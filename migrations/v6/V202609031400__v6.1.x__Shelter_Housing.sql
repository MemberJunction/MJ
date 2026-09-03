/* ==============================================================================================
   MJ Academy — Harbor Street Animal Shelter: Housing

   Module 4. The first related record that is meaningful on its own, with its own list and form.
   It exists so there is something real to filter an animal grid BY and to group a count BY.

   WHY THESE COLUMNS

     Capacity      The most load-bearing column in the schema. It makes "can this animal go here?"
                   a question that cannot be answered without reading the database, which is the
                   whole justification for the ValidateAsync lesson in module 6.
     Species       Stops a cat being assigned to a dog run. Allows Any, unlike Animal.Species,
                   because some units take either.
     IsQuarantine  Keeps new intakes separated from the adoptable population.
     Building      Free text on purpose. Buildings differ per shelter and a check constraint here
                   would be a guess about someone elses site.

   WHAT IS DELIBERATELY ABSENT

     Occupancy is NOT stored. It is derived by counting animals assigned to the unit, so the
     dashboard has a real RunQuery to run instead of reading a denormalised column that would go
     stale the moment an animal moved.

   Animal.HousingID is nullable: an animal exists in the system from the moment it is logged, which
   is usually before anyone has placed it.
   ============================================================================================== */

CREATE TABLE ${flyway:defaultSchema}.Housing (
    ID UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
    Name NVARCHAR(50) NOT NULL,
    Building NVARCHAR(50) NULL,
    Species NVARCHAR(20) NOT NULL DEFAULT 'Any',
    Capacity INT NOT NULL,
    IsQuarantine BIT NOT NULL DEFAULT 0,
    IsActive BIT NOT NULL DEFAULT 1,
    CONSTRAINT PK_Housing PRIMARY KEY (ID),
    CONSTRAINT UQ_Housing_Building_Name UNIQUE (Building, Name),
    CONSTRAINT CK_Housing_Species CHECK (Species IN ('Dog','Cat','Any')),
    CONSTRAINT CK_Housing_Capacity CHECK (Capacity > 0)
);
GO

ALTER TABLE ${flyway:defaultSchema}.Animal
    ADD HousingID UNIQUEIDENTIFIER NULL
        CONSTRAINT FK_Animal_HousingID FOREIGN KEY REFERENCES ${flyway:defaultSchema}.Housing (ID);
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'A physical place an animal can be kept: a dog run, a cat condo, an isolation room. Occupancy is deliberately not stored here -- it is derived by counting the animals assigned to the unit, so it can never go stale.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'Housing';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'How many animals this unit is designed to hold. Assignment rules compare live occupancy against this number, which is why it cannot be answered without a database read.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'Housing',
    @level2type = N'COLUMN', @level2name = N'Capacity';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Which species the unit accepts: Dog, Cat, or Any. Prevents a cat being assigned to a dog run. Allows Any because some units take either, which Animal.Species does not.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'Housing',
    @level2type = N'COLUMN', @level2name = N'Species';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Marks the unit as quarantine space, used to keep new or sick intakes away from the adoptable population.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'Housing',
    @level2type = N'COLUMN', @level2name = N'IsQuarantine';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'The housing unit this animal is currently assigned to. Nullable because an animal is logged at intake, usually before anyone has placed it.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'Animal',
    @level2type = N'COLUMN', @level2name = N'HousingID';
GO


































































/* ============================================================================================
   ============================================================================================
   ==                                                                                        ==
   ==   EVERYTHING BELOW THIS POINT WAS PRODUCED BY THE MEMBERJUNCTION CodeGen TOOL          ==
   ==                                                                                        ==
   ==   DO NOT EDIT ANY OF IT BY HAND.                                                       ==
   ==                                                                                        ==
   ==   It contains the Entity / EntityField metadata inserts, the generated base view, the  ==
   ==   spCreate / spUpdate / spDelete procedures, permission grants, and extended-property   ==
   ==   descriptions for the IdentityClaimType and IdentityClaim tables.                     ==
   ==                                                                                        ==
   ==   If the hand-written DDL above changes, DO NOT patch this section: re-run              ==
   ==   `mj codegen` and replace this entire block with the new output.                       ==
   ==                                                                                        ==
   ============================================================================================
   ============================================================================================ */

/* SQL generated to create new entity MJ: Housings */

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
         'bade4114-5159-4461-9af5-8819623abd0c',
         'MJ: Housings',
         'Housings',
         'A physical place an animal can be kept: a dog run, a cat condo, an isolation room. Occupancy is deliberately not stored here -- it is derived by counting the animals assigned to the unit, so it can never go stale.',
         NULL,
         'Housing',
         'vwHousings',
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

/* SQL generated to add new entity MJ: Housings to application ID: 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E' */
INSERT INTO [${flyway:defaultSchema}].[ApplicationEntity]
                                       ([ApplicationID], [EntityID], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                       ('EBA5CCEC-6A37-EF11-86D4-000D3A4E707E', 'bade4114-5159-4461-9af5-8819623abd0c', (SELECT COALESCE(MAX([Sequence]),0)+1 FROM [${flyway:defaultSchema}].[ApplicationEntity] WHERE [ApplicationID] = 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E'), GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity MJ: Housings for role UI */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('bade4114-5159-4461-9af5-8819623abd0c', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0, 0, 0, GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity MJ: Housings for role Developer */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('bade4114-5159-4461-9af5-8819623abd0c', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity MJ: Housings for role Integration */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('bade4114-5159-4461-9af5-8819623abd0c', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE());

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.Housing */
ALTER TABLE [${flyway:defaultSchema}].[Housing] ADD [__mj_CreatedAt] DATETIMEOFFSET NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.Housing */
UPDATE [${flyway:defaultSchema}].[Housing] SET [__mj_CreatedAt] = GETUTCDATE() WHERE [__mj_CreatedAt] IS NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.Housing */
ALTER TABLE [${flyway:defaultSchema}].[Housing] ALTER COLUMN [__mj_CreatedAt] DATETIMEOFFSET NOT NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.Housing */
ALTER TABLE [${flyway:defaultSchema}].[Housing] ADD CONSTRAINT [DF___mj_Housing___mj_CreatedAt] DEFAULT GETUTCDATE() FOR [__mj_CreatedAt];
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.Housing */
ALTER TABLE [${flyway:defaultSchema}].[Housing] ADD [__mj_UpdatedAt] DATETIMEOFFSET NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.Housing */
UPDATE [${flyway:defaultSchema}].[Housing] SET [__mj_UpdatedAt] = GETUTCDATE() WHERE [__mj_UpdatedAt] IS NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.Housing */
ALTER TABLE [${flyway:defaultSchema}].[Housing] ALTER COLUMN [__mj_UpdatedAt] DATETIMEOFFSET NOT NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.Housing */
ALTER TABLE [${flyway:defaultSchema}].[Housing] ADD CONSTRAINT [DF___mj_Housing___mj_UpdatedAt] DEFAULT GETUTCDATE() FOR [__mj_UpdatedAt];
GO

/* SQL text to insert 12 new entity field(s) */
UPDATE [${flyway:defaultSchema}].[EntityField]
         SET [Sequence] = [Sequence] + 100000
       WHERE [EntityID] = 'BADE4114-5159-4461-9AF5-8819623ABD0C'
         AND [Sequence] < 100000;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'e21860b9-6f4a-4908-9e3b-65634e1880a8' OR (EntityID = 'BADE4114-5159-4461-9AF5-8819623ABD0C' AND Name = 'ID')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'e21860b9-6f4a-4908-9e3b-65634e1880a8',
            'BADE4114-5159-4461-9AF5-8819623ABD0C', -- Entity: MJ: Housings
            (SELECT COALESCE(MAX([Sequence]), 0) FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'BADE4114-5159-4461-9AF5-8819623ABD0C') + 1,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '2f816d23-db75-44fe-b15f-fe23317e3f18' OR (EntityID = 'BADE4114-5159-4461-9AF5-8819623ABD0C' AND Name = 'Name')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '2f816d23-db75-44fe-b15f-fe23317e3f18',
            'BADE4114-5159-4461-9AF5-8819623ABD0C', -- Entity: MJ: Housings
            (SELECT COALESCE(MAX([Sequence]), 0) FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'BADE4114-5159-4461-9AF5-8819623ABD0C') + 2,
            'Name',
            'Name',
            NULL,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'c5a86050-f091-42c0-8d44-cedd19d7e954' OR (EntityID = 'BADE4114-5159-4461-9AF5-8819623ABD0C' AND Name = 'Building')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'c5a86050-f091-42c0-8d44-cedd19d7e954',
            'BADE4114-5159-4461-9AF5-8819623ABD0C', -- Entity: MJ: Housings
            (SELECT COALESCE(MAX([Sequence]), 0) FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'BADE4114-5159-4461-9AF5-8819623ABD0C') + 3,
            'Building',
            'Building',
            NULL,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'cf9fac6f-98dd-4882-a8cd-7452c0390cec' OR (EntityID = 'BADE4114-5159-4461-9AF5-8819623ABD0C' AND Name = 'Species')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'cf9fac6f-98dd-4882-a8cd-7452c0390cec',
            'BADE4114-5159-4461-9AF5-8819623ABD0C', -- Entity: MJ: Housings
            (SELECT COALESCE(MAX([Sequence]), 0) FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'BADE4114-5159-4461-9AF5-8819623ABD0C') + 4,
            'Species',
            'Species',
            'Which species the unit accepts: Dog, Cat, or Any. Prevents a cat being assigned to a dog run. Allows Any because some units take either, which Animal.Species does not.',
            'nvarchar',
            40,
            0,
            0,
            0,
            'Any',
            0,
            1,
            0,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '7860f7ba-72d5-4759-9a5c-224e1176ee6f' OR (EntityID = 'BADE4114-5159-4461-9AF5-8819623ABD0C' AND Name = 'Capacity')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '7860f7ba-72d5-4759-9a5c-224e1176ee6f',
            'BADE4114-5159-4461-9AF5-8819623ABD0C', -- Entity: MJ: Housings
            (SELECT COALESCE(MAX([Sequence]), 0) FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'BADE4114-5159-4461-9AF5-8819623ABD0C') + 5,
            'Capacity',
            'Capacity',
            'How many animals this unit is designed to hold. Assignment rules compare live occupancy against this number, which is why it cannot be answered without a database read.',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '0fc4ba4e-6f2c-4ed8-99e3-2a45ca6be12c' OR (EntityID = 'BADE4114-5159-4461-9AF5-8819623ABD0C' AND Name = 'IsQuarantine')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '0fc4ba4e-6f2c-4ed8-99e3-2a45ca6be12c',
            'BADE4114-5159-4461-9AF5-8819623ABD0C', -- Entity: MJ: Housings
            (SELECT COALESCE(MAX([Sequence]), 0) FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'BADE4114-5159-4461-9AF5-8819623ABD0C') + 6,
            'IsQuarantine',
            'Is Quarantine',
            'Marks the unit as quarantine space, used to keep new or sick intakes away from the adoptable population.',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'cfe52948-8b08-41f1-b34e-fc2dd72fc63e' OR (EntityID = 'BADE4114-5159-4461-9AF5-8819623ABD0C' AND Name = 'IsActive')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'cfe52948-8b08-41f1-b34e-fc2dd72fc63e',
            'BADE4114-5159-4461-9AF5-8819623ABD0C', -- Entity: MJ: Housings
            (SELECT COALESCE(MAX([Sequence]), 0) FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'BADE4114-5159-4461-9AF5-8819623ABD0C') + 7,
            'IsActive',
            'Is Active',
            NULL,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '38661252-7c52-45e9-a22c-ba33129bb9ef' OR (EntityID = 'BADE4114-5159-4461-9AF5-8819623ABD0C' AND Name = '__mj_CreatedAt')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '38661252-7c52-45e9-a22c-ba33129bb9ef',
            'BADE4114-5159-4461-9AF5-8819623ABD0C', -- Entity: MJ: Housings
            (SELECT COALESCE(MAX([Sequence]), 0) FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'BADE4114-5159-4461-9AF5-8819623ABD0C') + 8,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'd807069a-e7a4-4cd8-bb93-2331285f7098' OR (EntityID = 'BADE4114-5159-4461-9AF5-8819623ABD0C' AND Name = '__mj_UpdatedAt')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'd807069a-e7a4-4cd8-bb93-2331285f7098',
            'BADE4114-5159-4461-9AF5-8819623ABD0C', -- Entity: MJ: Housings
            (SELECT COALESCE(MAX([Sequence]), 0) FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'BADE4114-5159-4461-9AF5-8819623ABD0C') + 9,
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
UPDATE [${flyway:defaultSchema}].[EntityField]
         SET [Sequence] = [Sequence] + 100000
       WHERE [EntityID] = '22E4F4DE-9A9B-4FE3-AB1A-ECAC7EF5EF9D'
         AND [Sequence] < 100000;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '3c9ea97f-d1f7-4cba-b037-f367e3520c70' OR (EntityID = '22E4F4DE-9A9B-4FE3-AB1A-ECAC7EF5EF9D' AND Name = 'HousingID')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '3c9ea97f-d1f7-4cba-b037-f367e3520c70',
            '22E4F4DE-9A9B-4FE3-AB1A-ECAC7EF5EF9D', -- Entity: MJ: Animals
            (SELECT COALESCE(MAX([Sequence]), 0) FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '22E4F4DE-9A9B-4FE3-AB1A-ECAC7EF5EF9D') + 16,
            'HousingID',
            'Housing ID',
            'The housing unit this animal is currently assigned to. Nullable because an animal is logged at intake, usually before anyone has placed it.',
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
            'BADE4114-5159-4461-9AF5-8819623ABD0C',
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

/* SQL text to insert entity field value with ID 098f5ef3-9f5d-4773-b4b1-bae819f54f3c */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('098f5ef3-9f5d-4773-b4b1-bae819f54f3c', 'CF9FAC6F-98DD-4882-A8CD-7452C0390CEC', 1, 'Any', 'Any', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID fdbd8a7b-fbe3-4925-a2a8-584bdbfbbd5a */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('fdbd8a7b-fbe3-4925-a2a8-584bdbfbbd5a', 'CF9FAC6F-98DD-4882-A8CD-7452C0390CEC', 2, 'Cat', 'Cat', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID d43a856b-11da-492a-994d-0872c00fd537 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('d43a856b-11da-492a-994d-0872c00fd537', 'CF9FAC6F-98DD-4882-A8CD-7452C0390CEC', 3, 'Dog', 'Dog', GETUTCDATE(), GETUTCDATE());

/* SQL text to update ValueListType for entity field ID CF9FAC6F-98DD-4882-A8CD-7452C0390CEC */
UPDATE [${flyway:defaultSchema}].[EntityField] SET ValueListType='List' WHERE ID='CF9FAC6F-98DD-4882-A8CD-7452C0390CEC';


/* Create Entity Relationship: MJ: Housings -> MJ: Animals (One To Many via HousingID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = '30e5a2b2-8946-4a5e-b0bb-c1218c6faea6'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('30e5a2b2-8946-4a5e-b0bb-c1218c6faea6', 'BADE4114-5159-4461-9AF5-8819623ABD0C', '22E4F4DE-9A9B-4FE3-AB1A-ECAC7EF5EF9D', 'HousingID', 'One To Many', 1, 1, 1, GETUTCDATE(), GETUTCDATE())
   END;

/* Index for Foreign Keys for Animal */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Animals
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key BreedID in table Animal
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_Animal_BreedID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[Animal]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_Animal_BreedID ON [${flyway:defaultSchema}].[Animal] ([BreedID]);

-- Index for foreign key HousingID in table Animal
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_Animal_HousingID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[Animal]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_Animal_HousingID ON [${flyway:defaultSchema}].[Animal] ([HousingID]);

/* SQL text to update entity field related entity name field map for entity field ID 3C9EA97F-D1F7-4CBA-B037-F367E3520C70 */
EXEC [${flyway:defaultSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='3C9EA97F-D1F7-4CBA-B037-F367E3520C70', @RelatedEntityNameFieldMap='Housing';

/* Base View SQL for MJ: Animals */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Animals
-- Item: vwAnimals
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: Animals
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  Animal
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwAnimals]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwAnimals];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwAnimals]
AS
SELECT
    a.*,
    MJBreed_BreedID.[Name] AS [Breed],
    MJHousing_HousingID.[Name] AS [Housing]
FROM
    [${flyway:defaultSchema}].[Animal] AS a
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[Breed] AS MJBreed_BreedID
  ON
    [a].[BreedID] = MJBreed_BreedID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[Housing] AS MJHousing_HousingID
  ON
    [a].[HousingID] = MJHousing_HousingID.[ID]
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwAnimals] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* Base View Permissions SQL for MJ: Animals */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Animals
-- Item: Permissions for vwAnimals
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwAnimals] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* spCreate SQL for MJ: Animals */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Animals
-- Item: spCreateAnimal
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR Animal
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateAnimal]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateAnimal];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateAnimal]
    @ID uniqueidentifier = NULL,
    @Name nvarchar(100),
    @Species nvarchar(20),
    @BreedID_Clear bit = 0,
    @BreedID uniqueidentifier = NULL,
    @MicrochipNumber_Clear bit = 0,
    @MicrochipNumber nvarchar(30) = NULL,
    @IntakeDate date,
    @IntakeReason_Clear bit = 0,
    @IntakeReason nvarchar(30) = NULL,
    @Sex_Clear bit = 0,
    @Sex nvarchar(10) = NULL,
    @EstimatedBirthDate_Clear bit = 0,
    @EstimatedBirthDate date = NULL,
    @WeightKg_Clear bit = 0,
    @WeightKg decimal(6, 2) = NULL,
    @Status nvarchar(20) = NULL,
    @Description_Clear bit = 0,
    @Description nvarchar(MAX) = NULL,
    @PhotoBase64_Clear bit = 0,
    @PhotoBase64 nvarchar(MAX) = NULL,
    @HousingID_Clear bit = 0,
    @HousingID uniqueidentifier = NULL
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)

    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[Animal]
            (
                [ID],
                [Name],
                [Species],
                [BreedID],
                [MicrochipNumber],
                [IntakeDate],
                [IntakeReason],
                [Sex],
                [EstimatedBirthDate],
                [WeightKg],
                [Status],
                [Description],
                [PhotoBase64],
                [HousingID]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @Name,
                @Species,
                CASE WHEN @BreedID_Clear = 1 THEN NULL ELSE ISNULL(@BreedID, NULL) END,
                CASE WHEN @MicrochipNumber_Clear = 1 THEN NULL ELSE ISNULL(@MicrochipNumber, NULL) END,
                @IntakeDate,
                CASE WHEN @IntakeReason_Clear = 1 THEN NULL ELSE ISNULL(@IntakeReason, NULL) END,
                CASE WHEN @Sex_Clear = 1 THEN NULL ELSE ISNULL(@Sex, NULL) END,
                CASE WHEN @EstimatedBirthDate_Clear = 1 THEN NULL ELSE ISNULL(@EstimatedBirthDate, NULL) END,
                CASE WHEN @WeightKg_Clear = 1 THEN NULL ELSE ISNULL(@WeightKg, NULL) END,
                ISNULL(@Status, 'Intake'),
                CASE WHEN @Description_Clear = 1 THEN NULL ELSE ISNULL(@Description, NULL) END,
                CASE WHEN @PhotoBase64_Clear = 1 THEN NULL ELSE ISNULL(@PhotoBase64, NULL) END,
                CASE WHEN @HousingID_Clear = 1 THEN NULL ELSE ISNULL(@HousingID, NULL) END
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[Animal]
            (
                [Name],
                [Species],
                [BreedID],
                [MicrochipNumber],
                [IntakeDate],
                [IntakeReason],
                [Sex],
                [EstimatedBirthDate],
                [WeightKg],
                [Status],
                [Description],
                [PhotoBase64],
                [HousingID]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @Name,
                @Species,
                CASE WHEN @BreedID_Clear = 1 THEN NULL ELSE ISNULL(@BreedID, NULL) END,
                CASE WHEN @MicrochipNumber_Clear = 1 THEN NULL ELSE ISNULL(@MicrochipNumber, NULL) END,
                @IntakeDate,
                CASE WHEN @IntakeReason_Clear = 1 THEN NULL ELSE ISNULL(@IntakeReason, NULL) END,
                CASE WHEN @Sex_Clear = 1 THEN NULL ELSE ISNULL(@Sex, NULL) END,
                CASE WHEN @EstimatedBirthDate_Clear = 1 THEN NULL ELSE ISNULL(@EstimatedBirthDate, NULL) END,
                CASE WHEN @WeightKg_Clear = 1 THEN NULL ELSE ISNULL(@WeightKg, NULL) END,
                ISNULL(@Status, 'Intake'),
                CASE WHEN @Description_Clear = 1 THEN NULL ELSE ISNULL(@Description, NULL) END,
                CASE WHEN @PhotoBase64_Clear = 1 THEN NULL ELSE ISNULL(@PhotoBase64, NULL) END,
                CASE WHEN @HousingID_Clear = 1 THEN NULL ELSE ISNULL(@HousingID, NULL) END
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwAnimals] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateAnimal] TO [cdp_Developer], [cdp_Integration];

/* spCreate Permissions for MJ: Animals */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateAnimal] TO [cdp_Developer], [cdp_Integration];

/* spUpdate SQL for MJ: Animals */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Animals
-- Item: spUpdateAnimal
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR Animal
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateAnimal]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateAnimal];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateAnimal]
    @ID uniqueidentifier,
    @Name nvarchar(100) = NULL,
    @Species nvarchar(20) = NULL,
    @BreedID_Clear bit = 0,
    @BreedID uniqueidentifier = NULL,
    @MicrochipNumber_Clear bit = 0,
    @MicrochipNumber nvarchar(30) = NULL,
    @IntakeDate date = NULL,
    @IntakeReason_Clear bit = 0,
    @IntakeReason nvarchar(30) = NULL,
    @Sex_Clear bit = 0,
    @Sex nvarchar(10) = NULL,
    @EstimatedBirthDate_Clear bit = 0,
    @EstimatedBirthDate date = NULL,
    @WeightKg_Clear bit = 0,
    @WeightKg decimal(6, 2) = NULL,
    @Status nvarchar(20) = NULL,
    @Description_Clear bit = 0,
    @Description nvarchar(MAX) = NULL,
    @PhotoBase64_Clear bit = 0,
    @PhotoBase64 nvarchar(MAX) = NULL,
    @HousingID_Clear bit = 0,
    @HousingID uniqueidentifier = NULL
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[Animal]
    SET
        [Name] = ISNULL(@Name, [Name]),
        [Species] = ISNULL(@Species, [Species]),
        [BreedID] = CASE WHEN @BreedID_Clear = 1 THEN NULL ELSE ISNULL(@BreedID, [BreedID]) END,
        [MicrochipNumber] = CASE WHEN @MicrochipNumber_Clear = 1 THEN NULL ELSE ISNULL(@MicrochipNumber, [MicrochipNumber]) END,
        [IntakeDate] = ISNULL(@IntakeDate, [IntakeDate]),
        [IntakeReason] = CASE WHEN @IntakeReason_Clear = 1 THEN NULL ELSE ISNULL(@IntakeReason, [IntakeReason]) END,
        [Sex] = CASE WHEN @Sex_Clear = 1 THEN NULL ELSE ISNULL(@Sex, [Sex]) END,
        [EstimatedBirthDate] = CASE WHEN @EstimatedBirthDate_Clear = 1 THEN NULL ELSE ISNULL(@EstimatedBirthDate, [EstimatedBirthDate]) END,
        [WeightKg] = CASE WHEN @WeightKg_Clear = 1 THEN NULL ELSE ISNULL(@WeightKg, [WeightKg]) END,
        [Status] = ISNULL(@Status, [Status]),
        [Description] = CASE WHEN @Description_Clear = 1 THEN NULL ELSE ISNULL(@Description, [Description]) END,
        [PhotoBase64] = CASE WHEN @PhotoBase64_Clear = 1 THEN NULL ELSE ISNULL(@PhotoBase64, [PhotoBase64]) END,
        [HousingID] = CASE WHEN @HousingID_Clear = 1 THEN NULL ELSE ISNULL(@HousingID, [HousingID]) END
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwAnimals] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwAnimals]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateAnimal] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the Animal table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateAnimal]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateAnimal];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateAnimal
ON [${flyway:defaultSchema}].[Animal]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[Animal]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[Animal] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO

/* spUpdate Permissions for MJ: Animals */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateAnimal] TO [cdp_Developer], [cdp_Integration];

/* spDelete SQL for MJ: Animals */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Animals
-- Item: spDeleteAnimal
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR Animal
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteAnimal]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteAnimal];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteAnimal]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[Animal]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteAnimal] TO [cdp_Developer], [cdp_Integration];

/* spDelete Permissions for MJ: Animals */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteAnimal] TO [cdp_Developer], [cdp_Integration];

/* Index for Foreign Keys for Housing */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Housings
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------;

/* Base View SQL for MJ: Housings */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Housings
-- Item: vwHousings
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: Housings
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  Housing
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwHousings]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwHousings];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwHousings]
AS
SELECT
    h.*
FROM
    [${flyway:defaultSchema}].[Housing] AS h
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwHousings] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* Base View Permissions SQL for MJ: Housings */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Housings
-- Item: Permissions for vwHousings
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwHousings] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* spCreate SQL for MJ: Housings */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Housings
-- Item: spCreateHousing
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR Housing
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateHousing]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateHousing];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateHousing]
    @ID uniqueidentifier = NULL,
    @Name nvarchar(50),
    @Building_Clear bit = 0,
    @Building nvarchar(50) = NULL,
    @Species nvarchar(20) = NULL,
    @Capacity int,
    @IsQuarantine bit = NULL,
    @IsActive bit = NULL
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)

    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[Housing]
            (
                [ID],
                [Name],
                [Building],
                [Species],
                [Capacity],
                [IsQuarantine],
                [IsActive]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @Name,
                CASE WHEN @Building_Clear = 1 THEN NULL ELSE ISNULL(@Building, NULL) END,
                ISNULL(@Species, 'Any'),
                @Capacity,
                ISNULL(@IsQuarantine, 0),
                ISNULL(@IsActive, 1)
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[Housing]
            (
                [Name],
                [Building],
                [Species],
                [Capacity],
                [IsQuarantine],
                [IsActive]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @Name,
                CASE WHEN @Building_Clear = 1 THEN NULL ELSE ISNULL(@Building, NULL) END,
                ISNULL(@Species, 'Any'),
                @Capacity,
                ISNULL(@IsQuarantine, 0),
                ISNULL(@IsActive, 1)
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwHousings] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateHousing] TO [cdp_Developer], [cdp_Integration];

/* spCreate Permissions for MJ: Housings */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateHousing] TO [cdp_Developer], [cdp_Integration];

/* spUpdate SQL for MJ: Housings */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Housings
-- Item: spUpdateHousing
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR Housing
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateHousing]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateHousing];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateHousing]
    @ID uniqueidentifier,
    @Name nvarchar(50) = NULL,
    @Building_Clear bit = 0,
    @Building nvarchar(50) = NULL,
    @Species nvarchar(20) = NULL,
    @Capacity int = NULL,
    @IsQuarantine bit = NULL,
    @IsActive bit = NULL
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[Housing]
    SET
        [Name] = ISNULL(@Name, [Name]),
        [Building] = CASE WHEN @Building_Clear = 1 THEN NULL ELSE ISNULL(@Building, [Building]) END,
        [Species] = ISNULL(@Species, [Species]),
        [Capacity] = ISNULL(@Capacity, [Capacity]),
        [IsQuarantine] = ISNULL(@IsQuarantine, [IsQuarantine]),
        [IsActive] = ISNULL(@IsActive, [IsActive])
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwHousings] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwHousings]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateHousing] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the Housing table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateHousing]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateHousing];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateHousing
ON [${flyway:defaultSchema}].[Housing]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[Housing]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[Housing] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO

/* spUpdate Permissions for MJ: Housings */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateHousing] TO [cdp_Developer], [cdp_Integration];

/* spDelete SQL for MJ: Housings */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Housings
-- Item: spDeleteHousing
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR Housing
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteHousing]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteHousing];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteHousing]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[Housing]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteHousing] TO [cdp_Developer], [cdp_Integration];

/* spDelete Permissions for MJ: Housings */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteHousing] TO [cdp_Developer], [cdp_Integration];

/* SQL text to insert 2 new entity field(s) */
UPDATE [${flyway:defaultSchema}].[EntityField]
         SET [Sequence] = [Sequence] + 100000
       WHERE [EntityID] = '22E4F4DE-9A9B-4FE3-AB1A-ECAC7EF5EF9D'
         AND [Sequence] < 100000;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '3fde852d-4f5f-424b-8e36-e64feb8c0781' OR (EntityID = '22E4F4DE-9A9B-4FE3-AB1A-ECAC7EF5EF9D' AND Name = 'Housing')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '3fde852d-4f5f-424b-8e36-e64feb8c0781',
            '22E4F4DE-9A9B-4FE3-AB1A-ECAC7EF5EF9D', -- Entity: MJ: Animals
            (SELECT COALESCE(MAX([Sequence]), 0) FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '22E4F4DE-9A9B-4FE3-AB1A-ECAC7EF5EF9D') + 18,
            'Housing',
            'Housing',
            NULL,
            'nvarchar',
            100,
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

/* Set field properties for entity */

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = 'C5A86050-F091-42C0-8D44-CEDD19D7E954'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = 'CF9FAC6F-98DD-4882-A8CD-7452C0390CEC'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '7860F7BA-72D5-4759-9A5C-224E1176EE6F'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '0FC4BA4E-6F2C-4ED8-99E3-2A45CA6BE12C'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = 'CFE52948-8B08-41F1-B34E-FC2DD72FC63E'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET UserSearchPredicateAPI = 'BeginsWith'
               WHERE ID = '2F816D23-DB75-44FE-B15F-FE23317E3F18'
               AND AutoUpdateUserSearchPredicate = 1;

/* Set field properties for entity */

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '3FDE852D-4F5F-424B-8E36-E64FEB8C0781'
               AND AutoUpdateDefaultInView = 1;

/* Set categories for 9 fields */

-- UPDATE Entity Field Category Info MJ: Housings.ID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'E21860B9-6F4A-4908-9E3B-65634E1880A8' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Housings.Name 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Housing Details',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '2F816D23-DB75-44FE-B15F-FE23317E3F18' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Housings.Building 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Housing Details',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'C5A86050-F091-42C0-8D44-CEDD19D7E954' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Housings.Species 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Operational Rules',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'CF9FAC6F-98DD-4882-A8CD-7452C0390CEC' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Housings.Capacity 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Operational Rules',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '7860F7BA-72D5-4759-9A5C-224E1176EE6F' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Housings.IsQuarantine 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Operational Rules',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '0FC4BA4E-6F2C-4ED8-99E3-2A45CA6BE12C' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Housings.IsActive 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Operational Rules',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'CFE52948-8B08-41F1-B34E-FC2DD72FC63E' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Housings.__mj_CreatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '38661252-7C52-45E9-A22C-BA33129BB9EF' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Housings.__mj_UpdatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'D807069A-E7A4-4CD8-BB93-2331285F7098' AND AutoUpdateCategory = 1;

/* Set entity icon to fa fa-home */

               UPDATE [${flyway:defaultSchema}].[Entity]
               SET [Icon] = 'fa fa-home', [__mj_UpdatedAt] = GETUTCDATE()
               WHERE [ID] = 'BADE4114-5159-4461-9AF5-8819623ABD0C';

/* Insert FieldCategoryInfo setting for entity */

               INSERT INTO [${flyway:defaultSchema}].[EntitySetting] ([ID], [EntityID], [Name], [Value], [__mj_CreatedAt], [__mj_UpdatedAt])
               VALUES ('1944bd83-cfa6-4916-95e8-993ac65649df', 'BADE4114-5159-4461-9AF5-8819623ABD0C', 'FieldCategoryInfo', '{"Housing Details":{"icon":"fa fa-info-circle","description":"General identification and location information for the housing unit"},"Operational Rules":{"icon":"fa fa-cogs","description":"Rules governing capacity, species compatibility, and unit status"},"System Metadata":{"icon":"fa fa-cog","description":"System-managed audit and tracking fields"}}', GETUTCDATE(), GETUTCDATE());

/* Insert FieldCategoryIcons setting (legacy) */

               INSERT INTO [${flyway:defaultSchema}].[EntitySetting] ([ID], [EntityID], [Name], [Value], [__mj_CreatedAt], [__mj_UpdatedAt])
               VALUES ('eadd5f3a-fd64-4a35-95ba-07c345fdef20', 'BADE4114-5159-4461-9AF5-8819623ABD0C', 'FieldCategoryIcons', '{"Housing Details":"fa fa-info-circle","Operational Rules":"fa fa-cogs","System Metadata":"fa fa-cog"}', GETUTCDATE(), GETUTCDATE());

/* Set DefaultForNewUser=true for NEW entity (category: primary, confidence: high) */

         UPDATE [${flyway:defaultSchema}].[ApplicationEntity]
         SET [DefaultForNewUser] = 1, [__mj_UpdatedAt] = GETUTCDATE()
         WHERE [EntityID] = 'BADE4114-5159-4461-9AF5-8819623ABD0C';

/* Set categories for 18 fields */

-- UPDATE Entity Field Category Info MJ: Animals.ID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '7556A7F6-61EE-4C02-B410-D0DE79C4D61B' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Animals.__mj_CreatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '5F1C007E-9158-4FDA-B394-E4720CE1DC0D' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Animals.__mj_UpdatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '6C4C487E-6616-43A0-B731-E02749033E17' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Animals.Name 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'C755A802-FA0C-4100-9795-93FBB9A09CAD' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Animals.Species 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '14AF4223-9395-490A-9379-15CDB9D03097' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Animals.BreedID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   DisplayName = 'Breed ID',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'B296835D-7A50-4208-9671-0EAAC207F239' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Animals.Breed 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'A2FA8364-00BC-4B78-B404-B62FE5FBC819' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Animals.MicrochipNumber 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '57A8EE40-9CD3-47EA-AFE0-937A5A5FCF7E' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Animals.IntakeDate 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '4992E657-62FC-4B60-8B44-AE19B2643091' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Animals.IntakeReason 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '08050F3D-9B49-49D5-BCA2-8A416BC864ED' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Animals.Status 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'C4C52249-5EB8-4886-8431-87E2F1D6D1A0' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Animals.HousingID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Shelter History',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '3C9EA97F-D1F7-4CBA-B037-F367E3520C70' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Animals.Housing 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Shelter History',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '3FDE852D-4F5F-424B-8E36-E64FEB8C0781' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Animals.Sex 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '61F9A077-4288-4DDD-9E7D-101952BE8E0E' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Animals.EstimatedBirthDate 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '3379A4DB-A473-4FA1-AA5B-4FF5508781BE' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Animals.WeightKg 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'A26EE0EA-5B2E-4CDC-B458-64861B812713' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Animals.Description 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '5B541036-B1DB-4A16-8873-73E4A880E923' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Animals.PhotoBase64 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '7532C9F4-CEAB-44B0-80C1-218FE913C9BB' AND AutoUpdateCategory = 1;

/* Generated Validation Functions for MJ: Housings */
-- CHECK constraint for MJ: Housings: Field: Capacity was newly set or modified since the last generation of the validation function, the code was regenerated and updating the GeneratedCode table with the new generated validation function
INSERT INTO [${flyway:defaultSchema}].[GeneratedCode] ([CategoryID], [GeneratedByModelID], [GeneratedAt], [Language], [Status], [Source], [Code], [Description], [Name], [LinkedEntityID], [LinkedRecordPrimaryKey])
                      VALUES ((SELECT [ID] FROM [${flyway:defaultSchema}].[vwGeneratedCodeCategories] WHERE [Name]='CodeGen: Validators'), 'C43229F6-4CC8-4838-9D04-03419A2DA191', GETUTCDATE(), 'TypeScript', 'Approved', '([Capacity]>(0))', 'public ValidateCapacityGreaterThanZero(result: ValidationResult) {
	if (this.Capacity !== undefined && this.Capacity !== null && this.Capacity <= 0) {
		result.Errors.push(new ValidationErrorInfo(
			"Capacity",
			"Capacity must be greater than zero.",
			this.Capacity,
			ValidationErrorType.Failure
		));
	}
}', 'The capacity must be a positive number greater than zero.', 'ValidateCapacityGreaterThanZero', 'DF238F34-2837-EF11-86D4-6045BDEE16E6', '7860F7BA-72D5-4759-9A5C-224E1176EE6F');

/********** CODE GEN RUN #2 - after mj sync push *********/
