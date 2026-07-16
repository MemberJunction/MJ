/* SQL generated to create new entity Award Nominations */

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
         '6a2dec79-4a49-453a-bd2e-ef7f5883f25a',
         'Award Nominations',
         NULL,
         NULL,
         NULL,
         'AwardNominations',
         'vwAwardNominations',
         're_members_ams',
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

/* SQL generated to add new entity Award Nominations to application ID: '8A01E839-14EE-48C0-94DF-D85AC94D67BD' */
INSERT INTO [${flyway:defaultSchema}].[ApplicationEntity]
                                       ([ApplicationID], [EntityID], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                       ('8A01E839-14EE-48C0-94DF-D85AC94D67BD', '6a2dec79-4a49-453a-bd2e-ef7f5883f25a', (SELECT COALESCE(MAX([Sequence]),0)+1 FROM [${flyway:defaultSchema}].[ApplicationEntity] WHERE [ApplicationID] = '8A01E839-14EE-48C0-94DF-D85AC94D67BD'), GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity Award Nominations for role UI */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('6a2dec79-4a49-453a-bd2e-ef7f5883f25a', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0, 0, 0, GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity Award Nominations for role Developer */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('6a2dec79-4a49-453a-bd2e-ef7f5883f25a', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity Award Nominations for role Integration */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('6a2dec79-4a49-453a-bd2e-ef7f5883f25a', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE());

/* SQL generated to create new entity Categories */

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
         'c6895f42-a972-42cc-9a57-84c0680b0bd7',
         'Categories',
         NULL,
         'Category assignments on a record. Write-only sub-resource (no independent GET-list): POST /Individuals/{Record Number}/Categories, DELETE /Individuals/{Record Number}/Categories/{Category Code} (and the Organizations mirror). Backed by SaveCategoryBasicData {code, isPrimary}.',
         NULL,
         'Categories',
         'vwCategories',
         're_members_ams',
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

/* SQL generated to add new entity Categories to application ID: '8A01E839-14EE-48C0-94DF-D85AC94D67BD' */
INSERT INTO [${flyway:defaultSchema}].[ApplicationEntity]
                                       ([ApplicationID], [EntityID], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                       ('8A01E839-14EE-48C0-94DF-D85AC94D67BD', 'c6895f42-a972-42cc-9a57-84c0680b0bd7', (SELECT COALESCE(MAX([Sequence]),0)+1 FROM [${flyway:defaultSchema}].[ApplicationEntity] WHERE [ApplicationID] = '8A01E839-14EE-48C0-94DF-D85AC94D67BD'), GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity Categories for role UI */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('c6895f42-a972-42cc-9a57-84c0680b0bd7', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0, 0, 0, GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity Categories for role Developer */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('c6895f42-a972-42cc-9a57-84c0680b0bd7', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity Categories for role Integration */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('c6895f42-a972-42cc-9a57-84c0680b0bd7', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE());

/* SQL generated to create new entity Emails */

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
         'c3154270-c0fd-4431-8c0a-5775b2801566',
         'Emails',
         NULL,
         'Email addresses on a customer record. Create: POST /Individuals/{ID Or Record Number}/Emails (response EmailData) and POST /Organizations/{ID}/Emails. Update: PUT /Individuals/{ID or Record Number}/Emails/{Current Email Address} (Individuals only). Record identity is the email address itself (no server id). Backed by EmailData.',
         NULL,
         'Emails',
         'vwEmails',
         're_members_ams',
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

/* SQL generated to add new entity Emails to application ID: '8A01E839-14EE-48C0-94DF-D85AC94D67BD' */
INSERT INTO [${flyway:defaultSchema}].[ApplicationEntity]
                                       ([ApplicationID], [EntityID], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                       ('8A01E839-14EE-48C0-94DF-D85AC94D67BD', 'c3154270-c0fd-4431-8c0a-5775b2801566', (SELECT COALESCE(MAX([Sequence]),0)+1 FROM [${flyway:defaultSchema}].[ApplicationEntity] WHERE [ApplicationID] = '8A01E839-14EE-48C0-94DF-D85AC94D67BD'), GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity Emails for role UI */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('c3154270-c0fd-4431-8c0a-5775b2801566', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0, 0, 0, GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity Emails for role Developer */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('c3154270-c0fd-4431-8c0a-5775b2801566', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity Emails for role Integration */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('c3154270-c0fd-4431-8c0a-5775b2801566', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE());

/* SQL generated to create new entity Exam Scores */

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
         '5c701293-d4ad-4f41-b870-c6bd695bf4cd',
         'Exam Scores',
         NULL,
         NULL,
         NULL,
         'ExamScores',
         'vwExamScores',
         're_members_ams',
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

/* SQL generated to add new entity Exam Scores to application ID: '8A01E839-14EE-48C0-94DF-D85AC94D67BD' */
INSERT INTO [${flyway:defaultSchema}].[ApplicationEntity]
                                       ([ApplicationID], [EntityID], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                       ('8A01E839-14EE-48C0-94DF-D85AC94D67BD', '5c701293-d4ad-4f41-b870-c6bd695bf4cd', (SELECT COALESCE(MAX([Sequence]),0)+1 FROM [${flyway:defaultSchema}].[ApplicationEntity] WHERE [ApplicationID] = '8A01E839-14EE-48C0-94DF-D85AC94D67BD'), GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity Exam Scores for role UI */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('5c701293-d4ad-4f41-b870-c6bd695bf4cd', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0, 0, 0, GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity Exam Scores for role Developer */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('5c701293-d4ad-4f41-b870-c6bd695bf4cd', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity Exam Scores for role Integration */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('5c701293-d4ad-4f41-b870-c6bd695bf4cd', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE());

/* SQL generated to create new entity Phones */

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
         'a5f735ce-b945-415e-b9db-ab748c47d0e7',
         'Phones',
         NULL,
         'Phone numbers on a customer record. Create: POST /Individuals/{ID or Record Number}/Phones and POST /Organizations/{ID or Record Number}/Phones (write body PhoneSaveData, response PhoneDataSet with a server id). Update: PUT /Individuals|/Organizations/{ID or Record Number}/Phones/{ID}. Fields are the union of PhoneDataSet (canonical record) + PhoneSaveData create-required fields.',
         NULL,
         'Phones',
         'vwPhones',
         're_members_ams',
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

/* SQL generated to add new entity Phones to application ID: '8A01E839-14EE-48C0-94DF-D85AC94D67BD' */
INSERT INTO [${flyway:defaultSchema}].[ApplicationEntity]
                                       ([ApplicationID], [EntityID], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                       ('8A01E839-14EE-48C0-94DF-D85AC94D67BD', 'a5f735ce-b945-415e-b9db-ab748c47d0e7', (SELECT COALESCE(MAX([Sequence]),0)+1 FROM [${flyway:defaultSchema}].[ApplicationEntity] WHERE [ApplicationID] = '8A01E839-14EE-48C0-94DF-D85AC94D67BD'), GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity Phones for role UI */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('a5f735ce-b945-415e-b9db-ab748c47d0e7', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0, 0, 0, GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity Phones for role Developer */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('a5f735ce-b945-415e-b9db-ab748c47d0e7', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity Phones for role Integration */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('a5f735ce-b945-415e-b9db-ab748c47d0e7', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE());

/* SQL generated to create new entity Addresses */

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
         '465ad98d-45a3-42dd-a68a-10fe6cb79d39',
         'Addresses',
         NULL,
         'Postal addresses on a customer record. Upsert-style single POST ("Add-or-Update-Address"): POST /Individuals/{ID Or Record Number}/Addresses and POST /Organizations/{ID or Record Number}/Addresses. Backed by AddressSaveData (returned with a server-assigned id). No whole-record PUT/DELETE for addresses.',
         NULL,
         'Addresses',
         'vwAddresses',
         're_members_ams',
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

/* SQL generated to add new entity Addresses to application ID: '8A01E839-14EE-48C0-94DF-D85AC94D67BD' */
INSERT INTO [${flyway:defaultSchema}].[ApplicationEntity]
                                       ([ApplicationID], [EntityID], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                       ('8A01E839-14EE-48C0-94DF-D85AC94D67BD', '465ad98d-45a3-42dd-a68a-10fe6cb79d39', (SELECT COALESCE(MAX([Sequence]),0)+1 FROM [${flyway:defaultSchema}].[ApplicationEntity] WHERE [ApplicationID] = '8A01E839-14EE-48C0-94DF-D85AC94D67BD'), GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity Addresses for role UI */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('465ad98d-45a3-42dd-a68a-10fe6cb79d39', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0, 0, 0, GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity Addresses for role Developer */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('465ad98d-45a3-42dd-a68a-10fe6cb79d39', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity Addresses for role Integration */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('465ad98d-45a3-42dd-a68a-10fe6cb79d39', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE());

/* SQL text to add special date field __mj_CreatedAt to entity re_members_ams.Addresses */
ALTER TABLE [re_members_ams].[Addresses] ADD [__mj_CreatedAt] DATETIMEOFFSET NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity re_members_ams.Addresses */
UPDATE [re_members_ams].[Addresses] SET [__mj_CreatedAt] = GETUTCDATE() WHERE [__mj_CreatedAt] IS NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity re_members_ams.Addresses */
ALTER TABLE [re_members_ams].[Addresses] ALTER COLUMN [__mj_CreatedAt] DATETIMEOFFSET NOT NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity re_members_ams.Addresses */
ALTER TABLE [re_members_ams].[Addresses] ADD CONSTRAINT [DF_re_members_ams_Addresses___mj_CreatedAt] DEFAULT GETUTCDATE() FOR [__mj_CreatedAt];
GO

/* SQL text to add special date field __mj_UpdatedAt to entity re_members_ams.Addresses */
ALTER TABLE [re_members_ams].[Addresses] ADD [__mj_UpdatedAt] DATETIMEOFFSET NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity re_members_ams.Addresses */
UPDATE [re_members_ams].[Addresses] SET [__mj_UpdatedAt] = GETUTCDATE() WHERE [__mj_UpdatedAt] IS NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity re_members_ams.Addresses */
ALTER TABLE [re_members_ams].[Addresses] ALTER COLUMN [__mj_UpdatedAt] DATETIMEOFFSET NOT NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity re_members_ams.Addresses */
ALTER TABLE [re_members_ams].[Addresses] ADD CONSTRAINT [DF_re_members_ams_Addresses___mj_UpdatedAt] DEFAULT GETUTCDATE() FOR [__mj_UpdatedAt];
GO

/* SQL text to add special date field __mj_CreatedAt to entity re_members_ams.Emails */
ALTER TABLE [re_members_ams].[Emails] ADD [__mj_CreatedAt] DATETIMEOFFSET NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity re_members_ams.Emails */
UPDATE [re_members_ams].[Emails] SET [__mj_CreatedAt] = GETUTCDATE() WHERE [__mj_CreatedAt] IS NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity re_members_ams.Emails */
ALTER TABLE [re_members_ams].[Emails] ALTER COLUMN [__mj_CreatedAt] DATETIMEOFFSET NOT NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity re_members_ams.Emails */
ALTER TABLE [re_members_ams].[Emails] ADD CONSTRAINT [DF_re_members_ams_Emails___mj_CreatedAt] DEFAULT GETUTCDATE() FOR [__mj_CreatedAt];
GO

/* SQL text to add special date field __mj_UpdatedAt to entity re_members_ams.Emails */
ALTER TABLE [re_members_ams].[Emails] ADD [__mj_UpdatedAt] DATETIMEOFFSET NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity re_members_ams.Emails */
UPDATE [re_members_ams].[Emails] SET [__mj_UpdatedAt] = GETUTCDATE() WHERE [__mj_UpdatedAt] IS NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity re_members_ams.Emails */
ALTER TABLE [re_members_ams].[Emails] ALTER COLUMN [__mj_UpdatedAt] DATETIMEOFFSET NOT NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity re_members_ams.Emails */
ALTER TABLE [re_members_ams].[Emails] ADD CONSTRAINT [DF_re_members_ams_Emails___mj_UpdatedAt] DEFAULT GETUTCDATE() FOR [__mj_UpdatedAt];
GO

/* SQL text to add special date field __mj_CreatedAt to entity re_members_ams.Categories */
ALTER TABLE [re_members_ams].[Categories] ADD [__mj_CreatedAt] DATETIMEOFFSET NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity re_members_ams.Categories */
UPDATE [re_members_ams].[Categories] SET [__mj_CreatedAt] = GETUTCDATE() WHERE [__mj_CreatedAt] IS NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity re_members_ams.Categories */
ALTER TABLE [re_members_ams].[Categories] ALTER COLUMN [__mj_CreatedAt] DATETIMEOFFSET NOT NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity re_members_ams.Categories */
ALTER TABLE [re_members_ams].[Categories] ADD CONSTRAINT [DF_re_members_ams_Categories___mj_CreatedAt] DEFAULT GETUTCDATE() FOR [__mj_CreatedAt];
GO

/* SQL text to add special date field __mj_UpdatedAt to entity re_members_ams.Categories */
ALTER TABLE [re_members_ams].[Categories] ADD [__mj_UpdatedAt] DATETIMEOFFSET NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity re_members_ams.Categories */
UPDATE [re_members_ams].[Categories] SET [__mj_UpdatedAt] = GETUTCDATE() WHERE [__mj_UpdatedAt] IS NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity re_members_ams.Categories */
ALTER TABLE [re_members_ams].[Categories] ALTER COLUMN [__mj_UpdatedAt] DATETIMEOFFSET NOT NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity re_members_ams.Categories */
ALTER TABLE [re_members_ams].[Categories] ADD CONSTRAINT [DF_re_members_ams_Categories___mj_UpdatedAt] DEFAULT GETUTCDATE() FOR [__mj_UpdatedAt];
GO

/* SQL text to add special date field __mj_CreatedAt to entity re_members_ams.Phones */
ALTER TABLE [re_members_ams].[Phones] ADD [__mj_CreatedAt] DATETIMEOFFSET NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity re_members_ams.Phones */
UPDATE [re_members_ams].[Phones] SET [__mj_CreatedAt] = GETUTCDATE() WHERE [__mj_CreatedAt] IS NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity re_members_ams.Phones */
ALTER TABLE [re_members_ams].[Phones] ALTER COLUMN [__mj_CreatedAt] DATETIMEOFFSET NOT NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity re_members_ams.Phones */
ALTER TABLE [re_members_ams].[Phones] ADD CONSTRAINT [DF_re_members_ams_Phones___mj_CreatedAt] DEFAULT GETUTCDATE() FOR [__mj_CreatedAt];
GO

/* SQL text to add special date field __mj_UpdatedAt to entity re_members_ams.Phones */
ALTER TABLE [re_members_ams].[Phones] ADD [__mj_UpdatedAt] DATETIMEOFFSET NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity re_members_ams.Phones */
UPDATE [re_members_ams].[Phones] SET [__mj_UpdatedAt] = GETUTCDATE() WHERE [__mj_UpdatedAt] IS NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity re_members_ams.Phones */
ALTER TABLE [re_members_ams].[Phones] ALTER COLUMN [__mj_UpdatedAt] DATETIMEOFFSET NOT NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity re_members_ams.Phones */
ALTER TABLE [re_members_ams].[Phones] ADD CONSTRAINT [DF_re_members_ams_Phones___mj_UpdatedAt] DEFAULT GETUTCDATE() FOR [__mj_UpdatedAt];
GO

/* SQL text to add special date field __mj_CreatedAt to entity re_members_ams.ExamScores */
ALTER TABLE [re_members_ams].[ExamScores] ADD [__mj_CreatedAt] DATETIMEOFFSET NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity re_members_ams.ExamScores */
UPDATE [re_members_ams].[ExamScores] SET [__mj_CreatedAt] = GETUTCDATE() WHERE [__mj_CreatedAt] IS NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity re_members_ams.ExamScores */
ALTER TABLE [re_members_ams].[ExamScores] ALTER COLUMN [__mj_CreatedAt] DATETIMEOFFSET NOT NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity re_members_ams.ExamScores */
ALTER TABLE [re_members_ams].[ExamScores] ADD CONSTRAINT [DF_re_members_ams_ExamScores___mj_CreatedAt] DEFAULT GETUTCDATE() FOR [__mj_CreatedAt];
GO

/* SQL text to add special date field __mj_UpdatedAt to entity re_members_ams.ExamScores */
ALTER TABLE [re_members_ams].[ExamScores] ADD [__mj_UpdatedAt] DATETIMEOFFSET NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity re_members_ams.ExamScores */
UPDATE [re_members_ams].[ExamScores] SET [__mj_UpdatedAt] = GETUTCDATE() WHERE [__mj_UpdatedAt] IS NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity re_members_ams.ExamScores */
ALTER TABLE [re_members_ams].[ExamScores] ALTER COLUMN [__mj_UpdatedAt] DATETIMEOFFSET NOT NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity re_members_ams.ExamScores */
ALTER TABLE [re_members_ams].[ExamScores] ADD CONSTRAINT [DF_re_members_ams_ExamScores___mj_UpdatedAt] DEFAULT GETUTCDATE() FOR [__mj_UpdatedAt];
GO

/* SQL text to add special date field __mj_CreatedAt to entity re_members_ams.AwardNominations */
ALTER TABLE [re_members_ams].[AwardNominations] ADD [__mj_CreatedAt] DATETIMEOFFSET NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity re_members_ams.AwardNominations */
UPDATE [re_members_ams].[AwardNominations] SET [__mj_CreatedAt] = GETUTCDATE() WHERE [__mj_CreatedAt] IS NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity re_members_ams.AwardNominations */
ALTER TABLE [re_members_ams].[AwardNominations] ALTER COLUMN [__mj_CreatedAt] DATETIMEOFFSET NOT NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity re_members_ams.AwardNominations */
ALTER TABLE [re_members_ams].[AwardNominations] ADD CONSTRAINT [DF_re_members_ams_AwardNominations___mj_CreatedAt] DEFAULT GETUTCDATE() FOR [__mj_CreatedAt];
GO

/* SQL text to add special date field __mj_UpdatedAt to entity re_members_ams.AwardNominations */
ALTER TABLE [re_members_ams].[AwardNominations] ADD [__mj_UpdatedAt] DATETIMEOFFSET NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity re_members_ams.AwardNominations */
UPDATE [re_members_ams].[AwardNominations] SET [__mj_UpdatedAt] = GETUTCDATE() WHERE [__mj_UpdatedAt] IS NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity re_members_ams.AwardNominations */
ALTER TABLE [re_members_ams].[AwardNominations] ALTER COLUMN [__mj_UpdatedAt] DATETIMEOFFSET NOT NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity re_members_ams.AwardNominations */
ALTER TABLE [re_members_ams].[AwardNominations] ADD CONSTRAINT [DF_re_members_ams_AwardNominations___mj_UpdatedAt] DEFAULT GETUTCDATE() FOR [__mj_UpdatedAt];
GO

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'ed123a0e-88c2-41a4-88ff-6812b29d6d31' OR (EntityID = '465AD98D-45A3-42DD-A68A-10FE6CB79D39' AND Name = 'country')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'ed123a0e-88c2-41a4-88ff-6812b29d6d31',
            '465AD98D-45A3-42DD-A68A-10FE6CB79D39', -- Entity: Addresses
            100001,
            'country',
            'country',
            'Country.',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'f7df3bfb-8357-4eec-809e-90259adccb3c' OR (EntityID = '465AD98D-45A3-42DD-A68A-10FE6CB79D39' AND Name = 'line1')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'f7df3bfb-8357-4eec-809e-90259adccb3c',
            '465AD98D-45A3-42DD-A68A-10FE6CB79D39', -- Entity: Addresses
            100002,
            'line1',
            'line 1',
            'Address line 1.',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'cb213d08-433a-41ad-b33e-c1cbeed217c3' OR (EntityID = '465AD98D-45A3-42DD-A68A-10FE6CB79D39' AND Name = 'isBadAddress')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'cb213d08-433a-41ad-b33e-c1cbeed217c3',
            '465AD98D-45A3-42DD-A68A-10FE6CB79D39', -- Entity: Addresses
            100003,
            'isBadAddress',
            'is Bad Address',
            'Flag marking the address as undeliverable.',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '200fb234-3865-48ee-84c8-dc0ecf4c74fd' OR (EntityID = '465AD98D-45A3-42DD-A68A-10FE6CB79D39' AND Name = 'isPreferredBilling')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '200fb234-3865-48ee-84c8-dc0ecf4c74fd',
            '465AD98D-45A3-42DD-A68A-10FE6CB79D39', -- Entity: Addresses
            100004,
            'isPreferredBilling',
            'is Preferred Billing',
            'Preferred billing address flag.',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '10ab6ec5-7da6-44f1-a95e-71200dad8fa1' OR (EntityID = '465AD98D-45A3-42DD-A68A-10FE6CB79D39' AND Name = 'isPreferredShipping')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '10ab6ec5-7da6-44f1-a95e-71200dad8fa1',
            '465AD98D-45A3-42DD-A68A-10FE6CB79D39', -- Entity: Addresses
            100005,
            'isPreferredShipping',
            'is Preferred Shipping',
            'Preferred shipping address flag.',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'daf7ff39-c77d-4e55-82e1-2a4b2df41368' OR (EntityID = '465AD98D-45A3-42DD-A68A-10FE6CB79D39' AND Name = 'zipcode')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'daf7ff39-c77d-4e55-82e1-2a4b2df41368',
            '465AD98D-45A3-42DD-A68A-10FE6CB79D39', -- Entity: Addresses
            100006,
            'zipcode',
            'zipcode',
            'Postal/zip code.',
            'nvarchar',
            640,
            0,
            0,
            1,
            NULL,
            0,
            1,
            0,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '141e9a7c-b892-41ce-b119-e64b9e6997dd' OR (EntityID = '465AD98D-45A3-42DD-A68A-10FE6CB79D39' AND Name = 'type')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '141e9a7c-b892-41ce-b119-e64b9e6997dd',
            '465AD98D-45A3-42DD-A68A-10FE6CB79D39', -- Entity: Addresses
            100007,
            'type',
            'type',
            'Address type. Enum: Home | Work | Other.',
            'nvarchar',
            640,
            0,
            0,
            1,
            NULL,
            0,
            1,
            0,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'e8832d2d-4ced-438b-8ee0-44e79775da0c' OR (EntityID = '465AD98D-45A3-42DD-A68A-10FE6CB79D39' AND Name = 'city')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'e8832d2d-4ced-438b-8ee0-44e79775da0c',
            '465AD98D-45A3-42DD-A68A-10FE6CB79D39', -- Entity: Addresses
            100008,
            'city',
            'city',
            'City.',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '5e543ac5-7f9a-4e41-9290-3dda8535a4ea' OR (EntityID = '465AD98D-45A3-42DD-A68A-10FE6CB79D39' AND Name = 'line3')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '5e543ac5-7f9a-4e41-9290-3dda8535a4ea',
            '465AD98D-45A3-42DD-A68A-10FE6CB79D39', -- Entity: Addresses
            100009,
            'line3',
            'line 3',
            'Address line 3.',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '966fdbd1-5de0-4c96-a973-b4651e70bb11' OR (EntityID = '465AD98D-45A3-42DD-A68A-10FE6CB79D39' AND Name = 'primary')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '966fdbd1-5de0-4c96-a973-b4651e70bb11',
            '465AD98D-45A3-42DD-A68A-10FE6CB79D39', -- Entity: Addresses
            100010,
            'primary',
            'primary',
            'Whether this is the primary address.',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '2e5b8501-eb2e-46c8-9a64-f4d3ef9575c4' OR (EntityID = '465AD98D-45A3-42DD-A68A-10FE6CB79D39' AND Name = 'id')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '2e5b8501-eb2e-46c8-9a64-f4d3ef9575c4',
            '465AD98D-45A3-42DD-A68A-10FE6CB79D39', -- Entity: Addresses
            100011,
            'id',
            'id',
            'Server-assigned address id. Soft PK.',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'bcf1cfce-a964-4b6d-bd2a-50df63451b84' OR (EntityID = '465AD98D-45A3-42DD-A68A-10FE6CB79D39' AND Name = 'line2')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'bcf1cfce-a964-4b6d-bd2a-50df63451b84',
            '465AD98D-45A3-42DD-A68A-10FE6CB79D39', -- Entity: Addresses
            100012,
            'line2',
            'line 2',
            'Address line 2.',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '09ab138f-3464-4890-840a-713a76c2f450' OR (EntityID = '465AD98D-45A3-42DD-A68A-10FE6CB79D39' AND Name = 'state')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '09ab138f-3464-4890-840a-713a76c2f450',
            '465AD98D-45A3-42DD-A68A-10FE6CB79D39', -- Entity: Addresses
            100013,
            'state',
            'state',
            'State/province.',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '83f874c0-906f-4fa6-9ed9-e32ce4b47301' OR (EntityID = '465AD98D-45A3-42DD-A68A-10FE6CB79D39' AND Name = 'showInDirectory')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '83f874c0-906f-4fa6-9ed9-e32ce4b47301',
            '465AD98D-45A3-42DD-A68A-10FE6CB79D39', -- Entity: Addresses
            100014,
            'showInDirectory',
            'show In Directory',
            'Whether the address is shown in the directory.',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '1c64e539-03cc-4a71-a59a-3840a252aecb' OR (EntityID = '465AD98D-45A3-42DD-A68A-10FE6CB79D39' AND Name = '${flyway:defaultSchema}_integration_SyncStatus')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '1c64e539-03cc-4a71-a59a-3840a252aecb',
            '465AD98D-45A3-42DD-A68A-10FE6CB79D39', -- Entity: Addresses
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '73273714-ed11-47ac-84d6-25ffdd64dca9' OR (EntityID = '465AD98D-45A3-42DD-A68A-10FE6CB79D39' AND Name = '__mj_integration_LastSyncedAt')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '73273714-ed11-47ac-84d6-25ffdd64dca9',
            '465AD98D-45A3-42DD-A68A-10FE6CB79D39', -- Entity: Addresses
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '65259acb-857c-4055-87c9-309e62b216d9' OR (EntityID = '465AD98D-45A3-42DD-A68A-10FE6CB79D39' AND Name = '${flyway:defaultSchema}_integration_LastSyncedSnapshot')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '65259acb-857c-4055-87c9-309e62b216d9',
            '465AD98D-45A3-42DD-A68A-10FE6CB79D39', -- Entity: Addresses
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '6aabd1da-6cca-4d15-bba4-7282c2829d30' OR (EntityID = '465AD98D-45A3-42DD-A68A-10FE6CB79D39' AND Name = '${flyway:defaultSchema}_integration_SyncMessage')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '6aabd1da-6cca-4d15-bba4-7282c2829d30',
            '465AD98D-45A3-42DD-A68A-10FE6CB79D39', -- Entity: Addresses
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '4af94df2-4478-402e-8d00-b45d2fc5fd01' OR (EntityID = '465AD98D-45A3-42DD-A68A-10FE6CB79D39' AND Name = '${flyway:defaultSchema}_integration_ContentHash')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '4af94df2-4478-402e-8d00-b45d2fc5fd01',
            '465AD98D-45A3-42DD-A68A-10FE6CB79D39', -- Entity: Addresses
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'bb04c45f-242f-455c-801c-0e0102e5294e' OR (EntityID = '465AD98D-45A3-42DD-A68A-10FE6CB79D39' AND Name = '${flyway:defaultSchema}_integration_CustomOverflow')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'bb04c45f-242f-455c-801c-0e0102e5294e',
            '465AD98D-45A3-42DD-A68A-10FE6CB79D39', -- Entity: Addresses
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '5757510e-9ce1-46e1-949f-432ff8217165' OR (EntityID = '465AD98D-45A3-42DD-A68A-10FE6CB79D39' AND Name = '${flyway:defaultSchema}_integration_ExternalVersion')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '5757510e-9ce1-46e1-949f-432ff8217165',
            '465AD98D-45A3-42DD-A68A-10FE6CB79D39', -- Entity: Addresses
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '98f4141b-b5d7-4ed9-99c0-e1ec074b1987' OR (EntityID = '465AD98D-45A3-42DD-A68A-10FE6CB79D39' AND Name = '${flyway:defaultSchema}_integration_LastSeenModifiedValue')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '98f4141b-b5d7-4ed9-99c0-e1ec074b1987',
            '465AD98D-45A3-42DD-A68A-10FE6CB79D39', -- Entity: Addresses
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'bfd77bd8-9ba2-47be-9b47-51492ec7ec0b' OR (EntityID = '465AD98D-45A3-42DD-A68A-10FE6CB79D39' AND Name = '__mj_integration_LastReconciledAt')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'bfd77bd8-9ba2-47be-9b47-51492ec7ec0b',
            '465AD98D-45A3-42DD-A68A-10FE6CB79D39', -- Entity: Addresses
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '3dd8d6b2-533b-44de-975c-ebe088172890' OR (EntityID = '465AD98D-45A3-42DD-A68A-10FE6CB79D39' AND Name = '${flyway:defaultSchema}_integration_LastWriterDirection')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '3dd8d6b2-533b-44de-975c-ebe088172890',
            '465AD98D-45A3-42DD-A68A-10FE6CB79D39', -- Entity: Addresses
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'c3f5d6da-3f16-41f7-8388-c15b02eae1b6' OR (EntityID = '465AD98D-45A3-42DD-A68A-10FE6CB79D39' AND Name = '${flyway:defaultSchema}_integration_IsTombstoned')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'c3f5d6da-3f16-41f7-8388-c15b02eae1b6',
            '465AD98D-45A3-42DD-A68A-10FE6CB79D39', -- Entity: Addresses
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '9c60ed36-54cb-4815-ac2c-841a875e6f35' OR (EntityID = '465AD98D-45A3-42DD-A68A-10FE6CB79D39' AND Name = '__mj_integration_DeletedDetectedAt')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '9c60ed36-54cb-4815-ac2c-841a875e6f35',
            '465AD98D-45A3-42DD-A68A-10FE6CB79D39', -- Entity: Addresses
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'f12b92a4-5add-43d5-b803-5698fb6f707f' OR (EntityID = '465AD98D-45A3-42DD-A68A-10FE6CB79D39' AND Name = '__mj_CreatedAt')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'f12b92a4-5add-43d5-b803-5698fb6f707f',
            '465AD98D-45A3-42DD-A68A-10FE6CB79D39', -- Entity: Addresses
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '46967233-c096-44c5-bd56-95d818a21adb' OR (EntityID = '465AD98D-45A3-42DD-A68A-10FE6CB79D39' AND Name = '__mj_UpdatedAt')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '46967233-c096-44c5-bd56-95d818a21adb',
            '465AD98D-45A3-42DD-A68A-10FE6CB79D39', -- Entity: Addresses
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

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '919f6dbd-0b38-4024-993d-e49941560e49' OR (EntityID = 'C3154270-C0FD-4431-8C0A-5775B2801566' AND Name = 'type')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '919f6dbd-0b38-4024-993d-e49941560e49',
            'C3154270-C0FD-4431-8C0A-5775B2801566', -- Entity: Emails
            100001,
            'type',
            'type',
            'Email type.',
            'nvarchar',
            700,
            0,
            0,
            1,
            NULL,
            0,
            1,
            0,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'a1f79604-fe73-4a58-a0d1-ef145728aace' OR (EntityID = 'C3154270-C0FD-4431-8C0A-5775B2801566' AND Name = 'primary')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'a1f79604-fe73-4a58-a0d1-ef145728aace',
            'C3154270-C0FD-4431-8C0A-5775B2801566', -- Entity: Emails
            100002,
            'primary',
            'primary',
            'Whether this is the primary email address.',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '5c92d484-7b3d-4e4e-9b62-c5e267c1df12' OR (EntityID = 'C3154270-C0FD-4431-8C0A-5775B2801566' AND Name = 'address')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '5c92d484-7b3d-4e4e-9b62-c5e267c1df12',
            'C3154270-C0FD-4431-8C0A-5775B2801566', -- Entity: Emails
            100003,
            'address',
            'address',
            'Email address — the per-record identity (PUT addresses the record by {Current Email Address}). Soft PK / unique key.',
            'nvarchar',
            900,
            0,
            0,
            1,
            NULL,
            0,
            1,
            0,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'd86ec78a-4205-45d1-ba1a-afeb21b12240' OR (EntityID = 'C3154270-C0FD-4431-8C0A-5775B2801566' AND Name = 'showInDirectory')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'd86ec78a-4205-45d1-ba1a-afeb21b12240',
            'C3154270-C0FD-4431-8C0A-5775B2801566', -- Entity: Emails
            100004,
            'showInDirectory',
            'show In Directory',
            'Whether the email is shown in the directory.',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '7f8a9123-0f83-4e75-aa33-1453c2cc2f7a' OR (EntityID = 'C3154270-C0FD-4431-8C0A-5775B2801566' AND Name = '${flyway:defaultSchema}_integration_SyncStatus')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '7f8a9123-0f83-4e75-aa33-1453c2cc2f7a',
            'C3154270-C0FD-4431-8C0A-5775B2801566', -- Entity: Emails
            100005,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '3175a3d8-ba05-40af-bd15-359431272ea1' OR (EntityID = 'C3154270-C0FD-4431-8C0A-5775B2801566' AND Name = '__mj_integration_LastSyncedAt')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '3175a3d8-ba05-40af-bd15-359431272ea1',
            'C3154270-C0FD-4431-8C0A-5775B2801566', -- Entity: Emails
            100006,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '958e95ef-e65d-4e07-a4d7-399897c15635' OR (EntityID = 'C3154270-C0FD-4431-8C0A-5775B2801566' AND Name = '${flyway:defaultSchema}_integration_LastSyncedSnapshot')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '958e95ef-e65d-4e07-a4d7-399897c15635',
            'C3154270-C0FD-4431-8C0A-5775B2801566', -- Entity: Emails
            100007,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'b85a51c7-c61c-4cbc-936f-4674a5306ff0' OR (EntityID = 'C3154270-C0FD-4431-8C0A-5775B2801566' AND Name = '${flyway:defaultSchema}_integration_SyncMessage')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'b85a51c7-c61c-4cbc-936f-4674a5306ff0',
            'C3154270-C0FD-4431-8C0A-5775B2801566', -- Entity: Emails
            100008,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'a2fd4246-0b57-42a4-82dc-8da2f550c481' OR (EntityID = 'C3154270-C0FD-4431-8C0A-5775B2801566' AND Name = '${flyway:defaultSchema}_integration_ContentHash')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'a2fd4246-0b57-42a4-82dc-8da2f550c481',
            'C3154270-C0FD-4431-8C0A-5775B2801566', -- Entity: Emails
            100009,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '096b9a60-85c6-4c90-a803-4a001c92ade7' OR (EntityID = 'C3154270-C0FD-4431-8C0A-5775B2801566' AND Name = '${flyway:defaultSchema}_integration_CustomOverflow')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '096b9a60-85c6-4c90-a803-4a001c92ade7',
            'C3154270-C0FD-4431-8C0A-5775B2801566', -- Entity: Emails
            100010,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '9acfb45e-7bcc-467e-88da-adfc292ec585' OR (EntityID = 'C3154270-C0FD-4431-8C0A-5775B2801566' AND Name = '${flyway:defaultSchema}_integration_ExternalVersion')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '9acfb45e-7bcc-467e-88da-adfc292ec585',
            'C3154270-C0FD-4431-8C0A-5775B2801566', -- Entity: Emails
            100011,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '86dc3e0e-e621-4729-9df0-9d701e380632' OR (EntityID = 'C3154270-C0FD-4431-8C0A-5775B2801566' AND Name = '${flyway:defaultSchema}_integration_LastSeenModifiedValue')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '86dc3e0e-e621-4729-9df0-9d701e380632',
            'C3154270-C0FD-4431-8C0A-5775B2801566', -- Entity: Emails
            100012,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'aa942543-a974-43bb-89b1-f114023e73d1' OR (EntityID = 'C3154270-C0FD-4431-8C0A-5775B2801566' AND Name = '__mj_integration_LastReconciledAt')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'aa942543-a974-43bb-89b1-f114023e73d1',
            'C3154270-C0FD-4431-8C0A-5775B2801566', -- Entity: Emails
            100013,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'ad25cca9-6ace-47ed-bcf4-6384cfbcdf93' OR (EntityID = 'C3154270-C0FD-4431-8C0A-5775B2801566' AND Name = '${flyway:defaultSchema}_integration_LastWriterDirection')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'ad25cca9-6ace-47ed-bcf4-6384cfbcdf93',
            'C3154270-C0FD-4431-8C0A-5775B2801566', -- Entity: Emails
            100014,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '272b695c-14b8-43c2-9920-f3d08011db00' OR (EntityID = 'C3154270-C0FD-4431-8C0A-5775B2801566' AND Name = '${flyway:defaultSchema}_integration_IsTombstoned')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '272b695c-14b8-43c2-9920-f3d08011db00',
            'C3154270-C0FD-4431-8C0A-5775B2801566', -- Entity: Emails
            100015,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'a44427b0-879d-4e6a-b382-750dbc9f8472' OR (EntityID = 'C3154270-C0FD-4431-8C0A-5775B2801566' AND Name = '__mj_integration_DeletedDetectedAt')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'a44427b0-879d-4e6a-b382-750dbc9f8472',
            'C3154270-C0FD-4431-8C0A-5775B2801566', -- Entity: Emails
            100016,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'f31c0f60-39ce-4752-9a7b-9460289a8aa3' OR (EntityID = 'C3154270-C0FD-4431-8C0A-5775B2801566' AND Name = '__mj_CreatedAt')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'f31c0f60-39ce-4752-9a7b-9460289a8aa3',
            'C3154270-C0FD-4431-8C0A-5775B2801566', -- Entity: Emails
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
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '725efbe1-33b1-497a-8623-f1c469bc9156' OR (EntityID = 'C3154270-C0FD-4431-8C0A-5775B2801566' AND Name = '__mj_UpdatedAt')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '725efbe1-33b1-497a-8623-f1c469bc9156',
            'C3154270-C0FD-4431-8C0A-5775B2801566', -- Entity: Emails
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
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '03b086bf-0782-4b9c-986d-080bfaf02537' OR (EntityID = 'C6895F42-A972-42CC-9A57-84C0680B0BD7' AND Name = 'isPrimary')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '03b086bf-0782-4b9c-986d-080bfaf02537',
            'C6895F42-A972-42CC-9A57-84C0680B0BD7', -- Entity: Categories
            100001,
            'isPrimary',
            'is Primary',
            'Whether this is the primary category assignment.',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'd04ae271-66aa-42a8-8730-cf4364765cfa' OR (EntityID = 'C6895F42-A972-42CC-9A57-84C0680B0BD7' AND Name = 'code')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'd04ae271-66aa-42a8-8730-cf4364765cfa',
            'C6895F42-A972-42CC-9A57-84C0680B0BD7', -- Entity: Categories
            100002,
            'code',
            'code',
            'Category code — the DELETE addressing key /Categories/{Category Code}.',
            'nvarchar',
            800,
            0,
            0,
            1,
            NULL,
            0,
            1,
            0,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '779512c9-3d90-42aa-b4c2-c00a3ae98486' OR (EntityID = 'C6895F42-A972-42CC-9A57-84C0680B0BD7' AND Name = '${flyway:defaultSchema}_integration_SyncStatus')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '779512c9-3d90-42aa-b4c2-c00a3ae98486',
            'C6895F42-A972-42CC-9A57-84C0680B0BD7', -- Entity: Categories
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '6f0d1c29-0680-48e1-8a7f-928256ca711f' OR (EntityID = 'C6895F42-A972-42CC-9A57-84C0680B0BD7' AND Name = '__mj_integration_LastSyncedAt')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '6f0d1c29-0680-48e1-8a7f-928256ca711f',
            'C6895F42-A972-42CC-9A57-84C0680B0BD7', -- Entity: Categories
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '515fb60d-f7ae-4dc1-b9d2-7a226c18b3f8' OR (EntityID = 'C6895F42-A972-42CC-9A57-84C0680B0BD7' AND Name = '${flyway:defaultSchema}_integration_LastSyncedSnapshot')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '515fb60d-f7ae-4dc1-b9d2-7a226c18b3f8',
            'C6895F42-A972-42CC-9A57-84C0680B0BD7', -- Entity: Categories
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'e93bd42e-0f9c-4956-84e2-18c6a3b0aeb6' OR (EntityID = 'C6895F42-A972-42CC-9A57-84C0680B0BD7' AND Name = '${flyway:defaultSchema}_integration_SyncMessage')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'e93bd42e-0f9c-4956-84e2-18c6a3b0aeb6',
            'C6895F42-A972-42CC-9A57-84C0680B0BD7', -- Entity: Categories
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'e92dbf01-9cfd-4984-8155-3321880e0aad' OR (EntityID = 'C6895F42-A972-42CC-9A57-84C0680B0BD7' AND Name = '${flyway:defaultSchema}_integration_ContentHash')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'e92dbf01-9cfd-4984-8155-3321880e0aad',
            'C6895F42-A972-42CC-9A57-84C0680B0BD7', -- Entity: Categories
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'd665dbb9-5003-4af1-96e2-fd8e36cb906f' OR (EntityID = 'C6895F42-A972-42CC-9A57-84C0680B0BD7' AND Name = '${flyway:defaultSchema}_integration_CustomOverflow')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'd665dbb9-5003-4af1-96e2-fd8e36cb906f',
            'C6895F42-A972-42CC-9A57-84C0680B0BD7', -- Entity: Categories
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'af19cd77-8a9d-4a28-9b41-efe62faba0e6' OR (EntityID = 'C6895F42-A972-42CC-9A57-84C0680B0BD7' AND Name = '${flyway:defaultSchema}_integration_ExternalVersion')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'af19cd77-8a9d-4a28-9b41-efe62faba0e6',
            'C6895F42-A972-42CC-9A57-84C0680B0BD7', -- Entity: Categories
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '57d0dd86-99f6-4cd1-bdc2-72ad151ccaad' OR (EntityID = 'C6895F42-A972-42CC-9A57-84C0680B0BD7' AND Name = '${flyway:defaultSchema}_integration_LastSeenModifiedValue')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '57d0dd86-99f6-4cd1-bdc2-72ad151ccaad',
            'C6895F42-A972-42CC-9A57-84C0680B0BD7', -- Entity: Categories
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '66c29a5a-8877-42ca-8647-9157cffd0e0a' OR (EntityID = 'C6895F42-A972-42CC-9A57-84C0680B0BD7' AND Name = '__mj_integration_LastReconciledAt')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '66c29a5a-8877-42ca-8647-9157cffd0e0a',
            'C6895F42-A972-42CC-9A57-84C0680B0BD7', -- Entity: Categories
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '40003af1-f8cc-453d-8c4d-e700270387cd' OR (EntityID = 'C6895F42-A972-42CC-9A57-84C0680B0BD7' AND Name = '${flyway:defaultSchema}_integration_LastWriterDirection')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '40003af1-f8cc-453d-8c4d-e700270387cd',
            'C6895F42-A972-42CC-9A57-84C0680B0BD7', -- Entity: Categories
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '5be2794e-7fe3-41f6-af1b-bcd0a033e05b' OR (EntityID = 'C6895F42-A972-42CC-9A57-84C0680B0BD7' AND Name = '${flyway:defaultSchema}_integration_IsTombstoned')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '5be2794e-7fe3-41f6-af1b-bcd0a033e05b',
            'C6895F42-A972-42CC-9A57-84C0680B0BD7', -- Entity: Categories
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '6e86b9e6-89f5-4062-9996-b48fa9c4266d' OR (EntityID = 'C6895F42-A972-42CC-9A57-84C0680B0BD7' AND Name = '__mj_integration_DeletedDetectedAt')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '6e86b9e6-89f5-4062-9996-b48fa9c4266d',
            'C6895F42-A972-42CC-9A57-84C0680B0BD7', -- Entity: Categories
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'e5d78803-3937-4542-84e5-400c75cf9e97' OR (EntityID = 'C6895F42-A972-42CC-9A57-84C0680B0BD7' AND Name = '__mj_CreatedAt')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'e5d78803-3937-4542-84e5-400c75cf9e97',
            'C6895F42-A972-42CC-9A57-84C0680B0BD7', -- Entity: Categories
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '471b0c56-9b4d-4f0b-aa1a-95efd80f74c0' OR (EntityID = 'C6895F42-A972-42CC-9A57-84C0680B0BD7' AND Name = '__mj_UpdatedAt')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '471b0c56-9b4d-4f0b-aa1a-95efd80f74c0',
            'C6895F42-A972-42CC-9A57-84C0680B0BD7', -- Entity: Categories
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '39f814f6-c882-47b8-ac85-3c58d95b4bd5' OR (EntityID = 'A5F735CE-B945-415E-B9DB-AB748C47D0E7' AND Name = 'country')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '39f814f6-c882-47b8-ac85-3c58d95b4bd5',
            'A5F735CE-B945-415E-B9DB-AB748C47D0E7', -- Entity: Phones
            100001,
            'country',
            'country',
            'Country object (PhoneDataSet.country).',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'e4e3f75b-61c3-423e-b6b0-6c1f8e5737e5' OR (EntityID = 'A5F735CE-B945-415E-B9DB-AB748C47D0E7' AND Name = 'countryName')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'e4e3f75b-61c3-423e-b6b0-6c1f8e5737e5',
            'A5F735CE-B945-415E-B9DB-AB748C47D0E7', -- Entity: Phones
            100002,
            'countryName',
            'country Name',
            'Country name (create-required in PhoneSaveData).',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'a6565aa6-bc07-4b97-b527-ec4f5d239078' OR (EntityID = 'A5F735CE-B945-415E-B9DB-AB748C47D0E7' AND Name = 'typeName')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'a6565aa6-bc07-4b97-b527-ec4f5d239078',
            'A5F735CE-B945-415E-B9DB-AB748C47D0E7', -- Entity: Phones
            100003,
            'typeName',
            'type Name',
            'Phone type name (create-required). Enum: Home | Work | Mobile | Fax | TollFree | Other | Main.',
            'nvarchar',
            640,
            0,
            0,
            1,
            NULL,
            0,
            1,
            0,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '34f7251f-6bb9-4b8c-9e82-99fe8fb02419' OR (EntityID = 'A5F735CE-B945-415E-B9DB-AB748C47D0E7' AND Name = 'primary')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '34f7251f-6bb9-4b8c-9e82-99fe8fb02419',
            'A5F735CE-B945-415E-B9DB-AB748C47D0E7', -- Entity: Phones
            100004,
            'primary',
            'primary',
            'Whether this is the primary phone.',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '5f7729bb-0b4e-4d73-8837-db42514aeba6' OR (EntityID = 'A5F735CE-B945-415E-B9DB-AB748C47D0E7' AND Name = 'showInDirectory')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '5f7729bb-0b4e-4d73-8837-db42514aeba6',
            'A5F735CE-B945-415E-B9DB-AB748C47D0E7', -- Entity: Phones
            100005,
            'showInDirectory',
            'show In Directory',
            'Whether the phone is shown in the directory.',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'b1db39af-1cd5-4d7e-9cc2-89dc1dc38642' OR (EntityID = 'A5F735CE-B945-415E-B9DB-AB748C47D0E7' AND Name = 'extension')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'b1db39af-1cd5-4d7e-9cc2-89dc1dc38642',
            'A5F735CE-B945-415E-B9DB-AB748C47D0E7', -- Entity: Phones
            100006,
            'extension',
            'extension',
            'Phone extension.',
            'nvarchar',
            640,
            0,
            0,
            1,
            NULL,
            0,
            1,
            0,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '16b9d2fd-b87d-41e6-a8fb-ae419fccfe7e' OR (EntityID = 'A5F735CE-B945-415E-B9DB-AB748C47D0E7' AND Name = 'number')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '16b9d2fd-b87d-41e6-a8fb-ae419fccfe7e',
            'A5F735CE-B945-415E-B9DB-AB748C47D0E7', -- Entity: Phones
            100007,
            'number',
            'number',
            'Phone number (create-required).',
            'nvarchar',
            700,
            0,
            0,
            1,
            NULL,
            0,
            1,
            0,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'bb538254-14f5-4aee-9c6f-25598619cb32' OR (EntityID = 'A5F735CE-B945-415E-B9DB-AB748C47D0E7' AND Name = 'id')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'bb538254-14f5-4aee-9c6f-25598619cb32',
            'A5F735CE-B945-415E-B9DB-AB748C47D0E7', -- Entity: Phones
            100008,
            'id',
            'id',
            'Server-assigned phone id (PhoneDataSet.id) — also the PUT addressing param /Phones/{ID}. Soft PK / unique key.',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '9836f88b-41ed-4330-a29a-7da9b996b19c' OR (EntityID = 'A5F735CE-B945-415E-B9DB-AB748C47D0E7' AND Name = 'type')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '9836f88b-41ed-4330-a29a-7da9b996b19c',
            'A5F735CE-B945-415E-B9DB-AB748C47D0E7', -- Entity: Phones
            100009,
            'type',
            'type',
            'Numeric phone-type code (PhoneDataSet.type; server-side).',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '548c12bc-4319-490a-aba5-d2fcd6658e24' OR (EntityID = 'A5F735CE-B945-415E-B9DB-AB748C47D0E7' AND Name = '${flyway:defaultSchema}_integration_SyncStatus')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '548c12bc-4319-490a-aba5-d2fcd6658e24',
            'A5F735CE-B945-415E-B9DB-AB748C47D0E7', -- Entity: Phones
            100010,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'cc3dddad-440d-4bdb-8cb9-4eb2f6119b3e' OR (EntityID = 'A5F735CE-B945-415E-B9DB-AB748C47D0E7' AND Name = '__mj_integration_LastSyncedAt')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'cc3dddad-440d-4bdb-8cb9-4eb2f6119b3e',
            'A5F735CE-B945-415E-B9DB-AB748C47D0E7', -- Entity: Phones
            100011,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '3ac4befb-7107-4e85-a6e6-243ed80a6bda' OR (EntityID = 'A5F735CE-B945-415E-B9DB-AB748C47D0E7' AND Name = '${flyway:defaultSchema}_integration_LastSyncedSnapshot')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '3ac4befb-7107-4e85-a6e6-243ed80a6bda',
            'A5F735CE-B945-415E-B9DB-AB748C47D0E7', -- Entity: Phones
            100012,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'abbabe50-383b-4243-99bf-0f8a05c9a802' OR (EntityID = 'A5F735CE-B945-415E-B9DB-AB748C47D0E7' AND Name = '${flyway:defaultSchema}_integration_SyncMessage')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'abbabe50-383b-4243-99bf-0f8a05c9a802',
            'A5F735CE-B945-415E-B9DB-AB748C47D0E7', -- Entity: Phones
            100013,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '4df87ec7-4b8b-40e8-9b9f-7061a7238054' OR (EntityID = 'A5F735CE-B945-415E-B9DB-AB748C47D0E7' AND Name = '${flyway:defaultSchema}_integration_ContentHash')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '4df87ec7-4b8b-40e8-9b9f-7061a7238054',
            'A5F735CE-B945-415E-B9DB-AB748C47D0E7', -- Entity: Phones
            100014,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '3536e60f-b6b8-4256-be46-d25a4cf17be3' OR (EntityID = 'A5F735CE-B945-415E-B9DB-AB748C47D0E7' AND Name = '${flyway:defaultSchema}_integration_CustomOverflow')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '3536e60f-b6b8-4256-be46-d25a4cf17be3',
            'A5F735CE-B945-415E-B9DB-AB748C47D0E7', -- Entity: Phones
            100015,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '9d2afcc2-b7c6-4595-85d4-9da29af00f13' OR (EntityID = 'A5F735CE-B945-415E-B9DB-AB748C47D0E7' AND Name = '${flyway:defaultSchema}_integration_ExternalVersion')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '9d2afcc2-b7c6-4595-85d4-9da29af00f13',
            'A5F735CE-B945-415E-B9DB-AB748C47D0E7', -- Entity: Phones
            100016,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '4ccbda29-53b1-48f3-9ca8-39573404ac0d' OR (EntityID = 'A5F735CE-B945-415E-B9DB-AB748C47D0E7' AND Name = '${flyway:defaultSchema}_integration_LastSeenModifiedValue')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '4ccbda29-53b1-48f3-9ca8-39573404ac0d',
            'A5F735CE-B945-415E-B9DB-AB748C47D0E7', -- Entity: Phones
            100017,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'f48dd94e-c61a-4481-af36-1f7fadf76838' OR (EntityID = 'A5F735CE-B945-415E-B9DB-AB748C47D0E7' AND Name = '__mj_integration_LastReconciledAt')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'f48dd94e-c61a-4481-af36-1f7fadf76838',
            'A5F735CE-B945-415E-B9DB-AB748C47D0E7', -- Entity: Phones
            100018,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '24f8221a-7c7b-471f-8798-972627607668' OR (EntityID = 'A5F735CE-B945-415E-B9DB-AB748C47D0E7' AND Name = '${flyway:defaultSchema}_integration_LastWriterDirection')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '24f8221a-7c7b-471f-8798-972627607668',
            'A5F735CE-B945-415E-B9DB-AB748C47D0E7', -- Entity: Phones
            100019,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '9bb34e18-73c7-4ea5-85c1-8f3860dc6582' OR (EntityID = 'A5F735CE-B945-415E-B9DB-AB748C47D0E7' AND Name = '${flyway:defaultSchema}_integration_IsTombstoned')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '9bb34e18-73c7-4ea5-85c1-8f3860dc6582',
            'A5F735CE-B945-415E-B9DB-AB748C47D0E7', -- Entity: Phones
            100020,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'a644a589-b82f-4c0e-8132-345d01a2e054' OR (EntityID = 'A5F735CE-B945-415E-B9DB-AB748C47D0E7' AND Name = '__mj_integration_DeletedDetectedAt')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'a644a589-b82f-4c0e-8132-345d01a2e054',
            'A5F735CE-B945-415E-B9DB-AB748C47D0E7', -- Entity: Phones
            100021,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'd8427fee-4106-40cd-8f8d-c25da3a36000' OR (EntityID = 'A5F735CE-B945-415E-B9DB-AB748C47D0E7' AND Name = '__mj_CreatedAt')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'd8427fee-4106-40cd-8f8d-c25da3a36000',
            'A5F735CE-B945-415E-B9DB-AB748C47D0E7', -- Entity: Phones
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
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '1ae5d4f2-0c48-4e25-8eca-f1a4e58c4bc1' OR (EntityID = 'A5F735CE-B945-415E-B9DB-AB748C47D0E7' AND Name = '__mj_UpdatedAt')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '1ae5d4f2-0c48-4e25-8eca-f1a4e58c4bc1',
            'A5F735CE-B945-415E-B9DB-AB748C47D0E7', -- Entity: Phones
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
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '0805c405-0523-4379-b4d3-91f2cff5b6af' OR (EntityID = '5C701293-D4AD-4F41-B870-C6BD695BF4CD' AND Name = 'individualRecordNumber')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '0805c405-0523-4379-b4d3-91f2cff5b6af',
            '5C701293-D4AD-4F41-B870-C6BD695BF4CD', -- Entity: Exam Scores
            100001,
            'individualRecordNumber',
            'individual Record Number',
            'Individual Record Number.',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'dfb44e0b-91a2-4724-a433-8c38ff21dcec' OR (EntityID = '5C701293-D4AD-4F41-B870-C6BD695BF4CD' AND Name = 'score')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'dfb44e0b-91a2-4724-a433-8c38ff21dcec',
            '5C701293-D4AD-4F41-B870-C6BD695BF4CD', -- Entity: Exam Scores
            100002,
            'score',
            'score',
            'Score.',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'bee53e5c-caef-4a42-af90-a45a1fe8adf9' OR (EntityID = '5C701293-D4AD-4F41-B870-C6BD695BF4CD' AND Name = '${flyway:defaultSchema}_integration_SyncStatus')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'bee53e5c-caef-4a42-af90-a45a1fe8adf9',
            '5C701293-D4AD-4F41-B870-C6BD695BF4CD', -- Entity: Exam Scores
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'e8eb2c45-4547-48c5-a43b-a7e14141f48d' OR (EntityID = '5C701293-D4AD-4F41-B870-C6BD695BF4CD' AND Name = '__mj_integration_LastSyncedAt')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'e8eb2c45-4547-48c5-a43b-a7e14141f48d',
            '5C701293-D4AD-4F41-B870-C6BD695BF4CD', -- Entity: Exam Scores
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'fab29e9a-1b71-4466-9ceb-7c21bc4822f5' OR (EntityID = '5C701293-D4AD-4F41-B870-C6BD695BF4CD' AND Name = '${flyway:defaultSchema}_integration_LastSyncedSnapshot')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'fab29e9a-1b71-4466-9ceb-7c21bc4822f5',
            '5C701293-D4AD-4F41-B870-C6BD695BF4CD', -- Entity: Exam Scores
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'a0e19c19-901a-4f2b-b0f9-6db83a5df1dd' OR (EntityID = '5C701293-D4AD-4F41-B870-C6BD695BF4CD' AND Name = '${flyway:defaultSchema}_integration_SyncMessage')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'a0e19c19-901a-4f2b-b0f9-6db83a5df1dd',
            '5C701293-D4AD-4F41-B870-C6BD695BF4CD', -- Entity: Exam Scores
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '157f9b62-c4f1-4838-9a50-9c781eab085e' OR (EntityID = '5C701293-D4AD-4F41-B870-C6BD695BF4CD' AND Name = '${flyway:defaultSchema}_integration_ContentHash')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '157f9b62-c4f1-4838-9a50-9c781eab085e',
            '5C701293-D4AD-4F41-B870-C6BD695BF4CD', -- Entity: Exam Scores
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '8eaa0ccb-207b-45c3-8a6f-b235e4755726' OR (EntityID = '5C701293-D4AD-4F41-B870-C6BD695BF4CD' AND Name = '${flyway:defaultSchema}_integration_CustomOverflow')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '8eaa0ccb-207b-45c3-8a6f-b235e4755726',
            '5C701293-D4AD-4F41-B870-C6BD695BF4CD', -- Entity: Exam Scores
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '4a0415d3-ed0d-4d21-901d-7cbde60a422f' OR (EntityID = '5C701293-D4AD-4F41-B870-C6BD695BF4CD' AND Name = '${flyway:defaultSchema}_integration_ExternalVersion')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '4a0415d3-ed0d-4d21-901d-7cbde60a422f',
            '5C701293-D4AD-4F41-B870-C6BD695BF4CD', -- Entity: Exam Scores
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '2d3716e7-82aa-49d5-a184-7581a295242d' OR (EntityID = '5C701293-D4AD-4F41-B870-C6BD695BF4CD' AND Name = '${flyway:defaultSchema}_integration_LastSeenModifiedValue')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '2d3716e7-82aa-49d5-a184-7581a295242d',
            '5C701293-D4AD-4F41-B870-C6BD695BF4CD', -- Entity: Exam Scores
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '99db2ac0-e511-400a-8fc5-0ebfbb0f4347' OR (EntityID = '5C701293-D4AD-4F41-B870-C6BD695BF4CD' AND Name = '__mj_integration_LastReconciledAt')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '99db2ac0-e511-400a-8fc5-0ebfbb0f4347',
            '5C701293-D4AD-4F41-B870-C6BD695BF4CD', -- Entity: Exam Scores
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '576dd768-43e3-47e2-95af-1e8732447ba1' OR (EntityID = '5C701293-D4AD-4F41-B870-C6BD695BF4CD' AND Name = '${flyway:defaultSchema}_integration_LastWriterDirection')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '576dd768-43e3-47e2-95af-1e8732447ba1',
            '5C701293-D4AD-4F41-B870-C6BD695BF4CD', -- Entity: Exam Scores
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '8940d6ff-d218-49ee-89b1-b4f302266599' OR (EntityID = '5C701293-D4AD-4F41-B870-C6BD695BF4CD' AND Name = '${flyway:defaultSchema}_integration_IsTombstoned')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '8940d6ff-d218-49ee-89b1-b4f302266599',
            '5C701293-D4AD-4F41-B870-C6BD695BF4CD', -- Entity: Exam Scores
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '0cd2fc5a-84fd-42fb-bfcf-812d5aca6bac' OR (EntityID = '5C701293-D4AD-4F41-B870-C6BD695BF4CD' AND Name = '__mj_integration_DeletedDetectedAt')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '0cd2fc5a-84fd-42fb-bfcf-812d5aca6bac',
            '5C701293-D4AD-4F41-B870-C6BD695BF4CD', -- Entity: Exam Scores
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '5cfe0364-4c97-450d-a432-d945f005a9da' OR (EntityID = '5C701293-D4AD-4F41-B870-C6BD695BF4CD' AND Name = '__mj_CreatedAt')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '5cfe0364-4c97-450d-a432-d945f005a9da',
            '5C701293-D4AD-4F41-B870-C6BD695BF4CD', -- Entity: Exam Scores
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'c2f5dce9-1e00-46cb-a233-c8efeeb0fdf9' OR (EntityID = '5C701293-D4AD-4F41-B870-C6BD695BF4CD' AND Name = '__mj_UpdatedAt')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'c2f5dce9-1e00-46cb-a233-c8efeeb0fdf9',
            '5C701293-D4AD-4F41-B870-C6BD695BF4CD', -- Entity: Exam Scores
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'a3506284-7e46-43e8-a337-1a5868565d86' OR (EntityID = 'B283C49A-F975-48C9-AE52-D66A1E0A4FDD' AND Name = 'mj_e2e_custom_attr')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'a3506284-7e46-43e8-a337-1a5868565d86',
            'B283C49A-F975-48C9-AE52-D66A1E0A4FDD', -- Entity: Tasks
            100041,
            'mj_e2e_custom_attr',
            'Mj E 2e Custom Attr',
            NULL,
            'nvarchar',
            1624,
            0,
            0,
            1,
            NULL,
            0,
            1,
            0,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'ecca9f07-82fa-4348-b2cc-fe9818e0b3c6' OR (EntityID = '6A2DEC79-4A49-453A-BD2E-EF7F5883F25A' AND Name = 'nominatedByCustomerRecordNumber')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'ecca9f07-82fa-4348-b2cc-fe9818e0b3c6',
            '6A2DEC79-4A49-453A-BD2E-EF7F5883F25A', -- Entity: Award Nominations
            100001,
            'nominatedByCustomerRecordNumber',
            'nominated By Customer Record Number',
            'Nominated By Record Number.',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '3a7d4383-a407-4ac2-842f-619109be11ba' OR (EntityID = '6A2DEC79-4A49-453A-BD2E-EF7F5883F25A' AND Name = 'description')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '3a7d4383-a407-4ac2-842f-619109be11ba',
            '6A2DEC79-4A49-453A-BD2E-EF7F5883F25A', -- Entity: Award Nominations
            100002,
            'description',
            'description',
            'An explanation why the nominee should be considered for the award.',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '8a86eb7f-3b94-4f28-9a81-c8065e59041a' OR (EntityID = '6A2DEC79-4A49-453A-BD2E-EF7F5883F25A' AND Name = 'nomineeRecordNumber')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '8a86eb7f-3b94-4f28-9a81-c8065e59041a',
            '6A2DEC79-4A49-453A-BD2E-EF7F5883F25A', -- Entity: Award Nominations
            100003,
            'nomineeRecordNumber',
            'nominee Record Number',
            'Nominee Record Number.',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'bbbb2634-053e-4213-a6e9-5286b1f23558' OR (EntityID = '6A2DEC79-4A49-453A-BD2E-EF7F5883F25A' AND Name = 'status')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'bbbb2634-053e-4213-a6e9-5286b1f23558',
            '6A2DEC79-4A49-453A-BD2E-EF7F5883F25A', -- Entity: Award Nominations
            100004,
            'status',
            'status',
            'Status.',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '153df6ca-90a9-42bd-b85c-ae09cd19dce4' OR (EntityID = '6A2DEC79-4A49-453A-BD2E-EF7F5883F25A' AND Name = 'awardedDate')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '153df6ca-90a9-42bd-b85c-ae09cd19dce4',
            '6A2DEC79-4A49-453A-BD2E-EF7F5883F25A', -- Entity: Award Nominations
            100005,
            'awardedDate',
            'awarded Date',
            'Awarded Date.',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '21957082-a67d-41ec-b4ea-63f91787a0f9' OR (EntityID = '6A2DEC79-4A49-453A-BD2E-EF7F5883F25A' AND Name = 'nominationDate')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '21957082-a67d-41ec-b4ea-63f91787a0f9',
            '6A2DEC79-4A49-453A-BD2E-EF7F5883F25A', -- Entity: Award Nominations
            100006,
            'nominationDate',
            'nomination Date',
            'Nomination Date.',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '076d09ae-4113-479c-aebf-eb382f599397' OR (EntityID = '6A2DEC79-4A49-453A-BD2E-EF7F5883F25A' AND Name = '${flyway:defaultSchema}_integration_SyncStatus')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '076d09ae-4113-479c-aebf-eb382f599397',
            '6A2DEC79-4A49-453A-BD2E-EF7F5883F25A', -- Entity: Award Nominations
            100007,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '15053bc0-0a56-420e-a23b-bbe6027bb177' OR (EntityID = '6A2DEC79-4A49-453A-BD2E-EF7F5883F25A' AND Name = '__mj_integration_LastSyncedAt')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '15053bc0-0a56-420e-a23b-bbe6027bb177',
            '6A2DEC79-4A49-453A-BD2E-EF7F5883F25A', -- Entity: Award Nominations
            100008,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '063176bf-1280-4f07-bb07-db9d80b9e5cf' OR (EntityID = '6A2DEC79-4A49-453A-BD2E-EF7F5883F25A' AND Name = '${flyway:defaultSchema}_integration_LastSyncedSnapshot')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '063176bf-1280-4f07-bb07-db9d80b9e5cf',
            '6A2DEC79-4A49-453A-BD2E-EF7F5883F25A', -- Entity: Award Nominations
            100009,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '82cd66ed-27e8-4dae-8b14-eaec144fd582' OR (EntityID = '6A2DEC79-4A49-453A-BD2E-EF7F5883F25A' AND Name = '${flyway:defaultSchema}_integration_SyncMessage')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '82cd66ed-27e8-4dae-8b14-eaec144fd582',
            '6A2DEC79-4A49-453A-BD2E-EF7F5883F25A', -- Entity: Award Nominations
            100010,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '3f03989b-b5f7-45d0-93aa-16e3fecbc2d6' OR (EntityID = '6A2DEC79-4A49-453A-BD2E-EF7F5883F25A' AND Name = '${flyway:defaultSchema}_integration_ContentHash')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '3f03989b-b5f7-45d0-93aa-16e3fecbc2d6',
            '6A2DEC79-4A49-453A-BD2E-EF7F5883F25A', -- Entity: Award Nominations
            100011,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '77019375-e318-47f5-945a-7b1ba3bad44a' OR (EntityID = '6A2DEC79-4A49-453A-BD2E-EF7F5883F25A' AND Name = '${flyway:defaultSchema}_integration_CustomOverflow')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '77019375-e318-47f5-945a-7b1ba3bad44a',
            '6A2DEC79-4A49-453A-BD2E-EF7F5883F25A', -- Entity: Award Nominations
            100012,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'a5b4aaed-b0cd-412b-a9c4-b665d0998d81' OR (EntityID = '6A2DEC79-4A49-453A-BD2E-EF7F5883F25A' AND Name = '${flyway:defaultSchema}_integration_ExternalVersion')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'a5b4aaed-b0cd-412b-a9c4-b665d0998d81',
            '6A2DEC79-4A49-453A-BD2E-EF7F5883F25A', -- Entity: Award Nominations
            100013,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '585f51f3-76dd-4c38-98b4-a3464fd544f6' OR (EntityID = '6A2DEC79-4A49-453A-BD2E-EF7F5883F25A' AND Name = '${flyway:defaultSchema}_integration_LastSeenModifiedValue')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '585f51f3-76dd-4c38-98b4-a3464fd544f6',
            '6A2DEC79-4A49-453A-BD2E-EF7F5883F25A', -- Entity: Award Nominations
            100014,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '9818ff60-bb16-462f-8e6d-9eec5358e065' OR (EntityID = '6A2DEC79-4A49-453A-BD2E-EF7F5883F25A' AND Name = '__mj_integration_LastReconciledAt')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '9818ff60-bb16-462f-8e6d-9eec5358e065',
            '6A2DEC79-4A49-453A-BD2E-EF7F5883F25A', -- Entity: Award Nominations
            100015,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '36f50e67-2973-4784-85f1-def0babb127d' OR (EntityID = '6A2DEC79-4A49-453A-BD2E-EF7F5883F25A' AND Name = '${flyway:defaultSchema}_integration_LastWriterDirection')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '36f50e67-2973-4784-85f1-def0babb127d',
            '6A2DEC79-4A49-453A-BD2E-EF7F5883F25A', -- Entity: Award Nominations
            100016,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '6a2228aa-74fd-4545-91cd-7c3cea72a084' OR (EntityID = '6A2DEC79-4A49-453A-BD2E-EF7F5883F25A' AND Name = '${flyway:defaultSchema}_integration_IsTombstoned')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '6a2228aa-74fd-4545-91cd-7c3cea72a084',
            '6A2DEC79-4A49-453A-BD2E-EF7F5883F25A', -- Entity: Award Nominations
            100017,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '9ae41690-b166-4043-b0a1-de23d5a2e55d' OR (EntityID = '6A2DEC79-4A49-453A-BD2E-EF7F5883F25A' AND Name = '__mj_integration_DeletedDetectedAt')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '9ae41690-b166-4043-b0a1-de23d5a2e55d',
            '6A2DEC79-4A49-453A-BD2E-EF7F5883F25A', -- Entity: Award Nominations
            100018,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '44347bc1-4674-4dd5-9317-788bec75f80f' OR (EntityID = '6A2DEC79-4A49-453A-BD2E-EF7F5883F25A' AND Name = '__mj_CreatedAt')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '44347bc1-4674-4dd5-9317-788bec75f80f',
            '6A2DEC79-4A49-453A-BD2E-EF7F5883F25A', -- Entity: Award Nominations
            100019,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '2b9a6bd5-bd81-4ae7-8017-4bdbf0d3ce4d' OR (EntityID = '6A2DEC79-4A49-453A-BD2E-EF7F5883F25A' AND Name = '__mj_UpdatedAt')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '2b9a6bd5-bd81-4ae7-8017-4bdbf0d3ce4d',
            '6A2DEC79-4A49-453A-BD2E-EF7F5883F25A', -- Entity: Award Nominations
            100020,
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

/* Set soft PK for re_members_ams.Individuals.id */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET [__mj_UpdatedAt]=GETUTCDATE(),
                                    [IsPrimaryKey] = 1,
                                    [IsSoftPrimaryKey] = 1
                                WHERE [EntityID] = 'B8B1A21E-70CE-404C-8104-3340A84858E0' AND [Name] = 'id';

/* Set soft PK for re_members_ams.Organizations.id */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET [__mj_UpdatedAt]=GETUTCDATE(),
                                    [IsPrimaryKey] = 1,
                                    [IsSoftPrimaryKey] = 1
                                WHERE [EntityID] = '6C475F1C-8F58-480B-8328-46813EF58D51' AND [Name] = 'id';

/* Set soft FK for re_members_ams.Organizations.parentCompanyId → Organizations.id */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET [__mj_UpdatedAt]=GETUTCDATE(),
                                    [RelatedEntityID] = '6C475F1C-8F58-480B-8328-46813EF58D51',
                                    [RelatedEntityFieldName] = 'id',
                                    [IsSoftForeignKey] = 1
                                WHERE [EntityID] = '6C475F1C-8F58-480B-8328-46813EF58D51' AND [Name] = 'parentCompanyId';

/* Set soft PK for re_members_ams.Memberships.code */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET [__mj_UpdatedAt]=GETUTCDATE(),
                                    [IsPrimaryKey] = 1,
                                    [IsSoftPrimaryKey] = 1
                                WHERE [EntityID] = 'CD75CAAA-B215-42F9-9F80-F8412A17BEA2' AND [Name] = 'code';

/* Set soft PK for re_members_ams.Events.eventId */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET [__mj_UpdatedAt]=GETUTCDATE(),
                                    [IsPrimaryKey] = 1,
                                    [IsSoftPrimaryKey] = 1
                                WHERE [EntityID] = 'D07B167E-258C-40C5-A6DC-2E42C2CE5F59' AND [Name] = 'eventId';

/* Set soft PK for re_members_ams.EventRegistrations.id */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET [__mj_UpdatedAt]=GETUTCDATE(),
                                    [IsPrimaryKey] = 1,
                                    [IsSoftPrimaryKey] = 1
                                WHERE [EntityID] = '90378890-6A83-4955-A2DE-548A4FA2EFE5' AND [Name] = 'id';

/* Set soft FK for re_members_ams.EventRegistrations.individualId → Individuals.id */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET [__mj_UpdatedAt]=GETUTCDATE(),
                                    [RelatedEntityID] = 'B8B1A21E-70CE-404C-8104-3340A84858E0',
                                    [RelatedEntityFieldName] = 'id',
                                    [IsSoftForeignKey] = 1
                                WHERE [EntityID] = '90378890-6A83-4955-A2DE-548A4FA2EFE5' AND [Name] = 'individualId';

/* Set soft PK for re_members_ams.EventCancellations.id */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET [__mj_UpdatedAt]=GETUTCDATE(),
                                    [IsPrimaryKey] = 1,
                                    [IsSoftPrimaryKey] = 1
                                WHERE [EntityID] = 'B234C369-EE9D-4174-A73D-EDA7442822DC' AND [Name] = 'id';

/* Set soft PK for re_members_ams.CourseAttendees.id */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET [__mj_UpdatedAt]=GETUTCDATE(),
                                    [IsPrimaryKey] = 1,
                                    [IsSoftPrimaryKey] = 1
                                WHERE [EntityID] = 'C54EA17D-DD1C-4B9C-84CD-ECC16C13C084' AND [Name] = 'id';

/* Set soft PK for re_members_ams.Orders.id */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET [__mj_UpdatedAt]=GETUTCDATE(),
                                    [IsPrimaryKey] = 1,
                                    [IsSoftPrimaryKey] = 1
                                WHERE [EntityID] = 'E669ECA0-17BA-484C-8131-7F351EBA24FB' AND [Name] = 'id';

/* Set soft PK for re_members_ams.AbandonedCheckouts.ID */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET [__mj_UpdatedAt]=GETUTCDATE(),
                                    [IsPrimaryKey] = 1,
                                    [IsSoftPrimaryKey] = 1
                                WHERE [EntityID] = '659F86CE-D795-46C1-81D0-1ED1ABE5D719' AND [Name] = 'ID';

/* Set soft PK for re_members_ams.Committees.id */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET [__mj_UpdatedAt]=GETUTCDATE(),
                                    [IsPrimaryKey] = 1,
                                    [IsSoftPrimaryKey] = 1
                                WHERE [EntityID] = 'CE33A7B2-81D8-4779-8AE2-0EC8CF82BF1E' AND [Name] = 'id';

/* Set soft FK for re_members_ams.Committees.parentCommitteeId → Committees.id */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET [__mj_UpdatedAt]=GETUTCDATE(),
                                    [RelatedEntityID] = 'CE33A7B2-81D8-4779-8AE2-0EC8CF82BF1E',
                                    [RelatedEntityFieldName] = 'id',
                                    [IsSoftForeignKey] = 1
                                WHERE [EntityID] = 'CE33A7B2-81D8-4779-8AE2-0EC8CF82BF1E' AND [Name] = 'parentCommitteeId';

/* Set soft PK for re_members_ams.CommitteeMembers.memberRecordNumber */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET [__mj_UpdatedAt]=GETUTCDATE(),
                                    [IsPrimaryKey] = 1,
                                    [IsSoftPrimaryKey] = 1
                                WHERE [EntityID] = '84E9C909-B27A-4A8D-BECF-0DA0F465D80A' AND [Name] = 'memberRecordNumber';

/* Set soft PK for re_members_ams.CommitteePositions.code */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET [__mj_UpdatedAt]=GETUTCDATE(),
                                    [IsPrimaryKey] = 1,
                                    [IsSoftPrimaryKey] = 1
                                WHERE [EntityID] = '0F05E31F-011E-4734-A14A-A89F5EDBCE4D' AND [Name] = 'code';

/* Set soft PK for re_members_ams.CommitteeNominees.id */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET [__mj_UpdatedAt]=GETUTCDATE(),
                                    [IsPrimaryKey] = 1,
                                    [IsSoftPrimaryKey] = 1
                                WHERE [EntityID] = '3127FDC6-66CA-47CE-B10B-927037D595FE' AND [Name] = 'id';

/* Set soft PK for re_members_ams.Awards.id */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET [__mj_UpdatedAt]=GETUTCDATE(),
                                    [IsPrimaryKey] = 1,
                                    [IsSoftPrimaryKey] = 1
                                WHERE [EntityID] = 'E2ECFA5A-05AA-49F9-8FD1-A9949AEF3985' AND [Name] = 'id';

/* Set soft PK for re_members_ams.AwardIndividualRecipients.id */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET [__mj_UpdatedAt]=GETUTCDATE(),
                                    [IsPrimaryKey] = 1,
                                    [IsSoftPrimaryKey] = 1
                                WHERE [EntityID] = '0402D55F-6EA1-4DF3-B912-FEF96EEDC760' AND [Name] = 'id';

/* Set soft PK for re_members_ams.AwardOrganizationRecipients.id */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET [__mj_UpdatedAt]=GETUTCDATE(),
                                    [IsPrimaryKey] = 1,
                                    [IsSoftPrimaryKey] = 1
                                WHERE [EntityID] = 'DA1E42D2-3847-48B2-ABB9-B303BC05293E' AND [Name] = 'id';

/* Set soft PK for re_members_ams.Certifications.code */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET [__mj_UpdatedAt]=GETUTCDATE(),
                                    [IsPrimaryKey] = 1,
                                    [IsSoftPrimaryKey] = 1
                                WHERE [EntityID] = 'CAF3EBAF-D974-4863-8473-7E41F481B259' AND [Name] = 'code';

/* Set soft PK for re_members_ams.Licenses.id */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET [__mj_UpdatedAt]=GETUTCDATE(),
                                    [IsPrimaryKey] = 1,
                                    [IsSoftPrimaryKey] = 1
                                WHERE [EntityID] = 'D3660C71-52C3-4804-BEDE-868C52FFB9BC' AND [Name] = 'id';

/* Set soft PK for re_members_ams.Exams.id */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET [__mj_UpdatedAt]=GETUTCDATE(),
                                    [IsPrimaryKey] = 1,
                                    [IsSoftPrimaryKey] = 1
                                WHERE [EntityID] = 'DD737CDB-CEE1-487F-99A6-B4F9398B9D76' AND [Name] = 'id';

/* Set soft PK for re_members_ams.Subscriptions.code */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET [__mj_UpdatedAt]=GETUTCDATE(),
                                    [IsPrimaryKey] = 1,
                                    [IsSoftPrimaryKey] = 1
                                WHERE [EntityID] = 'CC58A546-1CA5-4756-904F-5EEA5D03515F' AND [Name] = 'code';

/* Set soft PK for re_members_ams.UserTasks.taskNumber */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET [__mj_UpdatedAt]=GETUTCDATE(),
                                    [IsPrimaryKey] = 1,
                                    [IsSoftPrimaryKey] = 1
                                WHERE [EntityID] = '13D169AF-CF21-44C7-91E0-1952F9BD6974' AND [Name] = 'taskNumber';

/* Set soft PK for re_members_ams.CustomerRequests.requestNumber */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET [__mj_UpdatedAt]=GETUTCDATE(),
                                    [IsPrimaryKey] = 1,
                                    [IsSoftPrimaryKey] = 1
                                WHERE [EntityID] = 'F5AD833D-F362-40CF-82C1-DEBEC33DE399' AND [Name] = 'requestNumber';

/* Set soft PK for re_members_ams.Exhibits.code */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET [__mj_UpdatedAt]=GETUTCDATE(),
                                    [IsPrimaryKey] = 1,
                                    [IsSoftPrimaryKey] = 1
                                WHERE [EntityID] = 'E0C88340-483B-4B91-80C6-5DD083AA2297' AND [Name] = 'code';

/* Set soft PK for re_members_ams.Countries.id */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET [__mj_UpdatedAt]=GETUTCDATE(),
                                    [IsPrimaryKey] = 1,
                                    [IsSoftPrimaryKey] = 1
                                WHERE [EntityID] = 'CDD5A66C-7587-402A-9086-A3A4677029DF' AND [Name] = 'id';

/* Set soft PK for re_members_ams.States.id */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET [__mj_UpdatedAt]=GETUTCDATE(),
                                    [IsPrimaryKey] = 1,
                                    [IsSoftPrimaryKey] = 1
                                WHERE [EntityID] = '1295C0F0-D37C-4E45-9345-D98B1D03CD37' AND [Name] = 'id';

/* Set soft PK for re_members_ams.RelationshipTypes.name */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET [__mj_UpdatedAt]=GETUTCDATE(),
                                    [IsPrimaryKey] = 1,
                                    [IsSoftPrimaryKey] = 1
                                WHERE [EntityID] = '4396C56D-6F16-4FF3-8D4E-DFCD9107E9A3' AND [Name] = 'name';

/* Set soft PK for re_members_ams.OrganizationServices.code */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET [__mj_UpdatedAt]=GETUTCDATE(),
                                    [IsPrimaryKey] = 1,
                                    [IsSoftPrimaryKey] = 1
                                WHERE [EntityID] = '8FB1E96C-5E76-40A0-A7D3-E05D5E04B215' AND [Name] = 'code';

/* Set soft PK for re_members_ams.CustomFieldDefinitions.name */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET [__mj_UpdatedAt]=GETUTCDATE(),
                                    [IsPrimaryKey] = 1,
                                    [IsSoftPrimaryKey] = 1
                                WHERE [EntityID] = '685BBE9C-7EB6-4773-9B5D-E8C573A8D9DA' AND [Name] = 'name';

/* Set soft PK for re_members_ams.CustomFieldValues.name */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET [__mj_UpdatedAt]=GETUTCDATE(),
                                    [IsPrimaryKey] = 1,
                                    [IsSoftPrimaryKey] = 1
                                WHERE [EntityID] = '08BEDA08-4CAA-4389-AD7A-DE3025276CB0' AND [Name] = 'name';

/* Set soft PK for re_members_ams.Tasks.taskNumber */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET [__mj_UpdatedAt]=GETUTCDATE(),
                                    [IsPrimaryKey] = 1,
                                    [IsSoftPrimaryKey] = 1
                                WHERE [EntityID] = 'B283C49A-F975-48C9-AE52-D66A1E0A4FDD' AND [Name] = 'taskNumber';

/* Set soft PK for re_members_ams.Addresses.id */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET [__mj_UpdatedAt]=GETUTCDATE(),
                                    [IsPrimaryKey] = 1,
                                    [IsSoftPrimaryKey] = 1
                                WHERE [EntityID] = '465AD98D-45A3-42DD-A68A-10FE6CB79D39' AND [Name] = 'id';

/* Set soft PK for re_members_ams.AwardNominations.nomineeRecordNumber */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET [__mj_UpdatedAt]=GETUTCDATE(),
                                    [IsPrimaryKey] = 1,
                                    [IsSoftPrimaryKey] = 1
                                WHERE [EntityID] = '6A2DEC79-4A49-453A-BD2E-EF7F5883F25A' AND [Name] = 'nomineeRecordNumber';

/* Set soft PK for re_members_ams.Categories.code */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET [__mj_UpdatedAt]=GETUTCDATE(),
                                    [IsPrimaryKey] = 1,
                                    [IsSoftPrimaryKey] = 1
                                WHERE [EntityID] = 'C6895F42-A972-42CC-9A57-84C0680B0BD7' AND [Name] = 'code';

/* Set soft PK for re_members_ams.Emails.address */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET [__mj_UpdatedAt]=GETUTCDATE(),
                                    [IsPrimaryKey] = 1,
                                    [IsSoftPrimaryKey] = 1
                                WHERE [EntityID] = 'C3154270-C0FD-4431-8C0A-5775B2801566' AND [Name] = 'address';

/* Set soft PK for re_members_ams.ExamScores.individualRecordNumber */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET [__mj_UpdatedAt]=GETUTCDATE(),
                                    [IsPrimaryKey] = 1,
                                    [IsSoftPrimaryKey] = 1
                                WHERE [EntityID] = '5C701293-D4AD-4F41-B870-C6BD695BF4CD' AND [Name] = 'individualRecordNumber';

/* Set soft PK for re_members_ams.Phones.id */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET [__mj_UpdatedAt]=GETUTCDATE(),
                                    [IsPrimaryKey] = 1,
                                    [IsSoftPrimaryKey] = 1
                                WHERE [EntityID] = 'A5F735CE-B945-415E-B9DB-AB748C47D0E7' AND [Name] = 'id';

/* Index for Foreign Keys for AbandonedCheckouts */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Abandoned Checkouts
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------;

/* Index for Foreign Keys for Addresses */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Addresses
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------;

/* Index for Foreign Keys for AwardIndividualRecipients */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Award Individual Recipients
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------;

/* Index for Foreign Keys for AwardNominations */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Award Nominations
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------;

/* Index for Foreign Keys for AwardOrganizationRecipients */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Award Organization Recipients
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------;

/* Base View SQL for Abandoned Checkouts */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Abandoned Checkouts
-- Item: vwAbandonedCheckouts
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      Abandoned Checkouts
-----               SCHEMA:      re_members_ams
-----               BASE TABLE:  AbandonedCheckouts
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[re_members_ams].[vwAbandonedCheckouts]', 'V') IS NOT NULL
    DROP VIEW [re_members_ams].[vwAbandonedCheckouts];
GO

CREATE VIEW [re_members_ams].[vwAbandonedCheckouts]
AS
SELECT
    a.*
FROM
    [re_members_ams].[AbandonedCheckouts] AS a
GO
GRANT SELECT ON [re_members_ams].[vwAbandonedCheckouts] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* Base View Permissions SQL for Abandoned Checkouts */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Abandoned Checkouts
-- Item: Permissions for vwAbandonedCheckouts
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [re_members_ams].[vwAbandonedCheckouts] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* spCreate SQL for Abandoned Checkouts */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Abandoned Checkouts
-- Item: spCreateAbandonedCheckouts
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR AbandonedCheckouts
------------------------------------------------------------
IF OBJECT_ID('[re_members_ams].[spCreateAbandonedCheckouts]', 'P') IS NOT NULL
    DROP PROCEDURE [re_members_ams].[spCreateAbandonedCheckouts];
GO

CREATE PROCEDURE [re_members_ams].[spCreateAbandonedCheckouts]
    @ID nvarchar(450) = NULL,
    @customer_Clear bit = 0,
    @customer nvarchar(MAX) = NULL,
    @currency_Clear bit = 0,
    @currency nvarchar(812) = NULL,
    @createdOn_Clear bit = 0,
    @createdOn nvarchar(812) = NULL,
    @createdByEmailAddress_Clear bit = 0,
    @createdByEmailAddress nvarchar(812) = NULL,
    @mj_e2e_custom_attr_Clear bit = 0,
    @mj_e2e_custom_attr nvarchar(812) = NULL,
    @lineItems_Clear bit = 0,
    @lineItems nvarchar(MAX) = NULL,
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
    [re_members_ams].[AbandonedCheckouts]
        (
            [customer],
                [currency],
                [createdOn],
                [createdByEmailAddress],
                [mj_e2e_custom_attr],
                [lineItems],
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
                [ID]
        )
    VALUES
        (
            CASE WHEN @customer_Clear = 1 THEN NULL ELSE ISNULL(@customer, NULL) END,
                CASE WHEN @currency_Clear = 1 THEN NULL ELSE ISNULL(@currency, NULL) END,
                CASE WHEN @createdOn_Clear = 1 THEN NULL ELSE ISNULL(@createdOn, NULL) END,
                CASE WHEN @createdByEmailAddress_Clear = 1 THEN NULL ELSE ISNULL(@createdByEmailAddress, NULL) END,
                CASE WHEN @mj_e2e_custom_attr_Clear = 1 THEN NULL ELSE ISNULL(@mj_e2e_custom_attr, NULL) END,
                CASE WHEN @lineItems_Clear = 1 THEN NULL ELSE ISNULL(@lineItems, NULL) END,
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
                @ID
        )
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [re_members_ams].[vwAbandonedCheckouts] WHERE [ID] = @ID
END
GO
GRANT EXECUTE ON [re_members_ams].[spCreateAbandonedCheckouts] TO [cdp_Developer], [cdp_Integration];

/* spCreate Permissions for Abandoned Checkouts */

GRANT EXECUTE ON [re_members_ams].[spCreateAbandonedCheckouts] TO [cdp_Developer], [cdp_Integration];

/* spUpdate SQL for Abandoned Checkouts */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Abandoned Checkouts
-- Item: spUpdateAbandonedCheckouts
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR AbandonedCheckouts
------------------------------------------------------------
IF OBJECT_ID('[re_members_ams].[spUpdateAbandonedCheckouts]', 'P') IS NOT NULL
    DROP PROCEDURE [re_members_ams].[spUpdateAbandonedCheckouts];
GO

CREATE PROCEDURE [re_members_ams].[spUpdateAbandonedCheckouts]
    @ID nvarchar(450),
    @customer_Clear bit = 0,
    @customer nvarchar(MAX) = NULL,
    @currency_Clear bit = 0,
    @currency nvarchar(812) = NULL,
    @createdOn_Clear bit = 0,
    @createdOn nvarchar(812) = NULL,
    @createdByEmailAddress_Clear bit = 0,
    @createdByEmailAddress nvarchar(812) = NULL,
    @mj_e2e_custom_attr_Clear bit = 0,
    @mj_e2e_custom_attr nvarchar(812) = NULL,
    @lineItems_Clear bit = 0,
    @lineItems nvarchar(MAX) = NULL,
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
        [re_members_ams].[AbandonedCheckouts]
    SET
        [customer] = CASE WHEN @customer_Clear = 1 THEN NULL ELSE ISNULL(@customer, [customer]) END,
        [currency] = CASE WHEN @currency_Clear = 1 THEN NULL ELSE ISNULL(@currency, [currency]) END,
        [createdOn] = CASE WHEN @createdOn_Clear = 1 THEN NULL ELSE ISNULL(@createdOn, [createdOn]) END,
        [createdByEmailAddress] = CASE WHEN @createdByEmailAddress_Clear = 1 THEN NULL ELSE ISNULL(@createdByEmailAddress, [createdByEmailAddress]) END,
        [mj_e2e_custom_attr] = CASE WHEN @mj_e2e_custom_attr_Clear = 1 THEN NULL ELSE ISNULL(@mj_e2e_custom_attr, [mj_e2e_custom_attr]) END,
        [lineItems] = CASE WHEN @lineItems_Clear = 1 THEN NULL ELSE ISNULL(@lineItems, [lineItems]) END,
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
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [re_members_ams].[vwAbandonedCheckouts] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [re_members_ams].[vwAbandonedCheckouts]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [re_members_ams].[spUpdateAbandonedCheckouts] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the AbandonedCheckouts table
------------------------------------------------------------
IF OBJECT_ID('[re_members_ams].[trgUpdateAbandonedCheckouts]', 'TR') IS NOT NULL
    DROP TRIGGER [re_members_ams].[trgUpdateAbandonedCheckouts];
GO
CREATE TRIGGER [re_members_ams].trgUpdateAbandonedCheckouts
ON [re_members_ams].[AbandonedCheckouts]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [re_members_ams].[AbandonedCheckouts]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [re_members_ams].[AbandonedCheckouts] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO

/* spUpdate Permissions for Abandoned Checkouts */

GRANT EXECUTE ON [re_members_ams].[spUpdateAbandonedCheckouts] TO [cdp_Developer], [cdp_Integration];

/* Base View SQL for Addresses */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Addresses
-- Item: vwAddresses
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      Addresses
-----               SCHEMA:      re_members_ams
-----               BASE TABLE:  Addresses
-----               PRIMARY KEY: id
------------------------------------------------------------
IF OBJECT_ID('[re_members_ams].[vwAddresses]', 'V') IS NOT NULL
    DROP VIEW [re_members_ams].[vwAddresses];
GO

CREATE VIEW [re_members_ams].[vwAddresses]
AS
SELECT
    a.*
FROM
    [re_members_ams].[Addresses] AS a
GO
GRANT SELECT ON [re_members_ams].[vwAddresses] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* Base View Permissions SQL for Addresses */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Addresses
-- Item: Permissions for vwAddresses
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [re_members_ams].[vwAddresses] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* spCreate SQL for Addresses */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Addresses
-- Item: spCreateAddresses
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR Addresses
------------------------------------------------------------
IF OBJECT_ID('[re_members_ams].[spCreateAddresses]', 'P') IS NOT NULL
    DROP PROCEDURE [re_members_ams].[spCreateAddresses];
GO

CREATE PROCEDURE [re_members_ams].[spCreateAddresses]
    @country_Clear bit = 0,
    @country nvarchar(255) = NULL,
    @line1_Clear bit = 0,
    @line1 nvarchar(255) = NULL,
    @isBadAddress_Clear bit = 0,
    @isBadAddress nvarchar(255) = NULL,
    @isPreferredBilling_Clear bit = 0,
    @isPreferredBilling nvarchar(255) = NULL,
    @isPreferredShipping_Clear bit = 0,
    @isPreferredShipping nvarchar(255) = NULL,
    @zipcode_Clear bit = 0,
    @zipcode nvarchar(320) = NULL,
    @type_Clear bit = 0,
    @type nvarchar(320) = NULL,
    @city_Clear bit = 0,
    @city nvarchar(255) = NULL,
    @line3_Clear bit = 0,
    @line3 nvarchar(255) = NULL,
    @primary_Clear bit = 0,
    @primary nvarchar(255) = NULL,
    @id nvarchar(255) = NULL,
    @line2_Clear bit = 0,
    @line2 nvarchar(255) = NULL,
    @state_Clear bit = 0,
    @state nvarchar(255) = NULL,
    @showInDirectory_Clear bit = 0,
    @showInDirectory nvarchar(255) = NULL,
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
    [re_members_ams].[Addresses]
        (
            [country],
                [line1],
                [isBadAddress],
                [isPreferredBilling],
                [isPreferredShipping],
                [zipcode],
                [type],
                [city],
                [line3],
                [primary],
                [line2],
                [state],
                [showInDirectory],
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
            CASE WHEN @country_Clear = 1 THEN NULL ELSE ISNULL(@country, NULL) END,
                CASE WHEN @line1_Clear = 1 THEN NULL ELSE ISNULL(@line1, NULL) END,
                CASE WHEN @isBadAddress_Clear = 1 THEN NULL ELSE ISNULL(@isBadAddress, NULL) END,
                CASE WHEN @isPreferredBilling_Clear = 1 THEN NULL ELSE ISNULL(@isPreferredBilling, NULL) END,
                CASE WHEN @isPreferredShipping_Clear = 1 THEN NULL ELSE ISNULL(@isPreferredShipping, NULL) END,
                CASE WHEN @zipcode_Clear = 1 THEN NULL ELSE ISNULL(@zipcode, NULL) END,
                CASE WHEN @type_Clear = 1 THEN NULL ELSE ISNULL(@type, NULL) END,
                CASE WHEN @city_Clear = 1 THEN NULL ELSE ISNULL(@city, NULL) END,
                CASE WHEN @line3_Clear = 1 THEN NULL ELSE ISNULL(@line3, NULL) END,
                CASE WHEN @primary_Clear = 1 THEN NULL ELSE ISNULL(@primary, NULL) END,
                CASE WHEN @line2_Clear = 1 THEN NULL ELSE ISNULL(@line2, NULL) END,
                CASE WHEN @state_Clear = 1 THEN NULL ELSE ISNULL(@state, NULL) END,
                CASE WHEN @showInDirectory_Clear = 1 THEN NULL ELSE ISNULL(@showInDirectory, NULL) END,
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
    SELECT * FROM [re_members_ams].[vwAddresses] WHERE [id] = @id
END
GO
GRANT EXECUTE ON [re_members_ams].[spCreateAddresses] TO [cdp_Developer], [cdp_Integration];

/* spCreate Permissions for Addresses */

GRANT EXECUTE ON [re_members_ams].[spCreateAddresses] TO [cdp_Developer], [cdp_Integration];

/* spUpdate SQL for Addresses */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Addresses
-- Item: spUpdateAddresses
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR Addresses
------------------------------------------------------------
IF OBJECT_ID('[re_members_ams].[spUpdateAddresses]', 'P') IS NOT NULL
    DROP PROCEDURE [re_members_ams].[spUpdateAddresses];
GO

CREATE PROCEDURE [re_members_ams].[spUpdateAddresses]
    @country_Clear bit = 0,
    @country nvarchar(255) = NULL,
    @line1_Clear bit = 0,
    @line1 nvarchar(255) = NULL,
    @isBadAddress_Clear bit = 0,
    @isBadAddress nvarchar(255) = NULL,
    @isPreferredBilling_Clear bit = 0,
    @isPreferredBilling nvarchar(255) = NULL,
    @isPreferredShipping_Clear bit = 0,
    @isPreferredShipping nvarchar(255) = NULL,
    @zipcode_Clear bit = 0,
    @zipcode nvarchar(320) = NULL,
    @type_Clear bit = 0,
    @type nvarchar(320) = NULL,
    @city_Clear bit = 0,
    @city nvarchar(255) = NULL,
    @line3_Clear bit = 0,
    @line3 nvarchar(255) = NULL,
    @primary_Clear bit = 0,
    @primary nvarchar(255) = NULL,
    @id nvarchar(255),
    @line2_Clear bit = 0,
    @line2 nvarchar(255) = NULL,
    @state_Clear bit = 0,
    @state nvarchar(255) = NULL,
    @showInDirectory_Clear bit = 0,
    @showInDirectory nvarchar(255) = NULL,
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
        [re_members_ams].[Addresses]
    SET
        [country] = CASE WHEN @country_Clear = 1 THEN NULL ELSE ISNULL(@country, [country]) END,
        [line1] = CASE WHEN @line1_Clear = 1 THEN NULL ELSE ISNULL(@line1, [line1]) END,
        [isBadAddress] = CASE WHEN @isBadAddress_Clear = 1 THEN NULL ELSE ISNULL(@isBadAddress, [isBadAddress]) END,
        [isPreferredBilling] = CASE WHEN @isPreferredBilling_Clear = 1 THEN NULL ELSE ISNULL(@isPreferredBilling, [isPreferredBilling]) END,
        [isPreferredShipping] = CASE WHEN @isPreferredShipping_Clear = 1 THEN NULL ELSE ISNULL(@isPreferredShipping, [isPreferredShipping]) END,
        [zipcode] = CASE WHEN @zipcode_Clear = 1 THEN NULL ELSE ISNULL(@zipcode, [zipcode]) END,
        [type] = CASE WHEN @type_Clear = 1 THEN NULL ELSE ISNULL(@type, [type]) END,
        [city] = CASE WHEN @city_Clear = 1 THEN NULL ELSE ISNULL(@city, [city]) END,
        [line3] = CASE WHEN @line3_Clear = 1 THEN NULL ELSE ISNULL(@line3, [line3]) END,
        [primary] = CASE WHEN @primary_Clear = 1 THEN NULL ELSE ISNULL(@primary, [primary]) END,
        [line2] = CASE WHEN @line2_Clear = 1 THEN NULL ELSE ISNULL(@line2, [line2]) END,
        [state] = CASE WHEN @state_Clear = 1 THEN NULL ELSE ISNULL(@state, [state]) END,
        [showInDirectory] = CASE WHEN @showInDirectory_Clear = 1 THEN NULL ELSE ISNULL(@showInDirectory, [showInDirectory]) END,
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
        SELECT TOP 0 * FROM [re_members_ams].[vwAddresses] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [re_members_ams].[vwAddresses]
                                    WHERE
                                        [id] = @id
                                    
END
GO

GRANT EXECUTE ON [re_members_ams].[spUpdateAddresses] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the Addresses table
------------------------------------------------------------
IF OBJECT_ID('[re_members_ams].[trgUpdateAddresses]', 'TR') IS NOT NULL
    DROP TRIGGER [re_members_ams].[trgUpdateAddresses];
GO
CREATE TRIGGER [re_members_ams].trgUpdateAddresses
ON [re_members_ams].[Addresses]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [re_members_ams].[Addresses]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [re_members_ams].[Addresses] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[id] = I.[id];
END;
GO

/* spUpdate Permissions for Addresses */

GRANT EXECUTE ON [re_members_ams].[spUpdateAddresses] TO [cdp_Developer], [cdp_Integration];

/* Base View SQL for Award Individual Recipients */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Award Individual Recipients
-- Item: vwAwardIndividualRecipients
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      Award Individual Recipients
-----               SCHEMA:      re_members_ams
-----               BASE TABLE:  AwardIndividualRecipients
-----               PRIMARY KEY: id
------------------------------------------------------------
IF OBJECT_ID('[re_members_ams].[vwAwardIndividualRecipients]', 'V') IS NOT NULL
    DROP VIEW [re_members_ams].[vwAwardIndividualRecipients];
GO

CREATE VIEW [re_members_ams].[vwAwardIndividualRecipients]
AS
SELECT
    a.*
FROM
    [re_members_ams].[AwardIndividualRecipients] AS a
GO
GRANT SELECT ON [re_members_ams].[vwAwardIndividualRecipients] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* Base View Permissions SQL for Award Individual Recipients */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Award Individual Recipients
-- Item: Permissions for vwAwardIndividualRecipients
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [re_members_ams].[vwAwardIndividualRecipients] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* spCreate SQL for Award Individual Recipients */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Award Individual Recipients
-- Item: spCreateAwardIndividualRecipients
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR AwardIndividualRecipients
------------------------------------------------------------
IF OBJECT_ID('[re_members_ams].[spCreateAwardIndividualRecipients]', 'P') IS NOT NULL
    DROP PROCEDURE [re_members_ams].[spCreateAwardIndividualRecipients];
GO

CREATE PROCEDURE [re_members_ams].[spCreateAwardIndividualRecipients]
    @id nvarchar(255) = NULL,
    @recordNumber_Clear bit = 0,
    @recordNumber nvarchar(255) = NULL,
    @customerType_Clear bit = 0,
    @customerType nvarchar(255) = NULL,
    @phones_Clear bit = 0,
    @phones nvarchar(MAX) = NULL,
    @title_Clear bit = 0,
    @title nvarchar(255) = NULL,
    @primaryOrganization_Clear bit = 0,
    @primaryOrganization nvarchar(MAX) = NULL,
    @awardedDate_Clear bit = 0,
    @awardedDate nvarchar(255) = NULL,
    @emails_Clear bit = 0,
    @emails nvarchar(MAX) = NULL,
    @gender_Clear bit = 0,
    @gender nvarchar(255) = NULL,
    @suffix_Clear bit = 0,
    @suffix nvarchar(255) = NULL,
    @firstName_Clear bit = 0,
    @firstName nvarchar(255) = NULL,
    @secondLastName_Clear bit = 0,
    @secondLastName nvarchar(255) = NULL,
    @middleName_Clear bit = 0,
    @middleName nvarchar(255) = NULL,
    @prefix_Clear bit = 0,
    @prefix nvarchar(255) = NULL,
    @addresses_Clear bit = 0,
    @addresses nvarchar(MAX) = NULL,
    @lastName_Clear bit = 0,
    @lastName nvarchar(255) = NULL,
    @showInDirectory_Clear bit = 0,
    @showInDirectory nvarchar(255) = NULL,
    @preferredFirstName_Clear bit = 0,
    @preferredFirstName nvarchar(255) = NULL,
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
    [re_members_ams].[AwardIndividualRecipients]
        (
            [recordNumber],
                [customerType],
                [phones],
                [title],
                [primaryOrganization],
                [awardedDate],
                [emails],
                [gender],
                [suffix],
                [firstName],
                [secondLastName],
                [middleName],
                [prefix],
                [addresses],
                [lastName],
                [showInDirectory],
                [preferredFirstName],
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
            CASE WHEN @recordNumber_Clear = 1 THEN NULL ELSE ISNULL(@recordNumber, NULL) END,
                CASE WHEN @customerType_Clear = 1 THEN NULL ELSE ISNULL(@customerType, NULL) END,
                CASE WHEN @phones_Clear = 1 THEN NULL ELSE ISNULL(@phones, NULL) END,
                CASE WHEN @title_Clear = 1 THEN NULL ELSE ISNULL(@title, NULL) END,
                CASE WHEN @primaryOrganization_Clear = 1 THEN NULL ELSE ISNULL(@primaryOrganization, NULL) END,
                CASE WHEN @awardedDate_Clear = 1 THEN NULL ELSE ISNULL(@awardedDate, NULL) END,
                CASE WHEN @emails_Clear = 1 THEN NULL ELSE ISNULL(@emails, NULL) END,
                CASE WHEN @gender_Clear = 1 THEN NULL ELSE ISNULL(@gender, NULL) END,
                CASE WHEN @suffix_Clear = 1 THEN NULL ELSE ISNULL(@suffix, NULL) END,
                CASE WHEN @firstName_Clear = 1 THEN NULL ELSE ISNULL(@firstName, NULL) END,
                CASE WHEN @secondLastName_Clear = 1 THEN NULL ELSE ISNULL(@secondLastName, NULL) END,
                CASE WHEN @middleName_Clear = 1 THEN NULL ELSE ISNULL(@middleName, NULL) END,
                CASE WHEN @prefix_Clear = 1 THEN NULL ELSE ISNULL(@prefix, NULL) END,
                CASE WHEN @addresses_Clear = 1 THEN NULL ELSE ISNULL(@addresses, NULL) END,
                CASE WHEN @lastName_Clear = 1 THEN NULL ELSE ISNULL(@lastName, NULL) END,
                CASE WHEN @showInDirectory_Clear = 1 THEN NULL ELSE ISNULL(@showInDirectory, NULL) END,
                CASE WHEN @preferredFirstName_Clear = 1 THEN NULL ELSE ISNULL(@preferredFirstName, NULL) END,
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
    SELECT * FROM [re_members_ams].[vwAwardIndividualRecipients] WHERE [id] = @id
END
GO
GRANT EXECUTE ON [re_members_ams].[spCreateAwardIndividualRecipients] TO [cdp_Developer], [cdp_Integration];

/* spCreate Permissions for Award Individual Recipients */

GRANT EXECUTE ON [re_members_ams].[spCreateAwardIndividualRecipients] TO [cdp_Developer], [cdp_Integration];

/* spUpdate SQL for Award Individual Recipients */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Award Individual Recipients
-- Item: spUpdateAwardIndividualRecipients
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR AwardIndividualRecipients
------------------------------------------------------------
IF OBJECT_ID('[re_members_ams].[spUpdateAwardIndividualRecipients]', 'P') IS NOT NULL
    DROP PROCEDURE [re_members_ams].[spUpdateAwardIndividualRecipients];
GO

CREATE PROCEDURE [re_members_ams].[spUpdateAwardIndividualRecipients]
    @id nvarchar(255),
    @recordNumber_Clear bit = 0,
    @recordNumber nvarchar(255) = NULL,
    @customerType_Clear bit = 0,
    @customerType nvarchar(255) = NULL,
    @phones_Clear bit = 0,
    @phones nvarchar(MAX) = NULL,
    @title_Clear bit = 0,
    @title nvarchar(255) = NULL,
    @primaryOrganization_Clear bit = 0,
    @primaryOrganization nvarchar(MAX) = NULL,
    @awardedDate_Clear bit = 0,
    @awardedDate nvarchar(255) = NULL,
    @emails_Clear bit = 0,
    @emails nvarchar(MAX) = NULL,
    @gender_Clear bit = 0,
    @gender nvarchar(255) = NULL,
    @suffix_Clear bit = 0,
    @suffix nvarchar(255) = NULL,
    @firstName_Clear bit = 0,
    @firstName nvarchar(255) = NULL,
    @secondLastName_Clear bit = 0,
    @secondLastName nvarchar(255) = NULL,
    @middleName_Clear bit = 0,
    @middleName nvarchar(255) = NULL,
    @prefix_Clear bit = 0,
    @prefix nvarchar(255) = NULL,
    @addresses_Clear bit = 0,
    @addresses nvarchar(MAX) = NULL,
    @lastName_Clear bit = 0,
    @lastName nvarchar(255) = NULL,
    @showInDirectory_Clear bit = 0,
    @showInDirectory nvarchar(255) = NULL,
    @preferredFirstName_Clear bit = 0,
    @preferredFirstName nvarchar(255) = NULL,
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
        [re_members_ams].[AwardIndividualRecipients]
    SET
        [recordNumber] = CASE WHEN @recordNumber_Clear = 1 THEN NULL ELSE ISNULL(@recordNumber, [recordNumber]) END,
        [customerType] = CASE WHEN @customerType_Clear = 1 THEN NULL ELSE ISNULL(@customerType, [customerType]) END,
        [phones] = CASE WHEN @phones_Clear = 1 THEN NULL ELSE ISNULL(@phones, [phones]) END,
        [title] = CASE WHEN @title_Clear = 1 THEN NULL ELSE ISNULL(@title, [title]) END,
        [primaryOrganization] = CASE WHEN @primaryOrganization_Clear = 1 THEN NULL ELSE ISNULL(@primaryOrganization, [primaryOrganization]) END,
        [awardedDate] = CASE WHEN @awardedDate_Clear = 1 THEN NULL ELSE ISNULL(@awardedDate, [awardedDate]) END,
        [emails] = CASE WHEN @emails_Clear = 1 THEN NULL ELSE ISNULL(@emails, [emails]) END,
        [gender] = CASE WHEN @gender_Clear = 1 THEN NULL ELSE ISNULL(@gender, [gender]) END,
        [suffix] = CASE WHEN @suffix_Clear = 1 THEN NULL ELSE ISNULL(@suffix, [suffix]) END,
        [firstName] = CASE WHEN @firstName_Clear = 1 THEN NULL ELSE ISNULL(@firstName, [firstName]) END,
        [secondLastName] = CASE WHEN @secondLastName_Clear = 1 THEN NULL ELSE ISNULL(@secondLastName, [secondLastName]) END,
        [middleName] = CASE WHEN @middleName_Clear = 1 THEN NULL ELSE ISNULL(@middleName, [middleName]) END,
        [prefix] = CASE WHEN @prefix_Clear = 1 THEN NULL ELSE ISNULL(@prefix, [prefix]) END,
        [addresses] = CASE WHEN @addresses_Clear = 1 THEN NULL ELSE ISNULL(@addresses, [addresses]) END,
        [lastName] = CASE WHEN @lastName_Clear = 1 THEN NULL ELSE ISNULL(@lastName, [lastName]) END,
        [showInDirectory] = CASE WHEN @showInDirectory_Clear = 1 THEN NULL ELSE ISNULL(@showInDirectory, [showInDirectory]) END,
        [preferredFirstName] = CASE WHEN @preferredFirstName_Clear = 1 THEN NULL ELSE ISNULL(@preferredFirstName, [preferredFirstName]) END,
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
        SELECT TOP 0 * FROM [re_members_ams].[vwAwardIndividualRecipients] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [re_members_ams].[vwAwardIndividualRecipients]
                                    WHERE
                                        [id] = @id
                                    
END
GO

GRANT EXECUTE ON [re_members_ams].[spUpdateAwardIndividualRecipients] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the AwardIndividualRecipients table
------------------------------------------------------------
IF OBJECT_ID('[re_members_ams].[trgUpdateAwardIndividualRecipients]', 'TR') IS NOT NULL
    DROP TRIGGER [re_members_ams].[trgUpdateAwardIndividualRecipients];
GO
CREATE TRIGGER [re_members_ams].trgUpdateAwardIndividualRecipients
ON [re_members_ams].[AwardIndividualRecipients]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [re_members_ams].[AwardIndividualRecipients]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [re_members_ams].[AwardIndividualRecipients] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[id] = I.[id];
END;
GO

/* spUpdate Permissions for Award Individual Recipients */

GRANT EXECUTE ON [re_members_ams].[spUpdateAwardIndividualRecipients] TO [cdp_Developer], [cdp_Integration];

/* Base View SQL for Award Nominations */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Award Nominations
-- Item: vwAwardNominations
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      Award Nominations
-----               SCHEMA:      re_members_ams
-----               BASE TABLE:  AwardNominations
-----               PRIMARY KEY: nomineeRecordNumber
------------------------------------------------------------
IF OBJECT_ID('[re_members_ams].[vwAwardNominations]', 'V') IS NOT NULL
    DROP VIEW [re_members_ams].[vwAwardNominations];
GO

CREATE VIEW [re_members_ams].[vwAwardNominations]
AS
SELECT
    a.*
FROM
    [re_members_ams].[AwardNominations] AS a
GO
GRANT SELECT ON [re_members_ams].[vwAwardNominations] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* Base View Permissions SQL for Award Nominations */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Award Nominations
-- Item: Permissions for vwAwardNominations
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [re_members_ams].[vwAwardNominations] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* spCreate SQL for Award Nominations */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Award Nominations
-- Item: spCreateAwardNominations
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR AwardNominations
------------------------------------------------------------
IF OBJECT_ID('[re_members_ams].[spCreateAwardNominations]', 'P') IS NOT NULL
    DROP PROCEDURE [re_members_ams].[spCreateAwardNominations];
GO

CREATE PROCEDURE [re_members_ams].[spCreateAwardNominations]
    @nominatedByCustomerRecordNumber_Clear bit = 0,
    @nominatedByCustomerRecordNumber nvarchar(255) = NULL,
    @description_Clear bit = 0,
    @description nvarchar(255) = NULL,
    @nomineeRecordNumber nvarchar(255) = NULL,
    @status_Clear bit = 0,
    @status nvarchar(255) = NULL,
    @awardedDate_Clear bit = 0,
    @awardedDate nvarchar(255) = NULL,
    @nominationDate_Clear bit = 0,
    @nominationDate nvarchar(255) = NULL,
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
    [re_members_ams].[AwardNominations]
        (
            [nominatedByCustomerRecordNumber],
                [description],
                [status],
                [awardedDate],
                [nominationDate],
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
                [nomineeRecordNumber]
        )
    VALUES
        (
            CASE WHEN @nominatedByCustomerRecordNumber_Clear = 1 THEN NULL ELSE ISNULL(@nominatedByCustomerRecordNumber, NULL) END,
                CASE WHEN @description_Clear = 1 THEN NULL ELSE ISNULL(@description, NULL) END,
                CASE WHEN @status_Clear = 1 THEN NULL ELSE ISNULL(@status, NULL) END,
                CASE WHEN @awardedDate_Clear = 1 THEN NULL ELSE ISNULL(@awardedDate, NULL) END,
                CASE WHEN @nominationDate_Clear = 1 THEN NULL ELSE ISNULL(@nominationDate, NULL) END,
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
                @nomineeRecordNumber
        )
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [re_members_ams].[vwAwardNominations] WHERE [nomineeRecordNumber] = @nomineeRecordNumber
END
GO
GRANT EXECUTE ON [re_members_ams].[spCreateAwardNominations] TO [cdp_Developer], [cdp_Integration];

/* spCreate Permissions for Award Nominations */

GRANT EXECUTE ON [re_members_ams].[spCreateAwardNominations] TO [cdp_Developer], [cdp_Integration];

/* spUpdate SQL for Award Nominations */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Award Nominations
-- Item: spUpdateAwardNominations
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR AwardNominations
------------------------------------------------------------
IF OBJECT_ID('[re_members_ams].[spUpdateAwardNominations]', 'P') IS NOT NULL
    DROP PROCEDURE [re_members_ams].[spUpdateAwardNominations];
GO

CREATE PROCEDURE [re_members_ams].[spUpdateAwardNominations]
    @nominatedByCustomerRecordNumber_Clear bit = 0,
    @nominatedByCustomerRecordNumber nvarchar(255) = NULL,
    @description_Clear bit = 0,
    @description nvarchar(255) = NULL,
    @nomineeRecordNumber nvarchar(255),
    @status_Clear bit = 0,
    @status nvarchar(255) = NULL,
    @awardedDate_Clear bit = 0,
    @awardedDate nvarchar(255) = NULL,
    @nominationDate_Clear bit = 0,
    @nominationDate nvarchar(255) = NULL,
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
        [re_members_ams].[AwardNominations]
    SET
        [nominatedByCustomerRecordNumber] = CASE WHEN @nominatedByCustomerRecordNumber_Clear = 1 THEN NULL ELSE ISNULL(@nominatedByCustomerRecordNumber, [nominatedByCustomerRecordNumber]) END,
        [description] = CASE WHEN @description_Clear = 1 THEN NULL ELSE ISNULL(@description, [description]) END,
        [status] = CASE WHEN @status_Clear = 1 THEN NULL ELSE ISNULL(@status, [status]) END,
        [awardedDate] = CASE WHEN @awardedDate_Clear = 1 THEN NULL ELSE ISNULL(@awardedDate, [awardedDate]) END,
        [nominationDate] = CASE WHEN @nominationDate_Clear = 1 THEN NULL ELSE ISNULL(@nominationDate, [nominationDate]) END,
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
        [nomineeRecordNumber] = @nomineeRecordNumber

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [re_members_ams].[vwAwardNominations] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [re_members_ams].[vwAwardNominations]
                                    WHERE
                                        [nomineeRecordNumber] = @nomineeRecordNumber
                                    
END
GO

GRANT EXECUTE ON [re_members_ams].[spUpdateAwardNominations] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the AwardNominations table
------------------------------------------------------------
IF OBJECT_ID('[re_members_ams].[trgUpdateAwardNominations]', 'TR') IS NOT NULL
    DROP TRIGGER [re_members_ams].[trgUpdateAwardNominations];
GO
CREATE TRIGGER [re_members_ams].trgUpdateAwardNominations
ON [re_members_ams].[AwardNominations]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [re_members_ams].[AwardNominations]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [re_members_ams].[AwardNominations] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[nomineeRecordNumber] = I.[nomineeRecordNumber];
END;
GO

/* spUpdate Permissions for Award Nominations */

GRANT EXECUTE ON [re_members_ams].[spUpdateAwardNominations] TO [cdp_Developer], [cdp_Integration];

/* Base View SQL for Award Organization Recipients */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Award Organization Recipients
-- Item: vwAwardOrganizationRecipients
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      Award Organization Recipients
-----               SCHEMA:      re_members_ams
-----               BASE TABLE:  AwardOrganizationRecipients
-----               PRIMARY KEY: id
------------------------------------------------------------
IF OBJECT_ID('[re_members_ams].[vwAwardOrganizationRecipients]', 'V') IS NOT NULL
    DROP VIEW [re_members_ams].[vwAwardOrganizationRecipients];
GO

CREATE VIEW [re_members_ams].[vwAwardOrganizationRecipients]
AS
SELECT
    a.*
FROM
    [re_members_ams].[AwardOrganizationRecipients] AS a
GO
GRANT SELECT ON [re_members_ams].[vwAwardOrganizationRecipients] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* Base View Permissions SQL for Award Organization Recipients */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Award Organization Recipients
-- Item: Permissions for vwAwardOrganizationRecipients
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [re_members_ams].[vwAwardOrganizationRecipients] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* spCreate SQL for Award Organization Recipients */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Award Organization Recipients
-- Item: spCreateAwardOrganizationRecipients
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR AwardOrganizationRecipients
------------------------------------------------------------
IF OBJECT_ID('[re_members_ams].[spCreateAwardOrganizationRecipients]', 'P') IS NOT NULL
    DROP PROCEDURE [re_members_ams].[spCreateAwardOrganizationRecipients];
GO

CREATE PROCEDURE [re_members_ams].[spCreateAwardOrganizationRecipients]
    @emails_Clear bit = 0,
    @emails nvarchar(MAX) = NULL,
    @id nvarchar(255) = NULL,
    @showInDirectory_Clear bit = 0,
    @showInDirectory nvarchar(255) = NULL,
    @branchName_Clear bit = 0,
    @branchName nvarchar(255) = NULL,
    @recordNumber_Clear bit = 0,
    @recordNumber nvarchar(255) = NULL,
    @acronym_Clear bit = 0,
    @acronym nvarchar(255) = NULL,
    @awardedDate_Clear bit = 0,
    @awardedDate nvarchar(255) = NULL,
    @addresses_Clear bit = 0,
    @addresses nvarchar(MAX) = NULL,
    @name_Clear bit = 0,
    @name nvarchar(255) = NULL,
    @employeeRangeId_Clear bit = 0,
    @employeeRangeId nvarchar(255) = NULL,
    @customerType_Clear bit = 0,
    @customerType nvarchar(255) = NULL,
    @phones_Clear bit = 0,
    @phones nvarchar(MAX) = NULL,
    @annualSales_Clear bit = 0,
    @annualSales nvarchar(255) = NULL,
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
    [re_members_ams].[AwardOrganizationRecipients]
        (
            [emails],
                [showInDirectory],
                [branchName],
                [recordNumber],
                [acronym],
                [awardedDate],
                [addresses],
                [name],
                [employeeRangeId],
                [customerType],
                [phones],
                [annualSales],
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
            CASE WHEN @emails_Clear = 1 THEN NULL ELSE ISNULL(@emails, NULL) END,
                CASE WHEN @showInDirectory_Clear = 1 THEN NULL ELSE ISNULL(@showInDirectory, NULL) END,
                CASE WHEN @branchName_Clear = 1 THEN NULL ELSE ISNULL(@branchName, NULL) END,
                CASE WHEN @recordNumber_Clear = 1 THEN NULL ELSE ISNULL(@recordNumber, NULL) END,
                CASE WHEN @acronym_Clear = 1 THEN NULL ELSE ISNULL(@acronym, NULL) END,
                CASE WHEN @awardedDate_Clear = 1 THEN NULL ELSE ISNULL(@awardedDate, NULL) END,
                CASE WHEN @addresses_Clear = 1 THEN NULL ELSE ISNULL(@addresses, NULL) END,
                CASE WHEN @name_Clear = 1 THEN NULL ELSE ISNULL(@name, NULL) END,
                CASE WHEN @employeeRangeId_Clear = 1 THEN NULL ELSE ISNULL(@employeeRangeId, NULL) END,
                CASE WHEN @customerType_Clear = 1 THEN NULL ELSE ISNULL(@customerType, NULL) END,
                CASE WHEN @phones_Clear = 1 THEN NULL ELSE ISNULL(@phones, NULL) END,
                CASE WHEN @annualSales_Clear = 1 THEN NULL ELSE ISNULL(@annualSales, NULL) END,
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
    SELECT * FROM [re_members_ams].[vwAwardOrganizationRecipients] WHERE [id] = @id
END
GO
GRANT EXECUTE ON [re_members_ams].[spCreateAwardOrganizationRecipients] TO [cdp_Developer], [cdp_Integration];

/* spCreate Permissions for Award Organization Recipients */

GRANT EXECUTE ON [re_members_ams].[spCreateAwardOrganizationRecipients] TO [cdp_Developer], [cdp_Integration];

/* spUpdate SQL for Award Organization Recipients */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Award Organization Recipients
-- Item: spUpdateAwardOrganizationRecipients
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR AwardOrganizationRecipients
------------------------------------------------------------
IF OBJECT_ID('[re_members_ams].[spUpdateAwardOrganizationRecipients]', 'P') IS NOT NULL
    DROP PROCEDURE [re_members_ams].[spUpdateAwardOrganizationRecipients];
GO

CREATE PROCEDURE [re_members_ams].[spUpdateAwardOrganizationRecipients]
    @emails_Clear bit = 0,
    @emails nvarchar(MAX) = NULL,
    @id nvarchar(255),
    @showInDirectory_Clear bit = 0,
    @showInDirectory nvarchar(255) = NULL,
    @branchName_Clear bit = 0,
    @branchName nvarchar(255) = NULL,
    @recordNumber_Clear bit = 0,
    @recordNumber nvarchar(255) = NULL,
    @acronym_Clear bit = 0,
    @acronym nvarchar(255) = NULL,
    @awardedDate_Clear bit = 0,
    @awardedDate nvarchar(255) = NULL,
    @addresses_Clear bit = 0,
    @addresses nvarchar(MAX) = NULL,
    @name_Clear bit = 0,
    @name nvarchar(255) = NULL,
    @employeeRangeId_Clear bit = 0,
    @employeeRangeId nvarchar(255) = NULL,
    @customerType_Clear bit = 0,
    @customerType nvarchar(255) = NULL,
    @phones_Clear bit = 0,
    @phones nvarchar(MAX) = NULL,
    @annualSales_Clear bit = 0,
    @annualSales nvarchar(255) = NULL,
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
        [re_members_ams].[AwardOrganizationRecipients]
    SET
        [emails] = CASE WHEN @emails_Clear = 1 THEN NULL ELSE ISNULL(@emails, [emails]) END,
        [showInDirectory] = CASE WHEN @showInDirectory_Clear = 1 THEN NULL ELSE ISNULL(@showInDirectory, [showInDirectory]) END,
        [branchName] = CASE WHEN @branchName_Clear = 1 THEN NULL ELSE ISNULL(@branchName, [branchName]) END,
        [recordNumber] = CASE WHEN @recordNumber_Clear = 1 THEN NULL ELSE ISNULL(@recordNumber, [recordNumber]) END,
        [acronym] = CASE WHEN @acronym_Clear = 1 THEN NULL ELSE ISNULL(@acronym, [acronym]) END,
        [awardedDate] = CASE WHEN @awardedDate_Clear = 1 THEN NULL ELSE ISNULL(@awardedDate, [awardedDate]) END,
        [addresses] = CASE WHEN @addresses_Clear = 1 THEN NULL ELSE ISNULL(@addresses, [addresses]) END,
        [name] = CASE WHEN @name_Clear = 1 THEN NULL ELSE ISNULL(@name, [name]) END,
        [employeeRangeId] = CASE WHEN @employeeRangeId_Clear = 1 THEN NULL ELSE ISNULL(@employeeRangeId, [employeeRangeId]) END,
        [customerType] = CASE WHEN @customerType_Clear = 1 THEN NULL ELSE ISNULL(@customerType, [customerType]) END,
        [phones] = CASE WHEN @phones_Clear = 1 THEN NULL ELSE ISNULL(@phones, [phones]) END,
        [annualSales] = CASE WHEN @annualSales_Clear = 1 THEN NULL ELSE ISNULL(@annualSales, [annualSales]) END,
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
        SELECT TOP 0 * FROM [re_members_ams].[vwAwardOrganizationRecipients] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [re_members_ams].[vwAwardOrganizationRecipients]
                                    WHERE
                                        [id] = @id
                                    
END
GO

GRANT EXECUTE ON [re_members_ams].[spUpdateAwardOrganizationRecipients] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the AwardOrganizationRecipients table
------------------------------------------------------------
IF OBJECT_ID('[re_members_ams].[trgUpdateAwardOrganizationRecipients]', 'TR') IS NOT NULL
    DROP TRIGGER [re_members_ams].[trgUpdateAwardOrganizationRecipients];
GO
CREATE TRIGGER [re_members_ams].trgUpdateAwardOrganizationRecipients
ON [re_members_ams].[AwardOrganizationRecipients]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [re_members_ams].[AwardOrganizationRecipients]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [re_members_ams].[AwardOrganizationRecipients] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[id] = I.[id];
END;
GO

/* spUpdate Permissions for Award Organization Recipients */

GRANT EXECUTE ON [re_members_ams].[spUpdateAwardOrganizationRecipients] TO [cdp_Developer], [cdp_Integration];

/* spDelete SQL for Abandoned Checkouts */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Abandoned Checkouts
-- Item: spDeleteAbandonedCheckouts
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR AbandonedCheckouts
------------------------------------------------------------
IF OBJECT_ID('[re_members_ams].[spDeleteAbandonedCheckouts]', 'P') IS NOT NULL
    DROP PROCEDURE [re_members_ams].[spDeleteAbandonedCheckouts];
GO

CREATE PROCEDURE [re_members_ams].[spDeleteAbandonedCheckouts]
    @ID nvarchar(450)
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [re_members_ams].[AbandonedCheckouts]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [re_members_ams].[spDeleteAbandonedCheckouts] TO [cdp_Developer], [cdp_Integration];

/* spDelete Permissions for Abandoned Checkouts */

GRANT EXECUTE ON [re_members_ams].[spDeleteAbandonedCheckouts] TO [cdp_Developer], [cdp_Integration];

/* spDelete SQL for Addresses */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Addresses
-- Item: spDeleteAddresses
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR Addresses
------------------------------------------------------------
IF OBJECT_ID('[re_members_ams].[spDeleteAddresses]', 'P') IS NOT NULL
    DROP PROCEDURE [re_members_ams].[spDeleteAddresses];
GO

CREATE PROCEDURE [re_members_ams].[spDeleteAddresses]
    @id nvarchar(255)
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [re_members_ams].[Addresses]
    WHERE
        [id] = @id


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [id] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @id AS [id] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [re_members_ams].[spDeleteAddresses] TO [cdp_Developer], [cdp_Integration];

/* spDelete Permissions for Addresses */

GRANT EXECUTE ON [re_members_ams].[spDeleteAddresses] TO [cdp_Developer], [cdp_Integration];

/* spDelete SQL for Award Individual Recipients */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Award Individual Recipients
-- Item: spDeleteAwardIndividualRecipients
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR AwardIndividualRecipients
------------------------------------------------------------
IF OBJECT_ID('[re_members_ams].[spDeleteAwardIndividualRecipients]', 'P') IS NOT NULL
    DROP PROCEDURE [re_members_ams].[spDeleteAwardIndividualRecipients];
GO

CREATE PROCEDURE [re_members_ams].[spDeleteAwardIndividualRecipients]
    @id nvarchar(255)
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [re_members_ams].[AwardIndividualRecipients]
    WHERE
        [id] = @id


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [id] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @id AS [id] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [re_members_ams].[spDeleteAwardIndividualRecipients] TO [cdp_Developer], [cdp_Integration];

/* spDelete Permissions for Award Individual Recipients */

GRANT EXECUTE ON [re_members_ams].[spDeleteAwardIndividualRecipients] TO [cdp_Developer], [cdp_Integration];

/* spDelete SQL for Award Nominations */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Award Nominations
-- Item: spDeleteAwardNominations
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR AwardNominations
------------------------------------------------------------
IF OBJECT_ID('[re_members_ams].[spDeleteAwardNominations]', 'P') IS NOT NULL
    DROP PROCEDURE [re_members_ams].[spDeleteAwardNominations];
GO

CREATE PROCEDURE [re_members_ams].[spDeleteAwardNominations]
    @nomineeRecordNumber nvarchar(255)
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [re_members_ams].[AwardNominations]
    WHERE
        [nomineeRecordNumber] = @nomineeRecordNumber


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [nomineeRecordNumber] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @nomineeRecordNumber AS [nomineeRecordNumber] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [re_members_ams].[spDeleteAwardNominations] TO [cdp_Developer], [cdp_Integration];

/* spDelete Permissions for Award Nominations */

GRANT EXECUTE ON [re_members_ams].[spDeleteAwardNominations] TO [cdp_Developer], [cdp_Integration];

/* spDelete SQL for Award Organization Recipients */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Award Organization Recipients
-- Item: spDeleteAwardOrganizationRecipients
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR AwardOrganizationRecipients
------------------------------------------------------------
IF OBJECT_ID('[re_members_ams].[spDeleteAwardOrganizationRecipients]', 'P') IS NOT NULL
    DROP PROCEDURE [re_members_ams].[spDeleteAwardOrganizationRecipients];
GO

CREATE PROCEDURE [re_members_ams].[spDeleteAwardOrganizationRecipients]
    @id nvarchar(255)
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [re_members_ams].[AwardOrganizationRecipients]
    WHERE
        [id] = @id


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [id] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @id AS [id] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [re_members_ams].[spDeleteAwardOrganizationRecipients] TO [cdp_Developer], [cdp_Integration];

/* spDelete Permissions for Award Organization Recipients */

GRANT EXECUTE ON [re_members_ams].[spDeleteAwardOrganizationRecipients] TO [cdp_Developer], [cdp_Integration];

/* Index for Foreign Keys for Awards */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Awards
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------;

/* Index for Foreign Keys for Categories */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Categories
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------;

/* Index for Foreign Keys for Certifications */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Certifications
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------;

/* Index for Foreign Keys for CommitteeMembers */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Committee Members
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------;

/* Index for Foreign Keys for CommitteeNominees */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Committee Nominees
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------;

/* Base View SQL for Awards */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Awards
-- Item: vwAwards
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      Awards
-----               SCHEMA:      re_members_ams
-----               BASE TABLE:  Awards
-----               PRIMARY KEY: id
------------------------------------------------------------
IF OBJECT_ID('[re_members_ams].[vwAwards]', 'V') IS NOT NULL
    DROP VIEW [re_members_ams].[vwAwards];
GO

CREATE VIEW [re_members_ams].[vwAwards]
AS
SELECT
    a.*
FROM
    [re_members_ams].[Awards] AS a
GO
GRANT SELECT ON [re_members_ams].[vwAwards] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* Base View Permissions SQL for Awards */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Awards
-- Item: Permissions for vwAwards
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [re_members_ams].[vwAwards] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* spCreate SQL for Awards */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Awards
-- Item: spCreateAwards
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR Awards
------------------------------------------------------------
IF OBJECT_ID('[re_members_ams].[spCreateAwards]', 'P') IS NOT NULL
    DROP PROCEDURE [re_members_ams].[spCreateAwards];
GO

CREATE PROCEDURE [re_members_ams].[spCreateAwards]
    @customerType_Clear bit = 0,
    @customerType nvarchar(812) = NULL,
    @nominationEndDate_Clear bit = 0,
    @nominationEndDate nvarchar(MAX) = NULL,
    @nominationStartDate_Clear bit = 0,
    @nominationStartDate nvarchar(MAX) = NULL,
    @year_Clear bit = 0,
    @year nvarchar(MAX) = NULL,
    @id nvarchar(450) = NULL,
    @description_Clear bit = 0,
    @description nvarchar(812) = NULL,
    @mj_e2e_custom_attr_Clear bit = 0,
    @mj_e2e_custom_attr nvarchar(812) = NULL,
    @name_Clear bit = 0,
    @name nvarchar(812) = NULL,
    @allowPublicNomination_Clear bit = 0,
    @allowPublicNomination nvarchar(MAX) = NULL,
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
    [re_members_ams].[Awards]
        (
            [customerType],
                [nominationEndDate],
                [nominationStartDate],
                [year],
                [description],
                [mj_e2e_custom_attr],
                [name],
                [allowPublicNomination],
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
            CASE WHEN @customerType_Clear = 1 THEN NULL ELSE ISNULL(@customerType, NULL) END,
                CASE WHEN @nominationEndDate_Clear = 1 THEN NULL ELSE ISNULL(@nominationEndDate, NULL) END,
                CASE WHEN @nominationStartDate_Clear = 1 THEN NULL ELSE ISNULL(@nominationStartDate, NULL) END,
                CASE WHEN @year_Clear = 1 THEN NULL ELSE ISNULL(@year, NULL) END,
                CASE WHEN @description_Clear = 1 THEN NULL ELSE ISNULL(@description, NULL) END,
                CASE WHEN @mj_e2e_custom_attr_Clear = 1 THEN NULL ELSE ISNULL(@mj_e2e_custom_attr, NULL) END,
                CASE WHEN @name_Clear = 1 THEN NULL ELSE ISNULL(@name, NULL) END,
                CASE WHEN @allowPublicNomination_Clear = 1 THEN NULL ELSE ISNULL(@allowPublicNomination, NULL) END,
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
    SELECT * FROM [re_members_ams].[vwAwards] WHERE [id] = @id
END
GO
GRANT EXECUTE ON [re_members_ams].[spCreateAwards] TO [cdp_Developer], [cdp_Integration];

/* spCreate Permissions for Awards */

GRANT EXECUTE ON [re_members_ams].[spCreateAwards] TO [cdp_Developer], [cdp_Integration];

/* spUpdate SQL for Awards */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Awards
-- Item: spUpdateAwards
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR Awards
------------------------------------------------------------
IF OBJECT_ID('[re_members_ams].[spUpdateAwards]', 'P') IS NOT NULL
    DROP PROCEDURE [re_members_ams].[spUpdateAwards];
GO

CREATE PROCEDURE [re_members_ams].[spUpdateAwards]
    @customerType_Clear bit = 0,
    @customerType nvarchar(812) = NULL,
    @nominationEndDate_Clear bit = 0,
    @nominationEndDate nvarchar(MAX) = NULL,
    @nominationStartDate_Clear bit = 0,
    @nominationStartDate nvarchar(MAX) = NULL,
    @year_Clear bit = 0,
    @year nvarchar(MAX) = NULL,
    @id nvarchar(450),
    @description_Clear bit = 0,
    @description nvarchar(812) = NULL,
    @mj_e2e_custom_attr_Clear bit = 0,
    @mj_e2e_custom_attr nvarchar(812) = NULL,
    @name_Clear bit = 0,
    @name nvarchar(812) = NULL,
    @allowPublicNomination_Clear bit = 0,
    @allowPublicNomination nvarchar(MAX) = NULL,
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
        [re_members_ams].[Awards]
    SET
        [customerType] = CASE WHEN @customerType_Clear = 1 THEN NULL ELSE ISNULL(@customerType, [customerType]) END,
        [nominationEndDate] = CASE WHEN @nominationEndDate_Clear = 1 THEN NULL ELSE ISNULL(@nominationEndDate, [nominationEndDate]) END,
        [nominationStartDate] = CASE WHEN @nominationStartDate_Clear = 1 THEN NULL ELSE ISNULL(@nominationStartDate, [nominationStartDate]) END,
        [year] = CASE WHEN @year_Clear = 1 THEN NULL ELSE ISNULL(@year, [year]) END,
        [description] = CASE WHEN @description_Clear = 1 THEN NULL ELSE ISNULL(@description, [description]) END,
        [mj_e2e_custom_attr] = CASE WHEN @mj_e2e_custom_attr_Clear = 1 THEN NULL ELSE ISNULL(@mj_e2e_custom_attr, [mj_e2e_custom_attr]) END,
        [name] = CASE WHEN @name_Clear = 1 THEN NULL ELSE ISNULL(@name, [name]) END,
        [allowPublicNomination] = CASE WHEN @allowPublicNomination_Clear = 1 THEN NULL ELSE ISNULL(@allowPublicNomination, [allowPublicNomination]) END,
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
        SELECT TOP 0 * FROM [re_members_ams].[vwAwards] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [re_members_ams].[vwAwards]
                                    WHERE
                                        [id] = @id
                                    
END
GO

GRANT EXECUTE ON [re_members_ams].[spUpdateAwards] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the Awards table
------------------------------------------------------------
IF OBJECT_ID('[re_members_ams].[trgUpdateAwards]', 'TR') IS NOT NULL
    DROP TRIGGER [re_members_ams].[trgUpdateAwards];
GO
CREATE TRIGGER [re_members_ams].trgUpdateAwards
ON [re_members_ams].[Awards]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [re_members_ams].[Awards]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [re_members_ams].[Awards] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[id] = I.[id];
END;
GO

/* spUpdate Permissions for Awards */

GRANT EXECUTE ON [re_members_ams].[spUpdateAwards] TO [cdp_Developer], [cdp_Integration];

/* Base View SQL for Categories */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Categories
-- Item: vwCategories
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      Categories
-----               SCHEMA:      re_members_ams
-----               BASE TABLE:  Categories
-----               PRIMARY KEY: code
------------------------------------------------------------
IF OBJECT_ID('[re_members_ams].[vwCategories]', 'V') IS NOT NULL
    DROP VIEW [re_members_ams].[vwCategories];
GO

CREATE VIEW [re_members_ams].[vwCategories]
AS
SELECT
    c.*
FROM
    [re_members_ams].[Categories] AS c
GO
GRANT SELECT ON [re_members_ams].[vwCategories] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* Base View Permissions SQL for Categories */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Categories
-- Item: Permissions for vwCategories
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [re_members_ams].[vwCategories] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* spCreate SQL for Categories */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Categories
-- Item: spCreateCategories
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR Categories
------------------------------------------------------------
IF OBJECT_ID('[re_members_ams].[spCreateCategories]', 'P') IS NOT NULL
    DROP PROCEDURE [re_members_ams].[spCreateCategories];
GO

CREATE PROCEDURE [re_members_ams].[spCreateCategories]
    @isPrimary_Clear bit = 0,
    @isPrimary nvarchar(255) = NULL,
    @code nvarchar(400) = NULL,
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
    [re_members_ams].[Categories]
        (
            [isPrimary],
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
            CASE WHEN @isPrimary_Clear = 1 THEN NULL ELSE ISNULL(@isPrimary, NULL) END,
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
    SELECT * FROM [re_members_ams].[vwCategories] WHERE [code] = @code
END
GO
GRANT EXECUTE ON [re_members_ams].[spCreateCategories] TO [cdp_Developer], [cdp_Integration];

/* spCreate Permissions for Categories */

GRANT EXECUTE ON [re_members_ams].[spCreateCategories] TO [cdp_Developer], [cdp_Integration];

/* spUpdate SQL for Categories */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Categories
-- Item: spUpdateCategories
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR Categories
------------------------------------------------------------
IF OBJECT_ID('[re_members_ams].[spUpdateCategories]', 'P') IS NOT NULL
    DROP PROCEDURE [re_members_ams].[spUpdateCategories];
GO

CREATE PROCEDURE [re_members_ams].[spUpdateCategories]
    @isPrimary_Clear bit = 0,
    @isPrimary nvarchar(255) = NULL,
    @code nvarchar(400),
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
        [re_members_ams].[Categories]
    SET
        [isPrimary] = CASE WHEN @isPrimary_Clear = 1 THEN NULL ELSE ISNULL(@isPrimary, [isPrimary]) END,
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
        SELECT TOP 0 * FROM [re_members_ams].[vwCategories] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [re_members_ams].[vwCategories]
                                    WHERE
                                        [code] = @code
                                    
END
GO

GRANT EXECUTE ON [re_members_ams].[spUpdateCategories] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the Categories table
------------------------------------------------------------
IF OBJECT_ID('[re_members_ams].[trgUpdateCategories]', 'TR') IS NOT NULL
    DROP TRIGGER [re_members_ams].[trgUpdateCategories];
GO
CREATE TRIGGER [re_members_ams].trgUpdateCategories
ON [re_members_ams].[Categories]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [re_members_ams].[Categories]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [re_members_ams].[Categories] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[code] = I.[code];
END;
GO

/* spUpdate Permissions for Categories */

GRANT EXECUTE ON [re_members_ams].[spUpdateCategories] TO [cdp_Developer], [cdp_Integration];

/* Base View SQL for Certifications */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Certifications
-- Item: vwCertifications
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      Certifications
-----               SCHEMA:      re_members_ams
-----               BASE TABLE:  Certifications
-----               PRIMARY KEY: code
------------------------------------------------------------
IF OBJECT_ID('[re_members_ams].[vwCertifications]', 'V') IS NOT NULL
    DROP VIEW [re_members_ams].[vwCertifications];
GO

CREATE VIEW [re_members_ams].[vwCertifications]
AS
SELECT
    c.*
FROM
    [re_members_ams].[Certifications] AS c
GO
GRANT SELECT ON [re_members_ams].[vwCertifications] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* Base View Permissions SQL for Certifications */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Certifications
-- Item: Permissions for vwCertifications
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [re_members_ams].[vwCertifications] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* spCreate SQL for Certifications */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Certifications
-- Item: spCreateCertifications
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR Certifications
------------------------------------------------------------
IF OBJECT_ID('[re_members_ams].[spCreateCertifications]', 'P') IS NOT NULL
    DROP PROCEDURE [re_members_ams].[spCreateCertifications];
GO

CREATE PROCEDURE [re_members_ams].[spCreateCertifications]
    @name_Clear bit = 0,
    @name nvarchar(255) = NULL,
    @code nvarchar(255) = NULL,
    @expireDate_Clear bit = 0,
    @expireDate nvarchar(255) = NULL,
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
    [re_members_ams].[Certifications]
        (
            [name],
                [expireDate],
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
                CASE WHEN @expireDate_Clear = 1 THEN NULL ELSE ISNULL(@expireDate, NULL) END,
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
    SELECT * FROM [re_members_ams].[vwCertifications] WHERE [code] = @code
END
GO
GRANT EXECUTE ON [re_members_ams].[spCreateCertifications] TO [cdp_Developer], [cdp_Integration];

/* spCreate Permissions for Certifications */

GRANT EXECUTE ON [re_members_ams].[spCreateCertifications] TO [cdp_Developer], [cdp_Integration];

/* spUpdate SQL for Certifications */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Certifications
-- Item: spUpdateCertifications
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR Certifications
------------------------------------------------------------
IF OBJECT_ID('[re_members_ams].[spUpdateCertifications]', 'P') IS NOT NULL
    DROP PROCEDURE [re_members_ams].[spUpdateCertifications];
GO

CREATE PROCEDURE [re_members_ams].[spUpdateCertifications]
    @name_Clear bit = 0,
    @name nvarchar(255) = NULL,
    @code nvarchar(255),
    @expireDate_Clear bit = 0,
    @expireDate nvarchar(255) = NULL,
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
        [re_members_ams].[Certifications]
    SET
        [name] = CASE WHEN @name_Clear = 1 THEN NULL ELSE ISNULL(@name, [name]) END,
        [expireDate] = CASE WHEN @expireDate_Clear = 1 THEN NULL ELSE ISNULL(@expireDate, [expireDate]) END,
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
        SELECT TOP 0 * FROM [re_members_ams].[vwCertifications] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [re_members_ams].[vwCertifications]
                                    WHERE
                                        [code] = @code
                                    
END
GO

GRANT EXECUTE ON [re_members_ams].[spUpdateCertifications] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the Certifications table
------------------------------------------------------------
IF OBJECT_ID('[re_members_ams].[trgUpdateCertifications]', 'TR') IS NOT NULL
    DROP TRIGGER [re_members_ams].[trgUpdateCertifications];
GO
CREATE TRIGGER [re_members_ams].trgUpdateCertifications
ON [re_members_ams].[Certifications]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [re_members_ams].[Certifications]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [re_members_ams].[Certifications] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[code] = I.[code];
END;
GO

/* spUpdate Permissions for Certifications */

GRANT EXECUTE ON [re_members_ams].[spUpdateCertifications] TO [cdp_Developer], [cdp_Integration];

/* Base View SQL for Committee Members */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Committee Members
-- Item: vwCommitteeMembers
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      Committee Members
-----               SCHEMA:      re_members_ams
-----               BASE TABLE:  CommitteeMembers
-----               PRIMARY KEY: memberRecordNumber
------------------------------------------------------------
IF OBJECT_ID('[re_members_ams].[vwCommitteeMembers]', 'V') IS NOT NULL
    DROP VIEW [re_members_ams].[vwCommitteeMembers];
GO

CREATE VIEW [re_members_ams].[vwCommitteeMembers]
AS
SELECT
    c.*
FROM
    [re_members_ams].[CommitteeMembers] AS c
GO
GRANT SELECT ON [re_members_ams].[vwCommitteeMembers] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* Base View Permissions SQL for Committee Members */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Committee Members
-- Item: Permissions for vwCommitteeMembers
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [re_members_ams].[vwCommitteeMembers] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* spCreate SQL for Committee Members */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Committee Members
-- Item: spCreateCommitteeMembers
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR CommitteeMembers
------------------------------------------------------------
IF OBJECT_ID('[re_members_ams].[spCreateCommitteeMembers]', 'P') IS NOT NULL
    DROP PROCEDURE [re_members_ams].[spCreateCommitteeMembers];
GO

CREATE PROCEDURE [re_members_ams].[spCreateCommitteeMembers]
    @positionCode_Clear bit = 0,
    @positionCode nvarchar(255) = NULL,
    @committee_Clear bit = 0,
    @committee nvarchar(MAX) = NULL,
    @position_Clear bit = 0,
    @position nvarchar(255) = NULL,
    @code_Clear bit = 0,
    @code nvarchar(255) = NULL,
    @startDate_Clear bit = 0,
    @startDate nvarchar(255) = NULL,
    @endDate_Clear bit = 0,
    @endDate nvarchar(255) = NULL,
    @memberRecordNumber nvarchar(255) = NULL,
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
    [re_members_ams].[CommitteeMembers]
        (
            [positionCode],
                [committee],
                [position],
                [code],
                [startDate],
                [endDate],
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
                [memberRecordNumber]
        )
    VALUES
        (
            CASE WHEN @positionCode_Clear = 1 THEN NULL ELSE ISNULL(@positionCode, NULL) END,
                CASE WHEN @committee_Clear = 1 THEN NULL ELSE ISNULL(@committee, NULL) END,
                CASE WHEN @position_Clear = 1 THEN NULL ELSE ISNULL(@position, NULL) END,
                CASE WHEN @code_Clear = 1 THEN NULL ELSE ISNULL(@code, NULL) END,
                CASE WHEN @startDate_Clear = 1 THEN NULL ELSE ISNULL(@startDate, NULL) END,
                CASE WHEN @endDate_Clear = 1 THEN NULL ELSE ISNULL(@endDate, NULL) END,
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
                @memberRecordNumber
        )
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [re_members_ams].[vwCommitteeMembers] WHERE [memberRecordNumber] = @memberRecordNumber
END
GO
GRANT EXECUTE ON [re_members_ams].[spCreateCommitteeMembers] TO [cdp_Developer], [cdp_Integration];

/* spCreate Permissions for Committee Members */

GRANT EXECUTE ON [re_members_ams].[spCreateCommitteeMembers] TO [cdp_Developer], [cdp_Integration];

/* spUpdate SQL for Committee Members */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Committee Members
-- Item: spUpdateCommitteeMembers
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR CommitteeMembers
------------------------------------------------------------
IF OBJECT_ID('[re_members_ams].[spUpdateCommitteeMembers]', 'P') IS NOT NULL
    DROP PROCEDURE [re_members_ams].[spUpdateCommitteeMembers];
GO

CREATE PROCEDURE [re_members_ams].[spUpdateCommitteeMembers]
    @positionCode_Clear bit = 0,
    @positionCode nvarchar(255) = NULL,
    @committee_Clear bit = 0,
    @committee nvarchar(MAX) = NULL,
    @position_Clear bit = 0,
    @position nvarchar(255) = NULL,
    @code_Clear bit = 0,
    @code nvarchar(255) = NULL,
    @startDate_Clear bit = 0,
    @startDate nvarchar(255) = NULL,
    @endDate_Clear bit = 0,
    @endDate nvarchar(255) = NULL,
    @memberRecordNumber nvarchar(255),
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
        [re_members_ams].[CommitteeMembers]
    SET
        [positionCode] = CASE WHEN @positionCode_Clear = 1 THEN NULL ELSE ISNULL(@positionCode, [positionCode]) END,
        [committee] = CASE WHEN @committee_Clear = 1 THEN NULL ELSE ISNULL(@committee, [committee]) END,
        [position] = CASE WHEN @position_Clear = 1 THEN NULL ELSE ISNULL(@position, [position]) END,
        [code] = CASE WHEN @code_Clear = 1 THEN NULL ELSE ISNULL(@code, [code]) END,
        [startDate] = CASE WHEN @startDate_Clear = 1 THEN NULL ELSE ISNULL(@startDate, [startDate]) END,
        [endDate] = CASE WHEN @endDate_Clear = 1 THEN NULL ELSE ISNULL(@endDate, [endDate]) END,
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
        [memberRecordNumber] = @memberRecordNumber

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [re_members_ams].[vwCommitteeMembers] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [re_members_ams].[vwCommitteeMembers]
                                    WHERE
                                        [memberRecordNumber] = @memberRecordNumber
                                    
END
GO

GRANT EXECUTE ON [re_members_ams].[spUpdateCommitteeMembers] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the CommitteeMembers table
------------------------------------------------------------
IF OBJECT_ID('[re_members_ams].[trgUpdateCommitteeMembers]', 'TR') IS NOT NULL
    DROP TRIGGER [re_members_ams].[trgUpdateCommitteeMembers];
GO
CREATE TRIGGER [re_members_ams].trgUpdateCommitteeMembers
ON [re_members_ams].[CommitteeMembers]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [re_members_ams].[CommitteeMembers]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [re_members_ams].[CommitteeMembers] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[memberRecordNumber] = I.[memberRecordNumber];
END;
GO

/* spUpdate Permissions for Committee Members */

GRANT EXECUTE ON [re_members_ams].[spUpdateCommitteeMembers] TO [cdp_Developer], [cdp_Integration];

/* Base View SQL for Committee Nominees */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Committee Nominees
-- Item: vwCommitteeNominees
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      Committee Nominees
-----               SCHEMA:      re_members_ams
-----               BASE TABLE:  CommitteeNominees
-----               PRIMARY KEY: id
------------------------------------------------------------
IF OBJECT_ID('[re_members_ams].[vwCommitteeNominees]', 'V') IS NOT NULL
    DROP VIEW [re_members_ams].[vwCommitteeNominees];
GO

CREATE VIEW [re_members_ams].[vwCommitteeNominees]
AS
SELECT
    c.*
FROM
    [re_members_ams].[CommitteeNominees] AS c
GO
GRANT SELECT ON [re_members_ams].[vwCommitteeNominees] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* Base View Permissions SQL for Committee Nominees */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Committee Nominees
-- Item: Permissions for vwCommitteeNominees
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [re_members_ams].[vwCommitteeNominees] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* spCreate SQL for Committee Nominees */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Committee Nominees
-- Item: spCreateCommitteeNominees
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR CommitteeNominees
------------------------------------------------------------
IF OBJECT_ID('[re_members_ams].[spCreateCommitteeNominees]', 'P') IS NOT NULL
    DROP PROCEDURE [re_members_ams].[spCreateCommitteeNominees];
GO

CREATE PROCEDURE [re_members_ams].[spCreateCommitteeNominees]
    @phones_Clear bit = 0,
    @phones nvarchar(MAX) = NULL,
    @nominatedByCustomer_Clear bit = 0,
    @nominatedByCustomer nvarchar(MAX) = NULL,
    @position_Clear bit = 0,
    @position nvarchar(255) = NULL,
    @code_Clear bit = 0,
    @code nvarchar(255) = NULL,
    @organizationRepresenting_Clear bit = 0,
    @organizationRepresenting nvarchar(MAX) = NULL,
    @id nvarchar(255) = NULL,
    @primaryOrganization_Clear bit = 0,
    @primaryOrganization nvarchar(MAX) = NULL,
    @emails_Clear bit = 0,
    @emails nvarchar(MAX) = NULL,
    @startDate_Clear bit = 0,
    @startDate nvarchar(255) = NULL,
    @endDate_Clear bit = 0,
    @endDate nvarchar(255) = NULL,
    @positionCode_Clear bit = 0,
    @positionCode nvarchar(255) = NULL,
    @addresses_Clear bit = 0,
    @addresses nvarchar(MAX) = NULL,
    @lastName_Clear bit = 0,
    @lastName nvarchar(255) = NULL,
    @rank_Clear bit = 0,
    @rank nvarchar(255) = NULL,
    @firstName_Clear bit = 0,
    @firstName nvarchar(255) = NULL,
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
    [re_members_ams].[CommitteeNominees]
        (
            [phones],
                [nominatedByCustomer],
                [position],
                [code],
                [organizationRepresenting],
                [primaryOrganization],
                [emails],
                [startDate],
                [endDate],
                [positionCode],
                [addresses],
                [lastName],
                [rank],
                [firstName],
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
            CASE WHEN @phones_Clear = 1 THEN NULL ELSE ISNULL(@phones, NULL) END,
                CASE WHEN @nominatedByCustomer_Clear = 1 THEN NULL ELSE ISNULL(@nominatedByCustomer, NULL) END,
                CASE WHEN @position_Clear = 1 THEN NULL ELSE ISNULL(@position, NULL) END,
                CASE WHEN @code_Clear = 1 THEN NULL ELSE ISNULL(@code, NULL) END,
                CASE WHEN @organizationRepresenting_Clear = 1 THEN NULL ELSE ISNULL(@organizationRepresenting, NULL) END,
                CASE WHEN @primaryOrganization_Clear = 1 THEN NULL ELSE ISNULL(@primaryOrganization, NULL) END,
                CASE WHEN @emails_Clear = 1 THEN NULL ELSE ISNULL(@emails, NULL) END,
                CASE WHEN @startDate_Clear = 1 THEN NULL ELSE ISNULL(@startDate, NULL) END,
                CASE WHEN @endDate_Clear = 1 THEN NULL ELSE ISNULL(@endDate, NULL) END,
                CASE WHEN @positionCode_Clear = 1 THEN NULL ELSE ISNULL(@positionCode, NULL) END,
                CASE WHEN @addresses_Clear = 1 THEN NULL ELSE ISNULL(@addresses, NULL) END,
                CASE WHEN @lastName_Clear = 1 THEN NULL ELSE ISNULL(@lastName, NULL) END,
                CASE WHEN @rank_Clear = 1 THEN NULL ELSE ISNULL(@rank, NULL) END,
                CASE WHEN @firstName_Clear = 1 THEN NULL ELSE ISNULL(@firstName, NULL) END,
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
    SELECT * FROM [re_members_ams].[vwCommitteeNominees] WHERE [id] = @id
END
GO
GRANT EXECUTE ON [re_members_ams].[spCreateCommitteeNominees] TO [cdp_Developer], [cdp_Integration];

/* spCreate Permissions for Committee Nominees */

GRANT EXECUTE ON [re_members_ams].[spCreateCommitteeNominees] TO [cdp_Developer], [cdp_Integration];

/* spUpdate SQL for Committee Nominees */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Committee Nominees
-- Item: spUpdateCommitteeNominees
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR CommitteeNominees
------------------------------------------------------------
IF OBJECT_ID('[re_members_ams].[spUpdateCommitteeNominees]', 'P') IS NOT NULL
    DROP PROCEDURE [re_members_ams].[spUpdateCommitteeNominees];
GO

CREATE PROCEDURE [re_members_ams].[spUpdateCommitteeNominees]
    @phones_Clear bit = 0,
    @phones nvarchar(MAX) = NULL,
    @nominatedByCustomer_Clear bit = 0,
    @nominatedByCustomer nvarchar(MAX) = NULL,
    @position_Clear bit = 0,
    @position nvarchar(255) = NULL,
    @code_Clear bit = 0,
    @code nvarchar(255) = NULL,
    @organizationRepresenting_Clear bit = 0,
    @organizationRepresenting nvarchar(MAX) = NULL,
    @id nvarchar(255),
    @primaryOrganization_Clear bit = 0,
    @primaryOrganization nvarchar(MAX) = NULL,
    @emails_Clear bit = 0,
    @emails nvarchar(MAX) = NULL,
    @startDate_Clear bit = 0,
    @startDate nvarchar(255) = NULL,
    @endDate_Clear bit = 0,
    @endDate nvarchar(255) = NULL,
    @positionCode_Clear bit = 0,
    @positionCode nvarchar(255) = NULL,
    @addresses_Clear bit = 0,
    @addresses nvarchar(MAX) = NULL,
    @lastName_Clear bit = 0,
    @lastName nvarchar(255) = NULL,
    @rank_Clear bit = 0,
    @rank nvarchar(255) = NULL,
    @firstName_Clear bit = 0,
    @firstName nvarchar(255) = NULL,
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
        [re_members_ams].[CommitteeNominees]
    SET
        [phones] = CASE WHEN @phones_Clear = 1 THEN NULL ELSE ISNULL(@phones, [phones]) END,
        [nominatedByCustomer] = CASE WHEN @nominatedByCustomer_Clear = 1 THEN NULL ELSE ISNULL(@nominatedByCustomer, [nominatedByCustomer]) END,
        [position] = CASE WHEN @position_Clear = 1 THEN NULL ELSE ISNULL(@position, [position]) END,
        [code] = CASE WHEN @code_Clear = 1 THEN NULL ELSE ISNULL(@code, [code]) END,
        [organizationRepresenting] = CASE WHEN @organizationRepresenting_Clear = 1 THEN NULL ELSE ISNULL(@organizationRepresenting, [organizationRepresenting]) END,
        [primaryOrganization] = CASE WHEN @primaryOrganization_Clear = 1 THEN NULL ELSE ISNULL(@primaryOrganization, [primaryOrganization]) END,
        [emails] = CASE WHEN @emails_Clear = 1 THEN NULL ELSE ISNULL(@emails, [emails]) END,
        [startDate] = CASE WHEN @startDate_Clear = 1 THEN NULL ELSE ISNULL(@startDate, [startDate]) END,
        [endDate] = CASE WHEN @endDate_Clear = 1 THEN NULL ELSE ISNULL(@endDate, [endDate]) END,
        [positionCode] = CASE WHEN @positionCode_Clear = 1 THEN NULL ELSE ISNULL(@positionCode, [positionCode]) END,
        [addresses] = CASE WHEN @addresses_Clear = 1 THEN NULL ELSE ISNULL(@addresses, [addresses]) END,
        [lastName] = CASE WHEN @lastName_Clear = 1 THEN NULL ELSE ISNULL(@lastName, [lastName]) END,
        [rank] = CASE WHEN @rank_Clear = 1 THEN NULL ELSE ISNULL(@rank, [rank]) END,
        [firstName] = CASE WHEN @firstName_Clear = 1 THEN NULL ELSE ISNULL(@firstName, [firstName]) END,
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
        SELECT TOP 0 * FROM [re_members_ams].[vwCommitteeNominees] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [re_members_ams].[vwCommitteeNominees]
                                    WHERE
                                        [id] = @id
                                    
END
GO

GRANT EXECUTE ON [re_members_ams].[spUpdateCommitteeNominees] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the CommitteeNominees table
------------------------------------------------------------
IF OBJECT_ID('[re_members_ams].[trgUpdateCommitteeNominees]', 'TR') IS NOT NULL
    DROP TRIGGER [re_members_ams].[trgUpdateCommitteeNominees];
GO
CREATE TRIGGER [re_members_ams].trgUpdateCommitteeNominees
ON [re_members_ams].[CommitteeNominees]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [re_members_ams].[CommitteeNominees]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [re_members_ams].[CommitteeNominees] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[id] = I.[id];
END;
GO

/* spUpdate Permissions for Committee Nominees */

GRANT EXECUTE ON [re_members_ams].[spUpdateCommitteeNominees] TO [cdp_Developer], [cdp_Integration];

/* spDelete SQL for Awards */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Awards
-- Item: spDeleteAwards
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR Awards
------------------------------------------------------------
IF OBJECT_ID('[re_members_ams].[spDeleteAwards]', 'P') IS NOT NULL
    DROP PROCEDURE [re_members_ams].[spDeleteAwards];
GO

CREATE PROCEDURE [re_members_ams].[spDeleteAwards]
    @id nvarchar(450)
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [re_members_ams].[Awards]
    WHERE
        [id] = @id


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [id] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @id AS [id] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [re_members_ams].[spDeleteAwards] TO [cdp_Developer], [cdp_Integration];

/* spDelete Permissions for Awards */

GRANT EXECUTE ON [re_members_ams].[spDeleteAwards] TO [cdp_Developer], [cdp_Integration];

/* spDelete SQL for Categories */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Categories
-- Item: spDeleteCategories
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR Categories
------------------------------------------------------------
IF OBJECT_ID('[re_members_ams].[spDeleteCategories]', 'P') IS NOT NULL
    DROP PROCEDURE [re_members_ams].[spDeleteCategories];
GO

CREATE PROCEDURE [re_members_ams].[spDeleteCategories]
    @code nvarchar(400)
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [re_members_ams].[Categories]
    WHERE
        [code] = @code


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [code] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @code AS [code] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [re_members_ams].[spDeleteCategories] TO [cdp_Developer], [cdp_Integration];

/* spDelete Permissions for Categories */

GRANT EXECUTE ON [re_members_ams].[spDeleteCategories] TO [cdp_Developer], [cdp_Integration];

/* spDelete SQL for Certifications */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Certifications
-- Item: spDeleteCertifications
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR Certifications
------------------------------------------------------------
IF OBJECT_ID('[re_members_ams].[spDeleteCertifications]', 'P') IS NOT NULL
    DROP PROCEDURE [re_members_ams].[spDeleteCertifications];
GO

CREATE PROCEDURE [re_members_ams].[spDeleteCertifications]
    @code nvarchar(255)
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [re_members_ams].[Certifications]
    WHERE
        [code] = @code


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [code] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @code AS [code] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [re_members_ams].[spDeleteCertifications] TO [cdp_Developer], [cdp_Integration];

/* spDelete Permissions for Certifications */

GRANT EXECUTE ON [re_members_ams].[spDeleteCertifications] TO [cdp_Developer], [cdp_Integration];

/* spDelete SQL for Committee Members */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Committee Members
-- Item: spDeleteCommitteeMembers
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR CommitteeMembers
------------------------------------------------------------
IF OBJECT_ID('[re_members_ams].[spDeleteCommitteeMembers]', 'P') IS NOT NULL
    DROP PROCEDURE [re_members_ams].[spDeleteCommitteeMembers];
GO

CREATE PROCEDURE [re_members_ams].[spDeleteCommitteeMembers]
    @memberRecordNumber nvarchar(255)
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [re_members_ams].[CommitteeMembers]
    WHERE
        [memberRecordNumber] = @memberRecordNumber


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [memberRecordNumber] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @memberRecordNumber AS [memberRecordNumber] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [re_members_ams].[spDeleteCommitteeMembers] TO [cdp_Developer], [cdp_Integration];

/* spDelete Permissions for Committee Members */

GRANT EXECUTE ON [re_members_ams].[spDeleteCommitteeMembers] TO [cdp_Developer], [cdp_Integration];

/* spDelete SQL for Committee Nominees */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Committee Nominees
-- Item: spDeleteCommitteeNominees
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR CommitteeNominees
------------------------------------------------------------
IF OBJECT_ID('[re_members_ams].[spDeleteCommitteeNominees]', 'P') IS NOT NULL
    DROP PROCEDURE [re_members_ams].[spDeleteCommitteeNominees];
GO

CREATE PROCEDURE [re_members_ams].[spDeleteCommitteeNominees]
    @id nvarchar(255)
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [re_members_ams].[CommitteeNominees]
    WHERE
        [id] = @id


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [id] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @id AS [id] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [re_members_ams].[spDeleteCommitteeNominees] TO [cdp_Developer], [cdp_Integration];

/* spDelete Permissions for Committee Nominees */

GRANT EXECUTE ON [re_members_ams].[spDeleteCommitteeNominees] TO [cdp_Developer], [cdp_Integration];

/* Index for Foreign Keys for CommitteePositions */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Committee Positions
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------;

/* Index for Foreign Keys for Committees */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Committees
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key parentCommitteeId in table Committees
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_Committees_parentCommitteeId' 
    AND object_id = OBJECT_ID('[re_members_ams].[Committees]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_Committees_parentCommitteeId ON [re_members_ams].[Committees] ([parentCommitteeId]);

/* Index for Foreign Keys for Countries */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Countries
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------;

/* Index for Foreign Keys for CourseAttendees */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Course Attendees
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------;

/* Index for Foreign Keys for CustomFieldDefinitions */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Custom Field Definitions
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------;

/* Base View SQL for Committee Positions */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Committee Positions
-- Item: vwCommitteePositions
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      Committee Positions
-----               SCHEMA:      re_members_ams
-----               BASE TABLE:  CommitteePositions
-----               PRIMARY KEY: code
------------------------------------------------------------
IF OBJECT_ID('[re_members_ams].[vwCommitteePositions]', 'V') IS NOT NULL
    DROP VIEW [re_members_ams].[vwCommitteePositions];
GO

CREATE VIEW [re_members_ams].[vwCommitteePositions]
AS
SELECT
    c.*
FROM
    [re_members_ams].[CommitteePositions] AS c
GO
GRANT SELECT ON [re_members_ams].[vwCommitteePositions] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* Base View Permissions SQL for Committee Positions */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Committee Positions
-- Item: Permissions for vwCommitteePositions
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [re_members_ams].[vwCommitteePositions] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* spCreate SQL for Committee Positions */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Committee Positions
-- Item: spCreateCommitteePositions
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR CommitteePositions
------------------------------------------------------------
IF OBJECT_ID('[re_members_ams].[spCreateCommitteePositions]', 'P') IS NOT NULL
    DROP PROCEDURE [re_members_ams].[spCreateCommitteePositions];
GO

CREATE PROCEDURE [re_members_ams].[spCreateCommitteePositions]
    @code nvarchar(255) = NULL,
    @description_Clear bit = 0,
    @description nvarchar(255) = NULL,
    @isAdmin_Clear bit = 0,
    @isAdmin nvarchar(255) = NULL,
    @term_Clear bit = 0,
    @term nvarchar(255) = NULL,
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
    [re_members_ams].[CommitteePositions]
        (
            [description],
                [isAdmin],
                [term],
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
            CASE WHEN @description_Clear = 1 THEN NULL ELSE ISNULL(@description, NULL) END,
                CASE WHEN @isAdmin_Clear = 1 THEN NULL ELSE ISNULL(@isAdmin, NULL) END,
                CASE WHEN @term_Clear = 1 THEN NULL ELSE ISNULL(@term, NULL) END,
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
    SELECT * FROM [re_members_ams].[vwCommitteePositions] WHERE [code] = @code
END
GO
GRANT EXECUTE ON [re_members_ams].[spCreateCommitteePositions] TO [cdp_Developer], [cdp_Integration];

/* spCreate Permissions for Committee Positions */

GRANT EXECUTE ON [re_members_ams].[spCreateCommitteePositions] TO [cdp_Developer], [cdp_Integration];

/* spUpdate SQL for Committee Positions */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Committee Positions
-- Item: spUpdateCommitteePositions
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR CommitteePositions
------------------------------------------------------------
IF OBJECT_ID('[re_members_ams].[spUpdateCommitteePositions]', 'P') IS NOT NULL
    DROP PROCEDURE [re_members_ams].[spUpdateCommitteePositions];
GO

CREATE PROCEDURE [re_members_ams].[spUpdateCommitteePositions]
    @code nvarchar(255),
    @description_Clear bit = 0,
    @description nvarchar(255) = NULL,
    @isAdmin_Clear bit = 0,
    @isAdmin nvarchar(255) = NULL,
    @term_Clear bit = 0,
    @term nvarchar(255) = NULL,
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
        [re_members_ams].[CommitteePositions]
    SET
        [description] = CASE WHEN @description_Clear = 1 THEN NULL ELSE ISNULL(@description, [description]) END,
        [isAdmin] = CASE WHEN @isAdmin_Clear = 1 THEN NULL ELSE ISNULL(@isAdmin, [isAdmin]) END,
        [term] = CASE WHEN @term_Clear = 1 THEN NULL ELSE ISNULL(@term, [term]) END,
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
        SELECT TOP 0 * FROM [re_members_ams].[vwCommitteePositions] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [re_members_ams].[vwCommitteePositions]
                                    WHERE
                                        [code] = @code
                                    
END
GO

GRANT EXECUTE ON [re_members_ams].[spUpdateCommitteePositions] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the CommitteePositions table
------------------------------------------------------------
IF OBJECT_ID('[re_members_ams].[trgUpdateCommitteePositions]', 'TR') IS NOT NULL
    DROP TRIGGER [re_members_ams].[trgUpdateCommitteePositions];
GO
CREATE TRIGGER [re_members_ams].trgUpdateCommitteePositions
ON [re_members_ams].[CommitteePositions]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [re_members_ams].[CommitteePositions]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [re_members_ams].[CommitteePositions] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[code] = I.[code];
END;
GO

/* spUpdate Permissions for Committee Positions */

GRANT EXECUTE ON [re_members_ams].[spUpdateCommitteePositions] TO [cdp_Developer], [cdp_Integration];

/* Root ID Function SQL for Committees.parentCommitteeId */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Committees
-- Item: fnCommitteesparentCommitteeId_GetRootID
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
------------------------------------------------------------
----- ROOT ID FUNCTION FOR: [Committees].[parentCommitteeId]
------------------------------------------------------------
IF OBJECT_ID('[re_members_ams].[fnCommitteesparentCommitteeId_GetRootID]', 'IF') IS NOT NULL
    DROP FUNCTION [re_members_ams].[fnCommitteesparentCommitteeId_GetRootID];
GO

CREATE FUNCTION [re_members_ams].[fnCommitteesparentCommitteeId_GetRootID]
(
    @RecordID nvarchar(450),
    @ParentID nvarchar(450)
)
RETURNS TABLE
AS
RETURN
(
    WITH CTE_RootParent AS (
        SELECT
            [id],
            [parentCommitteeId],
            [id] AS [RootParentID],
            0 AS [Depth]
        FROM
            [re_members_ams].[Committees]
        WHERE
            [id] = COALESCE(@ParentID, @RecordID)

        UNION ALL

        SELECT
            c.[id],
            c.[parentCommitteeId],
            c.[id] AS [RootParentID],
            p.[Depth] + 1 AS [Depth]
        FROM
            [re_members_ams].[Committees] c
        INNER JOIN
            CTE_RootParent p ON c.[id] = p.[parentCommitteeId]
        WHERE
            p.[Depth] < 100
    )
    SELECT TOP 1
        [RootParentID] AS RootID
    FROM
        CTE_RootParent
    WHERE
        [parentCommitteeId] IS NULL
    ORDER BY
        [RootParentID]
);
GO

/* Base View SQL for Committees */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Committees
-- Item: vwCommittees
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      Committees
-----               SCHEMA:      re_members_ams
-----               BASE TABLE:  Committees
-----               PRIMARY KEY: id
------------------------------------------------------------
IF OBJECT_ID('[re_members_ams].[vwCommittees]', 'V') IS NOT NULL
    DROP VIEW [re_members_ams].[vwCommittees];
GO

CREATE VIEW [re_members_ams].[vwCommittees]
AS
SELECT
    c.*,
    root_parentCommitteeId.RootID AS [RootparentCommitteeId]
FROM
    [re_members_ams].[Committees] AS c
OUTER APPLY
    [re_members_ams].[fnCommitteesparentCommitteeId_GetRootID]([c].[id], [c].[parentCommitteeId]) AS root_parentCommitteeId
GO
GRANT SELECT ON [re_members_ams].[vwCommittees] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* Base View Permissions SQL for Committees */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Committees
-- Item: Permissions for vwCommittees
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [re_members_ams].[vwCommittees] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* spCreate SQL for Committees */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Committees
-- Item: spCreateCommittees
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR Committees
------------------------------------------------------------
IF OBJECT_ID('[re_members_ams].[spCreateCommittees]', 'P') IS NOT NULL
    DROP PROCEDURE [re_members_ams].[spCreateCommittees];
GO

CREATE PROCEDURE [re_members_ams].[spCreateCommittees]
    @name_Clear bit = 0,
    @name nvarchar(812) = NULL,
    @categoryName_Clear bit = 0,
    @categoryName nvarchar(812) = NULL,
    @parentCommitteeId_Clear bit = 0,
    @parentCommitteeId nvarchar(812) = NULL,
    @categoryCode_Clear bit = 0,
    @categoryCode nvarchar(812) = NULL,
    @tags_Clear bit = 0,
    @tags nvarchar(MAX) = NULL,
    @term_Clear bit = 0,
    @term nvarchar(MAX) = NULL,
    @mj_e2e_custom_attr_Clear bit = 0,
    @mj_e2e_custom_attr nvarchar(812) = NULL,
    @showInDirectory_Clear bit = 0,
    @showInDirectory nvarchar(MAX) = NULL,
    @code_Clear bit = 0,
    @code nvarchar(812) = NULL,
    @id nvarchar(450) = NULL,
    @website_Clear bit = 0,
    @website nvarchar(812) = NULL,
    @endDate_Clear bit = 0,
    @endDate nvarchar(MAX) = NULL,
    @description_Clear bit = 0,
    @description nvarchar(812) = NULL,
    @startDate_Clear bit = 0,
    @startDate nvarchar(MAX) = NULL,
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
    [re_members_ams].[Committees]
        (
            [name],
                [categoryName],
                [parentCommitteeId],
                [categoryCode],
                [tags],
                [term],
                [mj_e2e_custom_attr],
                [showInDirectory],
                [code],
                [website],
                [endDate],
                [description],
                [startDate],
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
            CASE WHEN @name_Clear = 1 THEN NULL ELSE ISNULL(@name, NULL) END,
                CASE WHEN @categoryName_Clear = 1 THEN NULL ELSE ISNULL(@categoryName, NULL) END,
                CASE WHEN @parentCommitteeId_Clear = 1 THEN NULL ELSE ISNULL(@parentCommitteeId, NULL) END,
                CASE WHEN @categoryCode_Clear = 1 THEN NULL ELSE ISNULL(@categoryCode, NULL) END,
                CASE WHEN @tags_Clear = 1 THEN NULL ELSE ISNULL(@tags, NULL) END,
                CASE WHEN @term_Clear = 1 THEN NULL ELSE ISNULL(@term, NULL) END,
                CASE WHEN @mj_e2e_custom_attr_Clear = 1 THEN NULL ELSE ISNULL(@mj_e2e_custom_attr, NULL) END,
                CASE WHEN @showInDirectory_Clear = 1 THEN NULL ELSE ISNULL(@showInDirectory, NULL) END,
                CASE WHEN @code_Clear = 1 THEN NULL ELSE ISNULL(@code, NULL) END,
                CASE WHEN @website_Clear = 1 THEN NULL ELSE ISNULL(@website, NULL) END,
                CASE WHEN @endDate_Clear = 1 THEN NULL ELSE ISNULL(@endDate, NULL) END,
                CASE WHEN @description_Clear = 1 THEN NULL ELSE ISNULL(@description, NULL) END,
                CASE WHEN @startDate_Clear = 1 THEN NULL ELSE ISNULL(@startDate, NULL) END,
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
    SELECT * FROM [re_members_ams].[vwCommittees] WHERE [id] = @id
END
GO
GRANT EXECUTE ON [re_members_ams].[spCreateCommittees] TO [cdp_Developer], [cdp_Integration];

/* spCreate Permissions for Committees */

GRANT EXECUTE ON [re_members_ams].[spCreateCommittees] TO [cdp_Developer], [cdp_Integration];

/* spUpdate SQL for Committees */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Committees
-- Item: spUpdateCommittees
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR Committees
------------------------------------------------------------
IF OBJECT_ID('[re_members_ams].[spUpdateCommittees]', 'P') IS NOT NULL
    DROP PROCEDURE [re_members_ams].[spUpdateCommittees];
GO

CREATE PROCEDURE [re_members_ams].[spUpdateCommittees]
    @name_Clear bit = 0,
    @name nvarchar(812) = NULL,
    @categoryName_Clear bit = 0,
    @categoryName nvarchar(812) = NULL,
    @parentCommitteeId_Clear bit = 0,
    @parentCommitteeId nvarchar(812) = NULL,
    @categoryCode_Clear bit = 0,
    @categoryCode nvarchar(812) = NULL,
    @tags_Clear bit = 0,
    @tags nvarchar(MAX) = NULL,
    @term_Clear bit = 0,
    @term nvarchar(MAX) = NULL,
    @mj_e2e_custom_attr_Clear bit = 0,
    @mj_e2e_custom_attr nvarchar(812) = NULL,
    @showInDirectory_Clear bit = 0,
    @showInDirectory nvarchar(MAX) = NULL,
    @code_Clear bit = 0,
    @code nvarchar(812) = NULL,
    @id nvarchar(450),
    @website_Clear bit = 0,
    @website nvarchar(812) = NULL,
    @endDate_Clear bit = 0,
    @endDate nvarchar(MAX) = NULL,
    @description_Clear bit = 0,
    @description nvarchar(812) = NULL,
    @startDate_Clear bit = 0,
    @startDate nvarchar(MAX) = NULL,
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
        [re_members_ams].[Committees]
    SET
        [name] = CASE WHEN @name_Clear = 1 THEN NULL ELSE ISNULL(@name, [name]) END,
        [categoryName] = CASE WHEN @categoryName_Clear = 1 THEN NULL ELSE ISNULL(@categoryName, [categoryName]) END,
        [parentCommitteeId] = CASE WHEN @parentCommitteeId_Clear = 1 THEN NULL ELSE ISNULL(@parentCommitteeId, [parentCommitteeId]) END,
        [categoryCode] = CASE WHEN @categoryCode_Clear = 1 THEN NULL ELSE ISNULL(@categoryCode, [categoryCode]) END,
        [tags] = CASE WHEN @tags_Clear = 1 THEN NULL ELSE ISNULL(@tags, [tags]) END,
        [term] = CASE WHEN @term_Clear = 1 THEN NULL ELSE ISNULL(@term, [term]) END,
        [mj_e2e_custom_attr] = CASE WHEN @mj_e2e_custom_attr_Clear = 1 THEN NULL ELSE ISNULL(@mj_e2e_custom_attr, [mj_e2e_custom_attr]) END,
        [showInDirectory] = CASE WHEN @showInDirectory_Clear = 1 THEN NULL ELSE ISNULL(@showInDirectory, [showInDirectory]) END,
        [code] = CASE WHEN @code_Clear = 1 THEN NULL ELSE ISNULL(@code, [code]) END,
        [website] = CASE WHEN @website_Clear = 1 THEN NULL ELSE ISNULL(@website, [website]) END,
        [endDate] = CASE WHEN @endDate_Clear = 1 THEN NULL ELSE ISNULL(@endDate, [endDate]) END,
        [description] = CASE WHEN @description_Clear = 1 THEN NULL ELSE ISNULL(@description, [description]) END,
        [startDate] = CASE WHEN @startDate_Clear = 1 THEN NULL ELSE ISNULL(@startDate, [startDate]) END,
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
        SELECT TOP 0 * FROM [re_members_ams].[vwCommittees] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [re_members_ams].[vwCommittees]
                                    WHERE
                                        [id] = @id
                                    
END
GO

GRANT EXECUTE ON [re_members_ams].[spUpdateCommittees] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the Committees table
------------------------------------------------------------
IF OBJECT_ID('[re_members_ams].[trgUpdateCommittees]', 'TR') IS NOT NULL
    DROP TRIGGER [re_members_ams].[trgUpdateCommittees];
GO
CREATE TRIGGER [re_members_ams].trgUpdateCommittees
ON [re_members_ams].[Committees]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [re_members_ams].[Committees]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [re_members_ams].[Committees] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[id] = I.[id];
END;
GO

/* spUpdate Permissions for Committees */

GRANT EXECUTE ON [re_members_ams].[spUpdateCommittees] TO [cdp_Developer], [cdp_Integration];

/* Base View SQL for Countries */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Countries
-- Item: vwCountries
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      Countries
-----               SCHEMA:      re_members_ams
-----               BASE TABLE:  Countries
-----               PRIMARY KEY: id
------------------------------------------------------------
IF OBJECT_ID('[re_members_ams].[vwCountries]', 'V') IS NOT NULL
    DROP VIEW [re_members_ams].[vwCountries];
GO

CREATE VIEW [re_members_ams].[vwCountries]
AS
SELECT
    c.*
FROM
    [re_members_ams].[Countries] AS c
GO
GRANT SELECT ON [re_members_ams].[vwCountries] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* Base View Permissions SQL for Countries */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Countries
-- Item: Permissions for vwCountries
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [re_members_ams].[vwCountries] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* spCreate SQL for Countries */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Countries
-- Item: spCreateCountries
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR Countries
------------------------------------------------------------
IF OBJECT_ID('[re_members_ams].[spCreateCountries]', 'P') IS NOT NULL
    DROP PROCEDURE [re_members_ams].[spCreateCountries];
GO

CREATE PROCEDURE [re_members_ams].[spCreateCountries]
    @twoLetterIsoCode_Clear bit = 0,
    @twoLetterIsoCode nvarchar(812) = NULL,
    @code_Clear bit = 0,
    @code nvarchar(812) = NULL,
    @name_Clear bit = 0,
    @name nvarchar(812) = NULL,
    @mj_e2e_custom_attr_Clear bit = 0,
    @mj_e2e_custom_attr nvarchar(812) = NULL,
    @threeLetterIsoCode_Clear bit = 0,
    @threeLetterIsoCode nvarchar(812) = NULL,
    @id nvarchar(450) = NULL,
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
    [re_members_ams].[Countries]
        (
            [twoLetterIsoCode],
                [code],
                [name],
                [mj_e2e_custom_attr],
                [threeLetterIsoCode],
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
            CASE WHEN @twoLetterIsoCode_Clear = 1 THEN NULL ELSE ISNULL(@twoLetterIsoCode, NULL) END,
                CASE WHEN @code_Clear = 1 THEN NULL ELSE ISNULL(@code, NULL) END,
                CASE WHEN @name_Clear = 1 THEN NULL ELSE ISNULL(@name, NULL) END,
                CASE WHEN @mj_e2e_custom_attr_Clear = 1 THEN NULL ELSE ISNULL(@mj_e2e_custom_attr, NULL) END,
                CASE WHEN @threeLetterIsoCode_Clear = 1 THEN NULL ELSE ISNULL(@threeLetterIsoCode, NULL) END,
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
    SELECT * FROM [re_members_ams].[vwCountries] WHERE [id] = @id
END
GO
GRANT EXECUTE ON [re_members_ams].[spCreateCountries] TO [cdp_Developer], [cdp_Integration];

/* spCreate Permissions for Countries */

GRANT EXECUTE ON [re_members_ams].[spCreateCountries] TO [cdp_Developer], [cdp_Integration];

/* spUpdate SQL for Countries */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Countries
-- Item: spUpdateCountries
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR Countries
------------------------------------------------------------
IF OBJECT_ID('[re_members_ams].[spUpdateCountries]', 'P') IS NOT NULL
    DROP PROCEDURE [re_members_ams].[spUpdateCountries];
GO

CREATE PROCEDURE [re_members_ams].[spUpdateCountries]
    @twoLetterIsoCode_Clear bit = 0,
    @twoLetterIsoCode nvarchar(812) = NULL,
    @code_Clear bit = 0,
    @code nvarchar(812) = NULL,
    @name_Clear bit = 0,
    @name nvarchar(812) = NULL,
    @mj_e2e_custom_attr_Clear bit = 0,
    @mj_e2e_custom_attr nvarchar(812) = NULL,
    @threeLetterIsoCode_Clear bit = 0,
    @threeLetterIsoCode nvarchar(812) = NULL,
    @id nvarchar(450),
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
        [re_members_ams].[Countries]
    SET
        [twoLetterIsoCode] = CASE WHEN @twoLetterIsoCode_Clear = 1 THEN NULL ELSE ISNULL(@twoLetterIsoCode, [twoLetterIsoCode]) END,
        [code] = CASE WHEN @code_Clear = 1 THEN NULL ELSE ISNULL(@code, [code]) END,
        [name] = CASE WHEN @name_Clear = 1 THEN NULL ELSE ISNULL(@name, [name]) END,
        [mj_e2e_custom_attr] = CASE WHEN @mj_e2e_custom_attr_Clear = 1 THEN NULL ELSE ISNULL(@mj_e2e_custom_attr, [mj_e2e_custom_attr]) END,
        [threeLetterIsoCode] = CASE WHEN @threeLetterIsoCode_Clear = 1 THEN NULL ELSE ISNULL(@threeLetterIsoCode, [threeLetterIsoCode]) END,
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
        SELECT TOP 0 * FROM [re_members_ams].[vwCountries] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [re_members_ams].[vwCountries]
                                    WHERE
                                        [id] = @id
                                    
END
GO

GRANT EXECUTE ON [re_members_ams].[spUpdateCountries] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the Countries table
------------------------------------------------------------
IF OBJECT_ID('[re_members_ams].[trgUpdateCountries]', 'TR') IS NOT NULL
    DROP TRIGGER [re_members_ams].[trgUpdateCountries];
GO
CREATE TRIGGER [re_members_ams].trgUpdateCountries
ON [re_members_ams].[Countries]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [re_members_ams].[Countries]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [re_members_ams].[Countries] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[id] = I.[id];
END;
GO

/* spUpdate Permissions for Countries */

GRANT EXECUTE ON [re_members_ams].[spUpdateCountries] TO [cdp_Developer], [cdp_Integration];

/* Base View SQL for Course Attendees */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Course Attendees
-- Item: vwCourseAttendees
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      Course Attendees
-----               SCHEMA:      re_members_ams
-----               BASE TABLE:  CourseAttendees
-----               PRIMARY KEY: id
------------------------------------------------------------
IF OBJECT_ID('[re_members_ams].[vwCourseAttendees]', 'V') IS NOT NULL
    DROP VIEW [re_members_ams].[vwCourseAttendees];
GO

CREATE VIEW [re_members_ams].[vwCourseAttendees]
AS
SELECT
    c.*
FROM
    [re_members_ams].[CourseAttendees] AS c
GO
GRANT SELECT ON [re_members_ams].[vwCourseAttendees] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* Base View Permissions SQL for Course Attendees */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Course Attendees
-- Item: Permissions for vwCourseAttendees
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [re_members_ams].[vwCourseAttendees] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* spCreate SQL for Course Attendees */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Course Attendees
-- Item: spCreateCourseAttendees
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR CourseAttendees
------------------------------------------------------------
IF OBJECT_ID('[re_members_ams].[spCreateCourseAttendees]', 'P') IS NOT NULL
    DROP PROCEDURE [re_members_ams].[spCreateCourseAttendees];
GO

CREATE PROCEDURE [re_members_ams].[spCreateCourseAttendees]
    @recordNumber_Clear bit = 0,
    @recordNumber nvarchar(255) = NULL,
    @suffix_Clear bit = 0,
    @suffix nvarchar(255) = NULL,
    @title_Clear bit = 0,
    @title nvarchar(255) = NULL,
    @customerType_Clear bit = 0,
    @customerType nvarchar(255) = NULL,
    @phones_Clear bit = 0,
    @phones nvarchar(MAX) = NULL,
    @secondLastName_Clear bit = 0,
    @secondLastName nvarchar(255) = NULL,
    @registeredDate_Clear bit = 0,
    @registeredDate nvarchar(255) = NULL,
    @id nvarchar(255) = NULL,
    @showInDirectory_Clear bit = 0,
    @showInDirectory nvarchar(255) = NULL,
    @gender_Clear bit = 0,
    @gender nvarchar(255) = NULL,
    @itemizedCustomFields_Clear bit = 0,
    @itemizedCustomFields nvarchar(MAX) = NULL,
    @lastName_Clear bit = 0,
    @lastName nvarchar(255) = NULL,
    @preferredFirstName_Clear bit = 0,
    @preferredFirstName nvarchar(255) = NULL,
    @emails_Clear bit = 0,
    @emails nvarchar(MAX) = NULL,
    @prefix_Clear bit = 0,
    @prefix nvarchar(255) = NULL,
    @addresses_Clear bit = 0,
    @addresses nvarchar(MAX) = NULL,
    @attendedDate_Clear bit = 0,
    @attendedDate nvarchar(255) = NULL,
    @primaryOrganization_Clear bit = 0,
    @primaryOrganization nvarchar(MAX) = NULL,
    @middleName_Clear bit = 0,
    @middleName nvarchar(255) = NULL,
    @firstName_Clear bit = 0,
    @firstName nvarchar(255) = NULL,
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
    [re_members_ams].[CourseAttendees]
        (
            [recordNumber],
                [suffix],
                [title],
                [customerType],
                [phones],
                [secondLastName],
                [registeredDate],
                [showInDirectory],
                [gender],
                [itemizedCustomFields],
                [lastName],
                [preferredFirstName],
                [emails],
                [prefix],
                [addresses],
                [attendedDate],
                [primaryOrganization],
                [middleName],
                [firstName],
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
            CASE WHEN @recordNumber_Clear = 1 THEN NULL ELSE ISNULL(@recordNumber, NULL) END,
                CASE WHEN @suffix_Clear = 1 THEN NULL ELSE ISNULL(@suffix, NULL) END,
                CASE WHEN @title_Clear = 1 THEN NULL ELSE ISNULL(@title, NULL) END,
                CASE WHEN @customerType_Clear = 1 THEN NULL ELSE ISNULL(@customerType, NULL) END,
                CASE WHEN @phones_Clear = 1 THEN NULL ELSE ISNULL(@phones, NULL) END,
                CASE WHEN @secondLastName_Clear = 1 THEN NULL ELSE ISNULL(@secondLastName, NULL) END,
                CASE WHEN @registeredDate_Clear = 1 THEN NULL ELSE ISNULL(@registeredDate, NULL) END,
                CASE WHEN @showInDirectory_Clear = 1 THEN NULL ELSE ISNULL(@showInDirectory, NULL) END,
                CASE WHEN @gender_Clear = 1 THEN NULL ELSE ISNULL(@gender, NULL) END,
                CASE WHEN @itemizedCustomFields_Clear = 1 THEN NULL ELSE ISNULL(@itemizedCustomFields, NULL) END,
                CASE WHEN @lastName_Clear = 1 THEN NULL ELSE ISNULL(@lastName, NULL) END,
                CASE WHEN @preferredFirstName_Clear = 1 THEN NULL ELSE ISNULL(@preferredFirstName, NULL) END,
                CASE WHEN @emails_Clear = 1 THEN NULL ELSE ISNULL(@emails, NULL) END,
                CASE WHEN @prefix_Clear = 1 THEN NULL ELSE ISNULL(@prefix, NULL) END,
                CASE WHEN @addresses_Clear = 1 THEN NULL ELSE ISNULL(@addresses, NULL) END,
                CASE WHEN @attendedDate_Clear = 1 THEN NULL ELSE ISNULL(@attendedDate, NULL) END,
                CASE WHEN @primaryOrganization_Clear = 1 THEN NULL ELSE ISNULL(@primaryOrganization, NULL) END,
                CASE WHEN @middleName_Clear = 1 THEN NULL ELSE ISNULL(@middleName, NULL) END,
                CASE WHEN @firstName_Clear = 1 THEN NULL ELSE ISNULL(@firstName, NULL) END,
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
    SELECT * FROM [re_members_ams].[vwCourseAttendees] WHERE [id] = @id
END
GO
GRANT EXECUTE ON [re_members_ams].[spCreateCourseAttendees] TO [cdp_Developer], [cdp_Integration];

/* spCreate Permissions for Course Attendees */

GRANT EXECUTE ON [re_members_ams].[spCreateCourseAttendees] TO [cdp_Developer], [cdp_Integration];

/* spUpdate SQL for Course Attendees */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Course Attendees
-- Item: spUpdateCourseAttendees
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR CourseAttendees
------------------------------------------------------------
IF OBJECT_ID('[re_members_ams].[spUpdateCourseAttendees]', 'P') IS NOT NULL
    DROP PROCEDURE [re_members_ams].[spUpdateCourseAttendees];
GO

CREATE PROCEDURE [re_members_ams].[spUpdateCourseAttendees]
    @recordNumber_Clear bit = 0,
    @recordNumber nvarchar(255) = NULL,
    @suffix_Clear bit = 0,
    @suffix nvarchar(255) = NULL,
    @title_Clear bit = 0,
    @title nvarchar(255) = NULL,
    @customerType_Clear bit = 0,
    @customerType nvarchar(255) = NULL,
    @phones_Clear bit = 0,
    @phones nvarchar(MAX) = NULL,
    @secondLastName_Clear bit = 0,
    @secondLastName nvarchar(255) = NULL,
    @registeredDate_Clear bit = 0,
    @registeredDate nvarchar(255) = NULL,
    @id nvarchar(255),
    @showInDirectory_Clear bit = 0,
    @showInDirectory nvarchar(255) = NULL,
    @gender_Clear bit = 0,
    @gender nvarchar(255) = NULL,
    @itemizedCustomFields_Clear bit = 0,
    @itemizedCustomFields nvarchar(MAX) = NULL,
    @lastName_Clear bit = 0,
    @lastName nvarchar(255) = NULL,
    @preferredFirstName_Clear bit = 0,
    @preferredFirstName nvarchar(255) = NULL,
    @emails_Clear bit = 0,
    @emails nvarchar(MAX) = NULL,
    @prefix_Clear bit = 0,
    @prefix nvarchar(255) = NULL,
    @addresses_Clear bit = 0,
    @addresses nvarchar(MAX) = NULL,
    @attendedDate_Clear bit = 0,
    @attendedDate nvarchar(255) = NULL,
    @primaryOrganization_Clear bit = 0,
    @primaryOrganization nvarchar(MAX) = NULL,
    @middleName_Clear bit = 0,
    @middleName nvarchar(255) = NULL,
    @firstName_Clear bit = 0,
    @firstName nvarchar(255) = NULL,
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
        [re_members_ams].[CourseAttendees]
    SET
        [recordNumber] = CASE WHEN @recordNumber_Clear = 1 THEN NULL ELSE ISNULL(@recordNumber, [recordNumber]) END,
        [suffix] = CASE WHEN @suffix_Clear = 1 THEN NULL ELSE ISNULL(@suffix, [suffix]) END,
        [title] = CASE WHEN @title_Clear = 1 THEN NULL ELSE ISNULL(@title, [title]) END,
        [customerType] = CASE WHEN @customerType_Clear = 1 THEN NULL ELSE ISNULL(@customerType, [customerType]) END,
        [phones] = CASE WHEN @phones_Clear = 1 THEN NULL ELSE ISNULL(@phones, [phones]) END,
        [secondLastName] = CASE WHEN @secondLastName_Clear = 1 THEN NULL ELSE ISNULL(@secondLastName, [secondLastName]) END,
        [registeredDate] = CASE WHEN @registeredDate_Clear = 1 THEN NULL ELSE ISNULL(@registeredDate, [registeredDate]) END,
        [showInDirectory] = CASE WHEN @showInDirectory_Clear = 1 THEN NULL ELSE ISNULL(@showInDirectory, [showInDirectory]) END,
        [gender] = CASE WHEN @gender_Clear = 1 THEN NULL ELSE ISNULL(@gender, [gender]) END,
        [itemizedCustomFields] = CASE WHEN @itemizedCustomFields_Clear = 1 THEN NULL ELSE ISNULL(@itemizedCustomFields, [itemizedCustomFields]) END,
        [lastName] = CASE WHEN @lastName_Clear = 1 THEN NULL ELSE ISNULL(@lastName, [lastName]) END,
        [preferredFirstName] = CASE WHEN @preferredFirstName_Clear = 1 THEN NULL ELSE ISNULL(@preferredFirstName, [preferredFirstName]) END,
        [emails] = CASE WHEN @emails_Clear = 1 THEN NULL ELSE ISNULL(@emails, [emails]) END,
        [prefix] = CASE WHEN @prefix_Clear = 1 THEN NULL ELSE ISNULL(@prefix, [prefix]) END,
        [addresses] = CASE WHEN @addresses_Clear = 1 THEN NULL ELSE ISNULL(@addresses, [addresses]) END,
        [attendedDate] = CASE WHEN @attendedDate_Clear = 1 THEN NULL ELSE ISNULL(@attendedDate, [attendedDate]) END,
        [primaryOrganization] = CASE WHEN @primaryOrganization_Clear = 1 THEN NULL ELSE ISNULL(@primaryOrganization, [primaryOrganization]) END,
        [middleName] = CASE WHEN @middleName_Clear = 1 THEN NULL ELSE ISNULL(@middleName, [middleName]) END,
        [firstName] = CASE WHEN @firstName_Clear = 1 THEN NULL ELSE ISNULL(@firstName, [firstName]) END,
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
        SELECT TOP 0 * FROM [re_members_ams].[vwCourseAttendees] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [re_members_ams].[vwCourseAttendees]
                                    WHERE
                                        [id] = @id
                                    
END
GO

GRANT EXECUTE ON [re_members_ams].[spUpdateCourseAttendees] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the CourseAttendees table
------------------------------------------------------------
IF OBJECT_ID('[re_members_ams].[trgUpdateCourseAttendees]', 'TR') IS NOT NULL
    DROP TRIGGER [re_members_ams].[trgUpdateCourseAttendees];
GO
CREATE TRIGGER [re_members_ams].trgUpdateCourseAttendees
ON [re_members_ams].[CourseAttendees]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [re_members_ams].[CourseAttendees]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [re_members_ams].[CourseAttendees] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[id] = I.[id];
END;
GO

/* spUpdate Permissions for Course Attendees */

GRANT EXECUTE ON [re_members_ams].[spUpdateCourseAttendees] TO [cdp_Developer], [cdp_Integration];

/* Base View SQL for Custom Field Definitions */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Custom Field Definitions
-- Item: vwCustomFieldDefinitions
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      Custom Field Definitions
-----               SCHEMA:      re_members_ams
-----               BASE TABLE:  CustomFieldDefinitions
-----               PRIMARY KEY: name
------------------------------------------------------------
IF OBJECT_ID('[re_members_ams].[vwCustomFieldDefinitions]', 'V') IS NOT NULL
    DROP VIEW [re_members_ams].[vwCustomFieldDefinitions];
GO

CREATE VIEW [re_members_ams].[vwCustomFieldDefinitions]
AS
SELECT
    c.*
FROM
    [re_members_ams].[CustomFieldDefinitions] AS c
GO
GRANT SELECT ON [re_members_ams].[vwCustomFieldDefinitions] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* Base View Permissions SQL for Custom Field Definitions */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Custom Field Definitions
-- Item: Permissions for vwCustomFieldDefinitions
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [re_members_ams].[vwCustomFieldDefinitions] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* spCreate SQL for Custom Field Definitions */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Custom Field Definitions
-- Item: spCreateCustomFieldDefinitions
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR CustomFieldDefinitions
------------------------------------------------------------
IF OBJECT_ID('[re_members_ams].[spCreateCustomFieldDefinitions]', 'P') IS NOT NULL
    DROP PROCEDURE [re_members_ams].[spCreateCustomFieldDefinitions];
GO

CREATE PROCEDURE [re_members_ams].[spCreateCustomFieldDefinitions]
    @description_Clear bit = 0,
    @description nvarchar(812) = NULL,
    @caption_Clear bit = 0,
    @caption nvarchar(812) = NULL,
    @dataType_Clear bit = 0,
    @dataType nvarchar(812) = NULL,
    @mj_e2e_custom_attr_Clear bit = 0,
    @mj_e2e_custom_attr nvarchar(812) = NULL,
    @inputType_Clear bit = 0,
    @inputType nvarchar(812) = NULL,
    @name nvarchar(450) = NULL,
    @availableValues_Clear bit = 0,
    @availableValues nvarchar(MAX) = NULL,
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
    [re_members_ams].[CustomFieldDefinitions]
        (
            [description],
                [caption],
                [dataType],
                [mj_e2e_custom_attr],
                [inputType],
                [availableValues],
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
                [name]
        )
    VALUES
        (
            CASE WHEN @description_Clear = 1 THEN NULL ELSE ISNULL(@description, NULL) END,
                CASE WHEN @caption_Clear = 1 THEN NULL ELSE ISNULL(@caption, NULL) END,
                CASE WHEN @dataType_Clear = 1 THEN NULL ELSE ISNULL(@dataType, NULL) END,
                CASE WHEN @mj_e2e_custom_attr_Clear = 1 THEN NULL ELSE ISNULL(@mj_e2e_custom_attr, NULL) END,
                CASE WHEN @inputType_Clear = 1 THEN NULL ELSE ISNULL(@inputType, NULL) END,
                CASE WHEN @availableValues_Clear = 1 THEN NULL ELSE ISNULL(@availableValues, NULL) END,
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
                @name
        )
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [re_members_ams].[vwCustomFieldDefinitions] WHERE [name] = @name
END
GO
GRANT EXECUTE ON [re_members_ams].[spCreateCustomFieldDefinitions] TO [cdp_Developer], [cdp_Integration];

/* spCreate Permissions for Custom Field Definitions */

GRANT EXECUTE ON [re_members_ams].[spCreateCustomFieldDefinitions] TO [cdp_Developer], [cdp_Integration];

/* spUpdate SQL for Custom Field Definitions */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Custom Field Definitions
-- Item: spUpdateCustomFieldDefinitions
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR CustomFieldDefinitions
------------------------------------------------------------
IF OBJECT_ID('[re_members_ams].[spUpdateCustomFieldDefinitions]', 'P') IS NOT NULL
    DROP PROCEDURE [re_members_ams].[spUpdateCustomFieldDefinitions];
GO

CREATE PROCEDURE [re_members_ams].[spUpdateCustomFieldDefinitions]
    @description_Clear bit = 0,
    @description nvarchar(812) = NULL,
    @caption_Clear bit = 0,
    @caption nvarchar(812) = NULL,
    @dataType_Clear bit = 0,
    @dataType nvarchar(812) = NULL,
    @mj_e2e_custom_attr_Clear bit = 0,
    @mj_e2e_custom_attr nvarchar(812) = NULL,
    @inputType_Clear bit = 0,
    @inputType nvarchar(812) = NULL,
    @name nvarchar(450),
    @availableValues_Clear bit = 0,
    @availableValues nvarchar(MAX) = NULL,
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
        [re_members_ams].[CustomFieldDefinitions]
    SET
        [description] = CASE WHEN @description_Clear = 1 THEN NULL ELSE ISNULL(@description, [description]) END,
        [caption] = CASE WHEN @caption_Clear = 1 THEN NULL ELSE ISNULL(@caption, [caption]) END,
        [dataType] = CASE WHEN @dataType_Clear = 1 THEN NULL ELSE ISNULL(@dataType, [dataType]) END,
        [mj_e2e_custom_attr] = CASE WHEN @mj_e2e_custom_attr_Clear = 1 THEN NULL ELSE ISNULL(@mj_e2e_custom_attr, [mj_e2e_custom_attr]) END,
        [inputType] = CASE WHEN @inputType_Clear = 1 THEN NULL ELSE ISNULL(@inputType, [inputType]) END,
        [availableValues] = CASE WHEN @availableValues_Clear = 1 THEN NULL ELSE ISNULL(@availableValues, [availableValues]) END,
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
        [name] = @name

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [re_members_ams].[vwCustomFieldDefinitions] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [re_members_ams].[vwCustomFieldDefinitions]
                                    WHERE
                                        [name] = @name
                                    
END
GO

GRANT EXECUTE ON [re_members_ams].[spUpdateCustomFieldDefinitions] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the CustomFieldDefinitions table
------------------------------------------------------------
IF OBJECT_ID('[re_members_ams].[trgUpdateCustomFieldDefinitions]', 'TR') IS NOT NULL
    DROP TRIGGER [re_members_ams].[trgUpdateCustomFieldDefinitions];
GO
CREATE TRIGGER [re_members_ams].trgUpdateCustomFieldDefinitions
ON [re_members_ams].[CustomFieldDefinitions]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [re_members_ams].[CustomFieldDefinitions]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [re_members_ams].[CustomFieldDefinitions] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[name] = I.[name];
END;
GO

/* spUpdate Permissions for Custom Field Definitions */

GRANT EXECUTE ON [re_members_ams].[spUpdateCustomFieldDefinitions] TO [cdp_Developer], [cdp_Integration];

/* spDelete SQL for Committee Positions */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Committee Positions
-- Item: spDeleteCommitteePositions
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR CommitteePositions
------------------------------------------------------------
IF OBJECT_ID('[re_members_ams].[spDeleteCommitteePositions]', 'P') IS NOT NULL
    DROP PROCEDURE [re_members_ams].[spDeleteCommitteePositions];
GO

CREATE PROCEDURE [re_members_ams].[spDeleteCommitteePositions]
    @code nvarchar(255)
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [re_members_ams].[CommitteePositions]
    WHERE
        [code] = @code


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [code] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @code AS [code] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [re_members_ams].[spDeleteCommitteePositions] TO [cdp_Developer], [cdp_Integration];

/* spDelete Permissions for Committee Positions */

GRANT EXECUTE ON [re_members_ams].[spDeleteCommitteePositions] TO [cdp_Developer], [cdp_Integration];

/* spDelete SQL for Committees */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Committees
-- Item: spDeleteCommittees
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR Committees
------------------------------------------------------------
IF OBJECT_ID('[re_members_ams].[spDeleteCommittees]', 'P') IS NOT NULL
    DROP PROCEDURE [re_members_ams].[spDeleteCommittees];
GO

CREATE PROCEDURE [re_members_ams].[spDeleteCommittees]
    @id nvarchar(450)
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [re_members_ams].[Committees]
    WHERE
        [id] = @id


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [id] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @id AS [id] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [re_members_ams].[spDeleteCommittees] TO [cdp_Developer], [cdp_Integration];

/* spDelete Permissions for Committees */

GRANT EXECUTE ON [re_members_ams].[spDeleteCommittees] TO [cdp_Developer], [cdp_Integration];

/* spDelete SQL for Countries */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Countries
-- Item: spDeleteCountries
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR Countries
------------------------------------------------------------
IF OBJECT_ID('[re_members_ams].[spDeleteCountries]', 'P') IS NOT NULL
    DROP PROCEDURE [re_members_ams].[spDeleteCountries];
GO

CREATE PROCEDURE [re_members_ams].[spDeleteCountries]
    @id nvarchar(450)
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [re_members_ams].[Countries]
    WHERE
        [id] = @id


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [id] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @id AS [id] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [re_members_ams].[spDeleteCountries] TO [cdp_Developer], [cdp_Integration];

/* spDelete Permissions for Countries */

GRANT EXECUTE ON [re_members_ams].[spDeleteCountries] TO [cdp_Developer], [cdp_Integration];

/* spDelete SQL for Course Attendees */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Course Attendees
-- Item: spDeleteCourseAttendees
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR CourseAttendees
------------------------------------------------------------
IF OBJECT_ID('[re_members_ams].[spDeleteCourseAttendees]', 'P') IS NOT NULL
    DROP PROCEDURE [re_members_ams].[spDeleteCourseAttendees];
GO

CREATE PROCEDURE [re_members_ams].[spDeleteCourseAttendees]
    @id nvarchar(255)
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [re_members_ams].[CourseAttendees]
    WHERE
        [id] = @id


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [id] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @id AS [id] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [re_members_ams].[spDeleteCourseAttendees] TO [cdp_Developer], [cdp_Integration];

/* spDelete Permissions for Course Attendees */

GRANT EXECUTE ON [re_members_ams].[spDeleteCourseAttendees] TO [cdp_Developer], [cdp_Integration];

/* spDelete SQL for Custom Field Definitions */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Custom Field Definitions
-- Item: spDeleteCustomFieldDefinitions
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR CustomFieldDefinitions
------------------------------------------------------------
IF OBJECT_ID('[re_members_ams].[spDeleteCustomFieldDefinitions]', 'P') IS NOT NULL
    DROP PROCEDURE [re_members_ams].[spDeleteCustomFieldDefinitions];
GO

CREATE PROCEDURE [re_members_ams].[spDeleteCustomFieldDefinitions]
    @name nvarchar(450)
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [re_members_ams].[CustomFieldDefinitions]
    WHERE
        [name] = @name


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [name] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @name AS [name] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [re_members_ams].[spDeleteCustomFieldDefinitions] TO [cdp_Developer], [cdp_Integration];

/* spDelete Permissions for Custom Field Definitions */

GRANT EXECUTE ON [re_members_ams].[spDeleteCustomFieldDefinitions] TO [cdp_Developer], [cdp_Integration];

/* Index for Foreign Keys for CustomFieldValues */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Custom Field Values
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------;

/* Index for Foreign Keys for CustomerRequests */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Customer Requests
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------;

/* Index for Foreign Keys for Emails */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Emails
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------;

/* Index for Foreign Keys for EventCancellations */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Event Cancellations
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------;

/* Index for Foreign Keys for EventRegistrations */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Event Registrations
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key individualId in table EventRegistrations
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_EventRegistrations_individualId' 
    AND object_id = OBJECT_ID('[re_members_ams].[EventRegistrations]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_EventRegistrations_individualId ON [re_members_ams].[EventRegistrations] ([individualId]);

/* Base View SQL for Custom Field Values */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Custom Field Values
-- Item: vwCustomFieldValues
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      Custom Field Values
-----               SCHEMA:      re_members_ams
-----               BASE TABLE:  CustomFieldValues
-----               PRIMARY KEY: name
------------------------------------------------------------
IF OBJECT_ID('[re_members_ams].[vwCustomFieldValues]', 'V') IS NOT NULL
    DROP VIEW [re_members_ams].[vwCustomFieldValues];
GO

CREATE VIEW [re_members_ams].[vwCustomFieldValues]
AS
SELECT
    c.*
FROM
    [re_members_ams].[CustomFieldValues] AS c
GO
GRANT SELECT ON [re_members_ams].[vwCustomFieldValues] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* Base View Permissions SQL for Custom Field Values */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Custom Field Values
-- Item: Permissions for vwCustomFieldValues
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [re_members_ams].[vwCustomFieldValues] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* spCreate SQL for Custom Field Values */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Custom Field Values
-- Item: spCreateCustomFieldValues
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR CustomFieldValues
------------------------------------------------------------
IF OBJECT_ID('[re_members_ams].[spCreateCustomFieldValues]', 'P') IS NOT NULL
    DROP PROCEDURE [re_members_ams].[spCreateCustomFieldValues];
GO

CREATE PROCEDURE [re_members_ams].[spCreateCustomFieldValues]
    @caption_Clear bit = 0,
    @caption nvarchar(800) = NULL,
    @value_Clear bit = 0,
    @value nvarchar(255) = NULL,
    @name nvarchar(450) = NULL,
    @individualId_Clear bit = 0,
    @individualId nvarchar(255) = NULL,
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
    [re_members_ams].[CustomFieldValues]
        (
            [caption],
                [value],
                [individualId],
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
                [name]
        )
    VALUES
        (
            CASE WHEN @caption_Clear = 1 THEN NULL ELSE ISNULL(@caption, NULL) END,
                CASE WHEN @value_Clear = 1 THEN NULL ELSE ISNULL(@value, NULL) END,
                CASE WHEN @individualId_Clear = 1 THEN NULL ELSE ISNULL(@individualId, NULL) END,
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
                @name
        )
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [re_members_ams].[vwCustomFieldValues] WHERE [name] = @name
END
GO
GRANT EXECUTE ON [re_members_ams].[spCreateCustomFieldValues] TO [cdp_Developer], [cdp_Integration];

/* spCreate Permissions for Custom Field Values */

GRANT EXECUTE ON [re_members_ams].[spCreateCustomFieldValues] TO [cdp_Developer], [cdp_Integration];

/* spUpdate SQL for Custom Field Values */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Custom Field Values
-- Item: spUpdateCustomFieldValues
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR CustomFieldValues
------------------------------------------------------------
IF OBJECT_ID('[re_members_ams].[spUpdateCustomFieldValues]', 'P') IS NOT NULL
    DROP PROCEDURE [re_members_ams].[spUpdateCustomFieldValues];
GO

CREATE PROCEDURE [re_members_ams].[spUpdateCustomFieldValues]
    @caption_Clear bit = 0,
    @caption nvarchar(800) = NULL,
    @value_Clear bit = 0,
    @value nvarchar(255) = NULL,
    @name nvarchar(450),
    @individualId_Clear bit = 0,
    @individualId nvarchar(255) = NULL,
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
        [re_members_ams].[CustomFieldValues]
    SET
        [caption] = CASE WHEN @caption_Clear = 1 THEN NULL ELSE ISNULL(@caption, [caption]) END,
        [value] = CASE WHEN @value_Clear = 1 THEN NULL ELSE ISNULL(@value, [value]) END,
        [individualId] = CASE WHEN @individualId_Clear = 1 THEN NULL ELSE ISNULL(@individualId, [individualId]) END,
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
        [name] = @name

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [re_members_ams].[vwCustomFieldValues] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [re_members_ams].[vwCustomFieldValues]
                                    WHERE
                                        [name] = @name
                                    
END
GO

GRANT EXECUTE ON [re_members_ams].[spUpdateCustomFieldValues] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the CustomFieldValues table
------------------------------------------------------------
IF OBJECT_ID('[re_members_ams].[trgUpdateCustomFieldValues]', 'TR') IS NOT NULL
    DROP TRIGGER [re_members_ams].[trgUpdateCustomFieldValues];
GO
CREATE TRIGGER [re_members_ams].trgUpdateCustomFieldValues
ON [re_members_ams].[CustomFieldValues]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [re_members_ams].[CustomFieldValues]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [re_members_ams].[CustomFieldValues] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[name] = I.[name];
END;
GO

/* spUpdate Permissions for Custom Field Values */

GRANT EXECUTE ON [re_members_ams].[spUpdateCustomFieldValues] TO [cdp_Developer], [cdp_Integration];

/* Base View SQL for Customer Requests */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Customer Requests
-- Item: vwCustomerRequests
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      Customer Requests
-----               SCHEMA:      re_members_ams
-----               BASE TABLE:  CustomerRequests
-----               PRIMARY KEY: requestNumber
------------------------------------------------------------
IF OBJECT_ID('[re_members_ams].[vwCustomerRequests]', 'V') IS NOT NULL
    DROP VIEW [re_members_ams].[vwCustomerRequests];
GO

CREATE VIEW [re_members_ams].[vwCustomerRequests]
AS
SELECT
    c.*
FROM
    [re_members_ams].[CustomerRequests] AS c
GO
GRANT SELECT ON [re_members_ams].[vwCustomerRequests] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* Base View Permissions SQL for Customer Requests */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Customer Requests
-- Item: Permissions for vwCustomerRequests
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [re_members_ams].[vwCustomerRequests] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* spCreate SQL for Customer Requests */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Customer Requests
-- Item: spCreateCustomerRequests
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR CustomerRequests
------------------------------------------------------------
IF OBJECT_ID('[re_members_ams].[spCreateCustomerRequests]', 'P') IS NOT NULL
    DROP PROCEDURE [re_members_ams].[spCreateCustomerRequests];
GO

CREATE PROCEDURE [re_members_ams].[spCreateCustomerRequests]
    @requestedByCustomerRecordNumber_Clear bit = 0,
    @requestedByCustomerRecordNumber nvarchar(812) = NULL,
    @requestDate_Clear bit = 0,
    @requestDate nvarchar(MAX) = NULL,
    @requestType_Clear bit = 0,
    @requestType nvarchar(812) = NULL,
    @description_Clear bit = 0,
    @description nvarchar(812) = NULL,
    @closedDate_Clear bit = 0,
    @closedDate nvarchar(MAX) = NULL,
    @requestNumber nvarchar(450) = NULL,
    @mj_e2e_custom_attr_Clear bit = 0,
    @mj_e2e_custom_attr nvarchar(812) = NULL,
    @source_Clear bit = 0,
    @source nvarchar(812) = NULL,
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
    [re_members_ams].[CustomerRequests]
        (
            [requestedByCustomerRecordNumber],
                [requestDate],
                [requestType],
                [description],
                [closedDate],
                [mj_e2e_custom_attr],
                [source],
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
                [requestNumber]
        )
    VALUES
        (
            CASE WHEN @requestedByCustomerRecordNumber_Clear = 1 THEN NULL ELSE ISNULL(@requestedByCustomerRecordNumber, NULL) END,
                CASE WHEN @requestDate_Clear = 1 THEN NULL ELSE ISNULL(@requestDate, NULL) END,
                CASE WHEN @requestType_Clear = 1 THEN NULL ELSE ISNULL(@requestType, NULL) END,
                CASE WHEN @description_Clear = 1 THEN NULL ELSE ISNULL(@description, NULL) END,
                CASE WHEN @closedDate_Clear = 1 THEN NULL ELSE ISNULL(@closedDate, NULL) END,
                CASE WHEN @mj_e2e_custom_attr_Clear = 1 THEN NULL ELSE ISNULL(@mj_e2e_custom_attr, NULL) END,
                CASE WHEN @source_Clear = 1 THEN NULL ELSE ISNULL(@source, NULL) END,
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
                @requestNumber
        )
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [re_members_ams].[vwCustomerRequests] WHERE [requestNumber] = @requestNumber
END
GO
GRANT EXECUTE ON [re_members_ams].[spCreateCustomerRequests] TO [cdp_Developer], [cdp_Integration];

/* spCreate Permissions for Customer Requests */

GRANT EXECUTE ON [re_members_ams].[spCreateCustomerRequests] TO [cdp_Developer], [cdp_Integration];

/* spUpdate SQL for Customer Requests */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Customer Requests
-- Item: spUpdateCustomerRequests
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR CustomerRequests
------------------------------------------------------------
IF OBJECT_ID('[re_members_ams].[spUpdateCustomerRequests]', 'P') IS NOT NULL
    DROP PROCEDURE [re_members_ams].[spUpdateCustomerRequests];
GO

CREATE PROCEDURE [re_members_ams].[spUpdateCustomerRequests]
    @requestedByCustomerRecordNumber_Clear bit = 0,
    @requestedByCustomerRecordNumber nvarchar(812) = NULL,
    @requestDate_Clear bit = 0,
    @requestDate nvarchar(MAX) = NULL,
    @requestType_Clear bit = 0,
    @requestType nvarchar(812) = NULL,
    @description_Clear bit = 0,
    @description nvarchar(812) = NULL,
    @closedDate_Clear bit = 0,
    @closedDate nvarchar(MAX) = NULL,
    @requestNumber nvarchar(450),
    @mj_e2e_custom_attr_Clear bit = 0,
    @mj_e2e_custom_attr nvarchar(812) = NULL,
    @source_Clear bit = 0,
    @source nvarchar(812) = NULL,
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
        [re_members_ams].[CustomerRequests]
    SET
        [requestedByCustomerRecordNumber] = CASE WHEN @requestedByCustomerRecordNumber_Clear = 1 THEN NULL ELSE ISNULL(@requestedByCustomerRecordNumber, [requestedByCustomerRecordNumber]) END,
        [requestDate] = CASE WHEN @requestDate_Clear = 1 THEN NULL ELSE ISNULL(@requestDate, [requestDate]) END,
        [requestType] = CASE WHEN @requestType_Clear = 1 THEN NULL ELSE ISNULL(@requestType, [requestType]) END,
        [description] = CASE WHEN @description_Clear = 1 THEN NULL ELSE ISNULL(@description, [description]) END,
        [closedDate] = CASE WHEN @closedDate_Clear = 1 THEN NULL ELSE ISNULL(@closedDate, [closedDate]) END,
        [mj_e2e_custom_attr] = CASE WHEN @mj_e2e_custom_attr_Clear = 1 THEN NULL ELSE ISNULL(@mj_e2e_custom_attr, [mj_e2e_custom_attr]) END,
        [source] = CASE WHEN @source_Clear = 1 THEN NULL ELSE ISNULL(@source, [source]) END,
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
        [requestNumber] = @requestNumber

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [re_members_ams].[vwCustomerRequests] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [re_members_ams].[vwCustomerRequests]
                                    WHERE
                                        [requestNumber] = @requestNumber
                                    
END
GO

GRANT EXECUTE ON [re_members_ams].[spUpdateCustomerRequests] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the CustomerRequests table
------------------------------------------------------------
IF OBJECT_ID('[re_members_ams].[trgUpdateCustomerRequests]', 'TR') IS NOT NULL
    DROP TRIGGER [re_members_ams].[trgUpdateCustomerRequests];
GO
CREATE TRIGGER [re_members_ams].trgUpdateCustomerRequests
ON [re_members_ams].[CustomerRequests]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [re_members_ams].[CustomerRequests]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [re_members_ams].[CustomerRequests] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[requestNumber] = I.[requestNumber];
END;
GO

/* spUpdate Permissions for Customer Requests */

GRANT EXECUTE ON [re_members_ams].[spUpdateCustomerRequests] TO [cdp_Developer], [cdp_Integration];

/* Base View SQL for Emails */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Emails
-- Item: vwEmails
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      Emails
-----               SCHEMA:      re_members_ams
-----               BASE TABLE:  Emails
-----               PRIMARY KEY: address
------------------------------------------------------------
IF OBJECT_ID('[re_members_ams].[vwEmails]', 'V') IS NOT NULL
    DROP VIEW [re_members_ams].[vwEmails];
GO

CREATE VIEW [re_members_ams].[vwEmails]
AS
SELECT
    e.*
FROM
    [re_members_ams].[Emails] AS e
GO
GRANT SELECT ON [re_members_ams].[vwEmails] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* Base View Permissions SQL for Emails */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Emails
-- Item: Permissions for vwEmails
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [re_members_ams].[vwEmails] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* spCreate SQL for Emails */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Emails
-- Item: spCreateEmails
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR Emails
------------------------------------------------------------
IF OBJECT_ID('[re_members_ams].[spCreateEmails]', 'P') IS NOT NULL
    DROP PROCEDURE [re_members_ams].[spCreateEmails];
GO

CREATE PROCEDURE [re_members_ams].[spCreateEmails]
    @type_Clear bit = 0,
    @type nvarchar(350) = NULL,
    @primary_Clear bit = 0,
    @primary nvarchar(255) = NULL,
    @address nvarchar(450) = NULL,
    @showInDirectory_Clear bit = 0,
    @showInDirectory nvarchar(255) = NULL,
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
    [re_members_ams].[Emails]
        (
            [type],
                [primary],
                [showInDirectory],
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
                [address]
        )
    VALUES
        (
            CASE WHEN @type_Clear = 1 THEN NULL ELSE ISNULL(@type, NULL) END,
                CASE WHEN @primary_Clear = 1 THEN NULL ELSE ISNULL(@primary, NULL) END,
                CASE WHEN @showInDirectory_Clear = 1 THEN NULL ELSE ISNULL(@showInDirectory, NULL) END,
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
                @address
        )
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [re_members_ams].[vwEmails] WHERE [address] = @address
END
GO
GRANT EXECUTE ON [re_members_ams].[spCreateEmails] TO [cdp_Developer], [cdp_Integration];

/* spCreate Permissions for Emails */

GRANT EXECUTE ON [re_members_ams].[spCreateEmails] TO [cdp_Developer], [cdp_Integration];

/* spUpdate SQL for Emails */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Emails
-- Item: spUpdateEmails
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR Emails
------------------------------------------------------------
IF OBJECT_ID('[re_members_ams].[spUpdateEmails]', 'P') IS NOT NULL
    DROP PROCEDURE [re_members_ams].[spUpdateEmails];
GO

CREATE PROCEDURE [re_members_ams].[spUpdateEmails]
    @type_Clear bit = 0,
    @type nvarchar(350) = NULL,
    @primary_Clear bit = 0,
    @primary nvarchar(255) = NULL,
    @address nvarchar(450),
    @showInDirectory_Clear bit = 0,
    @showInDirectory nvarchar(255) = NULL,
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
        [re_members_ams].[Emails]
    SET
        [type] = CASE WHEN @type_Clear = 1 THEN NULL ELSE ISNULL(@type, [type]) END,
        [primary] = CASE WHEN @primary_Clear = 1 THEN NULL ELSE ISNULL(@primary, [primary]) END,
        [showInDirectory] = CASE WHEN @showInDirectory_Clear = 1 THEN NULL ELSE ISNULL(@showInDirectory, [showInDirectory]) END,
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
        [address] = @address

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [re_members_ams].[vwEmails] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [re_members_ams].[vwEmails]
                                    WHERE
                                        [address] = @address
                                    
END
GO

GRANT EXECUTE ON [re_members_ams].[spUpdateEmails] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the Emails table
------------------------------------------------------------
IF OBJECT_ID('[re_members_ams].[trgUpdateEmails]', 'TR') IS NOT NULL
    DROP TRIGGER [re_members_ams].[trgUpdateEmails];
GO
CREATE TRIGGER [re_members_ams].trgUpdateEmails
ON [re_members_ams].[Emails]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [re_members_ams].[Emails]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [re_members_ams].[Emails] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[address] = I.[address];
END;
GO

/* spUpdate Permissions for Emails */

GRANT EXECUTE ON [re_members_ams].[spUpdateEmails] TO [cdp_Developer], [cdp_Integration];

/* Base View SQL for Event Cancellations */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Event Cancellations
-- Item: vwEventCancellations
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      Event Cancellations
-----               SCHEMA:      re_members_ams
-----               BASE TABLE:  EventCancellations
-----               PRIMARY KEY: id
------------------------------------------------------------
IF OBJECT_ID('[re_members_ams].[vwEventCancellations]', 'V') IS NOT NULL
    DROP VIEW [re_members_ams].[vwEventCancellations];
GO

CREATE VIEW [re_members_ams].[vwEventCancellations]
AS
SELECT
    e.*
FROM
    [re_members_ams].[EventCancellations] AS e
GO
GRANT SELECT ON [re_members_ams].[vwEventCancellations] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* Base View Permissions SQL for Event Cancellations */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Event Cancellations
-- Item: Permissions for vwEventCancellations
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [re_members_ams].[vwEventCancellations] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* spCreate SQL for Event Cancellations */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Event Cancellations
-- Item: spCreateEventCancellations
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR EventCancellations
------------------------------------------------------------
IF OBJECT_ID('[re_members_ams].[spCreateEventCancellations]', 'P') IS NOT NULL
    DROP PROCEDURE [re_members_ams].[spCreateEventCancellations];
GO

CREATE PROCEDURE [re_members_ams].[spCreateEventCancellations]
    @firstName_Clear bit = 0,
    @firstName nvarchar(255) = NULL,
    @addresses_Clear bit = 0,
    @addresses nvarchar(MAX) = NULL,
    @secondLastName_Clear bit = 0,
    @secondLastName nvarchar(255) = NULL,
    @suffix_Clear bit = 0,
    @suffix nvarchar(255) = NULL,
    @primaryOrganization_Clear bit = 0,
    @primaryOrganization nvarchar(MAX) = NULL,
    @customerType_Clear bit = 0,
    @customerType nvarchar(255) = NULL,
    @registrationNumber_Clear bit = 0,
    @registrationNumber nvarchar(255) = NULL,
    @id nvarchar(255) = NULL,
    @lastName_Clear bit = 0,
    @lastName nvarchar(255) = NULL,
    @emails_Clear bit = 0,
    @emails nvarchar(MAX) = NULL,
    @title_Clear bit = 0,
    @title nvarchar(255) = NULL,
    @phones_Clear bit = 0,
    @phones nvarchar(MAX) = NULL,
    @preferredFirstName_Clear bit = 0,
    @preferredFirstName nvarchar(255) = NULL,
    @guestOfRecordNumber_Clear bit = 0,
    @guestOfRecordNumber nvarchar(255) = NULL,
    @gender_Clear bit = 0,
    @gender nvarchar(255) = NULL,
    @middleName_Clear bit = 0,
    @middleName nvarchar(255) = NULL,
    @showInDirectory_Clear bit = 0,
    @showInDirectory nvarchar(255) = NULL,
    @eventCancellationDate_Clear bit = 0,
    @eventCancellationDate nvarchar(255) = NULL,
    @cancelledSessions_Clear bit = 0,
    @cancelledSessions nvarchar(MAX) = NULL,
    @recordNumber_Clear bit = 0,
    @recordNumber nvarchar(255) = NULL,
    @prefix_Clear bit = 0,
    @prefix nvarchar(255) = NULL,
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
    [re_members_ams].[EventCancellations]
        (
            [firstName],
                [addresses],
                [secondLastName],
                [suffix],
                [primaryOrganization],
                [customerType],
                [registrationNumber],
                [lastName],
                [emails],
                [title],
                [phones],
                [preferredFirstName],
                [guestOfRecordNumber],
                [gender],
                [middleName],
                [showInDirectory],
                [eventCancellationDate],
                [cancelledSessions],
                [recordNumber],
                [prefix],
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
            CASE WHEN @firstName_Clear = 1 THEN NULL ELSE ISNULL(@firstName, NULL) END,
                CASE WHEN @addresses_Clear = 1 THEN NULL ELSE ISNULL(@addresses, NULL) END,
                CASE WHEN @secondLastName_Clear = 1 THEN NULL ELSE ISNULL(@secondLastName, NULL) END,
                CASE WHEN @suffix_Clear = 1 THEN NULL ELSE ISNULL(@suffix, NULL) END,
                CASE WHEN @primaryOrganization_Clear = 1 THEN NULL ELSE ISNULL(@primaryOrganization, NULL) END,
                CASE WHEN @customerType_Clear = 1 THEN NULL ELSE ISNULL(@customerType, NULL) END,
                CASE WHEN @registrationNumber_Clear = 1 THEN NULL ELSE ISNULL(@registrationNumber, NULL) END,
                CASE WHEN @lastName_Clear = 1 THEN NULL ELSE ISNULL(@lastName, NULL) END,
                CASE WHEN @emails_Clear = 1 THEN NULL ELSE ISNULL(@emails, NULL) END,
                CASE WHEN @title_Clear = 1 THEN NULL ELSE ISNULL(@title, NULL) END,
                CASE WHEN @phones_Clear = 1 THEN NULL ELSE ISNULL(@phones, NULL) END,
                CASE WHEN @preferredFirstName_Clear = 1 THEN NULL ELSE ISNULL(@preferredFirstName, NULL) END,
                CASE WHEN @guestOfRecordNumber_Clear = 1 THEN NULL ELSE ISNULL(@guestOfRecordNumber, NULL) END,
                CASE WHEN @gender_Clear = 1 THEN NULL ELSE ISNULL(@gender, NULL) END,
                CASE WHEN @middleName_Clear = 1 THEN NULL ELSE ISNULL(@middleName, NULL) END,
                CASE WHEN @showInDirectory_Clear = 1 THEN NULL ELSE ISNULL(@showInDirectory, NULL) END,
                CASE WHEN @eventCancellationDate_Clear = 1 THEN NULL ELSE ISNULL(@eventCancellationDate, NULL) END,
                CASE WHEN @cancelledSessions_Clear = 1 THEN NULL ELSE ISNULL(@cancelledSessions, NULL) END,
                CASE WHEN @recordNumber_Clear = 1 THEN NULL ELSE ISNULL(@recordNumber, NULL) END,
                CASE WHEN @prefix_Clear = 1 THEN NULL ELSE ISNULL(@prefix, NULL) END,
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
    SELECT * FROM [re_members_ams].[vwEventCancellations] WHERE [id] = @id
END
GO
GRANT EXECUTE ON [re_members_ams].[spCreateEventCancellations] TO [cdp_Developer], [cdp_Integration];

/* spCreate Permissions for Event Cancellations */

GRANT EXECUTE ON [re_members_ams].[spCreateEventCancellations] TO [cdp_Developer], [cdp_Integration];

/* spUpdate SQL for Event Cancellations */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Event Cancellations
-- Item: spUpdateEventCancellations
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR EventCancellations
------------------------------------------------------------
IF OBJECT_ID('[re_members_ams].[spUpdateEventCancellations]', 'P') IS NOT NULL
    DROP PROCEDURE [re_members_ams].[spUpdateEventCancellations];
GO

CREATE PROCEDURE [re_members_ams].[spUpdateEventCancellations]
    @firstName_Clear bit = 0,
    @firstName nvarchar(255) = NULL,
    @addresses_Clear bit = 0,
    @addresses nvarchar(MAX) = NULL,
    @secondLastName_Clear bit = 0,
    @secondLastName nvarchar(255) = NULL,
    @suffix_Clear bit = 0,
    @suffix nvarchar(255) = NULL,
    @primaryOrganization_Clear bit = 0,
    @primaryOrganization nvarchar(MAX) = NULL,
    @customerType_Clear bit = 0,
    @customerType nvarchar(255) = NULL,
    @registrationNumber_Clear bit = 0,
    @registrationNumber nvarchar(255) = NULL,
    @id nvarchar(255),
    @lastName_Clear bit = 0,
    @lastName nvarchar(255) = NULL,
    @emails_Clear bit = 0,
    @emails nvarchar(MAX) = NULL,
    @title_Clear bit = 0,
    @title nvarchar(255) = NULL,
    @phones_Clear bit = 0,
    @phones nvarchar(MAX) = NULL,
    @preferredFirstName_Clear bit = 0,
    @preferredFirstName nvarchar(255) = NULL,
    @guestOfRecordNumber_Clear bit = 0,
    @guestOfRecordNumber nvarchar(255) = NULL,
    @gender_Clear bit = 0,
    @gender nvarchar(255) = NULL,
    @middleName_Clear bit = 0,
    @middleName nvarchar(255) = NULL,
    @showInDirectory_Clear bit = 0,
    @showInDirectory nvarchar(255) = NULL,
    @eventCancellationDate_Clear bit = 0,
    @eventCancellationDate nvarchar(255) = NULL,
    @cancelledSessions_Clear bit = 0,
    @cancelledSessions nvarchar(MAX) = NULL,
    @recordNumber_Clear bit = 0,
    @recordNumber nvarchar(255) = NULL,
    @prefix_Clear bit = 0,
    @prefix nvarchar(255) = NULL,
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
        [re_members_ams].[EventCancellations]
    SET
        [firstName] = CASE WHEN @firstName_Clear = 1 THEN NULL ELSE ISNULL(@firstName, [firstName]) END,
        [addresses] = CASE WHEN @addresses_Clear = 1 THEN NULL ELSE ISNULL(@addresses, [addresses]) END,
        [secondLastName] = CASE WHEN @secondLastName_Clear = 1 THEN NULL ELSE ISNULL(@secondLastName, [secondLastName]) END,
        [suffix] = CASE WHEN @suffix_Clear = 1 THEN NULL ELSE ISNULL(@suffix, [suffix]) END,
        [primaryOrganization] = CASE WHEN @primaryOrganization_Clear = 1 THEN NULL ELSE ISNULL(@primaryOrganization, [primaryOrganization]) END,
        [customerType] = CASE WHEN @customerType_Clear = 1 THEN NULL ELSE ISNULL(@customerType, [customerType]) END,
        [registrationNumber] = CASE WHEN @registrationNumber_Clear = 1 THEN NULL ELSE ISNULL(@registrationNumber, [registrationNumber]) END,
        [lastName] = CASE WHEN @lastName_Clear = 1 THEN NULL ELSE ISNULL(@lastName, [lastName]) END,
        [emails] = CASE WHEN @emails_Clear = 1 THEN NULL ELSE ISNULL(@emails, [emails]) END,
        [title] = CASE WHEN @title_Clear = 1 THEN NULL ELSE ISNULL(@title, [title]) END,
        [phones] = CASE WHEN @phones_Clear = 1 THEN NULL ELSE ISNULL(@phones, [phones]) END,
        [preferredFirstName] = CASE WHEN @preferredFirstName_Clear = 1 THEN NULL ELSE ISNULL(@preferredFirstName, [preferredFirstName]) END,
        [guestOfRecordNumber] = CASE WHEN @guestOfRecordNumber_Clear = 1 THEN NULL ELSE ISNULL(@guestOfRecordNumber, [guestOfRecordNumber]) END,
        [gender] = CASE WHEN @gender_Clear = 1 THEN NULL ELSE ISNULL(@gender, [gender]) END,
        [middleName] = CASE WHEN @middleName_Clear = 1 THEN NULL ELSE ISNULL(@middleName, [middleName]) END,
        [showInDirectory] = CASE WHEN @showInDirectory_Clear = 1 THEN NULL ELSE ISNULL(@showInDirectory, [showInDirectory]) END,
        [eventCancellationDate] = CASE WHEN @eventCancellationDate_Clear = 1 THEN NULL ELSE ISNULL(@eventCancellationDate, [eventCancellationDate]) END,
        [cancelledSessions] = CASE WHEN @cancelledSessions_Clear = 1 THEN NULL ELSE ISNULL(@cancelledSessions, [cancelledSessions]) END,
        [recordNumber] = CASE WHEN @recordNumber_Clear = 1 THEN NULL ELSE ISNULL(@recordNumber, [recordNumber]) END,
        [prefix] = CASE WHEN @prefix_Clear = 1 THEN NULL ELSE ISNULL(@prefix, [prefix]) END,
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
        SELECT TOP 0 * FROM [re_members_ams].[vwEventCancellations] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [re_members_ams].[vwEventCancellations]
                                    WHERE
                                        [id] = @id
                                    
END
GO

GRANT EXECUTE ON [re_members_ams].[spUpdateEventCancellations] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the EventCancellations table
------------------------------------------------------------
IF OBJECT_ID('[re_members_ams].[trgUpdateEventCancellations]', 'TR') IS NOT NULL
    DROP TRIGGER [re_members_ams].[trgUpdateEventCancellations];
GO
CREATE TRIGGER [re_members_ams].trgUpdateEventCancellations
ON [re_members_ams].[EventCancellations]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [re_members_ams].[EventCancellations]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [re_members_ams].[EventCancellations] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[id] = I.[id];
END;
GO

/* spUpdate Permissions for Event Cancellations */

GRANT EXECUTE ON [re_members_ams].[spUpdateEventCancellations] TO [cdp_Developer], [cdp_Integration];

/* Base View SQL for Event Registrations */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Event Registrations
-- Item: vwEventRegistrations
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      Event Registrations
-----               SCHEMA:      re_members_ams
-----               BASE TABLE:  EventRegistrations
-----               PRIMARY KEY: id
------------------------------------------------------------
IF OBJECT_ID('[re_members_ams].[vwEventRegistrations]', 'V') IS NOT NULL
    DROP VIEW [re_members_ams].[vwEventRegistrations];
GO

CREATE VIEW [re_members_ams].[vwEventRegistrations]
AS
SELECT
    e.*
FROM
    [re_members_ams].[EventRegistrations] AS e
GO
GRANT SELECT ON [re_members_ams].[vwEventRegistrations] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* Base View Permissions SQL for Event Registrations */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Event Registrations
-- Item: Permissions for vwEventRegistrations
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [re_members_ams].[vwEventRegistrations] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* spCreate SQL for Event Registrations */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Event Registrations
-- Item: spCreateEventRegistrations
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR EventRegistrations
------------------------------------------------------------
IF OBJECT_ID('[re_members_ams].[spCreateEventRegistrations]', 'P') IS NOT NULL
    DROP PROCEDURE [re_members_ams].[spCreateEventRegistrations];
GO

CREATE PROCEDURE [re_members_ams].[spCreateEventRegistrations]
    @sessions_Clear bit = 0,
    @sessions nvarchar(MAX) = NULL,
    @registrantTypeCode_Clear bit = 0,
    @registrantTypeCode nvarchar(255) = NULL,
    @event_Clear bit = 0,
    @event nvarchar(MAX) = NULL,
    @badgeCity_Clear bit = 0,
    @badgeCity nvarchar(255) = NULL,
    @id nvarchar(255) = NULL,
    @individualId_Clear bit = 0,
    @individualId nvarchar(255) = NULL,
    @registrationNumber_Clear bit = 0,
    @registrationNumber nvarchar(255) = NULL,
    @emails_Clear bit = 0,
    @emails nvarchar(MAX) = NULL,
    @prefix_Clear bit = 0,
    @prefix nvarchar(255) = NULL,
    @registrantTypeName_Clear bit = 0,
    @registrantTypeName nvarchar(255) = NULL,
    @lastName_Clear bit = 0,
    @lastName nvarchar(255) = NULL,
    @title_Clear bit = 0,
    @title nvarchar(255) = NULL,
    @showInDirectory_Clear bit = 0,
    @showInDirectory nvarchar(255) = NULL,
    @boughtTogetherWith_Clear bit = 0,
    @boughtTogetherWith nvarchar(MAX) = NULL,
    @secondLastName_Clear bit = 0,
    @secondLastName nvarchar(255) = NULL,
    @itemizedCustomFields_Clear bit = 0,
    @itemizedCustomFields nvarchar(MAX) = NULL,
    @guestOfRecordNumber_Clear bit = 0,
    @guestOfRecordNumber nvarchar(255) = NULL,
    @customerType_Clear bit = 0,
    @customerType nvarchar(255) = NULL,
    @badgeName_Clear bit = 0,
    @badgeName nvarchar(255) = NULL,
    @suffix_Clear bit = 0,
    @suffix nvarchar(255) = NULL,
    @gender_Clear bit = 0,
    @gender nvarchar(255) = NULL,
    @attendedDate_Clear bit = 0,
    @attendedDate nvarchar(255) = NULL,
    @badgeState_Clear bit = 0,
    @badgeState nvarchar(255) = NULL,
    @firstName_Clear bit = 0,
    @firstName nvarchar(255) = NULL,
    @preferredFirstName_Clear bit = 0,
    @preferredFirstName nvarchar(255) = NULL,
    @addresses_Clear bit = 0,
    @addresses nvarchar(MAX) = NULL,
    @primaryOrganization_Clear bit = 0,
    @primaryOrganization nvarchar(MAX) = NULL,
    @badgeOrganization_Clear bit = 0,
    @badgeOrganization nvarchar(255) = NULL,
    @middleName_Clear bit = 0,
    @middleName nvarchar(255) = NULL,
    @recordNumber_Clear bit = 0,
    @recordNumber nvarchar(255) = NULL,
    @phones_Clear bit = 0,
    @phones nvarchar(MAX) = NULL,
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
    [re_members_ams].[EventRegistrations]
        (
            [sessions],
                [registrantTypeCode],
                [event],
                [badgeCity],
                [individualId],
                [registrationNumber],
                [emails],
                [prefix],
                [registrantTypeName],
                [lastName],
                [title],
                [showInDirectory],
                [boughtTogetherWith],
                [secondLastName],
                [itemizedCustomFields],
                [guestOfRecordNumber],
                [customerType],
                [badgeName],
                [suffix],
                [gender],
                [attendedDate],
                [badgeState],
                [firstName],
                [preferredFirstName],
                [addresses],
                [primaryOrganization],
                [badgeOrganization],
                [middleName],
                [recordNumber],
                [phones],
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
            CASE WHEN @sessions_Clear = 1 THEN NULL ELSE ISNULL(@sessions, NULL) END,
                CASE WHEN @registrantTypeCode_Clear = 1 THEN NULL ELSE ISNULL(@registrantTypeCode, NULL) END,
                CASE WHEN @event_Clear = 1 THEN NULL ELSE ISNULL(@event, NULL) END,
                CASE WHEN @badgeCity_Clear = 1 THEN NULL ELSE ISNULL(@badgeCity, NULL) END,
                CASE WHEN @individualId_Clear = 1 THEN NULL ELSE ISNULL(@individualId, NULL) END,
                CASE WHEN @registrationNumber_Clear = 1 THEN NULL ELSE ISNULL(@registrationNumber, NULL) END,
                CASE WHEN @emails_Clear = 1 THEN NULL ELSE ISNULL(@emails, NULL) END,
                CASE WHEN @prefix_Clear = 1 THEN NULL ELSE ISNULL(@prefix, NULL) END,
                CASE WHEN @registrantTypeName_Clear = 1 THEN NULL ELSE ISNULL(@registrantTypeName, NULL) END,
                CASE WHEN @lastName_Clear = 1 THEN NULL ELSE ISNULL(@lastName, NULL) END,
                CASE WHEN @title_Clear = 1 THEN NULL ELSE ISNULL(@title, NULL) END,
                CASE WHEN @showInDirectory_Clear = 1 THEN NULL ELSE ISNULL(@showInDirectory, NULL) END,
                CASE WHEN @boughtTogetherWith_Clear = 1 THEN NULL ELSE ISNULL(@boughtTogetherWith, NULL) END,
                CASE WHEN @secondLastName_Clear = 1 THEN NULL ELSE ISNULL(@secondLastName, NULL) END,
                CASE WHEN @itemizedCustomFields_Clear = 1 THEN NULL ELSE ISNULL(@itemizedCustomFields, NULL) END,
                CASE WHEN @guestOfRecordNumber_Clear = 1 THEN NULL ELSE ISNULL(@guestOfRecordNumber, NULL) END,
                CASE WHEN @customerType_Clear = 1 THEN NULL ELSE ISNULL(@customerType, NULL) END,
                CASE WHEN @badgeName_Clear = 1 THEN NULL ELSE ISNULL(@badgeName, NULL) END,
                CASE WHEN @suffix_Clear = 1 THEN NULL ELSE ISNULL(@suffix, NULL) END,
                CASE WHEN @gender_Clear = 1 THEN NULL ELSE ISNULL(@gender, NULL) END,
                CASE WHEN @attendedDate_Clear = 1 THEN NULL ELSE ISNULL(@attendedDate, NULL) END,
                CASE WHEN @badgeState_Clear = 1 THEN NULL ELSE ISNULL(@badgeState, NULL) END,
                CASE WHEN @firstName_Clear = 1 THEN NULL ELSE ISNULL(@firstName, NULL) END,
                CASE WHEN @preferredFirstName_Clear = 1 THEN NULL ELSE ISNULL(@preferredFirstName, NULL) END,
                CASE WHEN @addresses_Clear = 1 THEN NULL ELSE ISNULL(@addresses, NULL) END,
                CASE WHEN @primaryOrganization_Clear = 1 THEN NULL ELSE ISNULL(@primaryOrganization, NULL) END,
                CASE WHEN @badgeOrganization_Clear = 1 THEN NULL ELSE ISNULL(@badgeOrganization, NULL) END,
                CASE WHEN @middleName_Clear = 1 THEN NULL ELSE ISNULL(@middleName, NULL) END,
                CASE WHEN @recordNumber_Clear = 1 THEN NULL ELSE ISNULL(@recordNumber, NULL) END,
                CASE WHEN @phones_Clear = 1 THEN NULL ELSE ISNULL(@phones, NULL) END,
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
    SELECT * FROM [re_members_ams].[vwEventRegistrations] WHERE [id] = @id
END
GO
GRANT EXECUTE ON [re_members_ams].[spCreateEventRegistrations] TO [cdp_Developer], [cdp_Integration];

/* spCreate Permissions for Event Registrations */

GRANT EXECUTE ON [re_members_ams].[spCreateEventRegistrations] TO [cdp_Developer], [cdp_Integration];

/* spUpdate SQL for Event Registrations */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Event Registrations
-- Item: spUpdateEventRegistrations
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR EventRegistrations
------------------------------------------------------------
IF OBJECT_ID('[re_members_ams].[spUpdateEventRegistrations]', 'P') IS NOT NULL
    DROP PROCEDURE [re_members_ams].[spUpdateEventRegistrations];
GO

CREATE PROCEDURE [re_members_ams].[spUpdateEventRegistrations]
    @sessions_Clear bit = 0,
    @sessions nvarchar(MAX) = NULL,
    @registrantTypeCode_Clear bit = 0,
    @registrantTypeCode nvarchar(255) = NULL,
    @event_Clear bit = 0,
    @event nvarchar(MAX) = NULL,
    @badgeCity_Clear bit = 0,
    @badgeCity nvarchar(255) = NULL,
    @id nvarchar(255),
    @individualId_Clear bit = 0,
    @individualId nvarchar(255) = NULL,
    @registrationNumber_Clear bit = 0,
    @registrationNumber nvarchar(255) = NULL,
    @emails_Clear bit = 0,
    @emails nvarchar(MAX) = NULL,
    @prefix_Clear bit = 0,
    @prefix nvarchar(255) = NULL,
    @registrantTypeName_Clear bit = 0,
    @registrantTypeName nvarchar(255) = NULL,
    @lastName_Clear bit = 0,
    @lastName nvarchar(255) = NULL,
    @title_Clear bit = 0,
    @title nvarchar(255) = NULL,
    @showInDirectory_Clear bit = 0,
    @showInDirectory nvarchar(255) = NULL,
    @boughtTogetherWith_Clear bit = 0,
    @boughtTogetherWith nvarchar(MAX) = NULL,
    @secondLastName_Clear bit = 0,
    @secondLastName nvarchar(255) = NULL,
    @itemizedCustomFields_Clear bit = 0,
    @itemizedCustomFields nvarchar(MAX) = NULL,
    @guestOfRecordNumber_Clear bit = 0,
    @guestOfRecordNumber nvarchar(255) = NULL,
    @customerType_Clear bit = 0,
    @customerType nvarchar(255) = NULL,
    @badgeName_Clear bit = 0,
    @badgeName nvarchar(255) = NULL,
    @suffix_Clear bit = 0,
    @suffix nvarchar(255) = NULL,
    @gender_Clear bit = 0,
    @gender nvarchar(255) = NULL,
    @attendedDate_Clear bit = 0,
    @attendedDate nvarchar(255) = NULL,
    @badgeState_Clear bit = 0,
    @badgeState nvarchar(255) = NULL,
    @firstName_Clear bit = 0,
    @firstName nvarchar(255) = NULL,
    @preferredFirstName_Clear bit = 0,
    @preferredFirstName nvarchar(255) = NULL,
    @addresses_Clear bit = 0,
    @addresses nvarchar(MAX) = NULL,
    @primaryOrganization_Clear bit = 0,
    @primaryOrganization nvarchar(MAX) = NULL,
    @badgeOrganization_Clear bit = 0,
    @badgeOrganization nvarchar(255) = NULL,
    @middleName_Clear bit = 0,
    @middleName nvarchar(255) = NULL,
    @recordNumber_Clear bit = 0,
    @recordNumber nvarchar(255) = NULL,
    @phones_Clear bit = 0,
    @phones nvarchar(MAX) = NULL,
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
        [re_members_ams].[EventRegistrations]
    SET
        [sessions] = CASE WHEN @sessions_Clear = 1 THEN NULL ELSE ISNULL(@sessions, [sessions]) END,
        [registrantTypeCode] = CASE WHEN @registrantTypeCode_Clear = 1 THEN NULL ELSE ISNULL(@registrantTypeCode, [registrantTypeCode]) END,
        [event] = CASE WHEN @event_Clear = 1 THEN NULL ELSE ISNULL(@event, [event]) END,
        [badgeCity] = CASE WHEN @badgeCity_Clear = 1 THEN NULL ELSE ISNULL(@badgeCity, [badgeCity]) END,
        [individualId] = CASE WHEN @individualId_Clear = 1 THEN NULL ELSE ISNULL(@individualId, [individualId]) END,
        [registrationNumber] = CASE WHEN @registrationNumber_Clear = 1 THEN NULL ELSE ISNULL(@registrationNumber, [registrationNumber]) END,
        [emails] = CASE WHEN @emails_Clear = 1 THEN NULL ELSE ISNULL(@emails, [emails]) END,
        [prefix] = CASE WHEN @prefix_Clear = 1 THEN NULL ELSE ISNULL(@prefix, [prefix]) END,
        [registrantTypeName] = CASE WHEN @registrantTypeName_Clear = 1 THEN NULL ELSE ISNULL(@registrantTypeName, [registrantTypeName]) END,
        [lastName] = CASE WHEN @lastName_Clear = 1 THEN NULL ELSE ISNULL(@lastName, [lastName]) END,
        [title] = CASE WHEN @title_Clear = 1 THEN NULL ELSE ISNULL(@title, [title]) END,
        [showInDirectory] = CASE WHEN @showInDirectory_Clear = 1 THEN NULL ELSE ISNULL(@showInDirectory, [showInDirectory]) END,
        [boughtTogetherWith] = CASE WHEN @boughtTogetherWith_Clear = 1 THEN NULL ELSE ISNULL(@boughtTogetherWith, [boughtTogetherWith]) END,
        [secondLastName] = CASE WHEN @secondLastName_Clear = 1 THEN NULL ELSE ISNULL(@secondLastName, [secondLastName]) END,
        [itemizedCustomFields] = CASE WHEN @itemizedCustomFields_Clear = 1 THEN NULL ELSE ISNULL(@itemizedCustomFields, [itemizedCustomFields]) END,
        [guestOfRecordNumber] = CASE WHEN @guestOfRecordNumber_Clear = 1 THEN NULL ELSE ISNULL(@guestOfRecordNumber, [guestOfRecordNumber]) END,
        [customerType] = CASE WHEN @customerType_Clear = 1 THEN NULL ELSE ISNULL(@customerType, [customerType]) END,
        [badgeName] = CASE WHEN @badgeName_Clear = 1 THEN NULL ELSE ISNULL(@badgeName, [badgeName]) END,
        [suffix] = CASE WHEN @suffix_Clear = 1 THEN NULL ELSE ISNULL(@suffix, [suffix]) END,
        [gender] = CASE WHEN @gender_Clear = 1 THEN NULL ELSE ISNULL(@gender, [gender]) END,
        [attendedDate] = CASE WHEN @attendedDate_Clear = 1 THEN NULL ELSE ISNULL(@attendedDate, [attendedDate]) END,
        [badgeState] = CASE WHEN @badgeState_Clear = 1 THEN NULL ELSE ISNULL(@badgeState, [badgeState]) END,
        [firstName] = CASE WHEN @firstName_Clear = 1 THEN NULL ELSE ISNULL(@firstName, [firstName]) END,
        [preferredFirstName] = CASE WHEN @preferredFirstName_Clear = 1 THEN NULL ELSE ISNULL(@preferredFirstName, [preferredFirstName]) END,
        [addresses] = CASE WHEN @addresses_Clear = 1 THEN NULL ELSE ISNULL(@addresses, [addresses]) END,
        [primaryOrganization] = CASE WHEN @primaryOrganization_Clear = 1 THEN NULL ELSE ISNULL(@primaryOrganization, [primaryOrganization]) END,
        [badgeOrganization] = CASE WHEN @badgeOrganization_Clear = 1 THEN NULL ELSE ISNULL(@badgeOrganization, [badgeOrganization]) END,
        [middleName] = CASE WHEN @middleName_Clear = 1 THEN NULL ELSE ISNULL(@middleName, [middleName]) END,
        [recordNumber] = CASE WHEN @recordNumber_Clear = 1 THEN NULL ELSE ISNULL(@recordNumber, [recordNumber]) END,
        [phones] = CASE WHEN @phones_Clear = 1 THEN NULL ELSE ISNULL(@phones, [phones]) END,
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
        SELECT TOP 0 * FROM [re_members_ams].[vwEventRegistrations] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [re_members_ams].[vwEventRegistrations]
                                    WHERE
                                        [id] = @id
                                    
END
GO

GRANT EXECUTE ON [re_members_ams].[spUpdateEventRegistrations] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the EventRegistrations table
------------------------------------------------------------
IF OBJECT_ID('[re_members_ams].[trgUpdateEventRegistrations]', 'TR') IS NOT NULL
    DROP TRIGGER [re_members_ams].[trgUpdateEventRegistrations];
GO
CREATE TRIGGER [re_members_ams].trgUpdateEventRegistrations
ON [re_members_ams].[EventRegistrations]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [re_members_ams].[EventRegistrations]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [re_members_ams].[EventRegistrations] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[id] = I.[id];
END;
GO

/* spUpdate Permissions for Event Registrations */

GRANT EXECUTE ON [re_members_ams].[spUpdateEventRegistrations] TO [cdp_Developer], [cdp_Integration];

/* spDelete SQL for Custom Field Values */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Custom Field Values
-- Item: spDeleteCustomFieldValues
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR CustomFieldValues
------------------------------------------------------------
IF OBJECT_ID('[re_members_ams].[spDeleteCustomFieldValues]', 'P') IS NOT NULL
    DROP PROCEDURE [re_members_ams].[spDeleteCustomFieldValues];
GO

CREATE PROCEDURE [re_members_ams].[spDeleteCustomFieldValues]
    @name nvarchar(450)
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [re_members_ams].[CustomFieldValues]
    WHERE
        [name] = @name


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [name] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @name AS [name] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [re_members_ams].[spDeleteCustomFieldValues] TO [cdp_Developer], [cdp_Integration];

/* spDelete Permissions for Custom Field Values */

GRANT EXECUTE ON [re_members_ams].[spDeleteCustomFieldValues] TO [cdp_Developer], [cdp_Integration];

/* spDelete SQL for Customer Requests */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Customer Requests
-- Item: spDeleteCustomerRequests
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR CustomerRequests
------------------------------------------------------------
IF OBJECT_ID('[re_members_ams].[spDeleteCustomerRequests]', 'P') IS NOT NULL
    DROP PROCEDURE [re_members_ams].[spDeleteCustomerRequests];
GO

CREATE PROCEDURE [re_members_ams].[spDeleteCustomerRequests]
    @requestNumber nvarchar(450)
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [re_members_ams].[CustomerRequests]
    WHERE
        [requestNumber] = @requestNumber


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [requestNumber] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @requestNumber AS [requestNumber] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [re_members_ams].[spDeleteCustomerRequests] TO [cdp_Developer], [cdp_Integration];

/* spDelete Permissions for Customer Requests */

GRANT EXECUTE ON [re_members_ams].[spDeleteCustomerRequests] TO [cdp_Developer], [cdp_Integration];

/* spDelete SQL for Emails */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Emails
-- Item: spDeleteEmails
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR Emails
------------------------------------------------------------
IF OBJECT_ID('[re_members_ams].[spDeleteEmails]', 'P') IS NOT NULL
    DROP PROCEDURE [re_members_ams].[spDeleteEmails];
GO

CREATE PROCEDURE [re_members_ams].[spDeleteEmails]
    @address nvarchar(450)
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [re_members_ams].[Emails]
    WHERE
        [address] = @address


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [address] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @address AS [address] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [re_members_ams].[spDeleteEmails] TO [cdp_Developer], [cdp_Integration];

/* spDelete Permissions for Emails */

GRANT EXECUTE ON [re_members_ams].[spDeleteEmails] TO [cdp_Developer], [cdp_Integration];

/* spDelete SQL for Event Cancellations */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Event Cancellations
-- Item: spDeleteEventCancellations
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR EventCancellations
------------------------------------------------------------
IF OBJECT_ID('[re_members_ams].[spDeleteEventCancellations]', 'P') IS NOT NULL
    DROP PROCEDURE [re_members_ams].[spDeleteEventCancellations];
GO

CREATE PROCEDURE [re_members_ams].[spDeleteEventCancellations]
    @id nvarchar(255)
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [re_members_ams].[EventCancellations]
    WHERE
        [id] = @id


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [id] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @id AS [id] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [re_members_ams].[spDeleteEventCancellations] TO [cdp_Developer], [cdp_Integration];

/* spDelete Permissions for Event Cancellations */

GRANT EXECUTE ON [re_members_ams].[spDeleteEventCancellations] TO [cdp_Developer], [cdp_Integration];

/* spDelete SQL for Event Registrations */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Event Registrations
-- Item: spDeleteEventRegistrations
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR EventRegistrations
------------------------------------------------------------
IF OBJECT_ID('[re_members_ams].[spDeleteEventRegistrations]', 'P') IS NOT NULL
    DROP PROCEDURE [re_members_ams].[spDeleteEventRegistrations];
GO

CREATE PROCEDURE [re_members_ams].[spDeleteEventRegistrations]
    @id nvarchar(255)
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [re_members_ams].[EventRegistrations]
    WHERE
        [id] = @id


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [id] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @id AS [id] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [re_members_ams].[spDeleteEventRegistrations] TO [cdp_Developer], [cdp_Integration];

/* spDelete Permissions for Event Registrations */

GRANT EXECUTE ON [re_members_ams].[spDeleteEventRegistrations] TO [cdp_Developer], [cdp_Integration];

/* Index for Foreign Keys for Events */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Events
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------;

/* Index for Foreign Keys for ExamScores */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Exam Scores
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------;

/* Index for Foreign Keys for Exams */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Exams
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------;

/* Index for Foreign Keys for Exhibits */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Exhibits
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------;

/* Index for Foreign Keys for Individuals */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Individuals
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------;

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
-----               SCHEMA:      re_members_ams
-----               BASE TABLE:  Events
-----               PRIMARY KEY: eventId
------------------------------------------------------------
IF OBJECT_ID('[re_members_ams].[vwEvents]', 'V') IS NOT NULL
    DROP VIEW [re_members_ams].[vwEvents];
GO

CREATE VIEW [re_members_ams].[vwEvents]
AS
SELECT
    e.*
FROM
    [re_members_ams].[Events] AS e
GO
GRANT SELECT ON [re_members_ams].[vwEvents] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* Base View Permissions SQL for Events */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Events
-- Item: Permissions for vwEvents
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [re_members_ams].[vwEvents] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

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
IF OBJECT_ID('[re_members_ams].[spCreateEvents]', 'P') IS NOT NULL
    DROP PROCEDURE [re_members_ams].[spCreateEvents];
GO

CREATE PROCEDURE [re_members_ams].[spCreateEvents]
    @educationCredits_Clear bit = 0,
    @educationCredits nvarchar(MAX) = NULL,
    @imageUrl_Clear bit = 0,
    @imageUrl nvarchar(MAX) = NULL,
    @mj_e2e_custom_attr_Clear bit = 0,
    @mj_e2e_custom_attr nvarchar(812) = NULL,
    @uploadsData_Clear bit = 0,
    @uploadsData nvarchar(MAX) = NULL,
    @externalUrl_Clear bit = 0,
    @externalUrl nvarchar(812) = NULL,
    @eventId nvarchar(450) = NULL,
    @eventName_Clear bit = 0,
    @eventName nvarchar(812) = NULL,
    @eventDescription_Clear bit = 0,
    @eventDescription nvarchar(812) = NULL,
    @eventTimezone_Clear bit = 0,
    @eventTimezone nvarchar(812) = NULL,
    @categories_Clear bit = 0,
    @categories nvarchar(MAX) = NULL,
    @tags_Clear bit = 0,
    @tags nvarchar(MAX) = NULL,
    @eventStartDate_Clear bit = 0,
    @eventStartDate nvarchar(MAX) = NULL,
    @eventLocations_Clear bit = 0,
    @eventLocations nvarchar(MAX) = NULL,
    @externalCode_Clear bit = 0,
    @externalCode nvarchar(812) = NULL,
    @eventEndTime_Clear bit = 0,
    @eventEndTime nvarchar(812) = NULL,
    @eventCode_Clear bit = 0,
    @eventCode nvarchar(812) = NULL,
    @publicEvent_Clear bit = 0,
    @publicEvent nvarchar(MAX) = NULL,
    @eventEndDate_Clear bit = 0,
    @eventEndDate nvarchar(MAX) = NULL,
    @relatedProducts_Clear bit = 0,
    @relatedProducts nvarchar(MAX) = NULL,
    @shortDescription_Clear bit = 0,
    @shortDescription nvarchar(812) = NULL,
    @eventStartTime_Clear bit = 0,
    @eventStartTime nvarchar(812) = NULL,
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
    [re_members_ams].[Events]
        (
            [educationCredits],
                [imageUrl],
                [mj_e2e_custom_attr],
                [uploadsData],
                [externalUrl],
                [eventName],
                [eventDescription],
                [eventTimezone],
                [categories],
                [tags],
                [eventStartDate],
                [eventLocations],
                [externalCode],
                [eventEndTime],
                [eventCode],
                [publicEvent],
                [eventEndDate],
                [relatedProducts],
                [shortDescription],
                [eventStartTime],
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
                [eventId]
        )
    VALUES
        (
            CASE WHEN @educationCredits_Clear = 1 THEN NULL ELSE ISNULL(@educationCredits, NULL) END,
                CASE WHEN @imageUrl_Clear = 1 THEN NULL ELSE ISNULL(@imageUrl, NULL) END,
                CASE WHEN @mj_e2e_custom_attr_Clear = 1 THEN NULL ELSE ISNULL(@mj_e2e_custom_attr, NULL) END,
                CASE WHEN @uploadsData_Clear = 1 THEN NULL ELSE ISNULL(@uploadsData, NULL) END,
                CASE WHEN @externalUrl_Clear = 1 THEN NULL ELSE ISNULL(@externalUrl, NULL) END,
                CASE WHEN @eventName_Clear = 1 THEN NULL ELSE ISNULL(@eventName, NULL) END,
                CASE WHEN @eventDescription_Clear = 1 THEN NULL ELSE ISNULL(@eventDescription, NULL) END,
                CASE WHEN @eventTimezone_Clear = 1 THEN NULL ELSE ISNULL(@eventTimezone, NULL) END,
                CASE WHEN @categories_Clear = 1 THEN NULL ELSE ISNULL(@categories, NULL) END,
                CASE WHEN @tags_Clear = 1 THEN NULL ELSE ISNULL(@tags, NULL) END,
                CASE WHEN @eventStartDate_Clear = 1 THEN NULL ELSE ISNULL(@eventStartDate, NULL) END,
                CASE WHEN @eventLocations_Clear = 1 THEN NULL ELSE ISNULL(@eventLocations, NULL) END,
                CASE WHEN @externalCode_Clear = 1 THEN NULL ELSE ISNULL(@externalCode, NULL) END,
                CASE WHEN @eventEndTime_Clear = 1 THEN NULL ELSE ISNULL(@eventEndTime, NULL) END,
                CASE WHEN @eventCode_Clear = 1 THEN NULL ELSE ISNULL(@eventCode, NULL) END,
                CASE WHEN @publicEvent_Clear = 1 THEN NULL ELSE ISNULL(@publicEvent, NULL) END,
                CASE WHEN @eventEndDate_Clear = 1 THEN NULL ELSE ISNULL(@eventEndDate, NULL) END,
                CASE WHEN @relatedProducts_Clear = 1 THEN NULL ELSE ISNULL(@relatedProducts, NULL) END,
                CASE WHEN @shortDescription_Clear = 1 THEN NULL ELSE ISNULL(@shortDescription, NULL) END,
                CASE WHEN @eventStartTime_Clear = 1 THEN NULL ELSE ISNULL(@eventStartTime, NULL) END,
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
                @eventId
        )
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [re_members_ams].[vwEvents] WHERE [eventId] = @eventId
END
GO
GRANT EXECUTE ON [re_members_ams].[spCreateEvents] TO [cdp_Developer], [cdp_Integration];

/* spCreate Permissions for Events */

GRANT EXECUTE ON [re_members_ams].[spCreateEvents] TO [cdp_Developer], [cdp_Integration];

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
IF OBJECT_ID('[re_members_ams].[spUpdateEvents]', 'P') IS NOT NULL
    DROP PROCEDURE [re_members_ams].[spUpdateEvents];
GO

CREATE PROCEDURE [re_members_ams].[spUpdateEvents]
    @educationCredits_Clear bit = 0,
    @educationCredits nvarchar(MAX) = NULL,
    @imageUrl_Clear bit = 0,
    @imageUrl nvarchar(MAX) = NULL,
    @mj_e2e_custom_attr_Clear bit = 0,
    @mj_e2e_custom_attr nvarchar(812) = NULL,
    @uploadsData_Clear bit = 0,
    @uploadsData nvarchar(MAX) = NULL,
    @externalUrl_Clear bit = 0,
    @externalUrl nvarchar(812) = NULL,
    @eventId nvarchar(450),
    @eventName_Clear bit = 0,
    @eventName nvarchar(812) = NULL,
    @eventDescription_Clear bit = 0,
    @eventDescription nvarchar(812) = NULL,
    @eventTimezone_Clear bit = 0,
    @eventTimezone nvarchar(812) = NULL,
    @categories_Clear bit = 0,
    @categories nvarchar(MAX) = NULL,
    @tags_Clear bit = 0,
    @tags nvarchar(MAX) = NULL,
    @eventStartDate_Clear bit = 0,
    @eventStartDate nvarchar(MAX) = NULL,
    @eventLocations_Clear bit = 0,
    @eventLocations nvarchar(MAX) = NULL,
    @externalCode_Clear bit = 0,
    @externalCode nvarchar(812) = NULL,
    @eventEndTime_Clear bit = 0,
    @eventEndTime nvarchar(812) = NULL,
    @eventCode_Clear bit = 0,
    @eventCode nvarchar(812) = NULL,
    @publicEvent_Clear bit = 0,
    @publicEvent nvarchar(MAX) = NULL,
    @eventEndDate_Clear bit = 0,
    @eventEndDate nvarchar(MAX) = NULL,
    @relatedProducts_Clear bit = 0,
    @relatedProducts nvarchar(MAX) = NULL,
    @shortDescription_Clear bit = 0,
    @shortDescription nvarchar(812) = NULL,
    @eventStartTime_Clear bit = 0,
    @eventStartTime nvarchar(812) = NULL,
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
        [re_members_ams].[Events]
    SET
        [educationCredits] = CASE WHEN @educationCredits_Clear = 1 THEN NULL ELSE ISNULL(@educationCredits, [educationCredits]) END,
        [imageUrl] = CASE WHEN @imageUrl_Clear = 1 THEN NULL ELSE ISNULL(@imageUrl, [imageUrl]) END,
        [mj_e2e_custom_attr] = CASE WHEN @mj_e2e_custom_attr_Clear = 1 THEN NULL ELSE ISNULL(@mj_e2e_custom_attr, [mj_e2e_custom_attr]) END,
        [uploadsData] = CASE WHEN @uploadsData_Clear = 1 THEN NULL ELSE ISNULL(@uploadsData, [uploadsData]) END,
        [externalUrl] = CASE WHEN @externalUrl_Clear = 1 THEN NULL ELSE ISNULL(@externalUrl, [externalUrl]) END,
        [eventName] = CASE WHEN @eventName_Clear = 1 THEN NULL ELSE ISNULL(@eventName, [eventName]) END,
        [eventDescription] = CASE WHEN @eventDescription_Clear = 1 THEN NULL ELSE ISNULL(@eventDescription, [eventDescription]) END,
        [eventTimezone] = CASE WHEN @eventTimezone_Clear = 1 THEN NULL ELSE ISNULL(@eventTimezone, [eventTimezone]) END,
        [categories] = CASE WHEN @categories_Clear = 1 THEN NULL ELSE ISNULL(@categories, [categories]) END,
        [tags] = CASE WHEN @tags_Clear = 1 THEN NULL ELSE ISNULL(@tags, [tags]) END,
        [eventStartDate] = CASE WHEN @eventStartDate_Clear = 1 THEN NULL ELSE ISNULL(@eventStartDate, [eventStartDate]) END,
        [eventLocations] = CASE WHEN @eventLocations_Clear = 1 THEN NULL ELSE ISNULL(@eventLocations, [eventLocations]) END,
        [externalCode] = CASE WHEN @externalCode_Clear = 1 THEN NULL ELSE ISNULL(@externalCode, [externalCode]) END,
        [eventEndTime] = CASE WHEN @eventEndTime_Clear = 1 THEN NULL ELSE ISNULL(@eventEndTime, [eventEndTime]) END,
        [eventCode] = CASE WHEN @eventCode_Clear = 1 THEN NULL ELSE ISNULL(@eventCode, [eventCode]) END,
        [publicEvent] = CASE WHEN @publicEvent_Clear = 1 THEN NULL ELSE ISNULL(@publicEvent, [publicEvent]) END,
        [eventEndDate] = CASE WHEN @eventEndDate_Clear = 1 THEN NULL ELSE ISNULL(@eventEndDate, [eventEndDate]) END,
        [relatedProducts] = CASE WHEN @relatedProducts_Clear = 1 THEN NULL ELSE ISNULL(@relatedProducts, [relatedProducts]) END,
        [shortDescription] = CASE WHEN @shortDescription_Clear = 1 THEN NULL ELSE ISNULL(@shortDescription, [shortDescription]) END,
        [eventStartTime] = CASE WHEN @eventStartTime_Clear = 1 THEN NULL ELSE ISNULL(@eventStartTime, [eventStartTime]) END,
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
        [eventId] = @eventId

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [re_members_ams].[vwEvents] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [re_members_ams].[vwEvents]
                                    WHERE
                                        [eventId] = @eventId
                                    
END
GO

GRANT EXECUTE ON [re_members_ams].[spUpdateEvents] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the Events table
------------------------------------------------------------
IF OBJECT_ID('[re_members_ams].[trgUpdateEvents]', 'TR') IS NOT NULL
    DROP TRIGGER [re_members_ams].[trgUpdateEvents];
GO
CREATE TRIGGER [re_members_ams].trgUpdateEvents
ON [re_members_ams].[Events]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [re_members_ams].[Events]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [re_members_ams].[Events] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[eventId] = I.[eventId];
END;
GO

/* spUpdate Permissions for Events */

GRANT EXECUTE ON [re_members_ams].[spUpdateEvents] TO [cdp_Developer], [cdp_Integration];

/* Base View SQL for Exam Scores */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Exam Scores
-- Item: vwExamScores
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      Exam Scores
-----               SCHEMA:      re_members_ams
-----               BASE TABLE:  ExamScores
-----               PRIMARY KEY: individualRecordNumber
------------------------------------------------------------
IF OBJECT_ID('[re_members_ams].[vwExamScores]', 'V') IS NOT NULL
    DROP VIEW [re_members_ams].[vwExamScores];
GO

CREATE VIEW [re_members_ams].[vwExamScores]
AS
SELECT
    e.*
FROM
    [re_members_ams].[ExamScores] AS e
GO
GRANT SELECT ON [re_members_ams].[vwExamScores] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* Base View Permissions SQL for Exam Scores */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Exam Scores
-- Item: Permissions for vwExamScores
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [re_members_ams].[vwExamScores] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* spCreate SQL for Exam Scores */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Exam Scores
-- Item: spCreateExamScores
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR ExamScores
------------------------------------------------------------
IF OBJECT_ID('[re_members_ams].[spCreateExamScores]', 'P') IS NOT NULL
    DROP PROCEDURE [re_members_ams].[spCreateExamScores];
GO

CREATE PROCEDURE [re_members_ams].[spCreateExamScores]
    @individualRecordNumber nvarchar(255) = NULL,
    @score_Clear bit = 0,
    @score nvarchar(255) = NULL,
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
    [re_members_ams].[ExamScores]
        (
            [score],
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
                [individualRecordNumber]
        )
    VALUES
        (
            CASE WHEN @score_Clear = 1 THEN NULL ELSE ISNULL(@score, NULL) END,
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
                @individualRecordNumber
        )
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [re_members_ams].[vwExamScores] WHERE [individualRecordNumber] = @individualRecordNumber
END
GO
GRANT EXECUTE ON [re_members_ams].[spCreateExamScores] TO [cdp_Developer], [cdp_Integration];

/* spCreate Permissions for Exam Scores */

GRANT EXECUTE ON [re_members_ams].[spCreateExamScores] TO [cdp_Developer], [cdp_Integration];

/* spUpdate SQL for Exam Scores */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Exam Scores
-- Item: spUpdateExamScores
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR ExamScores
------------------------------------------------------------
IF OBJECT_ID('[re_members_ams].[spUpdateExamScores]', 'P') IS NOT NULL
    DROP PROCEDURE [re_members_ams].[spUpdateExamScores];
GO

CREATE PROCEDURE [re_members_ams].[spUpdateExamScores]
    @individualRecordNumber nvarchar(255),
    @score_Clear bit = 0,
    @score nvarchar(255) = NULL,
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
        [re_members_ams].[ExamScores]
    SET
        [score] = CASE WHEN @score_Clear = 1 THEN NULL ELSE ISNULL(@score, [score]) END,
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
        [individualRecordNumber] = @individualRecordNumber

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [re_members_ams].[vwExamScores] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [re_members_ams].[vwExamScores]
                                    WHERE
                                        [individualRecordNumber] = @individualRecordNumber
                                    
END
GO

GRANT EXECUTE ON [re_members_ams].[spUpdateExamScores] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the ExamScores table
------------------------------------------------------------
IF OBJECT_ID('[re_members_ams].[trgUpdateExamScores]', 'TR') IS NOT NULL
    DROP TRIGGER [re_members_ams].[trgUpdateExamScores];
GO
CREATE TRIGGER [re_members_ams].trgUpdateExamScores
ON [re_members_ams].[ExamScores]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [re_members_ams].[ExamScores]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [re_members_ams].[ExamScores] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[individualRecordNumber] = I.[individualRecordNumber];
END;
GO

/* spUpdate Permissions for Exam Scores */

GRANT EXECUTE ON [re_members_ams].[spUpdateExamScores] TO [cdp_Developer], [cdp_Integration];

/* Base View SQL for Exams */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Exams
-- Item: vwExams
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      Exams
-----               SCHEMA:      re_members_ams
-----               BASE TABLE:  Exams
-----               PRIMARY KEY: id
------------------------------------------------------------
IF OBJECT_ID('[re_members_ams].[vwExams]', 'V') IS NOT NULL
    DROP VIEW [re_members_ams].[vwExams];
GO

CREATE VIEW [re_members_ams].[vwExams]
AS
SELECT
    e.*
FROM
    [re_members_ams].[Exams] AS e
GO
GRANT SELECT ON [re_members_ams].[vwExams] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* Base View Permissions SQL for Exams */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Exams
-- Item: Permissions for vwExams
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [re_members_ams].[vwExams] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* spCreate SQL for Exams */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Exams
-- Item: spCreateExams
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR Exams
------------------------------------------------------------
IF OBJECT_ID('[re_members_ams].[spCreateExams]', 'P') IS NOT NULL
    DROP PROCEDURE [re_members_ams].[spCreateExams];
GO

CREATE PROCEDURE [re_members_ams].[spCreateExams]
    @id nvarchar(450) = NULL,
    @name_Clear bit = 0,
    @name nvarchar(812) = NULL,
    @educationCredits_Clear bit = 0,
    @educationCredits nvarchar(MAX) = NULL,
    @isPublic_Clear bit = 0,
    @isPublic nvarchar(MAX) = NULL,
    @activePrices_Clear bit = 0,
    @activePrices nvarchar(MAX) = NULL,
    @code_Clear bit = 0,
    @code nvarchar(812) = NULL,
    @longDescription_Clear bit = 0,
    @longDescription nvarchar(812) = NULL,
    @availableFrom_Clear bit = 0,
    @availableFrom nvarchar(812) = NULL,
    @shortDescription_Clear bit = 0,
    @shortDescription nvarchar(812) = NULL,
    @examStartDate_Clear bit = 0,
    @examStartDate nvarchar(MAX) = NULL,
    @tags_Clear bit = 0,
    @tags nvarchar(MAX) = NULL,
    @imageUrl_Clear bit = 0,
    @imageUrl nvarchar(MAX) = NULL,
    @mj_e2e_custom_attr_Clear bit = 0,
    @mj_e2e_custom_attr nvarchar(812) = NULL,
    @relatedProducts_Clear bit = 0,
    @relatedProducts nvarchar(MAX) = NULL,
    @examNumber_Clear bit = 0,
    @examNumber nvarchar(812) = NULL,
    @availableUntil_Clear bit = 0,
    @availableUntil nvarchar(812) = NULL,
    @categories_Clear bit = 0,
    @categories nvarchar(MAX) = NULL,
    @examEndDate_Clear bit = 0,
    @examEndDate nvarchar(MAX) = NULL,
    @url_Clear bit = 0,
    @url nvarchar(812) = NULL,
    @type_Clear bit = 0,
    @type nvarchar(812) = NULL,
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
    [re_members_ams].[Exams]
        (
            [name],
                [educationCredits],
                [isPublic],
                [activePrices],
                [code],
                [longDescription],
                [availableFrom],
                [shortDescription],
                [examStartDate],
                [tags],
                [imageUrl],
                [mj_e2e_custom_attr],
                [relatedProducts],
                [examNumber],
                [availableUntil],
                [categories],
                [examEndDate],
                [url],
                [type],
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
            CASE WHEN @name_Clear = 1 THEN NULL ELSE ISNULL(@name, NULL) END,
                CASE WHEN @educationCredits_Clear = 1 THEN NULL ELSE ISNULL(@educationCredits, NULL) END,
                CASE WHEN @isPublic_Clear = 1 THEN NULL ELSE ISNULL(@isPublic, NULL) END,
                CASE WHEN @activePrices_Clear = 1 THEN NULL ELSE ISNULL(@activePrices, NULL) END,
                CASE WHEN @code_Clear = 1 THEN NULL ELSE ISNULL(@code, NULL) END,
                CASE WHEN @longDescription_Clear = 1 THEN NULL ELSE ISNULL(@longDescription, NULL) END,
                CASE WHEN @availableFrom_Clear = 1 THEN NULL ELSE ISNULL(@availableFrom, NULL) END,
                CASE WHEN @shortDescription_Clear = 1 THEN NULL ELSE ISNULL(@shortDescription, NULL) END,
                CASE WHEN @examStartDate_Clear = 1 THEN NULL ELSE ISNULL(@examStartDate, NULL) END,
                CASE WHEN @tags_Clear = 1 THEN NULL ELSE ISNULL(@tags, NULL) END,
                CASE WHEN @imageUrl_Clear = 1 THEN NULL ELSE ISNULL(@imageUrl, NULL) END,
                CASE WHEN @mj_e2e_custom_attr_Clear = 1 THEN NULL ELSE ISNULL(@mj_e2e_custom_attr, NULL) END,
                CASE WHEN @relatedProducts_Clear = 1 THEN NULL ELSE ISNULL(@relatedProducts, NULL) END,
                CASE WHEN @examNumber_Clear = 1 THEN NULL ELSE ISNULL(@examNumber, NULL) END,
                CASE WHEN @availableUntil_Clear = 1 THEN NULL ELSE ISNULL(@availableUntil, NULL) END,
                CASE WHEN @categories_Clear = 1 THEN NULL ELSE ISNULL(@categories, NULL) END,
                CASE WHEN @examEndDate_Clear = 1 THEN NULL ELSE ISNULL(@examEndDate, NULL) END,
                CASE WHEN @url_Clear = 1 THEN NULL ELSE ISNULL(@url, NULL) END,
                CASE WHEN @type_Clear = 1 THEN NULL ELSE ISNULL(@type, NULL) END,
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
    SELECT * FROM [re_members_ams].[vwExams] WHERE [id] = @id
END
GO
GRANT EXECUTE ON [re_members_ams].[spCreateExams] TO [cdp_Developer], [cdp_Integration];

/* spCreate Permissions for Exams */

GRANT EXECUTE ON [re_members_ams].[spCreateExams] TO [cdp_Developer], [cdp_Integration];

/* spUpdate SQL for Exams */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Exams
-- Item: spUpdateExams
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR Exams
------------------------------------------------------------
IF OBJECT_ID('[re_members_ams].[spUpdateExams]', 'P') IS NOT NULL
    DROP PROCEDURE [re_members_ams].[spUpdateExams];
GO

CREATE PROCEDURE [re_members_ams].[spUpdateExams]
    @id nvarchar(450),
    @name_Clear bit = 0,
    @name nvarchar(812) = NULL,
    @educationCredits_Clear bit = 0,
    @educationCredits nvarchar(MAX) = NULL,
    @isPublic_Clear bit = 0,
    @isPublic nvarchar(MAX) = NULL,
    @activePrices_Clear bit = 0,
    @activePrices nvarchar(MAX) = NULL,
    @code_Clear bit = 0,
    @code nvarchar(812) = NULL,
    @longDescription_Clear bit = 0,
    @longDescription nvarchar(812) = NULL,
    @availableFrom_Clear bit = 0,
    @availableFrom nvarchar(812) = NULL,
    @shortDescription_Clear bit = 0,
    @shortDescription nvarchar(812) = NULL,
    @examStartDate_Clear bit = 0,
    @examStartDate nvarchar(MAX) = NULL,
    @tags_Clear bit = 0,
    @tags nvarchar(MAX) = NULL,
    @imageUrl_Clear bit = 0,
    @imageUrl nvarchar(MAX) = NULL,
    @mj_e2e_custom_attr_Clear bit = 0,
    @mj_e2e_custom_attr nvarchar(812) = NULL,
    @relatedProducts_Clear bit = 0,
    @relatedProducts nvarchar(MAX) = NULL,
    @examNumber_Clear bit = 0,
    @examNumber nvarchar(812) = NULL,
    @availableUntil_Clear bit = 0,
    @availableUntil nvarchar(812) = NULL,
    @categories_Clear bit = 0,
    @categories nvarchar(MAX) = NULL,
    @examEndDate_Clear bit = 0,
    @examEndDate nvarchar(MAX) = NULL,
    @url_Clear bit = 0,
    @url nvarchar(812) = NULL,
    @type_Clear bit = 0,
    @type nvarchar(812) = NULL,
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
        [re_members_ams].[Exams]
    SET
        [name] = CASE WHEN @name_Clear = 1 THEN NULL ELSE ISNULL(@name, [name]) END,
        [educationCredits] = CASE WHEN @educationCredits_Clear = 1 THEN NULL ELSE ISNULL(@educationCredits, [educationCredits]) END,
        [isPublic] = CASE WHEN @isPublic_Clear = 1 THEN NULL ELSE ISNULL(@isPublic, [isPublic]) END,
        [activePrices] = CASE WHEN @activePrices_Clear = 1 THEN NULL ELSE ISNULL(@activePrices, [activePrices]) END,
        [code] = CASE WHEN @code_Clear = 1 THEN NULL ELSE ISNULL(@code, [code]) END,
        [longDescription] = CASE WHEN @longDescription_Clear = 1 THEN NULL ELSE ISNULL(@longDescription, [longDescription]) END,
        [availableFrom] = CASE WHEN @availableFrom_Clear = 1 THEN NULL ELSE ISNULL(@availableFrom, [availableFrom]) END,
        [shortDescription] = CASE WHEN @shortDescription_Clear = 1 THEN NULL ELSE ISNULL(@shortDescription, [shortDescription]) END,
        [examStartDate] = CASE WHEN @examStartDate_Clear = 1 THEN NULL ELSE ISNULL(@examStartDate, [examStartDate]) END,
        [tags] = CASE WHEN @tags_Clear = 1 THEN NULL ELSE ISNULL(@tags, [tags]) END,
        [imageUrl] = CASE WHEN @imageUrl_Clear = 1 THEN NULL ELSE ISNULL(@imageUrl, [imageUrl]) END,
        [mj_e2e_custom_attr] = CASE WHEN @mj_e2e_custom_attr_Clear = 1 THEN NULL ELSE ISNULL(@mj_e2e_custom_attr, [mj_e2e_custom_attr]) END,
        [relatedProducts] = CASE WHEN @relatedProducts_Clear = 1 THEN NULL ELSE ISNULL(@relatedProducts, [relatedProducts]) END,
        [examNumber] = CASE WHEN @examNumber_Clear = 1 THEN NULL ELSE ISNULL(@examNumber, [examNumber]) END,
        [availableUntil] = CASE WHEN @availableUntil_Clear = 1 THEN NULL ELSE ISNULL(@availableUntil, [availableUntil]) END,
        [categories] = CASE WHEN @categories_Clear = 1 THEN NULL ELSE ISNULL(@categories, [categories]) END,
        [examEndDate] = CASE WHEN @examEndDate_Clear = 1 THEN NULL ELSE ISNULL(@examEndDate, [examEndDate]) END,
        [url] = CASE WHEN @url_Clear = 1 THEN NULL ELSE ISNULL(@url, [url]) END,
        [type] = CASE WHEN @type_Clear = 1 THEN NULL ELSE ISNULL(@type, [type]) END,
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
        SELECT TOP 0 * FROM [re_members_ams].[vwExams] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [re_members_ams].[vwExams]
                                    WHERE
                                        [id] = @id
                                    
END
GO

GRANT EXECUTE ON [re_members_ams].[spUpdateExams] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the Exams table
------------------------------------------------------------
IF OBJECT_ID('[re_members_ams].[trgUpdateExams]', 'TR') IS NOT NULL
    DROP TRIGGER [re_members_ams].[trgUpdateExams];
GO
CREATE TRIGGER [re_members_ams].trgUpdateExams
ON [re_members_ams].[Exams]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [re_members_ams].[Exams]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [re_members_ams].[Exams] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[id] = I.[id];
END;
GO

/* spUpdate Permissions for Exams */

GRANT EXECUTE ON [re_members_ams].[spUpdateExams] TO [cdp_Developer], [cdp_Integration];

/* Base View SQL for Exhibits */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Exhibits
-- Item: vwExhibits
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      Exhibits
-----               SCHEMA:      re_members_ams
-----               BASE TABLE:  Exhibits
-----               PRIMARY KEY: code
------------------------------------------------------------
IF OBJECT_ID('[re_members_ams].[vwExhibits]', 'V') IS NOT NULL
    DROP VIEW [re_members_ams].[vwExhibits];
GO

CREATE VIEW [re_members_ams].[vwExhibits]
AS
SELECT
    e.*
FROM
    [re_members_ams].[Exhibits] AS e
GO
GRANT SELECT ON [re_members_ams].[vwExhibits] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* Base View Permissions SQL for Exhibits */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Exhibits
-- Item: Permissions for vwExhibits
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [re_members_ams].[vwExhibits] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* spCreate SQL for Exhibits */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Exhibits
-- Item: spCreateExhibits
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR Exhibits
------------------------------------------------------------
IF OBJECT_ID('[re_members_ams].[spCreateExhibits]', 'P') IS NOT NULL
    DROP PROCEDURE [re_members_ams].[spCreateExhibits];
GO

CREATE PROCEDURE [re_members_ams].[spCreateExhibits]
    @name_Clear bit = 0,
    @name nvarchar(812) = NULL,
    @longDescription_Clear bit = 0,
    @longDescription nvarchar(812) = NULL,
    @code nvarchar(450) = NULL,
    @endDate_Clear bit = 0,
    @endDate nvarchar(MAX) = NULL,
    @featuredListing_Clear bit = 0,
    @featuredListing nvarchar(MAX) = NULL,
    @categories_Clear bit = 0,
    @categories nvarchar(MAX) = NULL,
    @startTime_Clear bit = 0,
    @startTime nvarchar(812) = NULL,
    @mj_e2e_custom_attr_Clear bit = 0,
    @mj_e2e_custom_attr nvarchar(812) = NULL,
    @startDate_Clear bit = 0,
    @startDate nvarchar(MAX) = NULL,
    @endTime_Clear bit = 0,
    @endTime nvarchar(812) = NULL,
    @shortDescription_Clear bit = 0,
    @shortDescription nvarchar(812) = NULL,
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
    [re_members_ams].[Exhibits]
        (
            [name],
                [longDescription],
                [endDate],
                [featuredListing],
                [categories],
                [startTime],
                [mj_e2e_custom_attr],
                [startDate],
                [endTime],
                [shortDescription],
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
                CASE WHEN @longDescription_Clear = 1 THEN NULL ELSE ISNULL(@longDescription, NULL) END,
                CASE WHEN @endDate_Clear = 1 THEN NULL ELSE ISNULL(@endDate, NULL) END,
                CASE WHEN @featuredListing_Clear = 1 THEN NULL ELSE ISNULL(@featuredListing, NULL) END,
                CASE WHEN @categories_Clear = 1 THEN NULL ELSE ISNULL(@categories, NULL) END,
                CASE WHEN @startTime_Clear = 1 THEN NULL ELSE ISNULL(@startTime, NULL) END,
                CASE WHEN @mj_e2e_custom_attr_Clear = 1 THEN NULL ELSE ISNULL(@mj_e2e_custom_attr, NULL) END,
                CASE WHEN @startDate_Clear = 1 THEN NULL ELSE ISNULL(@startDate, NULL) END,
                CASE WHEN @endTime_Clear = 1 THEN NULL ELSE ISNULL(@endTime, NULL) END,
                CASE WHEN @shortDescription_Clear = 1 THEN NULL ELSE ISNULL(@shortDescription, NULL) END,
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
    SELECT * FROM [re_members_ams].[vwExhibits] WHERE [code] = @code
END
GO
GRANT EXECUTE ON [re_members_ams].[spCreateExhibits] TO [cdp_Developer], [cdp_Integration];

/* spCreate Permissions for Exhibits */

GRANT EXECUTE ON [re_members_ams].[spCreateExhibits] TO [cdp_Developer], [cdp_Integration];

/* spUpdate SQL for Exhibits */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Exhibits
-- Item: spUpdateExhibits
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR Exhibits
------------------------------------------------------------
IF OBJECT_ID('[re_members_ams].[spUpdateExhibits]', 'P') IS NOT NULL
    DROP PROCEDURE [re_members_ams].[spUpdateExhibits];
GO

CREATE PROCEDURE [re_members_ams].[spUpdateExhibits]
    @name_Clear bit = 0,
    @name nvarchar(812) = NULL,
    @longDescription_Clear bit = 0,
    @longDescription nvarchar(812) = NULL,
    @code nvarchar(450),
    @endDate_Clear bit = 0,
    @endDate nvarchar(MAX) = NULL,
    @featuredListing_Clear bit = 0,
    @featuredListing nvarchar(MAX) = NULL,
    @categories_Clear bit = 0,
    @categories nvarchar(MAX) = NULL,
    @startTime_Clear bit = 0,
    @startTime nvarchar(812) = NULL,
    @mj_e2e_custom_attr_Clear bit = 0,
    @mj_e2e_custom_attr nvarchar(812) = NULL,
    @startDate_Clear bit = 0,
    @startDate nvarchar(MAX) = NULL,
    @endTime_Clear bit = 0,
    @endTime nvarchar(812) = NULL,
    @shortDescription_Clear bit = 0,
    @shortDescription nvarchar(812) = NULL,
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
        [re_members_ams].[Exhibits]
    SET
        [name] = CASE WHEN @name_Clear = 1 THEN NULL ELSE ISNULL(@name, [name]) END,
        [longDescription] = CASE WHEN @longDescription_Clear = 1 THEN NULL ELSE ISNULL(@longDescription, [longDescription]) END,
        [endDate] = CASE WHEN @endDate_Clear = 1 THEN NULL ELSE ISNULL(@endDate, [endDate]) END,
        [featuredListing] = CASE WHEN @featuredListing_Clear = 1 THEN NULL ELSE ISNULL(@featuredListing, [featuredListing]) END,
        [categories] = CASE WHEN @categories_Clear = 1 THEN NULL ELSE ISNULL(@categories, [categories]) END,
        [startTime] = CASE WHEN @startTime_Clear = 1 THEN NULL ELSE ISNULL(@startTime, [startTime]) END,
        [mj_e2e_custom_attr] = CASE WHEN @mj_e2e_custom_attr_Clear = 1 THEN NULL ELSE ISNULL(@mj_e2e_custom_attr, [mj_e2e_custom_attr]) END,
        [startDate] = CASE WHEN @startDate_Clear = 1 THEN NULL ELSE ISNULL(@startDate, [startDate]) END,
        [endTime] = CASE WHEN @endTime_Clear = 1 THEN NULL ELSE ISNULL(@endTime, [endTime]) END,
        [shortDescription] = CASE WHEN @shortDescription_Clear = 1 THEN NULL ELSE ISNULL(@shortDescription, [shortDescription]) END,
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
        SELECT TOP 0 * FROM [re_members_ams].[vwExhibits] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [re_members_ams].[vwExhibits]
                                    WHERE
                                        [code] = @code
                                    
END
GO

GRANT EXECUTE ON [re_members_ams].[spUpdateExhibits] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the Exhibits table
------------------------------------------------------------
IF OBJECT_ID('[re_members_ams].[trgUpdateExhibits]', 'TR') IS NOT NULL
    DROP TRIGGER [re_members_ams].[trgUpdateExhibits];
GO
CREATE TRIGGER [re_members_ams].trgUpdateExhibits
ON [re_members_ams].[Exhibits]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [re_members_ams].[Exhibits]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [re_members_ams].[Exhibits] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[code] = I.[code];
END;
GO

/* spUpdate Permissions for Exhibits */

GRANT EXECUTE ON [re_members_ams].[spUpdateExhibits] TO [cdp_Developer], [cdp_Integration];

/* Base View SQL for Individuals */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Individuals
-- Item: vwIndividuals
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      Individuals
-----               SCHEMA:      re_members_ams
-----               BASE TABLE:  Individuals
-----               PRIMARY KEY: id
------------------------------------------------------------
IF OBJECT_ID('[re_members_ams].[vwIndividuals]', 'V') IS NOT NULL
    DROP VIEW [re_members_ams].[vwIndividuals];
GO

CREATE VIEW [re_members_ams].[vwIndividuals]
AS
SELECT
    i.*
FROM
    [re_members_ams].[Individuals] AS i
GO
GRANT SELECT ON [re_members_ams].[vwIndividuals] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* Base View Permissions SQL for Individuals */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Individuals
-- Item: Permissions for vwIndividuals
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [re_members_ams].[vwIndividuals] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* spCreate SQL for Individuals */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Individuals
-- Item: spCreateIndividuals
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR Individuals
------------------------------------------------------------
IF OBJECT_ID('[re_members_ams].[spCreateIndividuals]', 'P') IS NOT NULL
    DROP PROCEDURE [re_members_ams].[spCreateIndividuals];
GO

CREATE PROCEDURE [re_members_ams].[spCreateIndividuals]
    @customerType_Clear bit = 0,
    @customerType nvarchar(812) = NULL,
    @id nvarchar(450) = NULL,
    @middleName_Clear bit = 0,
    @middleName nvarchar(812) = NULL,
    @name_Clear bit = 0,
    @name nvarchar(812) = NULL,
    @committees_Clear bit = 0,
    @committees nvarchar(MAX) = NULL,
    @phones_Clear bit = 0,
    @phones nvarchar(MAX) = NULL,
    @jobRoles_Clear bit = 0,
    @jobRoles nvarchar(MAX) = NULL,
    @prefix_Clear bit = 0,
    @prefix nvarchar(812) = NULL,
    @recordNumber_Clear bit = 0,
    @recordNumber nvarchar(812) = NULL,
    @isDeceased_Clear bit = 0,
    @isDeceased nvarchar(MAX) = NULL,
    @title_Clear bit = 0,
    @title nvarchar(812) = NULL,
    @tags_Clear bit = 0,
    @tags nvarchar(MAX) = NULL,
    @customFields_Clear bit = 0,
    @customFields nvarchar(MAX) = NULL,
    @showInDirectory_Clear bit = 0,
    @showInDirectory nvarchar(MAX) = NULL,
    @oldId_Clear bit = 0,
    @oldId nvarchar(812) = NULL,
    @suffix_Clear bit = 0,
    @suffix nvarchar(812) = NULL,
    @imageUri_Clear bit = 0,
    @imageUri nvarchar(812) = NULL,
    @memberships_Clear bit = 0,
    @memberships nvarchar(MAX) = NULL,
    @category_Clear bit = 0,
    @category nvarchar(812) = NULL,
    @gender_Clear bit = 0,
    @gender nvarchar(812) = NULL,
    @webSite_Clear bit = 0,
    @webSite nvarchar(812) = NULL,
    @lastName_Clear bit = 0,
    @lastName nvarchar(812) = NULL,
    @secondLastName_Clear bit = 0,
    @secondLastName nvarchar(812) = NULL,
    @preferredFirstName_Clear bit = 0,
    @preferredFirstName nvarchar(812) = NULL,
    @twitter_Clear bit = 0,
    @twitter nvarchar(812) = NULL,
    @linkedIn_Clear bit = 0,
    @linkedIn nvarchar(812) = NULL,
    @primaryOrganization_Clear bit = 0,
    @primaryOrganization nvarchar(MAX) = NULL,
    @user_Clear bit = 0,
    @user nvarchar(MAX) = NULL,
    @links_Clear bit = 0,
    @links nvarchar(MAX) = NULL,
    @designationData_Clear bit = 0,
    @designationData nvarchar(MAX) = NULL,
    @firstName_Clear bit = 0,
    @firstName nvarchar(812) = NULL,
    @emails_Clear bit = 0,
    @emails nvarchar(MAX) = NULL,
    @email_Clear bit = 0,
    @email nvarchar(812) = NULL,
    @addresses_Clear bit = 0,
    @addresses nvarchar(MAX) = NULL,
    @relationships_Clear bit = 0,
    @relationships nvarchar(MAX) = NULL,
    @mj_e2e_custom_attr_Clear bit = 0,
    @mj_e2e_custom_attr nvarchar(812) = NULL,
    @categories_Clear bit = 0,
    @categories nvarchar(MAX) = NULL,
    @securityRoles_Clear bit = 0,
    @securityRoles nvarchar(MAX) = NULL,
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
    [re_members_ams].[Individuals]
        (
            [customerType],
                [middleName],
                [name],
                [committees],
                [phones],
                [jobRoles],
                [prefix],
                [recordNumber],
                [isDeceased],
                [title],
                [tags],
                [customFields],
                [showInDirectory],
                [oldId],
                [suffix],
                [imageUri],
                [memberships],
                [category],
                [gender],
                [webSite],
                [lastName],
                [secondLastName],
                [preferredFirstName],
                [twitter],
                [linkedIn],
                [primaryOrganization],
                [user],
                [links],
                [designationData],
                [firstName],
                [emails],
                [email],
                [addresses],
                [relationships],
                [mj_e2e_custom_attr],
                [categories],
                [securityRoles],
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
            CASE WHEN @customerType_Clear = 1 THEN NULL ELSE ISNULL(@customerType, NULL) END,
                CASE WHEN @middleName_Clear = 1 THEN NULL ELSE ISNULL(@middleName, NULL) END,
                CASE WHEN @name_Clear = 1 THEN NULL ELSE ISNULL(@name, NULL) END,
                CASE WHEN @committees_Clear = 1 THEN NULL ELSE ISNULL(@committees, NULL) END,
                CASE WHEN @phones_Clear = 1 THEN NULL ELSE ISNULL(@phones, NULL) END,
                CASE WHEN @jobRoles_Clear = 1 THEN NULL ELSE ISNULL(@jobRoles, NULL) END,
                CASE WHEN @prefix_Clear = 1 THEN NULL ELSE ISNULL(@prefix, NULL) END,
                CASE WHEN @recordNumber_Clear = 1 THEN NULL ELSE ISNULL(@recordNumber, NULL) END,
                CASE WHEN @isDeceased_Clear = 1 THEN NULL ELSE ISNULL(@isDeceased, NULL) END,
                CASE WHEN @title_Clear = 1 THEN NULL ELSE ISNULL(@title, NULL) END,
                CASE WHEN @tags_Clear = 1 THEN NULL ELSE ISNULL(@tags, NULL) END,
                CASE WHEN @customFields_Clear = 1 THEN NULL ELSE ISNULL(@customFields, NULL) END,
                CASE WHEN @showInDirectory_Clear = 1 THEN NULL ELSE ISNULL(@showInDirectory, NULL) END,
                CASE WHEN @oldId_Clear = 1 THEN NULL ELSE ISNULL(@oldId, NULL) END,
                CASE WHEN @suffix_Clear = 1 THEN NULL ELSE ISNULL(@suffix, NULL) END,
                CASE WHEN @imageUri_Clear = 1 THEN NULL ELSE ISNULL(@imageUri, NULL) END,
                CASE WHEN @memberships_Clear = 1 THEN NULL ELSE ISNULL(@memberships, NULL) END,
                CASE WHEN @category_Clear = 1 THEN NULL ELSE ISNULL(@category, NULL) END,
                CASE WHEN @gender_Clear = 1 THEN NULL ELSE ISNULL(@gender, NULL) END,
                CASE WHEN @webSite_Clear = 1 THEN NULL ELSE ISNULL(@webSite, NULL) END,
                CASE WHEN @lastName_Clear = 1 THEN NULL ELSE ISNULL(@lastName, NULL) END,
                CASE WHEN @secondLastName_Clear = 1 THEN NULL ELSE ISNULL(@secondLastName, NULL) END,
                CASE WHEN @preferredFirstName_Clear = 1 THEN NULL ELSE ISNULL(@preferredFirstName, NULL) END,
                CASE WHEN @twitter_Clear = 1 THEN NULL ELSE ISNULL(@twitter, NULL) END,
                CASE WHEN @linkedIn_Clear = 1 THEN NULL ELSE ISNULL(@linkedIn, NULL) END,
                CASE WHEN @primaryOrganization_Clear = 1 THEN NULL ELSE ISNULL(@primaryOrganization, NULL) END,
                CASE WHEN @user_Clear = 1 THEN NULL ELSE ISNULL(@user, NULL) END,
                CASE WHEN @links_Clear = 1 THEN NULL ELSE ISNULL(@links, NULL) END,
                CASE WHEN @designationData_Clear = 1 THEN NULL ELSE ISNULL(@designationData, NULL) END,
                CASE WHEN @firstName_Clear = 1 THEN NULL ELSE ISNULL(@firstName, NULL) END,
                CASE WHEN @emails_Clear = 1 THEN NULL ELSE ISNULL(@emails, NULL) END,
                CASE WHEN @email_Clear = 1 THEN NULL ELSE ISNULL(@email, NULL) END,
                CASE WHEN @addresses_Clear = 1 THEN NULL ELSE ISNULL(@addresses, NULL) END,
                CASE WHEN @relationships_Clear = 1 THEN NULL ELSE ISNULL(@relationships, NULL) END,
                CASE WHEN @mj_e2e_custom_attr_Clear = 1 THEN NULL ELSE ISNULL(@mj_e2e_custom_attr, NULL) END,
                CASE WHEN @categories_Clear = 1 THEN NULL ELSE ISNULL(@categories, NULL) END,
                CASE WHEN @securityRoles_Clear = 1 THEN NULL ELSE ISNULL(@securityRoles, NULL) END,
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
    SELECT * FROM [re_members_ams].[vwIndividuals] WHERE [id] = @id
END
GO
GRANT EXECUTE ON [re_members_ams].[spCreateIndividuals] TO [cdp_Developer], [cdp_Integration];

/* spCreate Permissions for Individuals */

GRANT EXECUTE ON [re_members_ams].[spCreateIndividuals] TO [cdp_Developer], [cdp_Integration];

/* spUpdate SQL for Individuals */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Individuals
-- Item: spUpdateIndividuals
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR Individuals
------------------------------------------------------------
IF OBJECT_ID('[re_members_ams].[spUpdateIndividuals]', 'P') IS NOT NULL
    DROP PROCEDURE [re_members_ams].[spUpdateIndividuals];
GO

CREATE PROCEDURE [re_members_ams].[spUpdateIndividuals]
    @customerType_Clear bit = 0,
    @customerType nvarchar(812) = NULL,
    @id nvarchar(450),
    @middleName_Clear bit = 0,
    @middleName nvarchar(812) = NULL,
    @name_Clear bit = 0,
    @name nvarchar(812) = NULL,
    @committees_Clear bit = 0,
    @committees nvarchar(MAX) = NULL,
    @phones_Clear bit = 0,
    @phones nvarchar(MAX) = NULL,
    @jobRoles_Clear bit = 0,
    @jobRoles nvarchar(MAX) = NULL,
    @prefix_Clear bit = 0,
    @prefix nvarchar(812) = NULL,
    @recordNumber_Clear bit = 0,
    @recordNumber nvarchar(812) = NULL,
    @isDeceased_Clear bit = 0,
    @isDeceased nvarchar(MAX) = NULL,
    @title_Clear bit = 0,
    @title nvarchar(812) = NULL,
    @tags_Clear bit = 0,
    @tags nvarchar(MAX) = NULL,
    @customFields_Clear bit = 0,
    @customFields nvarchar(MAX) = NULL,
    @showInDirectory_Clear bit = 0,
    @showInDirectory nvarchar(MAX) = NULL,
    @oldId_Clear bit = 0,
    @oldId nvarchar(812) = NULL,
    @suffix_Clear bit = 0,
    @suffix nvarchar(812) = NULL,
    @imageUri_Clear bit = 0,
    @imageUri nvarchar(812) = NULL,
    @memberships_Clear bit = 0,
    @memberships nvarchar(MAX) = NULL,
    @category_Clear bit = 0,
    @category nvarchar(812) = NULL,
    @gender_Clear bit = 0,
    @gender nvarchar(812) = NULL,
    @webSite_Clear bit = 0,
    @webSite nvarchar(812) = NULL,
    @lastName_Clear bit = 0,
    @lastName nvarchar(812) = NULL,
    @secondLastName_Clear bit = 0,
    @secondLastName nvarchar(812) = NULL,
    @preferredFirstName_Clear bit = 0,
    @preferredFirstName nvarchar(812) = NULL,
    @twitter_Clear bit = 0,
    @twitter nvarchar(812) = NULL,
    @linkedIn_Clear bit = 0,
    @linkedIn nvarchar(812) = NULL,
    @primaryOrganization_Clear bit = 0,
    @primaryOrganization nvarchar(MAX) = NULL,
    @user_Clear bit = 0,
    @user nvarchar(MAX) = NULL,
    @links_Clear bit = 0,
    @links nvarchar(MAX) = NULL,
    @designationData_Clear bit = 0,
    @designationData nvarchar(MAX) = NULL,
    @firstName_Clear bit = 0,
    @firstName nvarchar(812) = NULL,
    @emails_Clear bit = 0,
    @emails nvarchar(MAX) = NULL,
    @email_Clear bit = 0,
    @email nvarchar(812) = NULL,
    @addresses_Clear bit = 0,
    @addresses nvarchar(MAX) = NULL,
    @relationships_Clear bit = 0,
    @relationships nvarchar(MAX) = NULL,
    @mj_e2e_custom_attr_Clear bit = 0,
    @mj_e2e_custom_attr nvarchar(812) = NULL,
    @categories_Clear bit = 0,
    @categories nvarchar(MAX) = NULL,
    @securityRoles_Clear bit = 0,
    @securityRoles nvarchar(MAX) = NULL,
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
        [re_members_ams].[Individuals]
    SET
        [customerType] = CASE WHEN @customerType_Clear = 1 THEN NULL ELSE ISNULL(@customerType, [customerType]) END,
        [middleName] = CASE WHEN @middleName_Clear = 1 THEN NULL ELSE ISNULL(@middleName, [middleName]) END,
        [name] = CASE WHEN @name_Clear = 1 THEN NULL ELSE ISNULL(@name, [name]) END,
        [committees] = CASE WHEN @committees_Clear = 1 THEN NULL ELSE ISNULL(@committees, [committees]) END,
        [phones] = CASE WHEN @phones_Clear = 1 THEN NULL ELSE ISNULL(@phones, [phones]) END,
        [jobRoles] = CASE WHEN @jobRoles_Clear = 1 THEN NULL ELSE ISNULL(@jobRoles, [jobRoles]) END,
        [prefix] = CASE WHEN @prefix_Clear = 1 THEN NULL ELSE ISNULL(@prefix, [prefix]) END,
        [recordNumber] = CASE WHEN @recordNumber_Clear = 1 THEN NULL ELSE ISNULL(@recordNumber, [recordNumber]) END,
        [isDeceased] = CASE WHEN @isDeceased_Clear = 1 THEN NULL ELSE ISNULL(@isDeceased, [isDeceased]) END,
        [title] = CASE WHEN @title_Clear = 1 THEN NULL ELSE ISNULL(@title, [title]) END,
        [tags] = CASE WHEN @tags_Clear = 1 THEN NULL ELSE ISNULL(@tags, [tags]) END,
        [customFields] = CASE WHEN @customFields_Clear = 1 THEN NULL ELSE ISNULL(@customFields, [customFields]) END,
        [showInDirectory] = CASE WHEN @showInDirectory_Clear = 1 THEN NULL ELSE ISNULL(@showInDirectory, [showInDirectory]) END,
        [oldId] = CASE WHEN @oldId_Clear = 1 THEN NULL ELSE ISNULL(@oldId, [oldId]) END,
        [suffix] = CASE WHEN @suffix_Clear = 1 THEN NULL ELSE ISNULL(@suffix, [suffix]) END,
        [imageUri] = CASE WHEN @imageUri_Clear = 1 THEN NULL ELSE ISNULL(@imageUri, [imageUri]) END,
        [memberships] = CASE WHEN @memberships_Clear = 1 THEN NULL ELSE ISNULL(@memberships, [memberships]) END,
        [category] = CASE WHEN @category_Clear = 1 THEN NULL ELSE ISNULL(@category, [category]) END,
        [gender] = CASE WHEN @gender_Clear = 1 THEN NULL ELSE ISNULL(@gender, [gender]) END,
        [webSite] = CASE WHEN @webSite_Clear = 1 THEN NULL ELSE ISNULL(@webSite, [webSite]) END,
        [lastName] = CASE WHEN @lastName_Clear = 1 THEN NULL ELSE ISNULL(@lastName, [lastName]) END,
        [secondLastName] = CASE WHEN @secondLastName_Clear = 1 THEN NULL ELSE ISNULL(@secondLastName, [secondLastName]) END,
        [preferredFirstName] = CASE WHEN @preferredFirstName_Clear = 1 THEN NULL ELSE ISNULL(@preferredFirstName, [preferredFirstName]) END,
        [twitter] = CASE WHEN @twitter_Clear = 1 THEN NULL ELSE ISNULL(@twitter, [twitter]) END,
        [linkedIn] = CASE WHEN @linkedIn_Clear = 1 THEN NULL ELSE ISNULL(@linkedIn, [linkedIn]) END,
        [primaryOrganization] = CASE WHEN @primaryOrganization_Clear = 1 THEN NULL ELSE ISNULL(@primaryOrganization, [primaryOrganization]) END,
        [user] = CASE WHEN @user_Clear = 1 THEN NULL ELSE ISNULL(@user, [user]) END,
        [links] = CASE WHEN @links_Clear = 1 THEN NULL ELSE ISNULL(@links, [links]) END,
        [designationData] = CASE WHEN @designationData_Clear = 1 THEN NULL ELSE ISNULL(@designationData, [designationData]) END,
        [firstName] = CASE WHEN @firstName_Clear = 1 THEN NULL ELSE ISNULL(@firstName, [firstName]) END,
        [emails] = CASE WHEN @emails_Clear = 1 THEN NULL ELSE ISNULL(@emails, [emails]) END,
        [email] = CASE WHEN @email_Clear = 1 THEN NULL ELSE ISNULL(@email, [email]) END,
        [addresses] = CASE WHEN @addresses_Clear = 1 THEN NULL ELSE ISNULL(@addresses, [addresses]) END,
        [relationships] = CASE WHEN @relationships_Clear = 1 THEN NULL ELSE ISNULL(@relationships, [relationships]) END,
        [mj_e2e_custom_attr] = CASE WHEN @mj_e2e_custom_attr_Clear = 1 THEN NULL ELSE ISNULL(@mj_e2e_custom_attr, [mj_e2e_custom_attr]) END,
        [categories] = CASE WHEN @categories_Clear = 1 THEN NULL ELSE ISNULL(@categories, [categories]) END,
        [securityRoles] = CASE WHEN @securityRoles_Clear = 1 THEN NULL ELSE ISNULL(@securityRoles, [securityRoles]) END,
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
        SELECT TOP 0 * FROM [re_members_ams].[vwIndividuals] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [re_members_ams].[vwIndividuals]
                                    WHERE
                                        [id] = @id
                                    
END
GO

GRANT EXECUTE ON [re_members_ams].[spUpdateIndividuals] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the Individuals table
------------------------------------------------------------
IF OBJECT_ID('[re_members_ams].[trgUpdateIndividuals]', 'TR') IS NOT NULL
    DROP TRIGGER [re_members_ams].[trgUpdateIndividuals];
GO
CREATE TRIGGER [re_members_ams].trgUpdateIndividuals
ON [re_members_ams].[Individuals]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [re_members_ams].[Individuals]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [re_members_ams].[Individuals] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[id] = I.[id];
END;
GO

/* spUpdate Permissions for Individuals */

GRANT EXECUTE ON [re_members_ams].[spUpdateIndividuals] TO [cdp_Developer], [cdp_Integration];

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
IF OBJECT_ID('[re_members_ams].[spDeleteEvents]', 'P') IS NOT NULL
    DROP PROCEDURE [re_members_ams].[spDeleteEvents];
GO

CREATE PROCEDURE [re_members_ams].[spDeleteEvents]
    @eventId nvarchar(450)
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [re_members_ams].[Events]
    WHERE
        [eventId] = @eventId


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [eventId] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @eventId AS [eventId] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [re_members_ams].[spDeleteEvents] TO [cdp_Developer], [cdp_Integration];

/* spDelete Permissions for Events */

GRANT EXECUTE ON [re_members_ams].[spDeleteEvents] TO [cdp_Developer], [cdp_Integration];

/* spDelete SQL for Exam Scores */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Exam Scores
-- Item: spDeleteExamScores
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR ExamScores
------------------------------------------------------------
IF OBJECT_ID('[re_members_ams].[spDeleteExamScores]', 'P') IS NOT NULL
    DROP PROCEDURE [re_members_ams].[spDeleteExamScores];
GO

CREATE PROCEDURE [re_members_ams].[spDeleteExamScores]
    @individualRecordNumber nvarchar(255)
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [re_members_ams].[ExamScores]
    WHERE
        [individualRecordNumber] = @individualRecordNumber


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [individualRecordNumber] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @individualRecordNumber AS [individualRecordNumber] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [re_members_ams].[spDeleteExamScores] TO [cdp_Developer], [cdp_Integration];

/* spDelete Permissions for Exam Scores */

GRANT EXECUTE ON [re_members_ams].[spDeleteExamScores] TO [cdp_Developer], [cdp_Integration];

/* spDelete SQL for Exams */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Exams
-- Item: spDeleteExams
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR Exams
------------------------------------------------------------
IF OBJECT_ID('[re_members_ams].[spDeleteExams]', 'P') IS NOT NULL
    DROP PROCEDURE [re_members_ams].[spDeleteExams];
GO

CREATE PROCEDURE [re_members_ams].[spDeleteExams]
    @id nvarchar(450)
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [re_members_ams].[Exams]
    WHERE
        [id] = @id


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [id] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @id AS [id] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [re_members_ams].[spDeleteExams] TO [cdp_Developer], [cdp_Integration];

/* spDelete Permissions for Exams */

GRANT EXECUTE ON [re_members_ams].[spDeleteExams] TO [cdp_Developer], [cdp_Integration];

/* spDelete SQL for Exhibits */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Exhibits
-- Item: spDeleteExhibits
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR Exhibits
------------------------------------------------------------
IF OBJECT_ID('[re_members_ams].[spDeleteExhibits]', 'P') IS NOT NULL
    DROP PROCEDURE [re_members_ams].[spDeleteExhibits];
GO

CREATE PROCEDURE [re_members_ams].[spDeleteExhibits]
    @code nvarchar(450)
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [re_members_ams].[Exhibits]
    WHERE
        [code] = @code


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [code] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @code AS [code] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [re_members_ams].[spDeleteExhibits] TO [cdp_Developer], [cdp_Integration];

/* spDelete Permissions for Exhibits */

GRANT EXECUTE ON [re_members_ams].[spDeleteExhibits] TO [cdp_Developer], [cdp_Integration];

/* spDelete SQL for Individuals */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Individuals
-- Item: spDeleteIndividuals
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR Individuals
------------------------------------------------------------
IF OBJECT_ID('[re_members_ams].[spDeleteIndividuals]', 'P') IS NOT NULL
    DROP PROCEDURE [re_members_ams].[spDeleteIndividuals];
GO

CREATE PROCEDURE [re_members_ams].[spDeleteIndividuals]
    @id nvarchar(450)
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [re_members_ams].[Individuals]
    WHERE
        [id] = @id


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [id] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @id AS [id] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [re_members_ams].[spDeleteIndividuals] TO [cdp_Developer], [cdp_Integration];

/* spDelete Permissions for Individuals */

GRANT EXECUTE ON [re_members_ams].[spDeleteIndividuals] TO [cdp_Developer], [cdp_Integration];

/* Index for Foreign Keys for Licenses */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Licenses
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

/* Base View SQL for Licenses */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Licenses
-- Item: vwLicenses
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      Licenses
-----               SCHEMA:      re_members_ams
-----               BASE TABLE:  Licenses
-----               PRIMARY KEY: id
------------------------------------------------------------
IF OBJECT_ID('[re_members_ams].[vwLicenses]', 'V') IS NOT NULL
    DROP VIEW [re_members_ams].[vwLicenses];
GO

CREATE VIEW [re_members_ams].[vwLicenses]
AS
SELECT
    l.*
FROM
    [re_members_ams].[Licenses] AS l
GO
GRANT SELECT ON [re_members_ams].[vwLicenses] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* Base View Permissions SQL for Licenses */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Licenses
-- Item: Permissions for vwLicenses
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [re_members_ams].[vwLicenses] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* spCreate SQL for Licenses */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Licenses
-- Item: spCreateLicenses
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR Licenses
------------------------------------------------------------
IF OBJECT_ID('[re_members_ams].[spCreateLicenses]', 'P') IS NOT NULL
    DROP PROCEDURE [re_members_ams].[spCreateLicenses];
GO

CREATE PROCEDURE [re_members_ams].[spCreateLicenses]
    @startDate_Clear bit = 0,
    @startDate nvarchar(255) = NULL,
    @licenseType_Clear bit = 0,
    @licenseType nvarchar(255) = NULL,
    @id nvarchar(255) = NULL,
    @state_Clear bit = 0,
    @state nvarchar(255) = NULL,
    @number_Clear bit = 0,
    @number nvarchar(255) = NULL,
    @expirationDate_Clear bit = 0,
    @expirationDate nvarchar(255) = NULL,
    @status_Clear bit = 0,
    @status nvarchar(255) = NULL,
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
    [re_members_ams].[Licenses]
        (
            [startDate],
                [licenseType],
                [state],
                [number],
                [expirationDate],
                [status],
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
            CASE WHEN @startDate_Clear = 1 THEN NULL ELSE ISNULL(@startDate, NULL) END,
                CASE WHEN @licenseType_Clear = 1 THEN NULL ELSE ISNULL(@licenseType, NULL) END,
                CASE WHEN @state_Clear = 1 THEN NULL ELSE ISNULL(@state, NULL) END,
                CASE WHEN @number_Clear = 1 THEN NULL ELSE ISNULL(@number, NULL) END,
                CASE WHEN @expirationDate_Clear = 1 THEN NULL ELSE ISNULL(@expirationDate, NULL) END,
                CASE WHEN @status_Clear = 1 THEN NULL ELSE ISNULL(@status, NULL) END,
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
    SELECT * FROM [re_members_ams].[vwLicenses] WHERE [id] = @id
END
GO
GRANT EXECUTE ON [re_members_ams].[spCreateLicenses] TO [cdp_Developer], [cdp_Integration];

/* spCreate Permissions for Licenses */

GRANT EXECUTE ON [re_members_ams].[spCreateLicenses] TO [cdp_Developer], [cdp_Integration];

/* spUpdate SQL for Licenses */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Licenses
-- Item: spUpdateLicenses
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR Licenses
------------------------------------------------------------
IF OBJECT_ID('[re_members_ams].[spUpdateLicenses]', 'P') IS NOT NULL
    DROP PROCEDURE [re_members_ams].[spUpdateLicenses];
GO

CREATE PROCEDURE [re_members_ams].[spUpdateLicenses]
    @startDate_Clear bit = 0,
    @startDate nvarchar(255) = NULL,
    @licenseType_Clear bit = 0,
    @licenseType nvarchar(255) = NULL,
    @id nvarchar(255),
    @state_Clear bit = 0,
    @state nvarchar(255) = NULL,
    @number_Clear bit = 0,
    @number nvarchar(255) = NULL,
    @expirationDate_Clear bit = 0,
    @expirationDate nvarchar(255) = NULL,
    @status_Clear bit = 0,
    @status nvarchar(255) = NULL,
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
        [re_members_ams].[Licenses]
    SET
        [startDate] = CASE WHEN @startDate_Clear = 1 THEN NULL ELSE ISNULL(@startDate, [startDate]) END,
        [licenseType] = CASE WHEN @licenseType_Clear = 1 THEN NULL ELSE ISNULL(@licenseType, [licenseType]) END,
        [state] = CASE WHEN @state_Clear = 1 THEN NULL ELSE ISNULL(@state, [state]) END,
        [number] = CASE WHEN @number_Clear = 1 THEN NULL ELSE ISNULL(@number, [number]) END,
        [expirationDate] = CASE WHEN @expirationDate_Clear = 1 THEN NULL ELSE ISNULL(@expirationDate, [expirationDate]) END,
        [status] = CASE WHEN @status_Clear = 1 THEN NULL ELSE ISNULL(@status, [status]) END,
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
        SELECT TOP 0 * FROM [re_members_ams].[vwLicenses] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [re_members_ams].[vwLicenses]
                                    WHERE
                                        [id] = @id
                                    
END
GO

GRANT EXECUTE ON [re_members_ams].[spUpdateLicenses] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the Licenses table
------------------------------------------------------------
IF OBJECT_ID('[re_members_ams].[trgUpdateLicenses]', 'TR') IS NOT NULL
    DROP TRIGGER [re_members_ams].[trgUpdateLicenses];
GO
CREATE TRIGGER [re_members_ams].trgUpdateLicenses
ON [re_members_ams].[Licenses]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [re_members_ams].[Licenses]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [re_members_ams].[Licenses] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[id] = I.[id];
END;
GO

/* spUpdate Permissions for Licenses */

GRANT EXECUTE ON [re_members_ams].[spUpdateLicenses] TO [cdp_Developer], [cdp_Integration];

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
-----               SCHEMA:      re_members_ams
-----               BASE TABLE:  Memberships
-----               PRIMARY KEY: code
------------------------------------------------------------
IF OBJECT_ID('[re_members_ams].[vwMemberships]', 'V') IS NOT NULL
    DROP VIEW [re_members_ams].[vwMemberships];
GO

CREATE VIEW [re_members_ams].[vwMemberships]
AS
SELECT
    m.*
FROM
    [re_members_ams].[Memberships] AS m
GO
GRANT SELECT ON [re_members_ams].[vwMemberships] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* Base View Permissions SQL for Memberships */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Memberships
-- Item: Permissions for vwMemberships
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [re_members_ams].[vwMemberships] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

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
IF OBJECT_ID('[re_members_ams].[spCreateMemberships]', 'P') IS NOT NULL
    DROP PROCEDURE [re_members_ams].[spCreateMemberships];
GO

CREATE PROCEDURE [re_members_ams].[spCreateMemberships]
    @terminateDate_Clear bit = 0,
    @terminateDate nvarchar(255) = NULL,
    @termsList_Clear bit = 0,
    @termsList nvarchar(MAX) = NULL,
    @inheritedMembershipBenefits_Clear bit = 0,
    @inheritedMembershipBenefits nvarchar(255) = NULL,
    @renewalUrl_Clear bit = 0,
    @renewalUrl nvarchar(255) = NULL,
    @membershipType_Clear bit = 0,
    @membershipType nvarchar(255) = NULL,
    @code nvarchar(255) = NULL,
    @graceExpireDate_Clear bit = 0,
    @graceExpireDate nvarchar(255) = NULL,
    @effectiveDate_Clear bit = 0,
    @effectiveDate nvarchar(255) = NULL,
    @membershipTypeId_Clear bit = 0,
    @membershipTypeId nvarchar(255) = NULL,
    @membershipUniqueId_Clear bit = 0,
    @membershipUniqueId nvarchar(255) = NULL,
    @expireDate_Clear bit = 0,
    @expireDate nvarchar(255) = NULL,
    @joinDate_Clear bit = 0,
    @joinDate nvarchar(255) = NULL,
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
    [re_members_ams].[Memberships]
        (
            [terminateDate],
                [termsList],
                [inheritedMembershipBenefits],
                [renewalUrl],
                [membershipType],
                [graceExpireDate],
                [effectiveDate],
                [membershipTypeId],
                [membershipUniqueId],
                [expireDate],
                [joinDate],
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
            CASE WHEN @terminateDate_Clear = 1 THEN NULL ELSE ISNULL(@terminateDate, NULL) END,
                CASE WHEN @termsList_Clear = 1 THEN NULL ELSE ISNULL(@termsList, NULL) END,
                CASE WHEN @inheritedMembershipBenefits_Clear = 1 THEN NULL ELSE ISNULL(@inheritedMembershipBenefits, NULL) END,
                CASE WHEN @renewalUrl_Clear = 1 THEN NULL ELSE ISNULL(@renewalUrl, NULL) END,
                CASE WHEN @membershipType_Clear = 1 THEN NULL ELSE ISNULL(@membershipType, NULL) END,
                CASE WHEN @graceExpireDate_Clear = 1 THEN NULL ELSE ISNULL(@graceExpireDate, NULL) END,
                CASE WHEN @effectiveDate_Clear = 1 THEN NULL ELSE ISNULL(@effectiveDate, NULL) END,
                CASE WHEN @membershipTypeId_Clear = 1 THEN NULL ELSE ISNULL(@membershipTypeId, NULL) END,
                CASE WHEN @membershipUniqueId_Clear = 1 THEN NULL ELSE ISNULL(@membershipUniqueId, NULL) END,
                CASE WHEN @expireDate_Clear = 1 THEN NULL ELSE ISNULL(@expireDate, NULL) END,
                CASE WHEN @joinDate_Clear = 1 THEN NULL ELSE ISNULL(@joinDate, NULL) END,
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
    SELECT * FROM [re_members_ams].[vwMemberships] WHERE [code] = @code
END
GO
GRANT EXECUTE ON [re_members_ams].[spCreateMemberships] TO [cdp_Developer], [cdp_Integration];

/* spCreate Permissions for Memberships */

GRANT EXECUTE ON [re_members_ams].[spCreateMemberships] TO [cdp_Developer], [cdp_Integration];

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
IF OBJECT_ID('[re_members_ams].[spUpdateMemberships]', 'P') IS NOT NULL
    DROP PROCEDURE [re_members_ams].[spUpdateMemberships];
GO

CREATE PROCEDURE [re_members_ams].[spUpdateMemberships]
    @terminateDate_Clear bit = 0,
    @terminateDate nvarchar(255) = NULL,
    @termsList_Clear bit = 0,
    @termsList nvarchar(MAX) = NULL,
    @inheritedMembershipBenefits_Clear bit = 0,
    @inheritedMembershipBenefits nvarchar(255) = NULL,
    @renewalUrl_Clear bit = 0,
    @renewalUrl nvarchar(255) = NULL,
    @membershipType_Clear bit = 0,
    @membershipType nvarchar(255) = NULL,
    @code nvarchar(255),
    @graceExpireDate_Clear bit = 0,
    @graceExpireDate nvarchar(255) = NULL,
    @effectiveDate_Clear bit = 0,
    @effectiveDate nvarchar(255) = NULL,
    @membershipTypeId_Clear bit = 0,
    @membershipTypeId nvarchar(255) = NULL,
    @membershipUniqueId_Clear bit = 0,
    @membershipUniqueId nvarchar(255) = NULL,
    @expireDate_Clear bit = 0,
    @expireDate nvarchar(255) = NULL,
    @joinDate_Clear bit = 0,
    @joinDate nvarchar(255) = NULL,
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
        [re_members_ams].[Memberships]
    SET
        [terminateDate] = CASE WHEN @terminateDate_Clear = 1 THEN NULL ELSE ISNULL(@terminateDate, [terminateDate]) END,
        [termsList] = CASE WHEN @termsList_Clear = 1 THEN NULL ELSE ISNULL(@termsList, [termsList]) END,
        [inheritedMembershipBenefits] = CASE WHEN @inheritedMembershipBenefits_Clear = 1 THEN NULL ELSE ISNULL(@inheritedMembershipBenefits, [inheritedMembershipBenefits]) END,
        [renewalUrl] = CASE WHEN @renewalUrl_Clear = 1 THEN NULL ELSE ISNULL(@renewalUrl, [renewalUrl]) END,
        [membershipType] = CASE WHEN @membershipType_Clear = 1 THEN NULL ELSE ISNULL(@membershipType, [membershipType]) END,
        [graceExpireDate] = CASE WHEN @graceExpireDate_Clear = 1 THEN NULL ELSE ISNULL(@graceExpireDate, [graceExpireDate]) END,
        [effectiveDate] = CASE WHEN @effectiveDate_Clear = 1 THEN NULL ELSE ISNULL(@effectiveDate, [effectiveDate]) END,
        [membershipTypeId] = CASE WHEN @membershipTypeId_Clear = 1 THEN NULL ELSE ISNULL(@membershipTypeId, [membershipTypeId]) END,
        [membershipUniqueId] = CASE WHEN @membershipUniqueId_Clear = 1 THEN NULL ELSE ISNULL(@membershipUniqueId, [membershipUniqueId]) END,
        [expireDate] = CASE WHEN @expireDate_Clear = 1 THEN NULL ELSE ISNULL(@expireDate, [expireDate]) END,
        [joinDate] = CASE WHEN @joinDate_Clear = 1 THEN NULL ELSE ISNULL(@joinDate, [joinDate]) END,
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
        SELECT TOP 0 * FROM [re_members_ams].[vwMemberships] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [re_members_ams].[vwMemberships]
                                    WHERE
                                        [code] = @code
                                    
END
GO

GRANT EXECUTE ON [re_members_ams].[spUpdateMemberships] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the Memberships table
------------------------------------------------------------
IF OBJECT_ID('[re_members_ams].[trgUpdateMemberships]', 'TR') IS NOT NULL
    DROP TRIGGER [re_members_ams].[trgUpdateMemberships];
GO
CREATE TRIGGER [re_members_ams].trgUpdateMemberships
ON [re_members_ams].[Memberships]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [re_members_ams].[Memberships]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [re_members_ams].[Memberships] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[code] = I.[code];
END;
GO

/* spUpdate Permissions for Memberships */

GRANT EXECUTE ON [re_members_ams].[spUpdateMemberships] TO [cdp_Developer], [cdp_Integration];

/* spDelete SQL for Licenses */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Licenses
-- Item: spDeleteLicenses
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR Licenses
------------------------------------------------------------
IF OBJECT_ID('[re_members_ams].[spDeleteLicenses]', 'P') IS NOT NULL
    DROP PROCEDURE [re_members_ams].[spDeleteLicenses];
GO

CREATE PROCEDURE [re_members_ams].[spDeleteLicenses]
    @id nvarchar(255)
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [re_members_ams].[Licenses]
    WHERE
        [id] = @id


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [id] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @id AS [id] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [re_members_ams].[spDeleteLicenses] TO [cdp_Developer], [cdp_Integration];

/* spDelete Permissions for Licenses */

GRANT EXECUTE ON [re_members_ams].[spDeleteLicenses] TO [cdp_Developer], [cdp_Integration];

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
IF OBJECT_ID('[re_members_ams].[spDeleteMemberships]', 'P') IS NOT NULL
    DROP PROCEDURE [re_members_ams].[spDeleteMemberships];
GO

CREATE PROCEDURE [re_members_ams].[spDeleteMemberships]
    @code nvarchar(255)
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [re_members_ams].[Memberships]
    WHERE
        [code] = @code


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [code] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @code AS [code] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [re_members_ams].[spDeleteMemberships] TO [cdp_Developer], [cdp_Integration];

/* spDelete Permissions for Memberships */

GRANT EXECUTE ON [re_members_ams].[spDeleteMemberships] TO [cdp_Developer], [cdp_Integration];

/* Index for Foreign Keys for Orders */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Orders
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------;

/* Base View SQL for Orders */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Orders
-- Item: vwOrders
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      Orders
-----               SCHEMA:      re_members_ams
-----               BASE TABLE:  Orders
-----               PRIMARY KEY: id
------------------------------------------------------------
IF OBJECT_ID('[re_members_ams].[vwOrders]', 'V') IS NOT NULL
    DROP VIEW [re_members_ams].[vwOrders];
GO

CREATE VIEW [re_members_ams].[vwOrders]
AS
SELECT
    o.*
FROM
    [re_members_ams].[Orders] AS o
GO
GRANT SELECT ON [re_members_ams].[vwOrders] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* Base View Permissions SQL for Orders */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Orders
-- Item: Permissions for vwOrders
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [re_members_ams].[vwOrders] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* spCreate SQL for Orders */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Orders
-- Item: spCreateOrders
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR Orders
------------------------------------------------------------
IF OBJECT_ID('[re_members_ams].[spCreateOrders]', 'P') IS NOT NULL
    DROP PROCEDURE [re_members_ams].[spCreateOrders];
GO

CREATE PROCEDURE [re_members_ams].[spCreateOrders]
    @customerId_Clear bit = 0,
    @customerId nvarchar(255) = NULL,
    @totalAmount_Clear bit = 0,
    @totalAmount nvarchar(255) = NULL,
    @title_Clear bit = 0,
    @title nvarchar(255) = NULL,
    @balance_Clear bit = 0,
    @balance nvarchar(255) = NULL,
    @id nvarchar(255) = NULL,
    @date_Clear bit = 0,
    @date nvarchar(255) = NULL,
    @type_Clear bit = 0,
    @type nvarchar(255) = NULL,
    @number_Clear bit = 0,
    @number nvarchar(255) = NULL,
    @lineItems_Clear bit = 0,
    @lineItems nvarchar(MAX) = NULL,
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
    [re_members_ams].[Orders]
        (
            [customerId],
                [totalAmount],
                [title],
                [balance],
                [date],
                [type],
                [number],
                [lineItems],
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
            CASE WHEN @customerId_Clear = 1 THEN NULL ELSE ISNULL(@customerId, NULL) END,
                CASE WHEN @totalAmount_Clear = 1 THEN NULL ELSE ISNULL(@totalAmount, NULL) END,
                CASE WHEN @title_Clear = 1 THEN NULL ELSE ISNULL(@title, NULL) END,
                CASE WHEN @balance_Clear = 1 THEN NULL ELSE ISNULL(@balance, NULL) END,
                CASE WHEN @date_Clear = 1 THEN NULL ELSE ISNULL(@date, NULL) END,
                CASE WHEN @type_Clear = 1 THEN NULL ELSE ISNULL(@type, NULL) END,
                CASE WHEN @number_Clear = 1 THEN NULL ELSE ISNULL(@number, NULL) END,
                CASE WHEN @lineItems_Clear = 1 THEN NULL ELSE ISNULL(@lineItems, NULL) END,
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
    SELECT * FROM [re_members_ams].[vwOrders] WHERE [id] = @id
END
GO
GRANT EXECUTE ON [re_members_ams].[spCreateOrders] TO [cdp_Developer], [cdp_Integration];

/* spCreate Permissions for Orders */

GRANT EXECUTE ON [re_members_ams].[spCreateOrders] TO [cdp_Developer], [cdp_Integration];

/* spUpdate SQL for Orders */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Orders
-- Item: spUpdateOrders
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR Orders
------------------------------------------------------------
IF OBJECT_ID('[re_members_ams].[spUpdateOrders]', 'P') IS NOT NULL
    DROP PROCEDURE [re_members_ams].[spUpdateOrders];
GO

CREATE PROCEDURE [re_members_ams].[spUpdateOrders]
    @customerId_Clear bit = 0,
    @customerId nvarchar(255) = NULL,
    @totalAmount_Clear bit = 0,
    @totalAmount nvarchar(255) = NULL,
    @title_Clear bit = 0,
    @title nvarchar(255) = NULL,
    @balance_Clear bit = 0,
    @balance nvarchar(255) = NULL,
    @id nvarchar(255),
    @date_Clear bit = 0,
    @date nvarchar(255) = NULL,
    @type_Clear bit = 0,
    @type nvarchar(255) = NULL,
    @number_Clear bit = 0,
    @number nvarchar(255) = NULL,
    @lineItems_Clear bit = 0,
    @lineItems nvarchar(MAX) = NULL,
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
        [re_members_ams].[Orders]
    SET
        [customerId] = CASE WHEN @customerId_Clear = 1 THEN NULL ELSE ISNULL(@customerId, [customerId]) END,
        [totalAmount] = CASE WHEN @totalAmount_Clear = 1 THEN NULL ELSE ISNULL(@totalAmount, [totalAmount]) END,
        [title] = CASE WHEN @title_Clear = 1 THEN NULL ELSE ISNULL(@title, [title]) END,
        [balance] = CASE WHEN @balance_Clear = 1 THEN NULL ELSE ISNULL(@balance, [balance]) END,
        [date] = CASE WHEN @date_Clear = 1 THEN NULL ELSE ISNULL(@date, [date]) END,
        [type] = CASE WHEN @type_Clear = 1 THEN NULL ELSE ISNULL(@type, [type]) END,
        [number] = CASE WHEN @number_Clear = 1 THEN NULL ELSE ISNULL(@number, [number]) END,
        [lineItems] = CASE WHEN @lineItems_Clear = 1 THEN NULL ELSE ISNULL(@lineItems, [lineItems]) END,
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
        SELECT TOP 0 * FROM [re_members_ams].[vwOrders] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [re_members_ams].[vwOrders]
                                    WHERE
                                        [id] = @id
                                    
END
GO

GRANT EXECUTE ON [re_members_ams].[spUpdateOrders] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the Orders table
------------------------------------------------------------
IF OBJECT_ID('[re_members_ams].[trgUpdateOrders]', 'TR') IS NOT NULL
    DROP TRIGGER [re_members_ams].[trgUpdateOrders];
GO
CREATE TRIGGER [re_members_ams].trgUpdateOrders
ON [re_members_ams].[Orders]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [re_members_ams].[Orders]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [re_members_ams].[Orders] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[id] = I.[id];
END;
GO

/* spUpdate Permissions for Orders */

GRANT EXECUTE ON [re_members_ams].[spUpdateOrders] TO [cdp_Developer], [cdp_Integration];

/* spDelete SQL for Orders */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Orders
-- Item: spDeleteOrders
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR Orders
------------------------------------------------------------
IF OBJECT_ID('[re_members_ams].[spDeleteOrders]', 'P') IS NOT NULL
    DROP PROCEDURE [re_members_ams].[spDeleteOrders];
GO

CREATE PROCEDURE [re_members_ams].[spDeleteOrders]
    @id nvarchar(255)
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [re_members_ams].[Orders]
    WHERE
        [id] = @id


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [id] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @id AS [id] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [re_members_ams].[spDeleteOrders] TO [cdp_Developer], [cdp_Integration];

/* spDelete Permissions for Orders */

GRANT EXECUTE ON [re_members_ams].[spDeleteOrders] TO [cdp_Developer], [cdp_Integration];

/* Index for Foreign Keys for OrganizationServices */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Organization Services
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------;

/* Index for Foreign Keys for Organizations */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Organizations
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key parentCompanyId in table Organizations
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_Organizations_parentCompanyId' 
    AND object_id = OBJECT_ID('[re_members_ams].[Organizations]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_Organizations_parentCompanyId ON [re_members_ams].[Organizations] ([parentCompanyId]);

/* Index for Foreign Keys for Phones */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Phones
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------;

/* Index for Foreign Keys for RelationshipTypes */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Relationship Types
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------;

/* Index for Foreign Keys for States */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: States
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------;

/* Base View SQL for Organization Services */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Organization Services
-- Item: vwOrganizationServices
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      Organization Services
-----               SCHEMA:      re_members_ams
-----               BASE TABLE:  OrganizationServices
-----               PRIMARY KEY: code
------------------------------------------------------------
IF OBJECT_ID('[re_members_ams].[vwOrganizationServices]', 'V') IS NOT NULL
    DROP VIEW [re_members_ams].[vwOrganizationServices];
GO

CREATE VIEW [re_members_ams].[vwOrganizationServices]
AS
SELECT
    o.*
FROM
    [re_members_ams].[OrganizationServices] AS o
GO
GRANT SELECT ON [re_members_ams].[vwOrganizationServices] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* Base View Permissions SQL for Organization Services */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Organization Services
-- Item: Permissions for vwOrganizationServices
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [re_members_ams].[vwOrganizationServices] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* spCreate SQL for Organization Services */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Organization Services
-- Item: spCreateOrganizationServices
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR OrganizationServices
------------------------------------------------------------
IF OBJECT_ID('[re_members_ams].[spCreateOrganizationServices]', 'P') IS NOT NULL
    DROP PROCEDURE [re_members_ams].[spCreateOrganizationServices];
GO

CREATE PROCEDURE [re_members_ams].[spCreateOrganizationServices]
    @name_Clear bit = 0,
    @name nvarchar(255) = NULL,
    @code nvarchar(255) = NULL,
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
    [re_members_ams].[OrganizationServices]
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
    SELECT * FROM [re_members_ams].[vwOrganizationServices] WHERE [code] = @code
END
GO
GRANT EXECUTE ON [re_members_ams].[spCreateOrganizationServices] TO [cdp_Developer], [cdp_Integration];

/* spCreate Permissions for Organization Services */

GRANT EXECUTE ON [re_members_ams].[spCreateOrganizationServices] TO [cdp_Developer], [cdp_Integration];

/* spUpdate SQL for Organization Services */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Organization Services
-- Item: spUpdateOrganizationServices
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR OrganizationServices
------------------------------------------------------------
IF OBJECT_ID('[re_members_ams].[spUpdateOrganizationServices]', 'P') IS NOT NULL
    DROP PROCEDURE [re_members_ams].[spUpdateOrganizationServices];
GO

CREATE PROCEDURE [re_members_ams].[spUpdateOrganizationServices]
    @name_Clear bit = 0,
    @name nvarchar(255) = NULL,
    @code nvarchar(255),
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
        [re_members_ams].[OrganizationServices]
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
        SELECT TOP 0 * FROM [re_members_ams].[vwOrganizationServices] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [re_members_ams].[vwOrganizationServices]
                                    WHERE
                                        [code] = @code
                                    
END
GO

GRANT EXECUTE ON [re_members_ams].[spUpdateOrganizationServices] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the OrganizationServices table
------------------------------------------------------------
IF OBJECT_ID('[re_members_ams].[trgUpdateOrganizationServices]', 'TR') IS NOT NULL
    DROP TRIGGER [re_members_ams].[trgUpdateOrganizationServices];
GO
CREATE TRIGGER [re_members_ams].trgUpdateOrganizationServices
ON [re_members_ams].[OrganizationServices]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [re_members_ams].[OrganizationServices]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [re_members_ams].[OrganizationServices] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[code] = I.[code];
END;
GO

/* spUpdate Permissions for Organization Services */

GRANT EXECUTE ON [re_members_ams].[spUpdateOrganizationServices] TO [cdp_Developer], [cdp_Integration];

/* Root ID Function SQL for Organizations.parentCompanyId */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Organizations
-- Item: fnOrganizationsparentCompanyId_GetRootID
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
------------------------------------------------------------
----- ROOT ID FUNCTION FOR: [Organizations].[parentCompanyId]
------------------------------------------------------------
IF OBJECT_ID('[re_members_ams].[fnOrganizationsparentCompanyId_GetRootID]', 'IF') IS NOT NULL
    DROP FUNCTION [re_members_ams].[fnOrganizationsparentCompanyId_GetRootID];
GO

CREATE FUNCTION [re_members_ams].[fnOrganizationsparentCompanyId_GetRootID]
(
    @RecordID nvarchar(450),
    @ParentID nvarchar(450)
)
RETURNS TABLE
AS
RETURN
(
    WITH CTE_RootParent AS (
        SELECT
            [id],
            [parentCompanyId],
            [id] AS [RootParentID],
            0 AS [Depth]
        FROM
            [re_members_ams].[Organizations]
        WHERE
            [id] = COALESCE(@ParentID, @RecordID)

        UNION ALL

        SELECT
            c.[id],
            c.[parentCompanyId],
            c.[id] AS [RootParentID],
            p.[Depth] + 1 AS [Depth]
        FROM
            [re_members_ams].[Organizations] c
        INNER JOIN
            CTE_RootParent p ON c.[id] = p.[parentCompanyId]
        WHERE
            p.[Depth] < 100
    )
    SELECT TOP 1
        [RootParentID] AS RootID
    FROM
        CTE_RootParent
    WHERE
        [parentCompanyId] IS NULL
    ORDER BY
        [RootParentID]
);
GO

/* Base View SQL for Organizations */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Organizations
-- Item: vwOrganizations
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      Organizations
-----               SCHEMA:      re_members_ams
-----               BASE TABLE:  Organizations
-----               PRIMARY KEY: id
------------------------------------------------------------
IF OBJECT_ID('[re_members_ams].[vwOrganizations]', 'V') IS NOT NULL
    DROP VIEW [re_members_ams].[vwOrganizations];
GO

CREATE VIEW [re_members_ams].[vwOrganizations]
AS
SELECT
    o.*,
    root_parentCompanyId.RootID AS [RootparentCompanyId]
FROM
    [re_members_ams].[Organizations] AS o
OUTER APPLY
    [re_members_ams].[fnOrganizationsparentCompanyId_GetRootID]([o].[id], [o].[parentCompanyId]) AS root_parentCompanyId
GO
GRANT SELECT ON [re_members_ams].[vwOrganizations] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* Base View Permissions SQL for Organizations */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Organizations
-- Item: Permissions for vwOrganizations
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [re_members_ams].[vwOrganizations] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* spCreate SQL for Organizations */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Organizations
-- Item: spCreateOrganizations
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR Organizations
------------------------------------------------------------
IF OBJECT_ID('[re_members_ams].[spCreateOrganizations]', 'P') IS NOT NULL
    DROP PROCEDURE [re_members_ams].[spCreateOrganizations];
GO

CREATE PROCEDURE [re_members_ams].[spCreateOrganizations]
    @email_Clear bit = 0,
    @email nvarchar(812) = NULL,
    @mj_e2e_custom_attr_Clear bit = 0,
    @mj_e2e_custom_attr nvarchar(812) = NULL,
    @recordNumber_Clear bit = 0,
    @recordNumber nvarchar(812) = NULL,
    @title_Clear bit = 0,
    @title nvarchar(812) = NULL,
    @customFields_Clear bit = 0,
    @customFields nvarchar(MAX) = NULL,
    @addresses_Clear bit = 0,
    @addresses nvarchar(MAX) = NULL,
    @id nvarchar(450) = NULL,
    @customerType_Clear bit = 0,
    @customerType nvarchar(812) = NULL,
    @categories_Clear bit = 0,
    @categories nvarchar(MAX) = NULL,
    @links_Clear bit = 0,
    @links nvarchar(MAX) = NULL,
    @linkedIn_Clear bit = 0,
    @linkedIn nvarchar(812) = NULL,
    @showInDirectory_Clear bit = 0,
    @showInDirectory nvarchar(MAX) = NULL,
    @tags_Clear bit = 0,
    @tags nvarchar(MAX) = NULL,
    @emails_Clear bit = 0,
    @emails nvarchar(MAX) = NULL,
    @twitter_Clear bit = 0,
    @twitter nvarchar(812) = NULL,
    @imageUri_Clear bit = 0,
    @imageUri nvarchar(812) = NULL,
    @description_Clear bit = 0,
    @description nvarchar(812) = NULL,
    @phones_Clear bit = 0,
    @phones nvarchar(MAX) = NULL,
    @category_Clear bit = 0,
    @category nvarchar(812) = NULL,
    @name_Clear bit = 0,
    @name nvarchar(812) = NULL,
    @parentCompanyId_Clear bit = 0,
    @parentCompanyId nvarchar(812) = NULL,
    @oldId_Clear bit = 0,
    @oldId nvarchar(812) = NULL,
    @memberships_Clear bit = 0,
    @memberships nvarchar(MAX) = NULL,
    @webSite_Clear bit = 0,
    @webSite nvarchar(812) = NULL,
    @branchName_Clear bit = 0,
    @branchName nvarchar(812) = NULL,
    @contactIds_Clear bit = 0,
    @contactIds nvarchar(MAX) = NULL,
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
    [re_members_ams].[Organizations]
        (
            [email],
                [mj_e2e_custom_attr],
                [recordNumber],
                [title],
                [customFields],
                [addresses],
                [customerType],
                [categories],
                [links],
                [linkedIn],
                [showInDirectory],
                [tags],
                [emails],
                [twitter],
                [imageUri],
                [description],
                [phones],
                [category],
                [name],
                [parentCompanyId],
                [oldId],
                [memberships],
                [webSite],
                [branchName],
                [contactIds],
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
            CASE WHEN @email_Clear = 1 THEN NULL ELSE ISNULL(@email, NULL) END,
                CASE WHEN @mj_e2e_custom_attr_Clear = 1 THEN NULL ELSE ISNULL(@mj_e2e_custom_attr, NULL) END,
                CASE WHEN @recordNumber_Clear = 1 THEN NULL ELSE ISNULL(@recordNumber, NULL) END,
                CASE WHEN @title_Clear = 1 THEN NULL ELSE ISNULL(@title, NULL) END,
                CASE WHEN @customFields_Clear = 1 THEN NULL ELSE ISNULL(@customFields, NULL) END,
                CASE WHEN @addresses_Clear = 1 THEN NULL ELSE ISNULL(@addresses, NULL) END,
                CASE WHEN @customerType_Clear = 1 THEN NULL ELSE ISNULL(@customerType, NULL) END,
                CASE WHEN @categories_Clear = 1 THEN NULL ELSE ISNULL(@categories, NULL) END,
                CASE WHEN @links_Clear = 1 THEN NULL ELSE ISNULL(@links, NULL) END,
                CASE WHEN @linkedIn_Clear = 1 THEN NULL ELSE ISNULL(@linkedIn, NULL) END,
                CASE WHEN @showInDirectory_Clear = 1 THEN NULL ELSE ISNULL(@showInDirectory, NULL) END,
                CASE WHEN @tags_Clear = 1 THEN NULL ELSE ISNULL(@tags, NULL) END,
                CASE WHEN @emails_Clear = 1 THEN NULL ELSE ISNULL(@emails, NULL) END,
                CASE WHEN @twitter_Clear = 1 THEN NULL ELSE ISNULL(@twitter, NULL) END,
                CASE WHEN @imageUri_Clear = 1 THEN NULL ELSE ISNULL(@imageUri, NULL) END,
                CASE WHEN @description_Clear = 1 THEN NULL ELSE ISNULL(@description, NULL) END,
                CASE WHEN @phones_Clear = 1 THEN NULL ELSE ISNULL(@phones, NULL) END,
                CASE WHEN @category_Clear = 1 THEN NULL ELSE ISNULL(@category, NULL) END,
                CASE WHEN @name_Clear = 1 THEN NULL ELSE ISNULL(@name, NULL) END,
                CASE WHEN @parentCompanyId_Clear = 1 THEN NULL ELSE ISNULL(@parentCompanyId, NULL) END,
                CASE WHEN @oldId_Clear = 1 THEN NULL ELSE ISNULL(@oldId, NULL) END,
                CASE WHEN @memberships_Clear = 1 THEN NULL ELSE ISNULL(@memberships, NULL) END,
                CASE WHEN @webSite_Clear = 1 THEN NULL ELSE ISNULL(@webSite, NULL) END,
                CASE WHEN @branchName_Clear = 1 THEN NULL ELSE ISNULL(@branchName, NULL) END,
                CASE WHEN @contactIds_Clear = 1 THEN NULL ELSE ISNULL(@contactIds, NULL) END,
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
    SELECT * FROM [re_members_ams].[vwOrganizations] WHERE [id] = @id
END
GO
GRANT EXECUTE ON [re_members_ams].[spCreateOrganizations] TO [cdp_Developer], [cdp_Integration];

/* spCreate Permissions for Organizations */

GRANT EXECUTE ON [re_members_ams].[spCreateOrganizations] TO [cdp_Developer], [cdp_Integration];

/* spUpdate SQL for Organizations */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Organizations
-- Item: spUpdateOrganizations
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR Organizations
------------------------------------------------------------
IF OBJECT_ID('[re_members_ams].[spUpdateOrganizations]', 'P') IS NOT NULL
    DROP PROCEDURE [re_members_ams].[spUpdateOrganizations];
GO

CREATE PROCEDURE [re_members_ams].[spUpdateOrganizations]
    @email_Clear bit = 0,
    @email nvarchar(812) = NULL,
    @mj_e2e_custom_attr_Clear bit = 0,
    @mj_e2e_custom_attr nvarchar(812) = NULL,
    @recordNumber_Clear bit = 0,
    @recordNumber nvarchar(812) = NULL,
    @title_Clear bit = 0,
    @title nvarchar(812) = NULL,
    @customFields_Clear bit = 0,
    @customFields nvarchar(MAX) = NULL,
    @addresses_Clear bit = 0,
    @addresses nvarchar(MAX) = NULL,
    @id nvarchar(450),
    @customerType_Clear bit = 0,
    @customerType nvarchar(812) = NULL,
    @categories_Clear bit = 0,
    @categories nvarchar(MAX) = NULL,
    @links_Clear bit = 0,
    @links nvarchar(MAX) = NULL,
    @linkedIn_Clear bit = 0,
    @linkedIn nvarchar(812) = NULL,
    @showInDirectory_Clear bit = 0,
    @showInDirectory nvarchar(MAX) = NULL,
    @tags_Clear bit = 0,
    @tags nvarchar(MAX) = NULL,
    @emails_Clear bit = 0,
    @emails nvarchar(MAX) = NULL,
    @twitter_Clear bit = 0,
    @twitter nvarchar(812) = NULL,
    @imageUri_Clear bit = 0,
    @imageUri nvarchar(812) = NULL,
    @description_Clear bit = 0,
    @description nvarchar(812) = NULL,
    @phones_Clear bit = 0,
    @phones nvarchar(MAX) = NULL,
    @category_Clear bit = 0,
    @category nvarchar(812) = NULL,
    @name_Clear bit = 0,
    @name nvarchar(812) = NULL,
    @parentCompanyId_Clear bit = 0,
    @parentCompanyId nvarchar(812) = NULL,
    @oldId_Clear bit = 0,
    @oldId nvarchar(812) = NULL,
    @memberships_Clear bit = 0,
    @memberships nvarchar(MAX) = NULL,
    @webSite_Clear bit = 0,
    @webSite nvarchar(812) = NULL,
    @branchName_Clear bit = 0,
    @branchName nvarchar(812) = NULL,
    @contactIds_Clear bit = 0,
    @contactIds nvarchar(MAX) = NULL,
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
        [re_members_ams].[Organizations]
    SET
        [email] = CASE WHEN @email_Clear = 1 THEN NULL ELSE ISNULL(@email, [email]) END,
        [mj_e2e_custom_attr] = CASE WHEN @mj_e2e_custom_attr_Clear = 1 THEN NULL ELSE ISNULL(@mj_e2e_custom_attr, [mj_e2e_custom_attr]) END,
        [recordNumber] = CASE WHEN @recordNumber_Clear = 1 THEN NULL ELSE ISNULL(@recordNumber, [recordNumber]) END,
        [title] = CASE WHEN @title_Clear = 1 THEN NULL ELSE ISNULL(@title, [title]) END,
        [customFields] = CASE WHEN @customFields_Clear = 1 THEN NULL ELSE ISNULL(@customFields, [customFields]) END,
        [addresses] = CASE WHEN @addresses_Clear = 1 THEN NULL ELSE ISNULL(@addresses, [addresses]) END,
        [customerType] = CASE WHEN @customerType_Clear = 1 THEN NULL ELSE ISNULL(@customerType, [customerType]) END,
        [categories] = CASE WHEN @categories_Clear = 1 THEN NULL ELSE ISNULL(@categories, [categories]) END,
        [links] = CASE WHEN @links_Clear = 1 THEN NULL ELSE ISNULL(@links, [links]) END,
        [linkedIn] = CASE WHEN @linkedIn_Clear = 1 THEN NULL ELSE ISNULL(@linkedIn, [linkedIn]) END,
        [showInDirectory] = CASE WHEN @showInDirectory_Clear = 1 THEN NULL ELSE ISNULL(@showInDirectory, [showInDirectory]) END,
        [tags] = CASE WHEN @tags_Clear = 1 THEN NULL ELSE ISNULL(@tags, [tags]) END,
        [emails] = CASE WHEN @emails_Clear = 1 THEN NULL ELSE ISNULL(@emails, [emails]) END,
        [twitter] = CASE WHEN @twitter_Clear = 1 THEN NULL ELSE ISNULL(@twitter, [twitter]) END,
        [imageUri] = CASE WHEN @imageUri_Clear = 1 THEN NULL ELSE ISNULL(@imageUri, [imageUri]) END,
        [description] = CASE WHEN @description_Clear = 1 THEN NULL ELSE ISNULL(@description, [description]) END,
        [phones] = CASE WHEN @phones_Clear = 1 THEN NULL ELSE ISNULL(@phones, [phones]) END,
        [category] = CASE WHEN @category_Clear = 1 THEN NULL ELSE ISNULL(@category, [category]) END,
        [name] = CASE WHEN @name_Clear = 1 THEN NULL ELSE ISNULL(@name, [name]) END,
        [parentCompanyId] = CASE WHEN @parentCompanyId_Clear = 1 THEN NULL ELSE ISNULL(@parentCompanyId, [parentCompanyId]) END,
        [oldId] = CASE WHEN @oldId_Clear = 1 THEN NULL ELSE ISNULL(@oldId, [oldId]) END,
        [memberships] = CASE WHEN @memberships_Clear = 1 THEN NULL ELSE ISNULL(@memberships, [memberships]) END,
        [webSite] = CASE WHEN @webSite_Clear = 1 THEN NULL ELSE ISNULL(@webSite, [webSite]) END,
        [branchName] = CASE WHEN @branchName_Clear = 1 THEN NULL ELSE ISNULL(@branchName, [branchName]) END,
        [contactIds] = CASE WHEN @contactIds_Clear = 1 THEN NULL ELSE ISNULL(@contactIds, [contactIds]) END,
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
        SELECT TOP 0 * FROM [re_members_ams].[vwOrganizations] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [re_members_ams].[vwOrganizations]
                                    WHERE
                                        [id] = @id
                                    
END
GO

GRANT EXECUTE ON [re_members_ams].[spUpdateOrganizations] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the Organizations table
------------------------------------------------------------
IF OBJECT_ID('[re_members_ams].[trgUpdateOrganizations]', 'TR') IS NOT NULL
    DROP TRIGGER [re_members_ams].[trgUpdateOrganizations];
GO
CREATE TRIGGER [re_members_ams].trgUpdateOrganizations
ON [re_members_ams].[Organizations]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [re_members_ams].[Organizations]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [re_members_ams].[Organizations] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[id] = I.[id];
END;
GO

/* spUpdate Permissions for Organizations */

GRANT EXECUTE ON [re_members_ams].[spUpdateOrganizations] TO [cdp_Developer], [cdp_Integration];

/* Base View SQL for Phones */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Phones
-- Item: vwPhones
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      Phones
-----               SCHEMA:      re_members_ams
-----               BASE TABLE:  Phones
-----               PRIMARY KEY: id
------------------------------------------------------------
IF OBJECT_ID('[re_members_ams].[vwPhones]', 'V') IS NOT NULL
    DROP VIEW [re_members_ams].[vwPhones];
GO

CREATE VIEW [re_members_ams].[vwPhones]
AS
SELECT
    p.*
FROM
    [re_members_ams].[Phones] AS p
GO
GRANT SELECT ON [re_members_ams].[vwPhones] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* Base View Permissions SQL for Phones */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Phones
-- Item: Permissions for vwPhones
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [re_members_ams].[vwPhones] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* spCreate SQL for Phones */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Phones
-- Item: spCreatePhones
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR Phones
------------------------------------------------------------
IF OBJECT_ID('[re_members_ams].[spCreatePhones]', 'P') IS NOT NULL
    DROP PROCEDURE [re_members_ams].[spCreatePhones];
GO

CREATE PROCEDURE [re_members_ams].[spCreatePhones]
    @country_Clear bit = 0,
    @country nvarchar(MAX) = NULL,
    @countryName_Clear bit = 0,
    @countryName nvarchar(255) = NULL,
    @typeName_Clear bit = 0,
    @typeName nvarchar(320) = NULL,
    @primary_Clear bit = 0,
    @primary nvarchar(255) = NULL,
    @showInDirectory_Clear bit = 0,
    @showInDirectory nvarchar(255) = NULL,
    @extension_Clear bit = 0,
    @extension nvarchar(320) = NULL,
    @number_Clear bit = 0,
    @number nvarchar(350) = NULL,
    @id nvarchar(255) = NULL,
    @type_Clear bit = 0,
    @type nvarchar(255) = NULL,
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
    [re_members_ams].[Phones]
        (
            [country],
                [countryName],
                [typeName],
                [primary],
                [showInDirectory],
                [extension],
                [number],
                [type],
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
            CASE WHEN @country_Clear = 1 THEN NULL ELSE ISNULL(@country, NULL) END,
                CASE WHEN @countryName_Clear = 1 THEN NULL ELSE ISNULL(@countryName, NULL) END,
                CASE WHEN @typeName_Clear = 1 THEN NULL ELSE ISNULL(@typeName, NULL) END,
                CASE WHEN @primary_Clear = 1 THEN NULL ELSE ISNULL(@primary, NULL) END,
                CASE WHEN @showInDirectory_Clear = 1 THEN NULL ELSE ISNULL(@showInDirectory, NULL) END,
                CASE WHEN @extension_Clear = 1 THEN NULL ELSE ISNULL(@extension, NULL) END,
                CASE WHEN @number_Clear = 1 THEN NULL ELSE ISNULL(@number, NULL) END,
                CASE WHEN @type_Clear = 1 THEN NULL ELSE ISNULL(@type, NULL) END,
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
    SELECT * FROM [re_members_ams].[vwPhones] WHERE [id] = @id
END
GO
GRANT EXECUTE ON [re_members_ams].[spCreatePhones] TO [cdp_Developer], [cdp_Integration];

/* spCreate Permissions for Phones */

GRANT EXECUTE ON [re_members_ams].[spCreatePhones] TO [cdp_Developer], [cdp_Integration];

/* spUpdate SQL for Phones */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Phones
-- Item: spUpdatePhones
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR Phones
------------------------------------------------------------
IF OBJECT_ID('[re_members_ams].[spUpdatePhones]', 'P') IS NOT NULL
    DROP PROCEDURE [re_members_ams].[spUpdatePhones];
GO

CREATE PROCEDURE [re_members_ams].[spUpdatePhones]
    @country_Clear bit = 0,
    @country nvarchar(MAX) = NULL,
    @countryName_Clear bit = 0,
    @countryName nvarchar(255) = NULL,
    @typeName_Clear bit = 0,
    @typeName nvarchar(320) = NULL,
    @primary_Clear bit = 0,
    @primary nvarchar(255) = NULL,
    @showInDirectory_Clear bit = 0,
    @showInDirectory nvarchar(255) = NULL,
    @extension_Clear bit = 0,
    @extension nvarchar(320) = NULL,
    @number_Clear bit = 0,
    @number nvarchar(350) = NULL,
    @id nvarchar(255),
    @type_Clear bit = 0,
    @type nvarchar(255) = NULL,
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
        [re_members_ams].[Phones]
    SET
        [country] = CASE WHEN @country_Clear = 1 THEN NULL ELSE ISNULL(@country, [country]) END,
        [countryName] = CASE WHEN @countryName_Clear = 1 THEN NULL ELSE ISNULL(@countryName, [countryName]) END,
        [typeName] = CASE WHEN @typeName_Clear = 1 THEN NULL ELSE ISNULL(@typeName, [typeName]) END,
        [primary] = CASE WHEN @primary_Clear = 1 THEN NULL ELSE ISNULL(@primary, [primary]) END,
        [showInDirectory] = CASE WHEN @showInDirectory_Clear = 1 THEN NULL ELSE ISNULL(@showInDirectory, [showInDirectory]) END,
        [extension] = CASE WHEN @extension_Clear = 1 THEN NULL ELSE ISNULL(@extension, [extension]) END,
        [number] = CASE WHEN @number_Clear = 1 THEN NULL ELSE ISNULL(@number, [number]) END,
        [type] = CASE WHEN @type_Clear = 1 THEN NULL ELSE ISNULL(@type, [type]) END,
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
        SELECT TOP 0 * FROM [re_members_ams].[vwPhones] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [re_members_ams].[vwPhones]
                                    WHERE
                                        [id] = @id
                                    
END
GO

GRANT EXECUTE ON [re_members_ams].[spUpdatePhones] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the Phones table
------------------------------------------------------------
IF OBJECT_ID('[re_members_ams].[trgUpdatePhones]', 'TR') IS NOT NULL
    DROP TRIGGER [re_members_ams].[trgUpdatePhones];
GO
CREATE TRIGGER [re_members_ams].trgUpdatePhones
ON [re_members_ams].[Phones]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [re_members_ams].[Phones]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [re_members_ams].[Phones] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[id] = I.[id];
END;
GO

/* spUpdate Permissions for Phones */

GRANT EXECUTE ON [re_members_ams].[spUpdatePhones] TO [cdp_Developer], [cdp_Integration];

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
-----               SCHEMA:      re_members_ams
-----               BASE TABLE:  RelationshipTypes
-----               PRIMARY KEY: name
------------------------------------------------------------
IF OBJECT_ID('[re_members_ams].[vwRelationshipTypes]', 'V') IS NOT NULL
    DROP VIEW [re_members_ams].[vwRelationshipTypes];
GO

CREATE VIEW [re_members_ams].[vwRelationshipTypes]
AS
SELECT
    r.*
FROM
    [re_members_ams].[RelationshipTypes] AS r
GO
GRANT SELECT ON [re_members_ams].[vwRelationshipTypes] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* Base View Permissions SQL for Relationship Types */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Relationship Types
-- Item: Permissions for vwRelationshipTypes
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [re_members_ams].[vwRelationshipTypes] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* spCreate SQL for Relationship Types */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Relationship Types
-- Item: spCreateRelationshipTypes
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR RelationshipTypes
------------------------------------------------------------
IF OBJECT_ID('[re_members_ams].[spCreateRelationshipTypes]', 'P') IS NOT NULL
    DROP PROCEDURE [re_members_ams].[spCreateRelationshipTypes];
GO

CREATE PROCEDURE [re_members_ams].[spCreateRelationshipTypes]
    @relationshipType_Clear bit = 0,
    @relationshipType nvarchar(812) = NULL,
    @name nvarchar(450) = NULL,
    @reciprocalRelationshipName_Clear bit = 0,
    @reciprocalRelationshipName nvarchar(812) = NULL,
    @canPurchaseForOrganization_Clear bit = 0,
    @canPurchaseForOrganization nvarchar(MAX) = NULL,
    @canManagePAC_Clear bit = 0,
    @canManagePAC nvarchar(MAX) = NULL,
    @mj_e2e_custom_attr_Clear bit = 0,
    @mj_e2e_custom_attr nvarchar(812) = NULL,
    @allowPrimary_Clear bit = 0,
    @allowPrimary nvarchar(MAX) = NULL,
    @canManageOrganization_Clear bit = 0,
    @canManageOrganization nvarchar(MAX) = NULL,
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
    [re_members_ams].[RelationshipTypes]
        (
            [relationshipType],
                [reciprocalRelationshipName],
                [canPurchaseForOrganization],
                [canManagePAC],
                [mj_e2e_custom_attr],
                [allowPrimary],
                [canManageOrganization],
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
                [name]
        )
    VALUES
        (
            CASE WHEN @relationshipType_Clear = 1 THEN NULL ELSE ISNULL(@relationshipType, NULL) END,
                CASE WHEN @reciprocalRelationshipName_Clear = 1 THEN NULL ELSE ISNULL(@reciprocalRelationshipName, NULL) END,
                CASE WHEN @canPurchaseForOrganization_Clear = 1 THEN NULL ELSE ISNULL(@canPurchaseForOrganization, NULL) END,
                CASE WHEN @canManagePAC_Clear = 1 THEN NULL ELSE ISNULL(@canManagePAC, NULL) END,
                CASE WHEN @mj_e2e_custom_attr_Clear = 1 THEN NULL ELSE ISNULL(@mj_e2e_custom_attr, NULL) END,
                CASE WHEN @allowPrimary_Clear = 1 THEN NULL ELSE ISNULL(@allowPrimary, NULL) END,
                CASE WHEN @canManageOrganization_Clear = 1 THEN NULL ELSE ISNULL(@canManageOrganization, NULL) END,
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
                @name
        )
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [re_members_ams].[vwRelationshipTypes] WHERE [name] = @name
END
GO
GRANT EXECUTE ON [re_members_ams].[spCreateRelationshipTypes] TO [cdp_Developer], [cdp_Integration];

/* spCreate Permissions for Relationship Types */

GRANT EXECUTE ON [re_members_ams].[spCreateRelationshipTypes] TO [cdp_Developer], [cdp_Integration];

/* spUpdate SQL for Relationship Types */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Relationship Types
-- Item: spUpdateRelationshipTypes
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR RelationshipTypes
------------------------------------------------------------
IF OBJECT_ID('[re_members_ams].[spUpdateRelationshipTypes]', 'P') IS NOT NULL
    DROP PROCEDURE [re_members_ams].[spUpdateRelationshipTypes];
GO

CREATE PROCEDURE [re_members_ams].[spUpdateRelationshipTypes]
    @relationshipType_Clear bit = 0,
    @relationshipType nvarchar(812) = NULL,
    @name nvarchar(450),
    @reciprocalRelationshipName_Clear bit = 0,
    @reciprocalRelationshipName nvarchar(812) = NULL,
    @canPurchaseForOrganization_Clear bit = 0,
    @canPurchaseForOrganization nvarchar(MAX) = NULL,
    @canManagePAC_Clear bit = 0,
    @canManagePAC nvarchar(MAX) = NULL,
    @mj_e2e_custom_attr_Clear bit = 0,
    @mj_e2e_custom_attr nvarchar(812) = NULL,
    @allowPrimary_Clear bit = 0,
    @allowPrimary nvarchar(MAX) = NULL,
    @canManageOrganization_Clear bit = 0,
    @canManageOrganization nvarchar(MAX) = NULL,
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
        [re_members_ams].[RelationshipTypes]
    SET
        [relationshipType] = CASE WHEN @relationshipType_Clear = 1 THEN NULL ELSE ISNULL(@relationshipType, [relationshipType]) END,
        [reciprocalRelationshipName] = CASE WHEN @reciprocalRelationshipName_Clear = 1 THEN NULL ELSE ISNULL(@reciprocalRelationshipName, [reciprocalRelationshipName]) END,
        [canPurchaseForOrganization] = CASE WHEN @canPurchaseForOrganization_Clear = 1 THEN NULL ELSE ISNULL(@canPurchaseForOrganization, [canPurchaseForOrganization]) END,
        [canManagePAC] = CASE WHEN @canManagePAC_Clear = 1 THEN NULL ELSE ISNULL(@canManagePAC, [canManagePAC]) END,
        [mj_e2e_custom_attr] = CASE WHEN @mj_e2e_custom_attr_Clear = 1 THEN NULL ELSE ISNULL(@mj_e2e_custom_attr, [mj_e2e_custom_attr]) END,
        [allowPrimary] = CASE WHEN @allowPrimary_Clear = 1 THEN NULL ELSE ISNULL(@allowPrimary, [allowPrimary]) END,
        [canManageOrganization] = CASE WHEN @canManageOrganization_Clear = 1 THEN NULL ELSE ISNULL(@canManageOrganization, [canManageOrganization]) END,
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
        [name] = @name

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [re_members_ams].[vwRelationshipTypes] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [re_members_ams].[vwRelationshipTypes]
                                    WHERE
                                        [name] = @name
                                    
END
GO

GRANT EXECUTE ON [re_members_ams].[spUpdateRelationshipTypes] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the RelationshipTypes table
------------------------------------------------------------
IF OBJECT_ID('[re_members_ams].[trgUpdateRelationshipTypes]', 'TR') IS NOT NULL
    DROP TRIGGER [re_members_ams].[trgUpdateRelationshipTypes];
GO
CREATE TRIGGER [re_members_ams].trgUpdateRelationshipTypes
ON [re_members_ams].[RelationshipTypes]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [re_members_ams].[RelationshipTypes]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [re_members_ams].[RelationshipTypes] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[name] = I.[name];
END;
GO

/* spUpdate Permissions for Relationship Types */

GRANT EXECUTE ON [re_members_ams].[spUpdateRelationshipTypes] TO [cdp_Developer], [cdp_Integration];

/* Base View SQL for States */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: States
-- Item: vwStates
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      States
-----               SCHEMA:      re_members_ams
-----               BASE TABLE:  States
-----               PRIMARY KEY: id
------------------------------------------------------------
IF OBJECT_ID('[re_members_ams].[vwStates]', 'V') IS NOT NULL
    DROP VIEW [re_members_ams].[vwStates];
GO

CREATE VIEW [re_members_ams].[vwStates]
AS
SELECT
    s.*
FROM
    [re_members_ams].[States] AS s
GO
GRANT SELECT ON [re_members_ams].[vwStates] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* Base View Permissions SQL for States */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: States
-- Item: Permissions for vwStates
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [re_members_ams].[vwStates] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* spCreate SQL for States */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: States
-- Item: spCreateStates
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR States
------------------------------------------------------------
IF OBJECT_ID('[re_members_ams].[spCreateStates]', 'P') IS NOT NULL
    DROP PROCEDURE [re_members_ams].[spCreateStates];
GO

CREATE PROCEDURE [re_members_ams].[spCreateStates]
    @name_Clear bit = 0,
    @name nvarchar(255) = NULL,
    @abbreviation_Clear bit = 0,
    @abbreviation nvarchar(255) = NULL,
    @isoCode_Clear bit = 0,
    @isoCode nvarchar(255) = NULL,
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
    [re_members_ams].[States]
        (
            [name],
                [abbreviation],
                [isoCode],
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
            CASE WHEN @name_Clear = 1 THEN NULL ELSE ISNULL(@name, NULL) END,
                CASE WHEN @abbreviation_Clear = 1 THEN NULL ELSE ISNULL(@abbreviation, NULL) END,
                CASE WHEN @isoCode_Clear = 1 THEN NULL ELSE ISNULL(@isoCode, NULL) END,
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
    SELECT * FROM [re_members_ams].[vwStates] WHERE [id] = @id
END
GO
GRANT EXECUTE ON [re_members_ams].[spCreateStates] TO [cdp_Developer], [cdp_Integration];

/* spCreate Permissions for States */

GRANT EXECUTE ON [re_members_ams].[spCreateStates] TO [cdp_Developer], [cdp_Integration];

/* spUpdate SQL for States */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: States
-- Item: spUpdateStates
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR States
------------------------------------------------------------
IF OBJECT_ID('[re_members_ams].[spUpdateStates]', 'P') IS NOT NULL
    DROP PROCEDURE [re_members_ams].[spUpdateStates];
GO

CREATE PROCEDURE [re_members_ams].[spUpdateStates]
    @name_Clear bit = 0,
    @name nvarchar(255) = NULL,
    @abbreviation_Clear bit = 0,
    @abbreviation nvarchar(255) = NULL,
    @isoCode_Clear bit = 0,
    @isoCode nvarchar(255) = NULL,
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
        [re_members_ams].[States]
    SET
        [name] = CASE WHEN @name_Clear = 1 THEN NULL ELSE ISNULL(@name, [name]) END,
        [abbreviation] = CASE WHEN @abbreviation_Clear = 1 THEN NULL ELSE ISNULL(@abbreviation, [abbreviation]) END,
        [isoCode] = CASE WHEN @isoCode_Clear = 1 THEN NULL ELSE ISNULL(@isoCode, [isoCode]) END,
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
        SELECT TOP 0 * FROM [re_members_ams].[vwStates] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [re_members_ams].[vwStates]
                                    WHERE
                                        [id] = @id
                                    
END
GO

GRANT EXECUTE ON [re_members_ams].[spUpdateStates] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the States table
------------------------------------------------------------
IF OBJECT_ID('[re_members_ams].[trgUpdateStates]', 'TR') IS NOT NULL
    DROP TRIGGER [re_members_ams].[trgUpdateStates];
GO
CREATE TRIGGER [re_members_ams].trgUpdateStates
ON [re_members_ams].[States]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [re_members_ams].[States]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [re_members_ams].[States] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[id] = I.[id];
END;
GO

/* spUpdate Permissions for States */

GRANT EXECUTE ON [re_members_ams].[spUpdateStates] TO [cdp_Developer], [cdp_Integration];

/* spDelete SQL for Organization Services */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Organization Services
-- Item: spDeleteOrganizationServices
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR OrganizationServices
------------------------------------------------------------
IF OBJECT_ID('[re_members_ams].[spDeleteOrganizationServices]', 'P') IS NOT NULL
    DROP PROCEDURE [re_members_ams].[spDeleteOrganizationServices];
GO

CREATE PROCEDURE [re_members_ams].[spDeleteOrganizationServices]
    @code nvarchar(255)
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [re_members_ams].[OrganizationServices]
    WHERE
        [code] = @code


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [code] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @code AS [code] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [re_members_ams].[spDeleteOrganizationServices] TO [cdp_Developer], [cdp_Integration];

/* spDelete Permissions for Organization Services */

GRANT EXECUTE ON [re_members_ams].[spDeleteOrganizationServices] TO [cdp_Developer], [cdp_Integration];

/* spDelete SQL for Organizations */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Organizations
-- Item: spDeleteOrganizations
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR Organizations
------------------------------------------------------------
IF OBJECT_ID('[re_members_ams].[spDeleteOrganizations]', 'P') IS NOT NULL
    DROP PROCEDURE [re_members_ams].[spDeleteOrganizations];
GO

CREATE PROCEDURE [re_members_ams].[spDeleteOrganizations]
    @id nvarchar(450)
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [re_members_ams].[Organizations]
    WHERE
        [id] = @id


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [id] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @id AS [id] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [re_members_ams].[spDeleteOrganizations] TO [cdp_Developer], [cdp_Integration];

/* spDelete Permissions for Organizations */

GRANT EXECUTE ON [re_members_ams].[spDeleteOrganizations] TO [cdp_Developer], [cdp_Integration];

/* spDelete SQL for Phones */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Phones
-- Item: spDeletePhones
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR Phones
------------------------------------------------------------
IF OBJECT_ID('[re_members_ams].[spDeletePhones]', 'P') IS NOT NULL
    DROP PROCEDURE [re_members_ams].[spDeletePhones];
GO

CREATE PROCEDURE [re_members_ams].[spDeletePhones]
    @id nvarchar(255)
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [re_members_ams].[Phones]
    WHERE
        [id] = @id


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [id] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @id AS [id] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [re_members_ams].[spDeletePhones] TO [cdp_Developer], [cdp_Integration];

/* spDelete Permissions for Phones */

GRANT EXECUTE ON [re_members_ams].[spDeletePhones] TO [cdp_Developer], [cdp_Integration];

/* spDelete SQL for Relationship Types */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Relationship Types
-- Item: spDeleteRelationshipTypes
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR RelationshipTypes
------------------------------------------------------------
IF OBJECT_ID('[re_members_ams].[spDeleteRelationshipTypes]', 'P') IS NOT NULL
    DROP PROCEDURE [re_members_ams].[spDeleteRelationshipTypes];
GO

CREATE PROCEDURE [re_members_ams].[spDeleteRelationshipTypes]
    @name nvarchar(450)
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [re_members_ams].[RelationshipTypes]
    WHERE
        [name] = @name


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [name] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @name AS [name] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [re_members_ams].[spDeleteRelationshipTypes] TO [cdp_Developer], [cdp_Integration];

/* spDelete Permissions for Relationship Types */

GRANT EXECUTE ON [re_members_ams].[spDeleteRelationshipTypes] TO [cdp_Developer], [cdp_Integration];

/* spDelete SQL for States */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: States
-- Item: spDeleteStates
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR States
------------------------------------------------------------
IF OBJECT_ID('[re_members_ams].[spDeleteStates]', 'P') IS NOT NULL
    DROP PROCEDURE [re_members_ams].[spDeleteStates];
GO

CREATE PROCEDURE [re_members_ams].[spDeleteStates]
    @id nvarchar(255)
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [re_members_ams].[States]
    WHERE
        [id] = @id


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [id] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @id AS [id] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [re_members_ams].[spDeleteStates] TO [cdp_Developer], [cdp_Integration];

/* spDelete Permissions for States */

GRANT EXECUTE ON [re_members_ams].[spDeleteStates] TO [cdp_Developer], [cdp_Integration];

/* Index for Foreign Keys for Subscriptions */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Subscriptions
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------;

/* Index for Foreign Keys for Tasks */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Tasks
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------;

/* Index for Foreign Keys for UserTasks */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: User Tasks
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------;

/* Base View SQL for Subscriptions */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Subscriptions
-- Item: vwSubscriptions
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      Subscriptions
-----               SCHEMA:      re_members_ams
-----               BASE TABLE:  Subscriptions
-----               PRIMARY KEY: code
------------------------------------------------------------
IF OBJECT_ID('[re_members_ams].[vwSubscriptions]', 'V') IS NOT NULL
    DROP VIEW [re_members_ams].[vwSubscriptions];
GO

CREATE VIEW [re_members_ams].[vwSubscriptions]
AS
SELECT
    s.*
FROM
    [re_members_ams].[Subscriptions] AS s
GO
GRANT SELECT ON [re_members_ams].[vwSubscriptions] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* Base View Permissions SQL for Subscriptions */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Subscriptions
-- Item: Permissions for vwSubscriptions
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [re_members_ams].[vwSubscriptions] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* spCreate SQL for Subscriptions */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Subscriptions
-- Item: spCreateSubscriptions
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR Subscriptions
------------------------------------------------------------
IF OBJECT_ID('[re_members_ams].[spCreateSubscriptions]', 'P') IS NOT NULL
    DROP PROCEDURE [re_members_ams].[spCreateSubscriptions];
GO

CREATE PROCEDURE [re_members_ams].[spCreateSubscriptions]
    @name_Clear bit = 0,
    @name nvarchar(255) = NULL,
    @quantity_Clear bit = 0,
    @quantity nvarchar(255) = NULL,
    @code nvarchar(255) = NULL,
    @expireDate_Clear bit = 0,
    @expireDate nvarchar(255) = NULL,
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
    [re_members_ams].[Subscriptions]
        (
            [name],
                [quantity],
                [expireDate],
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
                CASE WHEN @quantity_Clear = 1 THEN NULL ELSE ISNULL(@quantity, NULL) END,
                CASE WHEN @expireDate_Clear = 1 THEN NULL ELSE ISNULL(@expireDate, NULL) END,
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
    SELECT * FROM [re_members_ams].[vwSubscriptions] WHERE [code] = @code
END
GO
GRANT EXECUTE ON [re_members_ams].[spCreateSubscriptions] TO [cdp_Developer], [cdp_Integration];

/* spCreate Permissions for Subscriptions */

GRANT EXECUTE ON [re_members_ams].[spCreateSubscriptions] TO [cdp_Developer], [cdp_Integration];

/* spUpdate SQL for Subscriptions */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Subscriptions
-- Item: spUpdateSubscriptions
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR Subscriptions
------------------------------------------------------------
IF OBJECT_ID('[re_members_ams].[spUpdateSubscriptions]', 'P') IS NOT NULL
    DROP PROCEDURE [re_members_ams].[spUpdateSubscriptions];
GO

CREATE PROCEDURE [re_members_ams].[spUpdateSubscriptions]
    @name_Clear bit = 0,
    @name nvarchar(255) = NULL,
    @quantity_Clear bit = 0,
    @quantity nvarchar(255) = NULL,
    @code nvarchar(255),
    @expireDate_Clear bit = 0,
    @expireDate nvarchar(255) = NULL,
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
        [re_members_ams].[Subscriptions]
    SET
        [name] = CASE WHEN @name_Clear = 1 THEN NULL ELSE ISNULL(@name, [name]) END,
        [quantity] = CASE WHEN @quantity_Clear = 1 THEN NULL ELSE ISNULL(@quantity, [quantity]) END,
        [expireDate] = CASE WHEN @expireDate_Clear = 1 THEN NULL ELSE ISNULL(@expireDate, [expireDate]) END,
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
        SELECT TOP 0 * FROM [re_members_ams].[vwSubscriptions] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [re_members_ams].[vwSubscriptions]
                                    WHERE
                                        [code] = @code
                                    
END
GO

GRANT EXECUTE ON [re_members_ams].[spUpdateSubscriptions] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the Subscriptions table
------------------------------------------------------------
IF OBJECT_ID('[re_members_ams].[trgUpdateSubscriptions]', 'TR') IS NOT NULL
    DROP TRIGGER [re_members_ams].[trgUpdateSubscriptions];
GO
CREATE TRIGGER [re_members_ams].trgUpdateSubscriptions
ON [re_members_ams].[Subscriptions]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [re_members_ams].[Subscriptions]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [re_members_ams].[Subscriptions] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[code] = I.[code];
END;
GO

/* spUpdate Permissions for Subscriptions */

GRANT EXECUTE ON [re_members_ams].[spUpdateSubscriptions] TO [cdp_Developer], [cdp_Integration];

/* Base View SQL for Tasks */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Tasks
-- Item: vwTasks
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      Tasks
-----               SCHEMA:      re_members_ams
-----               BASE TABLE:  Tasks
-----               PRIMARY KEY: taskNumber
------------------------------------------------------------
IF OBJECT_ID('[re_members_ams].[vwTasks]', 'V') IS NOT NULL
    DROP VIEW [re_members_ams].[vwTasks];
GO

CREATE VIEW [re_members_ams].[vwTasks]
AS
SELECT
    t.*
FROM
    [re_members_ams].[Tasks] AS t
GO
GRANT SELECT ON [re_members_ams].[vwTasks] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* Base View Permissions SQL for Tasks */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Tasks
-- Item: Permissions for vwTasks
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [re_members_ams].[vwTasks] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* spCreate SQL for Tasks */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Tasks
-- Item: spCreateTasks
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR Tasks
------------------------------------------------------------
IF OBJECT_ID('[re_members_ams].[spCreateTasks]', 'P') IS NOT NULL
    DROP PROCEDURE [re_members_ams].[spCreateTasks];
GO

CREATE PROCEDURE [re_members_ams].[spCreateTasks]
    @taskNumber nvarchar(255) = NULL,
    @description_Clear bit = 0,
    @description nvarchar(812) = NULL,
    @startDate_Clear bit = 0,
    @startDate nvarchar(812) = NULL,
    @category_Clear bit = 0,
    @category nvarchar(812) = NULL,
    @title_Clear bit = 0,
    @title nvarchar(812) = NULL,
    @dueDate_Clear bit = 0,
    @dueDate nvarchar(812) = NULL,
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
    @__mj_integration_DeletedDetectedAt datetimeoffset = NULL,
    @mj_e2e_custom_attr_Clear bit = 0,
    @mj_e2e_custom_attr nvarchar(812) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    
    INSERT INTO
    [re_members_ams].[Tasks]
        (
            [description],
                [startDate],
                [category],
                [title],
                [dueDate],
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
                [mj_e2e_custom_attr],
                [taskNumber]
        )
    VALUES
        (
            CASE WHEN @description_Clear = 1 THEN NULL ELSE ISNULL(@description, NULL) END,
                CASE WHEN @startDate_Clear = 1 THEN NULL ELSE ISNULL(@startDate, NULL) END,
                CASE WHEN @category_Clear = 1 THEN NULL ELSE ISNULL(@category, NULL) END,
                CASE WHEN @title_Clear = 1 THEN NULL ELSE ISNULL(@title, NULL) END,
                CASE WHEN @dueDate_Clear = 1 THEN NULL ELSE ISNULL(@dueDate, NULL) END,
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
                CASE WHEN @mj_e2e_custom_attr_Clear = 1 THEN NULL ELSE ISNULL(@mj_e2e_custom_attr, NULL) END,
                @taskNumber
        )
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [re_members_ams].[vwTasks] WHERE [taskNumber] = @taskNumber
END
GO
GRANT EXECUTE ON [re_members_ams].[spCreateTasks] TO [cdp_Developer], [cdp_Integration];

/* spCreate Permissions for Tasks */

GRANT EXECUTE ON [re_members_ams].[spCreateTasks] TO [cdp_Developer], [cdp_Integration];

/* spUpdate SQL for Tasks */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Tasks
-- Item: spUpdateTasks
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR Tasks
------------------------------------------------------------
IF OBJECT_ID('[re_members_ams].[spUpdateTasks]', 'P') IS NOT NULL
    DROP PROCEDURE [re_members_ams].[spUpdateTasks];
GO

CREATE PROCEDURE [re_members_ams].[spUpdateTasks]
    @taskNumber nvarchar(255),
    @description_Clear bit = 0,
    @description nvarchar(812) = NULL,
    @startDate_Clear bit = 0,
    @startDate nvarchar(812) = NULL,
    @category_Clear bit = 0,
    @category nvarchar(812) = NULL,
    @title_Clear bit = 0,
    @title nvarchar(812) = NULL,
    @dueDate_Clear bit = 0,
    @dueDate nvarchar(812) = NULL,
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
    @__mj_integration_DeletedDetectedAt datetimeoffset = NULL,
    @mj_e2e_custom_attr_Clear bit = 0,
    @mj_e2e_custom_attr nvarchar(812) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [re_members_ams].[Tasks]
    SET
        [description] = CASE WHEN @description_Clear = 1 THEN NULL ELSE ISNULL(@description, [description]) END,
        [startDate] = CASE WHEN @startDate_Clear = 1 THEN NULL ELSE ISNULL(@startDate, [startDate]) END,
        [category] = CASE WHEN @category_Clear = 1 THEN NULL ELSE ISNULL(@category, [category]) END,
        [title] = CASE WHEN @title_Clear = 1 THEN NULL ELSE ISNULL(@title, [title]) END,
        [dueDate] = CASE WHEN @dueDate_Clear = 1 THEN NULL ELSE ISNULL(@dueDate, [dueDate]) END,
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
        [__mj_integration_DeletedDetectedAt] = CASE WHEN @__mj_integration_DeletedDetectedAt_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_DeletedDetectedAt, [__mj_integration_DeletedDetectedAt]) END,
        [mj_e2e_custom_attr] = CASE WHEN @mj_e2e_custom_attr_Clear = 1 THEN NULL ELSE ISNULL(@mj_e2e_custom_attr, [mj_e2e_custom_attr]) END
    WHERE
        [taskNumber] = @taskNumber

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [re_members_ams].[vwTasks] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [re_members_ams].[vwTasks]
                                    WHERE
                                        [taskNumber] = @taskNumber
                                    
END
GO

GRANT EXECUTE ON [re_members_ams].[spUpdateTasks] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the Tasks table
------------------------------------------------------------
IF OBJECT_ID('[re_members_ams].[trgUpdateTasks]', 'TR') IS NOT NULL
    DROP TRIGGER [re_members_ams].[trgUpdateTasks];
GO
CREATE TRIGGER [re_members_ams].trgUpdateTasks
ON [re_members_ams].[Tasks]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [re_members_ams].[Tasks]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [re_members_ams].[Tasks] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[taskNumber] = I.[taskNumber];
END;
GO

/* spUpdate Permissions for Tasks */

GRANT EXECUTE ON [re_members_ams].[spUpdateTasks] TO [cdp_Developer], [cdp_Integration];

/* Base View SQL for User Tasks */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: User Tasks
-- Item: vwUserTasks
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      User Tasks
-----               SCHEMA:      re_members_ams
-----               BASE TABLE:  UserTasks
-----               PRIMARY KEY: taskNumber
------------------------------------------------------------
IF OBJECT_ID('[re_members_ams].[vwUserTasks]', 'V') IS NOT NULL
    DROP VIEW [re_members_ams].[vwUserTasks];
GO

CREATE VIEW [re_members_ams].[vwUserTasks]
AS
SELECT
    u.*
FROM
    [re_members_ams].[UserTasks] AS u
GO
GRANT SELECT ON [re_members_ams].[vwUserTasks] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* Base View Permissions SQL for User Tasks */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: User Tasks
-- Item: Permissions for vwUserTasks
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [re_members_ams].[vwUserTasks] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* spCreate SQL for User Tasks */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: User Tasks
-- Item: spCreateUserTasks
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR UserTasks
------------------------------------------------------------
IF OBJECT_ID('[re_members_ams].[spCreateUserTasks]', 'P') IS NOT NULL
    DROP PROCEDURE [re_members_ams].[spCreateUserTasks];
GO

CREATE PROCEDURE [re_members_ams].[spCreateUserTasks]
    @dueDate_Clear bit = 0,
    @dueDate nvarchar(255) = NULL,
    @title_Clear bit = 0,
    @title nvarchar(255) = NULL,
    @completedDate_Clear bit = 0,
    @completedDate nvarchar(255) = NULL,
    @assignedBy_Clear bit = 0,
    @assignedBy nvarchar(255) = NULL,
    @description_Clear bit = 0,
    @description nvarchar(255) = NULL,
    @taskNumber nvarchar(255) = NULL,
    @category_Clear bit = 0,
    @category nvarchar(255) = NULL,
    @progress_Clear bit = 0,
    @progress nvarchar(255) = NULL,
    @startDate_Clear bit = 0,
    @startDate nvarchar(255) = NULL,
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
    [re_members_ams].[UserTasks]
        (
            [dueDate],
                [title],
                [completedDate],
                [assignedBy],
                [description],
                [category],
                [progress],
                [startDate],
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
                [taskNumber]
        )
    VALUES
        (
            CASE WHEN @dueDate_Clear = 1 THEN NULL ELSE ISNULL(@dueDate, NULL) END,
                CASE WHEN @title_Clear = 1 THEN NULL ELSE ISNULL(@title, NULL) END,
                CASE WHEN @completedDate_Clear = 1 THEN NULL ELSE ISNULL(@completedDate, NULL) END,
                CASE WHEN @assignedBy_Clear = 1 THEN NULL ELSE ISNULL(@assignedBy, NULL) END,
                CASE WHEN @description_Clear = 1 THEN NULL ELSE ISNULL(@description, NULL) END,
                CASE WHEN @category_Clear = 1 THEN NULL ELSE ISNULL(@category, NULL) END,
                CASE WHEN @progress_Clear = 1 THEN NULL ELSE ISNULL(@progress, NULL) END,
                CASE WHEN @startDate_Clear = 1 THEN NULL ELSE ISNULL(@startDate, NULL) END,
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
                @taskNumber
        )
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [re_members_ams].[vwUserTasks] WHERE [taskNumber] = @taskNumber
END
GO
GRANT EXECUTE ON [re_members_ams].[spCreateUserTasks] TO [cdp_Developer], [cdp_Integration];

/* spCreate Permissions for User Tasks */

GRANT EXECUTE ON [re_members_ams].[spCreateUserTasks] TO [cdp_Developer], [cdp_Integration];

/* spUpdate SQL for User Tasks */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: User Tasks
-- Item: spUpdateUserTasks
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR UserTasks
------------------------------------------------------------
IF OBJECT_ID('[re_members_ams].[spUpdateUserTasks]', 'P') IS NOT NULL
    DROP PROCEDURE [re_members_ams].[spUpdateUserTasks];
GO

CREATE PROCEDURE [re_members_ams].[spUpdateUserTasks]
    @dueDate_Clear bit = 0,
    @dueDate nvarchar(255) = NULL,
    @title_Clear bit = 0,
    @title nvarchar(255) = NULL,
    @completedDate_Clear bit = 0,
    @completedDate nvarchar(255) = NULL,
    @assignedBy_Clear bit = 0,
    @assignedBy nvarchar(255) = NULL,
    @description_Clear bit = 0,
    @description nvarchar(255) = NULL,
    @taskNumber nvarchar(255),
    @category_Clear bit = 0,
    @category nvarchar(255) = NULL,
    @progress_Clear bit = 0,
    @progress nvarchar(255) = NULL,
    @startDate_Clear bit = 0,
    @startDate nvarchar(255) = NULL,
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
        [re_members_ams].[UserTasks]
    SET
        [dueDate] = CASE WHEN @dueDate_Clear = 1 THEN NULL ELSE ISNULL(@dueDate, [dueDate]) END,
        [title] = CASE WHEN @title_Clear = 1 THEN NULL ELSE ISNULL(@title, [title]) END,
        [completedDate] = CASE WHEN @completedDate_Clear = 1 THEN NULL ELSE ISNULL(@completedDate, [completedDate]) END,
        [assignedBy] = CASE WHEN @assignedBy_Clear = 1 THEN NULL ELSE ISNULL(@assignedBy, [assignedBy]) END,
        [description] = CASE WHEN @description_Clear = 1 THEN NULL ELSE ISNULL(@description, [description]) END,
        [category] = CASE WHEN @category_Clear = 1 THEN NULL ELSE ISNULL(@category, [category]) END,
        [progress] = CASE WHEN @progress_Clear = 1 THEN NULL ELSE ISNULL(@progress, [progress]) END,
        [startDate] = CASE WHEN @startDate_Clear = 1 THEN NULL ELSE ISNULL(@startDate, [startDate]) END,
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
        [taskNumber] = @taskNumber

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [re_members_ams].[vwUserTasks] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [re_members_ams].[vwUserTasks]
                                    WHERE
                                        [taskNumber] = @taskNumber
                                    
END
GO

GRANT EXECUTE ON [re_members_ams].[spUpdateUserTasks] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the UserTasks table
------------------------------------------------------------
IF OBJECT_ID('[re_members_ams].[trgUpdateUserTasks]', 'TR') IS NOT NULL
    DROP TRIGGER [re_members_ams].[trgUpdateUserTasks];
GO
CREATE TRIGGER [re_members_ams].trgUpdateUserTasks
ON [re_members_ams].[UserTasks]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [re_members_ams].[UserTasks]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [re_members_ams].[UserTasks] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[taskNumber] = I.[taskNumber];
END;
GO

/* spUpdate Permissions for User Tasks */

GRANT EXECUTE ON [re_members_ams].[spUpdateUserTasks] TO [cdp_Developer], [cdp_Integration];

/* spDelete SQL for Subscriptions */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Subscriptions
-- Item: spDeleteSubscriptions
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR Subscriptions
------------------------------------------------------------
IF OBJECT_ID('[re_members_ams].[spDeleteSubscriptions]', 'P') IS NOT NULL
    DROP PROCEDURE [re_members_ams].[spDeleteSubscriptions];
GO

CREATE PROCEDURE [re_members_ams].[spDeleteSubscriptions]
    @code nvarchar(255)
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [re_members_ams].[Subscriptions]
    WHERE
        [code] = @code


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [code] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @code AS [code] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [re_members_ams].[spDeleteSubscriptions] TO [cdp_Developer], [cdp_Integration];

/* spDelete Permissions for Subscriptions */

GRANT EXECUTE ON [re_members_ams].[spDeleteSubscriptions] TO [cdp_Developer], [cdp_Integration];

/* spDelete SQL for Tasks */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Tasks
-- Item: spDeleteTasks
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR Tasks
------------------------------------------------------------
IF OBJECT_ID('[re_members_ams].[spDeleteTasks]', 'P') IS NOT NULL
    DROP PROCEDURE [re_members_ams].[spDeleteTasks];
GO

CREATE PROCEDURE [re_members_ams].[spDeleteTasks]
    @taskNumber nvarchar(255)
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [re_members_ams].[Tasks]
    WHERE
        [taskNumber] = @taskNumber


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [taskNumber] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @taskNumber AS [taskNumber] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [re_members_ams].[spDeleteTasks] TO [cdp_Developer], [cdp_Integration];

/* spDelete Permissions for Tasks */

GRANT EXECUTE ON [re_members_ams].[spDeleteTasks] TO [cdp_Developer], [cdp_Integration];

/* spDelete SQL for User Tasks */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: User Tasks
-- Item: spDeleteUserTasks
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR UserTasks
------------------------------------------------------------
IF OBJECT_ID('[re_members_ams].[spDeleteUserTasks]', 'P') IS NOT NULL
    DROP PROCEDURE [re_members_ams].[spDeleteUserTasks];
GO

CREATE PROCEDURE [re_members_ams].[spDeleteUserTasks]
    @taskNumber nvarchar(255)
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [re_members_ams].[UserTasks]
    WHERE
        [taskNumber] = @taskNumber


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [taskNumber] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @taskNumber AS [taskNumber] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [re_members_ams].[spDeleteUserTasks] TO [cdp_Developer], [cdp_Integration];

/* spDelete Permissions for User Tasks */

GRANT EXECUTE ON [re_members_ams].[spDeleteUserTasks] TO [cdp_Developer], [cdp_Integration];

/* Set soft PK for re_members_ams.Individuals.id */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET [__mj_UpdatedAt]=GETUTCDATE(),
                                    [IsPrimaryKey] = 1,
                                    [IsSoftPrimaryKey] = 1
                                WHERE [EntityID] = 'B8B1A21E-70CE-404C-8104-3340A84858E0' AND [Name] = 'id';

/* Set soft PK for re_members_ams.Organizations.id */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET [__mj_UpdatedAt]=GETUTCDATE(),
                                    [IsPrimaryKey] = 1,
                                    [IsSoftPrimaryKey] = 1
                                WHERE [EntityID] = '6C475F1C-8F58-480B-8328-46813EF58D51' AND [Name] = 'id';

/* Set soft FK for re_members_ams.Organizations.parentCompanyId → Organizations.id */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET [__mj_UpdatedAt]=GETUTCDATE(),
                                    [RelatedEntityID] = '6C475F1C-8F58-480B-8328-46813EF58D51',
                                    [RelatedEntityFieldName] = 'id',
                                    [IsSoftForeignKey] = 1
                                WHERE [EntityID] = '6C475F1C-8F58-480B-8328-46813EF58D51' AND [Name] = 'parentCompanyId';

/* Set soft PK for re_members_ams.Memberships.code */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET [__mj_UpdatedAt]=GETUTCDATE(),
                                    [IsPrimaryKey] = 1,
                                    [IsSoftPrimaryKey] = 1
                                WHERE [EntityID] = 'CD75CAAA-B215-42F9-9F80-F8412A17BEA2' AND [Name] = 'code';

/* Set soft PK for re_members_ams.Events.eventId */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET [__mj_UpdatedAt]=GETUTCDATE(),
                                    [IsPrimaryKey] = 1,
                                    [IsSoftPrimaryKey] = 1
                                WHERE [EntityID] = 'D07B167E-258C-40C5-A6DC-2E42C2CE5F59' AND [Name] = 'eventId';

/* Set soft PK for re_members_ams.EventRegistrations.id */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET [__mj_UpdatedAt]=GETUTCDATE(),
                                    [IsPrimaryKey] = 1,
                                    [IsSoftPrimaryKey] = 1
                                WHERE [EntityID] = '90378890-6A83-4955-A2DE-548A4FA2EFE5' AND [Name] = 'id';

/* Set soft FK for re_members_ams.EventRegistrations.individualId → Individuals.id */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET [__mj_UpdatedAt]=GETUTCDATE(),
                                    [RelatedEntityID] = 'B8B1A21E-70CE-404C-8104-3340A84858E0',
                                    [RelatedEntityFieldName] = 'id',
                                    [IsSoftForeignKey] = 1
                                WHERE [EntityID] = '90378890-6A83-4955-A2DE-548A4FA2EFE5' AND [Name] = 'individualId';

/* Set soft PK for re_members_ams.EventCancellations.id */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET [__mj_UpdatedAt]=GETUTCDATE(),
                                    [IsPrimaryKey] = 1,
                                    [IsSoftPrimaryKey] = 1
                                WHERE [EntityID] = 'B234C369-EE9D-4174-A73D-EDA7442822DC' AND [Name] = 'id';

/* Set soft PK for re_members_ams.CourseAttendees.id */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET [__mj_UpdatedAt]=GETUTCDATE(),
                                    [IsPrimaryKey] = 1,
                                    [IsSoftPrimaryKey] = 1
                                WHERE [EntityID] = 'C54EA17D-DD1C-4B9C-84CD-ECC16C13C084' AND [Name] = 'id';

/* Set soft PK for re_members_ams.Orders.id */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET [__mj_UpdatedAt]=GETUTCDATE(),
                                    [IsPrimaryKey] = 1,
                                    [IsSoftPrimaryKey] = 1
                                WHERE [EntityID] = 'E669ECA0-17BA-484C-8131-7F351EBA24FB' AND [Name] = 'id';

/* Set soft PK for re_members_ams.AbandonedCheckouts.ID */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET [__mj_UpdatedAt]=GETUTCDATE(),
                                    [IsPrimaryKey] = 1,
                                    [IsSoftPrimaryKey] = 1
                                WHERE [EntityID] = '659F86CE-D795-46C1-81D0-1ED1ABE5D719' AND [Name] = 'ID';

/* Set soft PK for re_members_ams.Committees.id */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET [__mj_UpdatedAt]=GETUTCDATE(),
                                    [IsPrimaryKey] = 1,
                                    [IsSoftPrimaryKey] = 1
                                WHERE [EntityID] = 'CE33A7B2-81D8-4779-8AE2-0EC8CF82BF1E' AND [Name] = 'id';

/* Set soft FK for re_members_ams.Committees.parentCommitteeId → Committees.id */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET [__mj_UpdatedAt]=GETUTCDATE(),
                                    [RelatedEntityID] = 'CE33A7B2-81D8-4779-8AE2-0EC8CF82BF1E',
                                    [RelatedEntityFieldName] = 'id',
                                    [IsSoftForeignKey] = 1
                                WHERE [EntityID] = 'CE33A7B2-81D8-4779-8AE2-0EC8CF82BF1E' AND [Name] = 'parentCommitteeId';

/* Set soft PK for re_members_ams.CommitteeMembers.memberRecordNumber */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET [__mj_UpdatedAt]=GETUTCDATE(),
                                    [IsPrimaryKey] = 1,
                                    [IsSoftPrimaryKey] = 1
                                WHERE [EntityID] = '84E9C909-B27A-4A8D-BECF-0DA0F465D80A' AND [Name] = 'memberRecordNumber';

/* Set soft PK for re_members_ams.CommitteePositions.code */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET [__mj_UpdatedAt]=GETUTCDATE(),
                                    [IsPrimaryKey] = 1,
                                    [IsSoftPrimaryKey] = 1
                                WHERE [EntityID] = '0F05E31F-011E-4734-A14A-A89F5EDBCE4D' AND [Name] = 'code';

/* Set soft PK for re_members_ams.CommitteeNominees.id */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET [__mj_UpdatedAt]=GETUTCDATE(),
                                    [IsPrimaryKey] = 1,
                                    [IsSoftPrimaryKey] = 1
                                WHERE [EntityID] = '3127FDC6-66CA-47CE-B10B-927037D595FE' AND [Name] = 'id';

/* Set soft PK for re_members_ams.Awards.id */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET [__mj_UpdatedAt]=GETUTCDATE(),
                                    [IsPrimaryKey] = 1,
                                    [IsSoftPrimaryKey] = 1
                                WHERE [EntityID] = 'E2ECFA5A-05AA-49F9-8FD1-A9949AEF3985' AND [Name] = 'id';

/* Set soft PK for re_members_ams.AwardIndividualRecipients.id */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET [__mj_UpdatedAt]=GETUTCDATE(),
                                    [IsPrimaryKey] = 1,
                                    [IsSoftPrimaryKey] = 1
                                WHERE [EntityID] = '0402D55F-6EA1-4DF3-B912-FEF96EEDC760' AND [Name] = 'id';

/* Set soft PK for re_members_ams.AwardOrganizationRecipients.id */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET [__mj_UpdatedAt]=GETUTCDATE(),
                                    [IsPrimaryKey] = 1,
                                    [IsSoftPrimaryKey] = 1
                                WHERE [EntityID] = 'DA1E42D2-3847-48B2-ABB9-B303BC05293E' AND [Name] = 'id';

/* Set soft PK for re_members_ams.Certifications.code */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET [__mj_UpdatedAt]=GETUTCDATE(),
                                    [IsPrimaryKey] = 1,
                                    [IsSoftPrimaryKey] = 1
                                WHERE [EntityID] = 'CAF3EBAF-D974-4863-8473-7E41F481B259' AND [Name] = 'code';

/* Set soft PK for re_members_ams.Licenses.id */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET [__mj_UpdatedAt]=GETUTCDATE(),
                                    [IsPrimaryKey] = 1,
                                    [IsSoftPrimaryKey] = 1
                                WHERE [EntityID] = 'D3660C71-52C3-4804-BEDE-868C52FFB9BC' AND [Name] = 'id';

/* Set soft PK for re_members_ams.Exams.id */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET [__mj_UpdatedAt]=GETUTCDATE(),
                                    [IsPrimaryKey] = 1,
                                    [IsSoftPrimaryKey] = 1
                                WHERE [EntityID] = 'DD737CDB-CEE1-487F-99A6-B4F9398B9D76' AND [Name] = 'id';

/* Set soft PK for re_members_ams.Subscriptions.code */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET [__mj_UpdatedAt]=GETUTCDATE(),
                                    [IsPrimaryKey] = 1,
                                    [IsSoftPrimaryKey] = 1
                                WHERE [EntityID] = 'CC58A546-1CA5-4756-904F-5EEA5D03515F' AND [Name] = 'code';

/* Set soft PK for re_members_ams.UserTasks.taskNumber */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET [__mj_UpdatedAt]=GETUTCDATE(),
                                    [IsPrimaryKey] = 1,
                                    [IsSoftPrimaryKey] = 1
                                WHERE [EntityID] = '13D169AF-CF21-44C7-91E0-1952F9BD6974' AND [Name] = 'taskNumber';

/* Set soft PK for re_members_ams.CustomerRequests.requestNumber */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET [__mj_UpdatedAt]=GETUTCDATE(),
                                    [IsPrimaryKey] = 1,
                                    [IsSoftPrimaryKey] = 1
                                WHERE [EntityID] = 'F5AD833D-F362-40CF-82C1-DEBEC33DE399' AND [Name] = 'requestNumber';

/* Set soft PK for re_members_ams.Exhibits.code */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET [__mj_UpdatedAt]=GETUTCDATE(),
                                    [IsPrimaryKey] = 1,
                                    [IsSoftPrimaryKey] = 1
                                WHERE [EntityID] = 'E0C88340-483B-4B91-80C6-5DD083AA2297' AND [Name] = 'code';

/* Set soft PK for re_members_ams.Countries.id */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET [__mj_UpdatedAt]=GETUTCDATE(),
                                    [IsPrimaryKey] = 1,
                                    [IsSoftPrimaryKey] = 1
                                WHERE [EntityID] = 'CDD5A66C-7587-402A-9086-A3A4677029DF' AND [Name] = 'id';

/* Set soft PK for re_members_ams.States.id */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET [__mj_UpdatedAt]=GETUTCDATE(),
                                    [IsPrimaryKey] = 1,
                                    [IsSoftPrimaryKey] = 1
                                WHERE [EntityID] = '1295C0F0-D37C-4E45-9345-D98B1D03CD37' AND [Name] = 'id';

/* Set soft PK for re_members_ams.RelationshipTypes.name */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET [__mj_UpdatedAt]=GETUTCDATE(),
                                    [IsPrimaryKey] = 1,
                                    [IsSoftPrimaryKey] = 1
                                WHERE [EntityID] = '4396C56D-6F16-4FF3-8D4E-DFCD9107E9A3' AND [Name] = 'name';

/* Set soft PK for re_members_ams.OrganizationServices.code */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET [__mj_UpdatedAt]=GETUTCDATE(),
                                    [IsPrimaryKey] = 1,
                                    [IsSoftPrimaryKey] = 1
                                WHERE [EntityID] = '8FB1E96C-5E76-40A0-A7D3-E05D5E04B215' AND [Name] = 'code';

/* Set soft PK for re_members_ams.CustomFieldDefinitions.name */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET [__mj_UpdatedAt]=GETUTCDATE(),
                                    [IsPrimaryKey] = 1,
                                    [IsSoftPrimaryKey] = 1
                                WHERE [EntityID] = '685BBE9C-7EB6-4773-9B5D-E8C573A8D9DA' AND [Name] = 'name';

/* Set soft PK for re_members_ams.CustomFieldValues.name */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET [__mj_UpdatedAt]=GETUTCDATE(),
                                    [IsPrimaryKey] = 1,
                                    [IsSoftPrimaryKey] = 1
                                WHERE [EntityID] = '08BEDA08-4CAA-4389-AD7A-DE3025276CB0' AND [Name] = 'name';

/* Set soft PK for re_members_ams.Tasks.taskNumber */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET [__mj_UpdatedAt]=GETUTCDATE(),
                                    [IsPrimaryKey] = 1,
                                    [IsSoftPrimaryKey] = 1
                                WHERE [EntityID] = 'B283C49A-F975-48C9-AE52-D66A1E0A4FDD' AND [Name] = 'taskNumber';

/* Set soft PK for re_members_ams.Addresses.id */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET [__mj_UpdatedAt]=GETUTCDATE(),
                                    [IsPrimaryKey] = 1,
                                    [IsSoftPrimaryKey] = 1
                                WHERE [EntityID] = '465AD98D-45A3-42DD-A68A-10FE6CB79D39' AND [Name] = 'id';

/* Set soft PK for re_members_ams.AwardNominations.nomineeRecordNumber */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET [__mj_UpdatedAt]=GETUTCDATE(),
                                    [IsPrimaryKey] = 1,
                                    [IsSoftPrimaryKey] = 1
                                WHERE [EntityID] = '6A2DEC79-4A49-453A-BD2E-EF7F5883F25A' AND [Name] = 'nomineeRecordNumber';

/* Set soft PK for re_members_ams.Categories.code */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET [__mj_UpdatedAt]=GETUTCDATE(),
                                    [IsPrimaryKey] = 1,
                                    [IsSoftPrimaryKey] = 1
                                WHERE [EntityID] = 'C6895F42-A972-42CC-9A57-84C0680B0BD7' AND [Name] = 'code';

/* Set soft PK for re_members_ams.Emails.address */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET [__mj_UpdatedAt]=GETUTCDATE(),
                                    [IsPrimaryKey] = 1,
                                    [IsSoftPrimaryKey] = 1
                                WHERE [EntityID] = 'C3154270-C0FD-4431-8C0A-5775B2801566' AND [Name] = 'address';

/* Set soft PK for re_members_ams.ExamScores.individualRecordNumber */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET [__mj_UpdatedAt]=GETUTCDATE(),
                                    [IsPrimaryKey] = 1,
                                    [IsSoftPrimaryKey] = 1
                                WHERE [EntityID] = '5C701293-D4AD-4F41-B870-C6BD695BF4CD' AND [Name] = 'individualRecordNumber';

/* Set soft PK for re_members_ams.Phones.id */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET [__mj_UpdatedAt]=GETUTCDATE(),
                                    [IsPrimaryKey] = 1,
                                    [IsSoftPrimaryKey] = 1
                                WHERE [EntityID] = 'A5F735CE-B945-415E-B9DB-AB748C47D0E7' AND [Name] = 'id';

