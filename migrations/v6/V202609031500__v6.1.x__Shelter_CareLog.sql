/* ==============================================================================================
   MJ Academy — Harbor Street Animal Shelter: CareLog

   Module 5. An event log: something that was done to an animal on a date. A vaccination, an exam,
   a treatment, a grooming session.

   WHY IT IS A PLAIN FK TABLE, DELIBERATELY

   CareLog arrives as an ordinary table with an AnimalID column and nothing else linking it to the
   parent. That is the point of module 5: the learner passes the animal ID around by hand, sets the
   foreign key themselves, refreshes the list themselves, and handles the empty state themselves --
   and then notices what that costs. Module 7 converts it into a real embedded record, the
   hand-wiring is deleted, and the behaviour survives unchanged. The contrast is the lesson.

   WHAT EACH COLUMN IS FOR

     CareDate      When it happened. Not defaulted: back-dating an entry is normal, since care is
                   often logged after the fact.
     CareType      Closed set. Vaccination plus IsComplete is what module 6 async validation looks
                   for before an animal may be listed Available -- a child-existence question the
                   parent row cannot answer on its own.
     Description   The one-line summary that shows in a grid.
     Notes         The vets free-text detail, kept out of the grid.
     PerformedBy   Free text on purpose. Staff and volunteers are module 7 entities; until they
                   exist, a name is honest and does not invent a relationship.
     IsComplete    Scheduled versus done. A care entry can be booked before it happens.
     FollowUpDate  Gives the module 5 dashboard an overdue-follow-up tile with no extra schema.

   No CreatedAt, UpdatedAt or audit columns are declared: MJ records field-level history in
   RecordChange for any entity with TrackRecordChanges enabled, which is the default.

   DDL ONLY. The CodeGen tail is captured separately and appended below the blank-line separator.
   ============================================================================================== */

CREATE TABLE ${flyway:defaultSchema}.CareLog (
    ID UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
    AnimalID UNIQUEIDENTIFIER NOT NULL,
    CareDate DATE NOT NULL,
    CareType NVARCHAR(20) NOT NULL,
    Description NVARCHAR(500) NOT NULL,
    PerformedBy NVARCHAR(100) NULL,
    IsComplete BIT NOT NULL DEFAULT 0,
    FollowUpDate DATE NULL,
    Notes NVARCHAR(MAX) NULL,
    CONSTRAINT PK_CareLog PRIMARY KEY (ID),
    CONSTRAINT FK_CareLog_AnimalID FOREIGN KEY (AnimalID) REFERENCES ${flyway:defaultSchema}.Animal (ID),
    CONSTRAINT CK_CareLog_CareType CHECK (CareType IN ('Vaccination','Exam','Treatment','Surgery','Grooming','Behavioral','Other')),
    CONSTRAINT CK_CareLog_FollowUpDate CHECK (FollowUpDate IS NULL OR FollowUpDate >= CareDate)
);
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'An event log of care given to an animal: one row per thing that was done, on a date. Introduced in MJ Academy module 5 as a plain foreign-key table so the learner wires the parent-child link by hand; converted to an embedded record in module 7.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'CareLog';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'The date the care happened. Not defaulted, because care is often logged after the fact and back-dating an entry is normal.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'CareLog',
    @level2type = N'COLUMN', @level2name = N'CareDate';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'What kind of care this was: Vaccination, Exam, Treatment, Surgery, Grooming, Behavioral or Other. A completed Vaccination entry is what the module 6 async rule requires before an animal may be listed Available.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'CareLog',
    @level2type = N'COLUMN', @level2name = N'CareType';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'One-line summary of what was done, shown in grids and lists.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'CareLog',
    @level2type = N'COLUMN', @level2name = N'Description';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Who performed the care. Free text on purpose: staff and volunteers become entities in module 7, and until they exist a name is more honest than inventing a relationship.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'CareLog',
    @level2type = N'COLUMN', @level2name = N'PerformedBy';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Whether the care has actually been carried out. An entry can be recorded as scheduled before it happens, so this distinguishes booked from done.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'CareLog',
    @level2type = N'COLUMN', @level2name = N'IsComplete';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'When this care needs revisiting, if it does. Constrained to be on or after CareDate. Drives the overdue-follow-up dashboard tile without any additional schema.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'CareLog',
    @level2type = N'COLUMN', @level2name = N'FollowUpDate';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Free-text clinical or behavioural detail. Kept separate from Description so grids stay readable while the full note remains available on the record.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'CareLog',
    @level2type = N'COLUMN', @level2name = N'Notes';
GO


























































/* ============================================================================================
   ============================================================================================
   ==                                                                                        ==
   ==   EVERYTHING BELOW THIS POINT WAS PRODUCED BY THE MEMBERJUNCTION CodeGen TOOL          ==
   ==                                                                                        ==
   ==   DO NOT EDIT ANY OF IT BY HAND.                                                       ==
   ==                                                                                        ==
   ==   It contains the Entity / EntityField metadata inserts, the generated base view, the  ==
   ==   spCreate / spUpdate / spDelete procedures, permission grants, and extended-property  ==
   ==   descriptions for the IdentityClaimType and IdentityClaim tables.                     ==
   ==                                                                                        ==
   ==   If the hand-written DDL above changes, DO NOT patch this section: re-run             ==
   ==   `mj codegen` and replace this entire block with the new output.                      ==
   ==                                                                                        ==
   ============================================================================================
   ============================================================================================ */

/* SQL generated to create new entity MJ: Care Logs */

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
         '78a0f3a7-1a8a-42bf-ac00-bee96bf22bd1',
         'MJ: Care Logs',
         'Care Logs',
         'An event log of care given to an animal: one row per thing that was done, on a date. Introduced in MJ Academy module 5 as a plain foreign-key table so the learner wires the parent-child link by hand; converted to an embedded record in module 7.',
         NULL,
         'CareLog',
         'vwCareLogs',
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

/* SQL generated to add new entity MJ: Care Logs to application ID: 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E' */
INSERT INTO [${flyway:defaultSchema}].[ApplicationEntity]
                                       ([ApplicationID], [EntityID], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                       ('EBA5CCEC-6A37-EF11-86D4-000D3A4E707E', '78a0f3a7-1a8a-42bf-ac00-bee96bf22bd1', (SELECT COALESCE(MAX([Sequence]),0)+1 FROM [${flyway:defaultSchema}].[ApplicationEntity] WHERE [ApplicationID] = 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E'), GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity MJ: Care Logs for role UI */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('78a0f3a7-1a8a-42bf-ac00-bee96bf22bd1', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0, 0, 0, GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity MJ: Care Logs for role Developer */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('78a0f3a7-1a8a-42bf-ac00-bee96bf22bd1', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity MJ: Care Logs for role Integration */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('78a0f3a7-1a8a-42bf-ac00-bee96bf22bd1', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE());

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.CareLog */
ALTER TABLE [${flyway:defaultSchema}].[CareLog] ADD [__mj_CreatedAt] DATETIMEOFFSET NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.CareLog */
UPDATE [${flyway:defaultSchema}].[CareLog] SET [__mj_CreatedAt] = GETUTCDATE() WHERE [__mj_CreatedAt] IS NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.CareLog */
ALTER TABLE [${flyway:defaultSchema}].[CareLog] ALTER COLUMN [__mj_CreatedAt] DATETIMEOFFSET NOT NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.CareLog */
ALTER TABLE [${flyway:defaultSchema}].[CareLog] ADD CONSTRAINT [DF___mj_CareLog___mj_CreatedAt] DEFAULT GETUTCDATE() FOR [__mj_CreatedAt];
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.CareLog */
ALTER TABLE [${flyway:defaultSchema}].[CareLog] ADD [__mj_UpdatedAt] DATETIMEOFFSET NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.CareLog */
UPDATE [${flyway:defaultSchema}].[CareLog] SET [__mj_UpdatedAt] = GETUTCDATE() WHERE [__mj_UpdatedAt] IS NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.CareLog */
ALTER TABLE [${flyway:defaultSchema}].[CareLog] ALTER COLUMN [__mj_UpdatedAt] DATETIMEOFFSET NOT NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.CareLog */
ALTER TABLE [${flyway:defaultSchema}].[CareLog] ADD CONSTRAINT [DF___mj_CareLog___mj_UpdatedAt] DEFAULT GETUTCDATE() FOR [__mj_UpdatedAt];
GO

/* SQL text to insert 12 new entity field(s) */
UPDATE [${flyway:defaultSchema}].[EntityField]
         SET [Sequence] = [Sequence] + 100000
       WHERE [EntityID] = '78A0F3A7-1A8A-42BF-AC00-BEE96BF22BD1'
         AND [Sequence] < 100000;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '3a59a925-7a6e-4028-a0b0-ae967cf82e6f' OR (EntityID = '78A0F3A7-1A8A-42BF-AC00-BEE96BF22BD1' AND Name = 'ID')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '3a59a925-7a6e-4028-a0b0-ae967cf82e6f',
            '78A0F3A7-1A8A-42BF-AC00-BEE96BF22BD1', -- Entity: MJ: Care Logs
            (SELECT COALESCE(MAX([Sequence]), 0) FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '78A0F3A7-1A8A-42BF-AC00-BEE96BF22BD1') + 1,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '90228849-939b-40bd-95ca-cf0214505d2a' OR (EntityID = '78A0F3A7-1A8A-42BF-AC00-BEE96BF22BD1' AND Name = 'AnimalID')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '90228849-939b-40bd-95ca-cf0214505d2a',
            '78A0F3A7-1A8A-42BF-AC00-BEE96BF22BD1', -- Entity: MJ: Care Logs
            (SELECT COALESCE(MAX([Sequence]), 0) FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '78A0F3A7-1A8A-42BF-AC00-BEE96BF22BD1') + 2,
            'AnimalID',
            'Animal ID',
            NULL,
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
            '22E4F4DE-9A9B-4FE3-AB1A-ECAC7EF5EF9D',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'f5ee959e-25f8-4328-b48d-cf14a85663a7' OR (EntityID = '78A0F3A7-1A8A-42BF-AC00-BEE96BF22BD1' AND Name = 'CareDate')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'f5ee959e-25f8-4328-b48d-cf14a85663a7',
            '78A0F3A7-1A8A-42BF-AC00-BEE96BF22BD1', -- Entity: MJ: Care Logs
            (SELECT COALESCE(MAX([Sequence]), 0) FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '78A0F3A7-1A8A-42BF-AC00-BEE96BF22BD1') + 3,
            'CareDate',
            'Care Date',
            'The date the care happened. Not defaulted, because care is often logged after the fact and back-dating an entry is normal.',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '4aba2b4b-545f-434a-8b4a-53d1049e84ed' OR (EntityID = '78A0F3A7-1A8A-42BF-AC00-BEE96BF22BD1' AND Name = 'CareType')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '4aba2b4b-545f-434a-8b4a-53d1049e84ed',
            '78A0F3A7-1A8A-42BF-AC00-BEE96BF22BD1', -- Entity: MJ: Care Logs
            (SELECT COALESCE(MAX([Sequence]), 0) FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '78A0F3A7-1A8A-42BF-AC00-BEE96BF22BD1') + 4,
            'CareType',
            'Care Type',
            'What kind of care this was: Vaccination, Exam, Treatment, Surgery, Grooming, Behavioral or Other. A completed Vaccination entry is what the module 6 async rule requires before an animal may be listed Available.',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '0bde4fad-e415-4e7d-b443-e750c70392c0' OR (EntityID = '78A0F3A7-1A8A-42BF-AC00-BEE96BF22BD1' AND Name = 'Description')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '0bde4fad-e415-4e7d-b443-e750c70392c0',
            '78A0F3A7-1A8A-42BF-AC00-BEE96BF22BD1', -- Entity: MJ: Care Logs
            (SELECT COALESCE(MAX([Sequence]), 0) FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '78A0F3A7-1A8A-42BF-AC00-BEE96BF22BD1') + 5,
            'Description',
            'Description',
            'One-line summary of what was done, shown in grids and lists.',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '39b1c2ac-75fe-42ff-982b-fd32b6a7b8e0' OR (EntityID = '78A0F3A7-1A8A-42BF-AC00-BEE96BF22BD1' AND Name = 'PerformedBy')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '39b1c2ac-75fe-42ff-982b-fd32b6a7b8e0',
            '78A0F3A7-1A8A-42BF-AC00-BEE96BF22BD1', -- Entity: MJ: Care Logs
            (SELECT COALESCE(MAX([Sequence]), 0) FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '78A0F3A7-1A8A-42BF-AC00-BEE96BF22BD1') + 6,
            'PerformedBy',
            'Performed By',
            'Who performed the care. Free text on purpose: staff and volunteers become entities in module 7, and until they exist a name is more honest than inventing a relationship.',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '89f34064-937a-4928-b0d5-cf93fbe9dd14' OR (EntityID = '78A0F3A7-1A8A-42BF-AC00-BEE96BF22BD1' AND Name = 'IsComplete')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '89f34064-937a-4928-b0d5-cf93fbe9dd14',
            '78A0F3A7-1A8A-42BF-AC00-BEE96BF22BD1', -- Entity: MJ: Care Logs
            (SELECT COALESCE(MAX([Sequence]), 0) FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '78A0F3A7-1A8A-42BF-AC00-BEE96BF22BD1') + 7,
            'IsComplete',
            'Is Complete',
            'Whether the care has actually been carried out. An entry can be recorded as scheduled before it happens, so this distinguishes booked from done.',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '6627cc71-cb4f-444f-965b-4db8c3a0af70' OR (EntityID = '78A0F3A7-1A8A-42BF-AC00-BEE96BF22BD1' AND Name = 'FollowUpDate')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '6627cc71-cb4f-444f-965b-4db8c3a0af70',
            '78A0F3A7-1A8A-42BF-AC00-BEE96BF22BD1', -- Entity: MJ: Care Logs
            (SELECT COALESCE(MAX([Sequence]), 0) FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '78A0F3A7-1A8A-42BF-AC00-BEE96BF22BD1') + 8,
            'FollowUpDate',
            'Follow Up Date',
            'When this care needs revisiting, if it does. Constrained to be on or after CareDate. Drives the overdue-follow-up dashboard tile without any additional schema.',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'a275aff3-9f2b-4166-9ffa-3442f40940cd' OR (EntityID = '78A0F3A7-1A8A-42BF-AC00-BEE96BF22BD1' AND Name = 'Notes')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'a275aff3-9f2b-4166-9ffa-3442f40940cd',
            '78A0F3A7-1A8A-42BF-AC00-BEE96BF22BD1', -- Entity: MJ: Care Logs
            (SELECT COALESCE(MAX([Sequence]), 0) FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '78A0F3A7-1A8A-42BF-AC00-BEE96BF22BD1') + 9,
            'Notes',
            'Notes',
            'Free-text clinical or behavioural detail. Kept separate from Description so grids stay readable while the full note remains available on the record.',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'd540dced-1d7d-44ea-8e85-b03ce91a857a' OR (EntityID = '78A0F3A7-1A8A-42BF-AC00-BEE96BF22BD1' AND Name = '__mj_CreatedAt')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'd540dced-1d7d-44ea-8e85-b03ce91a857a',
            '78A0F3A7-1A8A-42BF-AC00-BEE96BF22BD1', -- Entity: MJ: Care Logs
            (SELECT COALESCE(MAX([Sequence]), 0) FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '78A0F3A7-1A8A-42BF-AC00-BEE96BF22BD1') + 10,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '58fb4e46-13a0-415a-bf2d-d5371b688a66' OR (EntityID = '78A0F3A7-1A8A-42BF-AC00-BEE96BF22BD1' AND Name = '__mj_UpdatedAt')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '58fb4e46-13a0-415a-bf2d-d5371b688a66',
            '78A0F3A7-1A8A-42BF-AC00-BEE96BF22BD1', -- Entity: MJ: Care Logs
            (SELECT COALESCE(MAX([Sequence]), 0) FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '78A0F3A7-1A8A-42BF-AC00-BEE96BF22BD1') + 11,
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

/* SQL text to insert entity field value with ID c08a1b38-f82c-41d5-9159-562863807ff7 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('c08a1b38-f82c-41d5-9159-562863807ff7', '4ABA2B4B-545F-434A-8B4A-53D1049E84ED', 1, 'Behavioral', 'Behavioral', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 5fff6b2f-bae1-4c1a-a16b-423fc5b7378e */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('5fff6b2f-bae1-4c1a-a16b-423fc5b7378e', '4ABA2B4B-545F-434A-8B4A-53D1049E84ED', 2, 'Exam', 'Exam', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID a821269e-f5a4-4ace-9d54-fd54a032097d */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('a821269e-f5a4-4ace-9d54-fd54a032097d', '4ABA2B4B-545F-434A-8B4A-53D1049E84ED', 3, 'Grooming', 'Grooming', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 7f4e2ee4-5587-4743-afe1-9b22078ab04e */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('7f4e2ee4-5587-4743-afe1-9b22078ab04e', '4ABA2B4B-545F-434A-8B4A-53D1049E84ED', 4, 'Other', 'Other', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID dccbdfda-4687-4383-a7bb-59e0fb2c8fe0 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('dccbdfda-4687-4383-a7bb-59e0fb2c8fe0', '4ABA2B4B-545F-434A-8B4A-53D1049E84ED', 5, 'Surgery', 'Surgery', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 203d90ea-5422-4231-8c8c-01ac87dae313 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('203d90ea-5422-4231-8c8c-01ac87dae313', '4ABA2B4B-545F-434A-8B4A-53D1049E84ED', 6, 'Treatment', 'Treatment', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID c57ef5dc-22db-4743-9d0b-7747ec4115cb */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('c57ef5dc-22db-4743-9d0b-7747ec4115cb', '4ABA2B4B-545F-434A-8B4A-53D1049E84ED', 7, 'Vaccination', 'Vaccination', GETUTCDATE(), GETUTCDATE());

/* SQL text to update ValueListType for entity field ID 4ABA2B4B-545F-434A-8B4A-53D1049E84ED */
UPDATE [${flyway:defaultSchema}].[EntityField] SET ValueListType='List' WHERE ID='4ABA2B4B-545F-434A-8B4A-53D1049E84ED';


/* Create Entity Relationship: MJ: Animals -> MJ: Care Logs (One To Many via AnimalID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = '6278fa0c-6e21-49c9-804c-2180aa8e3d91'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('6278fa0c-6e21-49c9-804c-2180aa8e3d91', '22E4F4DE-9A9B-4FE3-AB1A-ECAC7EF5EF9D', '78A0F3A7-1A8A-42BF-AC00-BEE96BF22BD1', 'AnimalID', 'One To Many', 1, 1, 1, GETUTCDATE(), GETUTCDATE())
   END;

/* Index for Foreign Keys for CareLog */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Care Logs
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key AnimalID in table CareLog
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_CareLog_AnimalID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[CareLog]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_CareLog_AnimalID ON [${flyway:defaultSchema}].[CareLog] ([AnimalID]);

/* SQL text to update entity field related entity name field map for entity field ID 90228849-939B-40BD-95CA-CF0214505D2A */
EXEC [${flyway:defaultSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='90228849-939B-40BD-95CA-CF0214505D2A', @RelatedEntityNameFieldMap='Animal';

/* Base View SQL for MJ: Care Logs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Care Logs
-- Item: vwCareLogs
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: Care Logs
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  CareLog
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwCareLogs]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwCareLogs];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwCareLogs]
AS
SELECT
    c.*,
    MJAnimal_AnimalID.[Name] AS [Animal]
FROM
    [${flyway:defaultSchema}].[CareLog] AS c
INNER JOIN
    [${flyway:defaultSchema}].[Animal] AS MJAnimal_AnimalID
  ON
    [c].[AnimalID] = MJAnimal_AnimalID.[ID]
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwCareLogs] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* Base View Permissions SQL for MJ: Care Logs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Care Logs
-- Item: Permissions for vwCareLogs
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwCareLogs] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* spCreate SQL for MJ: Care Logs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Care Logs
-- Item: spCreateCareLog
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR CareLog
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateCareLog]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateCareLog];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateCareLog]
    @ID uniqueidentifier = NULL,
    @AnimalID uniqueidentifier,
    @CareDate date,
    @CareType nvarchar(20),
    @Description nvarchar(500),
    @PerformedBy_Clear bit = 0,
    @PerformedBy nvarchar(100) = NULL,
    @IsComplete bit = NULL,
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
        INSERT INTO [${flyway:defaultSchema}].[CareLog]
            (
                [ID],
                [AnimalID],
                [CareDate],
                [CareType],
                [Description],
                [PerformedBy],
                [IsComplete],
                [FollowUpDate],
                [Notes]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @AnimalID,
                @CareDate,
                @CareType,
                @Description,
                CASE WHEN @PerformedBy_Clear = 1 THEN NULL ELSE ISNULL(@PerformedBy, NULL) END,
                ISNULL(@IsComplete, 0),
                CASE WHEN @FollowUpDate_Clear = 1 THEN NULL ELSE ISNULL(@FollowUpDate, NULL) END,
                CASE WHEN @Notes_Clear = 1 THEN NULL ELSE ISNULL(@Notes, NULL) END
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[CareLog]
            (
                [AnimalID],
                [CareDate],
                [CareType],
                [Description],
                [PerformedBy],
                [IsComplete],
                [FollowUpDate],
                [Notes]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @AnimalID,
                @CareDate,
                @CareType,
                @Description,
                CASE WHEN @PerformedBy_Clear = 1 THEN NULL ELSE ISNULL(@PerformedBy, NULL) END,
                ISNULL(@IsComplete, 0),
                CASE WHEN @FollowUpDate_Clear = 1 THEN NULL ELSE ISNULL(@FollowUpDate, NULL) END,
                CASE WHEN @Notes_Clear = 1 THEN NULL ELSE ISNULL(@Notes, NULL) END
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwCareLogs] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateCareLog] TO [cdp_Developer], [cdp_Integration];

/* spCreate Permissions for MJ: Care Logs */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateCareLog] TO [cdp_Developer], [cdp_Integration];

/* spUpdate SQL for MJ: Care Logs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Care Logs
-- Item: spUpdateCareLog
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR CareLog
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateCareLog]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateCareLog];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateCareLog]
    @ID uniqueidentifier,
    @AnimalID uniqueidentifier = NULL,
    @CareDate date = NULL,
    @CareType nvarchar(20) = NULL,
    @Description nvarchar(500) = NULL,
    @PerformedBy_Clear bit = 0,
    @PerformedBy nvarchar(100) = NULL,
    @IsComplete bit = NULL,
    @FollowUpDate_Clear bit = 0,
    @FollowUpDate date = NULL,
    @Notes_Clear bit = 0,
    @Notes nvarchar(MAX) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[CareLog]
    SET
        [AnimalID] = ISNULL(@AnimalID, [AnimalID]),
        [CareDate] = ISNULL(@CareDate, [CareDate]),
        [CareType] = ISNULL(@CareType, [CareType]),
        [Description] = ISNULL(@Description, [Description]),
        [PerformedBy] = CASE WHEN @PerformedBy_Clear = 1 THEN NULL ELSE ISNULL(@PerformedBy, [PerformedBy]) END,
        [IsComplete] = ISNULL(@IsComplete, [IsComplete]),
        [FollowUpDate] = CASE WHEN @FollowUpDate_Clear = 1 THEN NULL ELSE ISNULL(@FollowUpDate, [FollowUpDate]) END,
        [Notes] = CASE WHEN @Notes_Clear = 1 THEN NULL ELSE ISNULL(@Notes, [Notes]) END
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwCareLogs] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwCareLogs]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateCareLog] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the CareLog table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateCareLog]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateCareLog];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateCareLog
ON [${flyway:defaultSchema}].[CareLog]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[CareLog]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[CareLog] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO

/* spUpdate Permissions for MJ: Care Logs */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateCareLog] TO [cdp_Developer], [cdp_Integration];

/* spDelete SQL for MJ: Care Logs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Care Logs
-- Item: spDeleteCareLog
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR CareLog
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteCareLog]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteCareLog];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteCareLog]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[CareLog]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteCareLog] TO [cdp_Developer], [cdp_Integration];

/* spDelete Permissions for MJ: Care Logs */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteCareLog] TO [cdp_Developer], [cdp_Integration];

/* SQL text to insert 2 new entity field(s) */
UPDATE [${flyway:defaultSchema}].[EntityField]
         SET [Sequence] = [Sequence] + 100000
       WHERE [EntityID] = '78A0F3A7-1A8A-42BF-AC00-BEE96BF22BD1'
         AND [Sequence] < 100000;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '276f1f45-ea0b-411b-9d3d-23f2d6c5e796' OR (EntityID = '78A0F3A7-1A8A-42BF-AC00-BEE96BF22BD1' AND Name = 'Animal')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '276f1f45-ea0b-411b-9d3d-23f2d6c5e796',
            '78A0F3A7-1A8A-42BF-AC00-BEE96BF22BD1', -- Entity: MJ: Care Logs
            (SELECT COALESCE(MAX([Sequence]), 0) FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '78A0F3A7-1A8A-42BF-AC00-BEE96BF22BD1') + 12,
            'Animal',
            'Animal',
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
               SET IsNameField = 1
               WHERE ID = '4ABA2B4B-545F-434A-8B4A-53D1049E84ED'
               AND AutoUpdateIsNameField = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = 'F5EE959E-25F8-4328-B48D-CF14A85663A7'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '4ABA2B4B-545F-434A-8B4A-53D1049E84ED'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '0BDE4FAD-E415-4E7D-B443-E750C70392C0'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '39B1C2AC-75FE-42FF-982B-FD32B6A7B8E0'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '89F34064-937A-4928-B0D5-CF93FBE9DD14'
               AND AutoUpdateDefaultInView = 1;

            UPDATE [${flyway:defaultSchema}].[Entity]
            SET AllowUserSearchAPI = 0
            WHERE ID = '78A0F3A7-1A8A-42BF-AC00-BEE96BF22BD1'
            AND AutoUpdateAllowUserSearchAPI = 1;

/* Set categories for 12 fields */

-- UPDATE Entity Field Category Info MJ: Care Logs.ID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '3A59A925-7A6E-4028-A0B0-AE967CF82E6F' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Care Logs.AnimalID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Care Details',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '90228849-939B-40BD-95CA-CF0214505D2A' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Care Logs.Animal 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Care Details',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '276F1F45-EA0B-411B-9D3D-23F2D6C5E796' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Care Logs.CareDate 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Care Details',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'F5EE959E-25F8-4328-B48D-CF14A85663A7' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Care Logs.CareType 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Care Details',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '4ABA2B4B-545F-434A-8B4A-53D1049E84ED' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Care Logs.IsComplete 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Care Details',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '89F34064-937A-4928-B0D5-CF93FBE9DD14' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Care Logs.Description 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Clinical Documentation',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '0BDE4FAD-E415-4E7D-B443-E750C70392C0' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Care Logs.Notes 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Clinical Documentation',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'A275AFF3-9F2B-4166-9FFA-3442F40940CD' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Care Logs.PerformedBy 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Clinical Documentation',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '39B1C2AC-75FE-42FF-982B-FD32B6A7B8E0' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Care Logs.FollowUpDate 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Clinical Documentation',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '6627CC71-CB4F-444F-965B-4DB8C3A0AF70' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Care Logs.__mj_CreatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'D540DCED-1D7D-44EA-8E85-B03CE91A857A' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Care Logs.__mj_UpdatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '58FB4E46-13A0-415A-BF2D-D5371B688A66' AND AutoUpdateCategory = 1;

/* Set entity icon to fa fa-notes-medical */

               UPDATE [${flyway:defaultSchema}].[Entity]
               SET [Icon] = 'fa fa-notes-medical', [__mj_UpdatedAt] = GETUTCDATE()
               WHERE [ID] = '78A0F3A7-1A8A-42BF-AC00-BEE96BF22BD1';

/* Insert FieldCategoryInfo setting for entity */

               INSERT INTO [${flyway:defaultSchema}].[EntitySetting] ([ID], [EntityID], [Name], [Value], [__mj_CreatedAt], [__mj_UpdatedAt])
               VALUES ('7237b4dd-4876-4739-9a15-24fb1bd69844', '78A0F3A7-1A8A-42BF-AC00-BEE96BF22BD1', 'FieldCategoryInfo', '{"Care Details":{"icon":"fa fa-info-circle","description":"Core information regarding the animal, care type, and completion status"},"Clinical Documentation":{"icon":"fa fa-file-medical","description":"Detailed clinical notes, summaries, and follow-up scheduling"},"System Metadata":{"icon":"fa fa-cog","description":"System-managed audit and tracking fields"}}', GETUTCDATE(), GETUTCDATE());

/* Insert FieldCategoryIcons setting (legacy) */

               INSERT INTO [${flyway:defaultSchema}].[EntitySetting] ([ID], [EntityID], [Name], [Value], [__mj_CreatedAt], [__mj_UpdatedAt])
               VALUES ('4d80ce23-a07d-4678-9cae-1b301d691adc', '78A0F3A7-1A8A-42BF-AC00-BEE96BF22BD1', 'FieldCategoryIcons', '{"Care Details":"fa fa-info-circle","Clinical Documentation":"fa fa-file-medical","System Metadata":"fa fa-cog"}', GETUTCDATE(), GETUTCDATE());

/* Set DefaultForNewUser=true for NEW entity (category: supporting, confidence: high) */

         UPDATE [${flyway:defaultSchema}].[ApplicationEntity]
         SET [DefaultForNewUser] = 1, [__mj_UpdatedAt] = GETUTCDATE()
         WHERE [EntityID] = '78A0F3A7-1A8A-42BF-AC00-BEE96BF22BD1';

/* Generated Validation Functions for MJ: Care Logs */
-- CHECK constraint for MJ: Care Logs @ Table Level was newly set or modified since the last generation of the validation function, the code was regenerated and updating the GeneratedCode table with the new generated validation function
INSERT INTO [${flyway:defaultSchema}].[GeneratedCode] ([CategoryID], [GeneratedByModelID], [GeneratedAt], [Language], [Status], [Source], [Code], [Description], [Name], [LinkedEntityID], [LinkedRecordPrimaryKey])
                      VALUES ((SELECT [ID] FROM [${flyway:defaultSchema}].[vwGeneratedCodeCategories] WHERE [Name]='CodeGen: Validators'), 'C43229F6-4CC8-4838-9D04-03419A2DA191', GETUTCDATE(), 'TypeScript', 'Approved', '([FollowUpDate] IS NULL OR [FollowUpDate]>=[CareDate])', 'public ValidateFollowUpDateOnOrAfterCareDate(result: ValidationResult) {
	if (this.FollowUpDate != null && this.CareDate != null) {
		const followUp = new Date(this.FollowUpDate).getTime();
		const care = new Date(this.CareDate).getTime();
		if (followUp < care) {
			result.Errors.push(new ValidationErrorInfo(
				"FollowUpDate",
				"The follow-up date must be on or after the care date.",
				this.FollowUpDate,
				ValidationErrorType.Failure
			));
		}
	}
}', 'The follow-up date must be on or after the care date to ensure chronological consistency.', 'ValidateFollowUpDateOnOrAfterCareDate', 'E0238F34-2837-EF11-86D4-6045BDEE16E6', '78A0F3A7-1A8A-42BF-AC00-BEE96BF22BD1');

