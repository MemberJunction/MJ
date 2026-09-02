/* ==============================================================================================
   MJ Academy — Harbor Street Animal Shelter: Animal and Breed

   The first two tables of the MJ Academy course-1 teaching app. The app is built as an ordinary
   MJ Explorer app rather than an Open App: its tables live in the core schema, its generated
   code lands in the MJ core generation targets, and it needs no manifest, no dynamic
   package registration and no separate workspace.

   WHAT THIS CREATES

     Breed   — reference data. The set of breeds the shelter recognises, per species.
     Animal  — the central shelter record. One row per animal currently in shelter care.

   Animal.BreedID is nullable on purpose: a stray arrives without a known breed, and the intake
   staff must be able to save the record before anyone has identified it. Species is duplicated
   on Animal rather than read through Breed for the same reason — species is known at intake even
   when breed is not, and every downstream feature filters on it.

   No CreatedAt, UpdatedAt or per-field ChangedAt columns are declared. MJ records field-level history in
   __mj.RecordChange for any entity with TrackRecordChanges enabled, which is the default, so
   hand-rolled audit columns would be a second, weaker source of truth.
   ============================================================================================== */

CREATE TABLE ${flyway:defaultSchema}.Breed (
    ID UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
    Name NVARCHAR(100) NOT NULL,
    Species NVARCHAR(20) NOT NULL,
    SizeCategory NVARCHAR(20) NULL,
    TypicalLifespanYears INT NULL,
    IsActive BIT NOT NULL DEFAULT 1,
    CONSTRAINT PK_Breed PRIMARY KEY (ID),
    CONSTRAINT UQ_Breed_Species_Name UNIQUE (Species, Name),
    CONSTRAINT CK_Breed_Species CHECK (Species IN ('Dog','Cat')),
    CONSTRAINT CK_Breed_SizeCategory CHECK (SizeCategory IS NULL OR SizeCategory IN ('Small','Medium','Large','Giant')),
    CONSTRAINT CK_Breed_TypicalLifespanYears CHECK (TypicalLifespanYears IS NULL OR TypicalLifespanYears > 0)
);
GO

CREATE TABLE ${flyway:defaultSchema}.Animal (
    ID UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
    Name NVARCHAR(100) NOT NULL,
    Species NVARCHAR(20) NOT NULL,
    BreedID UNIQUEIDENTIFIER NULL,
    MicrochipNumber NVARCHAR(30) NULL,
    IntakeDate DATE NOT NULL,
    IntakeReason NVARCHAR(30) NULL,
    Sex NVARCHAR(10) NULL,
    EstimatedBirthDate DATE NULL,
    WeightKg DECIMAL(6,2) NULL,
    Status NVARCHAR(20) NOT NULL DEFAULT 'Intake',
    Description NVARCHAR(MAX) NULL,
    PhotoBase64 NVARCHAR(MAX) NULL,
    CONSTRAINT PK_Animal PRIMARY KEY (ID),
    CONSTRAINT FK_Animal_BreedID FOREIGN KEY (BreedID) REFERENCES ${flyway:defaultSchema}.Breed (ID),
    CONSTRAINT CK_Animal_Species CHECK (Species IN ('Dog','Cat')),
    CONSTRAINT CK_Animal_Sex CHECK (Sex IS NULL OR Sex IN ('Male','Female','Unknown')),
    CONSTRAINT CK_Animal_IntakeReason CHECK (IntakeReason IS NULL OR IntakeReason IN ('Stray','Surrender','Transfer','Returned','Other')),
    CONSTRAINT CK_Animal_Status CHECK (Status IN ('Intake','Hold','Available','Adopted','Transferred')),
    CONSTRAINT CK_Animal_WeightKg CHECK (WeightKg IS NULL OR WeightKg > 0)
);
GO

/* A microchip number identifies exactly one animal, but most intakes arrive without one. A
   filtered unique index enforces uniqueness across the rows that HAVE a number while allowing
   any number of NULLs — a plain UNIQUE constraint would permit only one un-chipped animal. */
CREATE UNIQUE INDEX UQ_Animal_MicrochipNumber
    ON ${flyway:defaultSchema}.Animal (MicrochipNumber)
    WHERE MicrochipNumber IS NOT NULL;
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Breeds the shelter recognises, scoped by species. Reference data maintained by staff rather than per-animal data; Animal.BreedID is nullable because a stray''s breed is often unknown at intake.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'Breed';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'One row per animal in the shelter''s care, from intake through outcome. The central record of the shelter app: kennel assignments, care logs, medical conditions and adoptions all hang off it.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'Animal';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Dog or Cat. Duplicated from Breed on purpose: species is known at intake even when breed is not, and it is the discriminator every downstream feature filters on.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'Animal',
    @level2type = N'COLUMN', @level2name = N'Species';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Implanted microchip identifier, when the animal has one. Unique across animals that have a number via a filtered index; NULL for the many intakes that arrive un-chipped.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'Animal',
    @level2type = N'COLUMN', @level2name = N'MicrochipNumber';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Where the animal sits in the shelter workflow: Intake, Hold, Available, Adopted or Transferred. Drives which animals appear on the adoption floor and is the field the course''s validation rules govern.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'Animal',
    @level2type = N'COLUMN', @level2name = N'Status';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Base64-encoded photo of the animal, stored inline. Deliberately not MJ Storage: the course teaches entity and UI work, and a single self-contained column keeps photos working with no external provider to configure.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'Animal',
    @level2type = N'COLUMN', @level2name = N'PhotoBase64';
GO























































/* SQL generated to create new entity MJ: Breeds */

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
         'd0ef843d-8155-4a0e-aec4-24d13572e32a',
         'MJ: Breeds',
         'Breeds',
         'Breeds the shelter recognises, scoped by species. Reference data maintained by staff rather than per-animal data; Animal.BreedID is nullable because a stray''s breed is often unknown at intake.',
         NULL,
         'Breed',
         'vwBreeds',
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
/* SQL generated to add new entity MJ: Breeds to application ID: 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E' */
INSERT INTO [${flyway:defaultSchema}].[ApplicationEntity]
                                       ([ApplicationID], [EntityID], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                       ('EBA5CCEC-6A37-EF11-86D4-000D3A4E707E', 'd0ef843d-8155-4a0e-aec4-24d13572e32a', (SELECT COALESCE(MAX([Sequence]),0)+1 FROM [${flyway:defaultSchema}].[ApplicationEntity] WHERE [ApplicationID] = 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E'), GETUTCDATE(), GETUTCDATE());
/* SQL generated to add new permission for entity MJ: Breeds for role UI */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('d0ef843d-8155-4a0e-aec4-24d13572e32a', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0, 0, 0, GETUTCDATE(), GETUTCDATE());
/* SQL generated to add new permission for entity MJ: Breeds for role Developer */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('d0ef843d-8155-4a0e-aec4-24d13572e32a', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE());
/* SQL generated to add new permission for entity MJ: Breeds for role Integration */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('d0ef843d-8155-4a0e-aec4-24d13572e32a', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE());
/* SQL generated to create new entity MJ: Animals */

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
         '70d5576a-43d5-4e26-aacb-19cd866ab2f8',
         'MJ: Animals',
         'Animals',
         'One row per animal in the shelter''s care, from intake through outcome. The central record of the shelter app: kennel assignments, care logs, medical conditions and adoptions all hang off it.',
         NULL,
         'Animal',
         'vwAnimals',
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
/* SQL generated to add new entity MJ: Animals to application ID: 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E' */
INSERT INTO [${flyway:defaultSchema}].[ApplicationEntity]
                                       ([ApplicationID], [EntityID], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                       ('EBA5CCEC-6A37-EF11-86D4-000D3A4E707E', '70d5576a-43d5-4e26-aacb-19cd866ab2f8', (SELECT COALESCE(MAX([Sequence]),0)+1 FROM [${flyway:defaultSchema}].[ApplicationEntity] WHERE [ApplicationID] = 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E'), GETUTCDATE(), GETUTCDATE());
/* SQL generated to add new permission for entity MJ: Animals for role UI */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('70d5576a-43d5-4e26-aacb-19cd866ab2f8', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0, 0, 0, GETUTCDATE(), GETUTCDATE());
/* SQL generated to add new permission for entity MJ: Animals for role Developer */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('70d5576a-43d5-4e26-aacb-19cd866ab2f8', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE());
/* SQL generated to add new permission for entity MJ: Animals for role Integration */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('70d5576a-43d5-4e26-aacb-19cd866ab2f8', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE());
/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.Animal */
ALTER TABLE [${flyway:defaultSchema}].[Animal] ADD [__mj_CreatedAt] DATETIMEOFFSET NULL;
GO
/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.Animal */
UPDATE [${flyway:defaultSchema}].[Animal] SET [__mj_CreatedAt] = GETUTCDATE() WHERE [__mj_CreatedAt] IS NULL;
GO
/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.Animal */
ALTER TABLE [${flyway:defaultSchema}].[Animal] ALTER COLUMN [__mj_CreatedAt] DATETIMEOFFSET NOT NULL;
GO
/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.Animal */
ALTER TABLE [${flyway:defaultSchema}].[Animal] ADD CONSTRAINT [DF___mj_Animal___mj_CreatedAt] DEFAULT GETUTCDATE() FOR [__mj_CreatedAt];
GO
/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.Animal */
ALTER TABLE [${flyway:defaultSchema}].[Animal] ADD [__mj_UpdatedAt] DATETIMEOFFSET NULL;
GO
/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.Animal */
UPDATE [${flyway:defaultSchema}].[Animal] SET [__mj_UpdatedAt] = GETUTCDATE() WHERE [__mj_UpdatedAt] IS NULL;
GO
/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.Animal */
ALTER TABLE [${flyway:defaultSchema}].[Animal] ALTER COLUMN [__mj_UpdatedAt] DATETIMEOFFSET NOT NULL;
GO
/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.Animal */
ALTER TABLE [${flyway:defaultSchema}].[Animal] ADD CONSTRAINT [DF___mj_Animal___mj_UpdatedAt] DEFAULT GETUTCDATE() FOR [__mj_UpdatedAt];
GO
/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.Breed */
ALTER TABLE [${flyway:defaultSchema}].[Breed] ADD [__mj_CreatedAt] DATETIMEOFFSET NULL;
GO
/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.Breed */
UPDATE [${flyway:defaultSchema}].[Breed] SET [__mj_CreatedAt] = GETUTCDATE() WHERE [__mj_CreatedAt] IS NULL;
GO
/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.Breed */
ALTER TABLE [${flyway:defaultSchema}].[Breed] ALTER COLUMN [__mj_CreatedAt] DATETIMEOFFSET NOT NULL;
GO
/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.Breed */
ALTER TABLE [${flyway:defaultSchema}].[Breed] ADD CONSTRAINT [DF___mj_Breed___mj_CreatedAt] DEFAULT GETUTCDATE() FOR [__mj_CreatedAt];
GO
/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.Breed */
ALTER TABLE [${flyway:defaultSchema}].[Breed] ADD [__mj_UpdatedAt] DATETIMEOFFSET NULL;
GO
/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.Breed */
UPDATE [${flyway:defaultSchema}].[Breed] SET [__mj_UpdatedAt] = GETUTCDATE() WHERE [__mj_UpdatedAt] IS NULL;
GO
/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.Breed */
ALTER TABLE [${flyway:defaultSchema}].[Breed] ALTER COLUMN [__mj_UpdatedAt] DATETIMEOFFSET NOT NULL;
GO
/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.Breed */
ALTER TABLE [${flyway:defaultSchema}].[Breed] ADD CONSTRAINT [DF___mj_Breed___mj_UpdatedAt] DEFAULT GETUTCDATE() FOR [__mj_UpdatedAt];
GO
/* SQL text to insert 25 new entity field(s) */
UPDATE [${flyway:defaultSchema}].[EntityField]
         SET [Sequence] = [Sequence] + 100000
       WHERE [EntityID] = '70D5576A-43D5-4E26-AACB-19CD866AB2F8'
         AND [Sequence] < 100000;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '71a3f940-d814-42c4-86e9-9d82302b2448' OR (EntityID = '70D5576A-43D5-4E26-AACB-19CD866AB2F8' AND Name = 'ID')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '71a3f940-d814-42c4-86e9-9d82302b2448',
            '70D5576A-43D5-4E26-AACB-19CD866AB2F8', -- Entity: MJ: Animals
            1,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '732bf16b-9602-424f-9af4-1e248c9a427f' OR (EntityID = '70D5576A-43D5-4E26-AACB-19CD866AB2F8' AND Name = 'Name')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '732bf16b-9602-424f-9af4-1e248c9a427f',
            '70D5576A-43D5-4E26-AACB-19CD866AB2F8', -- Entity: MJ: Animals
            2,
            'Name',
            'Name',
            NULL,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '8e4a652f-0d84-43b8-a880-cb84e8ae6f77' OR (EntityID = '70D5576A-43D5-4E26-AACB-19CD866AB2F8' AND Name = 'Species')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '8e4a652f-0d84-43b8-a880-cb84e8ae6f77',
            '70D5576A-43D5-4E26-AACB-19CD866AB2F8', -- Entity: MJ: Animals
            3,
            'Species',
            'Species',
            'Dog or Cat. Duplicated from Breed on purpose: species is known at intake even when breed is not, and it is the discriminator every downstream feature filters on.',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'bc48ea0b-8bfe-4b3f-8ca1-5f49755e4206' OR (EntityID = '70D5576A-43D5-4E26-AACB-19CD866AB2F8' AND Name = 'BreedID')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'bc48ea0b-8bfe-4b3f-8ca1-5f49755e4206',
            '70D5576A-43D5-4E26-AACB-19CD866AB2F8', -- Entity: MJ: Animals
            4,
            'BreedID',
            'Breed ID',
            NULL,
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
            'D0EF843D-8155-4A0E-AEC4-24D13572E32A',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '37c2257d-1163-42bf-a71d-474538ad83db' OR (EntityID = '70D5576A-43D5-4E26-AACB-19CD866AB2F8' AND Name = 'MicrochipNumber')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '37c2257d-1163-42bf-a71d-474538ad83db',
            '70D5576A-43D5-4E26-AACB-19CD866AB2F8', -- Entity: MJ: Animals
            5,
            'MicrochipNumber',
            'Microchip Number',
            'Implanted microchip identifier, when the animal has one. Unique across animals that have a number via a filtered index; NULL for the many intakes that arrive un-chipped.',
            'nvarchar',
            60,
            0,
            0,
            1,
            NULL,
            0,
            1,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '89dc5992-dfad-4661-9d97-374c166cfd52' OR (EntityID = '70D5576A-43D5-4E26-AACB-19CD866AB2F8' AND Name = 'IntakeDate')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '89dc5992-dfad-4661-9d97-374c166cfd52',
            '70D5576A-43D5-4E26-AACB-19CD866AB2F8', -- Entity: MJ: Animals
            6,
            'IntakeDate',
            'Intake Date',
            NULL,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'bf881c85-20f3-4563-9b25-550ac5ad01cb' OR (EntityID = '70D5576A-43D5-4E26-AACB-19CD866AB2F8' AND Name = 'IntakeReason')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'bf881c85-20f3-4563-9b25-550ac5ad01cb',
            '70D5576A-43D5-4E26-AACB-19CD866AB2F8', -- Entity: MJ: Animals
            7,
            'IntakeReason',
            'Intake Reason',
            NULL,
            'nvarchar',
            60,
            0,
            0,
            1,
            NULL,
            0,
            1,
            0,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'a8dd289b-74c5-4ea5-8a98-7305457e224d' OR (EntityID = '70D5576A-43D5-4E26-AACB-19CD866AB2F8' AND Name = 'Sex')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'a8dd289b-74c5-4ea5-8a98-7305457e224d',
            '70D5576A-43D5-4E26-AACB-19CD866AB2F8', -- Entity: MJ: Animals
            8,
            'Sex',
            'Sex',
            NULL,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'e767149a-2363-4240-b26c-d9febe088483' OR (EntityID = '70D5576A-43D5-4E26-AACB-19CD866AB2F8' AND Name = 'EstimatedBirthDate')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'e767149a-2363-4240-b26c-d9febe088483',
            '70D5576A-43D5-4E26-AACB-19CD866AB2F8', -- Entity: MJ: Animals
            9,
            'EstimatedBirthDate',
            'Estimated Birth Date',
            NULL,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '5fd993ee-b784-4ef7-9242-3a6863f4b52f' OR (EntityID = '70D5576A-43D5-4E26-AACB-19CD866AB2F8' AND Name = 'WeightKg')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '5fd993ee-b784-4ef7-9242-3a6863f4b52f',
            '70D5576A-43D5-4E26-AACB-19CD866AB2F8', -- Entity: MJ: Animals
            10,
            'WeightKg',
            'Weight Kg',
            NULL,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '49172a81-b6b4-4cd1-ad66-d5ff08abca6f' OR (EntityID = '70D5576A-43D5-4E26-AACB-19CD866AB2F8' AND Name = 'Status')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '49172a81-b6b4-4cd1-ad66-d5ff08abca6f',
            '70D5576A-43D5-4E26-AACB-19CD866AB2F8', -- Entity: MJ: Animals
            11,
            'Status',
            'Status',
            'Where the animal sits in the shelter workflow: Intake, Hold, Available, Adopted or Transferred. Drives which animals appear on the adoption floor and is the field the course''s validation rules govern.',
            'nvarchar',
            40,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '703d02fa-dc7a-45be-bf64-4d21ce176c45' OR (EntityID = '70D5576A-43D5-4E26-AACB-19CD866AB2F8' AND Name = 'Description')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '703d02fa-dc7a-45be-bf64-4d21ce176c45',
            '70D5576A-43D5-4E26-AACB-19CD866AB2F8', -- Entity: MJ: Animals
            12,
            'Description',
            'Description',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'db181ad0-830c-4cc9-bd68-7fae3662e41e' OR (EntityID = '70D5576A-43D5-4E26-AACB-19CD866AB2F8' AND Name = 'PhotoBase64')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'db181ad0-830c-4cc9-bd68-7fae3662e41e',
            '70D5576A-43D5-4E26-AACB-19CD866AB2F8', -- Entity: MJ: Animals
            13,
            'PhotoBase64',
            'Photo Base 64',
            'Base64-encoded photo of the animal, stored inline. Deliberately not MJ Storage: the course teaches entity and UI work, and a single self-contained column keeps photos working with no external provider to configure.',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'cca8f56c-1d65-4af9-9f3b-f5dc6036fef9' OR (EntityID = '70D5576A-43D5-4E26-AACB-19CD866AB2F8' AND Name = '__mj_CreatedAt')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'cca8f56c-1d65-4af9-9f3b-f5dc6036fef9',
            '70D5576A-43D5-4E26-AACB-19CD866AB2F8', -- Entity: MJ: Animals
            14,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '000d31d7-39aa-4582-be24-93df839398b7' OR (EntityID = '70D5576A-43D5-4E26-AACB-19CD866AB2F8' AND Name = '__mj_UpdatedAt')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '000d31d7-39aa-4582-be24-93df839398b7',
            '70D5576A-43D5-4E26-AACB-19CD866AB2F8', -- Entity: MJ: Animals
            15,
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
       WHERE [EntityID] = 'D0EF843D-8155-4A0E-AEC4-24D13572E32A'
         AND [Sequence] < 100000;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '942ad296-3dd7-4a4c-aaf6-c90e666e697c' OR (EntityID = 'D0EF843D-8155-4A0E-AEC4-24D13572E32A' AND Name = 'ID')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '942ad296-3dd7-4a4c-aaf6-c90e666e697c',
            'D0EF843D-8155-4A0E-AEC4-24D13572E32A', -- Entity: MJ: Breeds
            1,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'fa404650-9e00-4c33-aee6-f4be7eb464ed' OR (EntityID = 'D0EF843D-8155-4A0E-AEC4-24D13572E32A' AND Name = 'Name')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'fa404650-9e00-4c33-aee6-f4be7eb464ed',
            'D0EF843D-8155-4A0E-AEC4-24D13572E32A', -- Entity: MJ: Breeds
            2,
            'Name',
            'Name',
            NULL,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '0f7e95f3-01d2-44a0-9958-000f06a82c3a' OR (EntityID = 'D0EF843D-8155-4A0E-AEC4-24D13572E32A' AND Name = 'Species')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '0f7e95f3-01d2-44a0-9958-000f06a82c3a',
            'D0EF843D-8155-4A0E-AEC4-24D13572E32A', -- Entity: MJ: Breeds
            3,
            'Species',
            'Species',
            NULL,
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
            1,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'b9c63424-dd79-44c2-82a2-a2f4ad065dd9' OR (EntityID = 'D0EF843D-8155-4A0E-AEC4-24D13572E32A' AND Name = 'SizeCategory')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'b9c63424-dd79-44c2-82a2-a2f4ad065dd9',
            'D0EF843D-8155-4A0E-AEC4-24D13572E32A', -- Entity: MJ: Breeds
            4,
            'SizeCategory',
            'Size Category',
            NULL,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'efc94585-72ee-453b-a991-c63a4df8964e' OR (EntityID = 'D0EF843D-8155-4A0E-AEC4-24D13572E32A' AND Name = 'TypicalLifespanYears')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'efc94585-72ee-453b-a991-c63a4df8964e',
            'D0EF843D-8155-4A0E-AEC4-24D13572E32A', -- Entity: MJ: Breeds
            5,
            'TypicalLifespanYears',
            'Typical Lifespan Years',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'fb915382-fe9f-4202-92f3-5efa943f1093' OR (EntityID = 'D0EF843D-8155-4A0E-AEC4-24D13572E32A' AND Name = 'IsActive')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'fb915382-fe9f-4202-92f3-5efa943f1093',
            'D0EF843D-8155-4A0E-AEC4-24D13572E32A', -- Entity: MJ: Breeds
            6,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '2dd5f54c-4269-4328-b274-595cc1c5ce8f' OR (EntityID = 'D0EF843D-8155-4A0E-AEC4-24D13572E32A' AND Name = '__mj_CreatedAt')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '2dd5f54c-4269-4328-b274-595cc1c5ce8f',
            'D0EF843D-8155-4A0E-AEC4-24D13572E32A', -- Entity: MJ: Breeds
            7,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '1e2691fa-c831-447a-a1fe-3717a7c35a53' OR (EntityID = 'D0EF843D-8155-4A0E-AEC4-24D13572E32A' AND Name = '__mj_UpdatedAt')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '1e2691fa-c831-447a-a1fe-3717a7c35a53',
            'D0EF843D-8155-4A0E-AEC4-24D13572E32A', -- Entity: MJ: Breeds
            8,
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
/* SQL text to insert entity field value with ID 5a19c21c-958c-43d8-8746-c7d8f647a52f */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('5a19c21c-958c-43d8-8746-c7d8f647a52f', '0F7E95F3-01D2-44A0-9958-000F06A82C3A', 1, 'Cat', 'Cat', GETUTCDATE(), GETUTCDATE());
/* SQL text to insert entity field value with ID 7779d88f-5ed9-4285-aa1a-f82d5bdfe366 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('7779d88f-5ed9-4285-aa1a-f82d5bdfe366', '0F7E95F3-01D2-44A0-9958-000F06A82C3A', 2, 'Dog', 'Dog', GETUTCDATE(), GETUTCDATE());
/* SQL text to update ValueListType for entity field ID 0F7E95F3-01D2-44A0-9958-000F06A82C3A */
UPDATE [${flyway:defaultSchema}].[EntityField] SET ValueListType='List' WHERE ID='0F7E95F3-01D2-44A0-9958-000F06A82C3A';
/* SQL text to insert entity field value with ID b450216b-dea2-4023-a3a9-afd63ce13244 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('b450216b-dea2-4023-a3a9-afd63ce13244', 'B9C63424-DD79-44C2-82A2-A2F4AD065DD9', 1, 'Giant', 'Giant', GETUTCDATE(), GETUTCDATE());
/* SQL text to insert entity field value with ID 92488eb2-47ac-411b-8c93-34c4a16e5849 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('92488eb2-47ac-411b-8c93-34c4a16e5849', 'B9C63424-DD79-44C2-82A2-A2F4AD065DD9', 2, 'Large', 'Large', GETUTCDATE(), GETUTCDATE());
/* SQL text to insert entity field value with ID ca03dda5-ab36-4efe-82e9-c0f6a6b8d28b */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('ca03dda5-ab36-4efe-82e9-c0f6a6b8d28b', 'B9C63424-DD79-44C2-82A2-A2F4AD065DD9', 3, 'Medium', 'Medium', GETUTCDATE(), GETUTCDATE());
/* SQL text to insert entity field value with ID 366ad1ae-3761-4bd7-9bcb-0bcdc3267ed9 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('366ad1ae-3761-4bd7-9bcb-0bcdc3267ed9', 'B9C63424-DD79-44C2-82A2-A2F4AD065DD9', 4, 'Small', 'Small', GETUTCDATE(), GETUTCDATE());
/* SQL text to update ValueListType for entity field ID B9C63424-DD79-44C2-82A2-A2F4AD065DD9 */
UPDATE [${flyway:defaultSchema}].[EntityField] SET ValueListType='List' WHERE ID='B9C63424-DD79-44C2-82A2-A2F4AD065DD9';
/* SQL text to insert entity field value with ID 37d4f454-b5e6-482e-b86e-75c741992eeb */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('37d4f454-b5e6-482e-b86e-75c741992eeb', '8E4A652F-0D84-43B8-A880-CB84E8AE6F77', 1, 'Cat', 'Cat', GETUTCDATE(), GETUTCDATE());
/* SQL text to insert entity field value with ID aebb302e-dba9-41ee-9a7e-11e6579f9294 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('aebb302e-dba9-41ee-9a7e-11e6579f9294', '8E4A652F-0D84-43B8-A880-CB84E8AE6F77', 2, 'Dog', 'Dog', GETUTCDATE(), GETUTCDATE());
/* SQL text to update ValueListType for entity field ID 8E4A652F-0D84-43B8-A880-CB84E8AE6F77 */
UPDATE [${flyway:defaultSchema}].[EntityField] SET ValueListType='List' WHERE ID='8E4A652F-0D84-43B8-A880-CB84E8AE6F77';
/* SQL text to insert entity field value with ID c6c3762c-80d8-4771-a336-3d1521b2008a */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('c6c3762c-80d8-4771-a336-3d1521b2008a', 'A8DD289B-74C5-4EA5-8A98-7305457E224D', 1, 'Female', 'Female', GETUTCDATE(), GETUTCDATE());
/* SQL text to insert entity field value with ID e2e15d2f-77e0-4f58-afb0-4288c7715045 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('e2e15d2f-77e0-4f58-afb0-4288c7715045', 'A8DD289B-74C5-4EA5-8A98-7305457E224D', 2, 'Male', 'Male', GETUTCDATE(), GETUTCDATE());
/* SQL text to insert entity field value with ID 1f0b1248-ca6b-4e9c-99a4-c9e6ebf87009 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('1f0b1248-ca6b-4e9c-99a4-c9e6ebf87009', 'A8DD289B-74C5-4EA5-8A98-7305457E224D', 3, 'Unknown', 'Unknown', GETUTCDATE(), GETUTCDATE());
/* SQL text to update ValueListType for entity field ID A8DD289B-74C5-4EA5-8A98-7305457E224D */
UPDATE [${flyway:defaultSchema}].[EntityField] SET ValueListType='List' WHERE ID='A8DD289B-74C5-4EA5-8A98-7305457E224D';
/* SQL text to insert entity field value with ID 222d4252-5fab-4d6e-a511-2b9759980297 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('222d4252-5fab-4d6e-a511-2b9759980297', 'BF881C85-20F3-4563-9B25-550AC5AD01CB', 1, 'Other', 'Other', GETUTCDATE(), GETUTCDATE());
/* SQL text to insert entity field value with ID af01189a-cb9a-4779-b9fb-7fe3b0d71ee3 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('af01189a-cb9a-4779-b9fb-7fe3b0d71ee3', 'BF881C85-20F3-4563-9B25-550AC5AD01CB', 2, 'Returned', 'Returned', GETUTCDATE(), GETUTCDATE());
/* SQL text to insert entity field value with ID 8547cfc3-64bb-4d87-9c68-838807ce4050 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('8547cfc3-64bb-4d87-9c68-838807ce4050', 'BF881C85-20F3-4563-9B25-550AC5AD01CB', 3, 'Stray', 'Stray', GETUTCDATE(), GETUTCDATE());
/* SQL text to insert entity field value with ID bc66e203-d317-46df-af18-3432c973d721 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('bc66e203-d317-46df-af18-3432c973d721', 'BF881C85-20F3-4563-9B25-550AC5AD01CB', 4, 'Surrender', 'Surrender', GETUTCDATE(), GETUTCDATE());
/* SQL text to insert entity field value with ID a451a421-eff3-44ef-be76-aa9a4c077a9e */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('a451a421-eff3-44ef-be76-aa9a4c077a9e', 'BF881C85-20F3-4563-9B25-550AC5AD01CB', 5, 'Transfer', 'Transfer', GETUTCDATE(), GETUTCDATE());
/* SQL text to update ValueListType for entity field ID BF881C85-20F3-4563-9B25-550AC5AD01CB */
UPDATE [${flyway:defaultSchema}].[EntityField] SET ValueListType='List' WHERE ID='BF881C85-20F3-4563-9B25-550AC5AD01CB';
/* SQL text to insert entity field value with ID ebf6beea-824d-444e-810e-4450987766f9 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('ebf6beea-824d-444e-810e-4450987766f9', '49172A81-B6B4-4CD1-AD66-D5FF08ABCA6F', 1, 'Adopted', 'Adopted', GETUTCDATE(), GETUTCDATE());
/* SQL text to insert entity field value with ID d6648e34-b734-42d7-b906-31a407dced7f */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('d6648e34-b734-42d7-b906-31a407dced7f', '49172A81-B6B4-4CD1-AD66-D5FF08ABCA6F', 2, 'Available', 'Available', GETUTCDATE(), GETUTCDATE());
/* SQL text to insert entity field value with ID ce754320-d21f-4a92-bfc3-9f8959c6b778 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('ce754320-d21f-4a92-bfc3-9f8959c6b778', '49172A81-B6B4-4CD1-AD66-D5FF08ABCA6F', 3, 'Hold', 'Hold', GETUTCDATE(), GETUTCDATE());
/* SQL text to insert entity field value with ID 2bc55331-edb5-4c32-9b6c-8fe63abb1801 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('2bc55331-edb5-4c32-9b6c-8fe63abb1801', '49172A81-B6B4-4CD1-AD66-D5FF08ABCA6F', 4, 'Intake', 'Intake', GETUTCDATE(), GETUTCDATE());
/* SQL text to insert entity field value with ID 5a52806c-c634-486d-8c61-ffc8de8121af */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('5a52806c-c634-486d-8c61-ffc8de8121af', '49172A81-B6B4-4CD1-AD66-D5FF08ABCA6F', 5, 'Transferred', 'Transferred', GETUTCDATE(), GETUTCDATE());
/* SQL text to update ValueListType for entity field ID 49172A81-B6B4-4CD1-AD66-D5FF08ABCA6F */
UPDATE [${flyway:defaultSchema}].[EntityField] SET ValueListType='List' WHERE ID='49172A81-B6B4-4CD1-AD66-D5FF08ABCA6F';
/* Create Entity Relationship: MJ: Breeds -> MJ: Animals (One To Many via BreedID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = 'd47118f6-1d0d-4cbf-bf4b-41c8bce8dd8b'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('d47118f6-1d0d-4cbf-bf4b-41c8bce8dd8b', 'D0EF843D-8155-4A0E-AEC4-24D13572E32A', '70D5576A-43D5-4E26-AACB-19CD866AB2F8', 'BreedID', 'One To Many', 1, 1, 1, GETUTCDATE(), GETUTCDATE())
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
/* SQL text to update entity field related entity name field map for entity field ID BC48EA0B-8BFE-4B3F-8CA1-5F49755E4206 */
EXEC [${flyway:defaultSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='BC48EA0B-8BFE-4B3F-8CA1-5F49755E4206', @RelatedEntityNameFieldMap='Breed';
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
    MJBreed_BreedID.[Name] AS [Breed]
FROM
    [${flyway:defaultSchema}].[Animal] AS a
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[Breed] AS MJBreed_BreedID
  ON
    [a].[BreedID] = MJBreed_BreedID.[ID]
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
    @PhotoBase64 nvarchar(MAX) = NULL
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
                [PhotoBase64]
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
                CASE WHEN @PhotoBase64_Clear = 1 THEN NULL ELSE ISNULL(@PhotoBase64, NULL) END
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
                [PhotoBase64]
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
                CASE WHEN @PhotoBase64_Clear = 1 THEN NULL ELSE ISNULL(@PhotoBase64, NULL) END
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
    @PhotoBase64 nvarchar(MAX) = NULL
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
        [PhotoBase64] = CASE WHEN @PhotoBase64_Clear = 1 THEN NULL ELSE ISNULL(@PhotoBase64, [PhotoBase64]) END
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
/* Index for Foreign Keys for Breed */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Breeds
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------;
/* Base View SQL for MJ: Breeds */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Breeds
-- Item: vwBreeds
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: Breeds
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  Breed
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwBreeds]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwBreeds];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwBreeds]
AS
SELECT
    b.*
FROM
    [${flyway:defaultSchema}].[Breed] AS b
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwBreeds] TO [cdp_UI], [cdp_Developer], [cdp_Integration];
/* Base View Permissions SQL for MJ: Breeds */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Breeds
-- Item: Permissions for vwBreeds
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwBreeds] TO [cdp_UI], [cdp_Developer], [cdp_Integration];
/* spCreate SQL for MJ: Breeds */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Breeds
-- Item: spCreateBreed
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR Breed
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateBreed]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateBreed];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateBreed]
    @ID uniqueidentifier = NULL,
    @Name nvarchar(100),
    @Species nvarchar(20),
    @SizeCategory_Clear bit = 0,
    @SizeCategory nvarchar(20) = NULL,
    @TypicalLifespanYears_Clear bit = 0,
    @TypicalLifespanYears int = NULL,
    @IsActive bit = NULL
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)

    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[Breed]
            (
                [ID],
                [Name],
                [Species],
                [SizeCategory],
                [TypicalLifespanYears],
                [IsActive]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @Name,
                @Species,
                CASE WHEN @SizeCategory_Clear = 1 THEN NULL ELSE ISNULL(@SizeCategory, NULL) END,
                CASE WHEN @TypicalLifespanYears_Clear = 1 THEN NULL ELSE ISNULL(@TypicalLifespanYears, NULL) END,
                ISNULL(@IsActive, 1)
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[Breed]
            (
                [Name],
                [Species],
                [SizeCategory],
                [TypicalLifespanYears],
                [IsActive]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @Name,
                @Species,
                CASE WHEN @SizeCategory_Clear = 1 THEN NULL ELSE ISNULL(@SizeCategory, NULL) END,
                CASE WHEN @TypicalLifespanYears_Clear = 1 THEN NULL ELSE ISNULL(@TypicalLifespanYears, NULL) END,
                ISNULL(@IsActive, 1)
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwBreeds] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateBreed] TO [cdp_Developer], [cdp_Integration];
/* spCreate Permissions for MJ: Breeds */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateBreed] TO [cdp_Developer], [cdp_Integration];
/* spUpdate SQL for MJ: Breeds */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Breeds
-- Item: spUpdateBreed
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR Breed
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateBreed]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateBreed];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateBreed]
    @ID uniqueidentifier,
    @Name nvarchar(100) = NULL,
    @Species nvarchar(20) = NULL,
    @SizeCategory_Clear bit = 0,
    @SizeCategory nvarchar(20) = NULL,
    @TypicalLifespanYears_Clear bit = 0,
    @TypicalLifespanYears int = NULL,
    @IsActive bit = NULL
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[Breed]
    SET
        [Name] = ISNULL(@Name, [Name]),
        [Species] = ISNULL(@Species, [Species]),
        [SizeCategory] = CASE WHEN @SizeCategory_Clear = 1 THEN NULL ELSE ISNULL(@SizeCategory, [SizeCategory]) END,
        [TypicalLifespanYears] = CASE WHEN @TypicalLifespanYears_Clear = 1 THEN NULL ELSE ISNULL(@TypicalLifespanYears, [TypicalLifespanYears]) END,
        [IsActive] = ISNULL(@IsActive, [IsActive])
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwBreeds] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwBreeds]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateBreed] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the Breed table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateBreed]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateBreed];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateBreed
ON [${flyway:defaultSchema}].[Breed]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[Breed]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[Breed] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO
/* spUpdate Permissions for MJ: Breeds */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateBreed] TO [cdp_Developer], [cdp_Integration];
/* spDelete SQL for MJ: Breeds */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Breeds
-- Item: spDeleteBreed
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR Breed
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteBreed]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteBreed];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteBreed]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[Breed]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteBreed] TO [cdp_Developer], [cdp_Integration];
/* spDelete Permissions for MJ: Breeds */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteBreed] TO [cdp_Developer], [cdp_Integration];
/* SQL text to insert 2 new entity field(s) */
UPDATE [${flyway:defaultSchema}].[EntityField]
         SET [Sequence] = [Sequence] + 100000
       WHERE [EntityID] = '70D5576A-43D5-4E26-AACB-19CD866AB2F8'
         AND [Sequence] < 100000;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '7daaeb2b-ba3e-46ac-9650-14b9ee888f29' OR (EntityID = '70D5576A-43D5-4E26-AACB-19CD866AB2F8' AND Name = 'Breed')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '7daaeb2b-ba3e-46ac-9650-14b9ee888f29',
            '70D5576A-43D5-4E26-AACB-19CD866AB2F8', -- Entity: MJ: Animals
            16,
            'Breed',
            'Breed',
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
/* Set field properties for entity */

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '0F7E95F3-01D2-44A0-9958-000F06A82C3A'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = 'B9C63424-DD79-44C2-82A2-A2F4AD065DD9'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = 'FB915382-FE9F-4202-92F3-5EFA943F1093'
               AND AutoUpdateDefaultInView = 1;

            UPDATE [${flyway:defaultSchema}].[Entity]
            SET AllowUserSearchAPI = 0
            WHERE ID = 'D0EF843D-8155-4A0E-AEC4-24D13572E32A'
            AND AutoUpdateAllowUserSearchAPI = 1;
/* Set field properties for entity */

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '8E4A652F-0D84-43B8-A880-CB84E8AE6F77'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '89DC5992-DFAD-4661-9D97-374C166CFD52'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '49172A81-B6B4-4CD1-AD66-D5FF08ABCA6F'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '7DAAEB2B-BA3E-46AC-9650-14B9EE888F29'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '37C2257D-1163-42BF-A71D-474538AD83DB'
               AND AutoUpdateIncludeInUserSearchAPI = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET UserSearchPredicateAPI = 'BeginsWith'
               WHERE ID = '732BF16B-9602-424F-9AF4-1E248C9A427F'
               AND AutoUpdateUserSearchPredicate = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET UserSearchPredicateAPI = 'Exact'
               WHERE ID = '37C2257D-1163-42BF-A71D-474538AD83DB'
               AND AutoUpdateUserSearchPredicate = 1;
/* Set categories for 8 fields */

-- UPDATE Entity Field Category Info MJ: Breeds.ID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '942AD296-3DD7-4A4C-AAF6-C90E666E697C' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Breeds.Name 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Breed Information',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'FA404650-9E00-4C33-AEE6-F4BE7EB464ED' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Breeds.Species 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Breed Information',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '0F7E95F3-01D2-44A0-9958-000F06A82C3A' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Breeds.SizeCategory 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Breed Information',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'B9C63424-DD79-44C2-82A2-A2F4AD065DD9' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Breeds.TypicalLifespanYears 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Breed Information',
   GeneratedFormSection = 'Category',
   DisplayName = 'Typical Lifespan (Years)',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'EFC94585-72EE-453B-A991-C63A4DF8964E' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Breeds.IsActive 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Breed Information',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'FB915382-FE9F-4202-92F3-5EFA943F1093' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Breeds.__mj_CreatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '2DD5F54C-4269-4328-B274-595CC1C5CE8F' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Breeds.__mj_UpdatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '1E2691FA-C831-447A-A1FE-3717A7C35A53' AND AutoUpdateCategory = 1;
/* Set entity icon to fa fa-paw */

               UPDATE [${flyway:defaultSchema}].[Entity]
               SET [Icon] = 'fa fa-paw', [__mj_UpdatedAt] = GETUTCDATE()
               WHERE [ID] = 'D0EF843D-8155-4A0E-AEC4-24D13572E32A';
/* Insert FieldCategoryInfo setting for entity */

               INSERT INTO [${flyway:defaultSchema}].[EntitySetting] ([ID], [EntityID], [Name], [Value], [__mj_CreatedAt], [__mj_UpdatedAt])
               VALUES ('62efa75d-b6ae-495f-ad1e-b80199c38202', 'D0EF843D-8155-4A0E-AEC4-24D13572E32A', 'FieldCategoryInfo', '{"Breed Information":{"icon":"fa fa-info-circle","description":"Descriptive attributes defining the shelter-recognized breed"},"System Metadata":{"icon":"fa fa-cog","description":"System-managed audit and tracking fields"}}', GETUTCDATE(), GETUTCDATE());
/* Insert FieldCategoryIcons setting (legacy) */

               INSERT INTO [${flyway:defaultSchema}].[EntitySetting] ([ID], [EntityID], [Name], [Value], [__mj_CreatedAt], [__mj_UpdatedAt])
               VALUES ('6bdcdca6-6b35-4ff0-8ae4-b9389e54c927', 'D0EF843D-8155-4A0E-AEC4-24D13572E32A', 'FieldCategoryIcons', '{"Breed Information":"fa fa-info-circle","System Metadata":"fa fa-cog"}', GETUTCDATE(), GETUTCDATE());
/* Set DefaultForNewUser=false for NEW entity (category: reference, confidence: high) */

         UPDATE [${flyway:defaultSchema}].[ApplicationEntity]
         SET [DefaultForNewUser] = 0, [__mj_UpdatedAt] = GETUTCDATE()
         WHERE [EntityID] = 'D0EF843D-8155-4A0E-AEC4-24D13572E32A';
/* Set categories for 16 fields */

-- UPDATE Entity Field Category Info MJ: Animals.ID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '71A3F940-D814-42C4-86E9-9D82302B2448' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Animals.Name 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Animal Profile',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '732BF16B-9602-424F-9AF4-1E248C9A427F' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Animals.Species 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Animal Profile',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '8E4A652F-0D84-43B8-A880-CB84E8AE6F77' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Animals.Breed 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Animal Profile',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '7DAAEB2B-BA3E-46AC-9650-14B9EE888F29' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Animals.BreedID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Animal Profile',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'BC48EA0B-8BFE-4B3F-8CA1-5F49755E4206' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Animals.Sex 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Animal Profile',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'A8DD289B-74C5-4EA5-8A98-7305457E224D' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Animals.EstimatedBirthDate 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Animal Profile',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'E767149A-2363-4240-B26C-D9FEBE088483' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Animals.MicrochipNumber 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Identification and Status',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '37C2257D-1163-42BF-A71D-474538AD83DB' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Animals.Status 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Identification and Status',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '49172A81-B6B4-4CD1-AD66-D5FF08ABCA6F' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Animals.IntakeDate 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Intake Details',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '89DC5992-DFAD-4661-9D97-374C166CFD52' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Animals.IntakeReason 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Intake Details',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'BF881C85-20F3-4563-9B25-550AC5AD01CB' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Animals.WeightKg 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Health and Description',
   GeneratedFormSection = 'Category',
   DisplayName = 'Weight (kg)',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '5FD993EE-B784-4EF7-9242-3A6863F4B52F' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Animals.Description 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Health and Description',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '703D02FA-DC7A-45BE-BF64-4D21CE176C45' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Animals.PhotoBase64 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Health and Description',
   GeneratedFormSection = 'Category',
   DisplayName = 'Photo',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'DB181AD0-830C-4CC9-BD68-7FAE3662E41E' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Animals.__mj_CreatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'CCA8F56C-1D65-4AF9-9F3B-F5DC6036FEF9' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Animals.__mj_UpdatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '000D31D7-39AA-4582-BE24-93DF839398B7' AND AutoUpdateCategory = 1;
/* Set entity icon to fa fa-paw */

               UPDATE [${flyway:defaultSchema}].[Entity]
               SET [Icon] = 'fa fa-paw', [__mj_UpdatedAt] = GETUTCDATE()
               WHERE [ID] = '70D5576A-43D5-4E26-AACB-19CD866AB2F8';
/* Insert FieldCategoryInfo setting for entity */

               INSERT INTO [${flyway:defaultSchema}].[EntitySetting] ([ID], [EntityID], [Name], [Value], [__mj_CreatedAt], [__mj_UpdatedAt])
               VALUES ('e3450924-8db3-4af7-9ec1-a83abac94295', '70D5576A-43D5-4E26-AACB-19CD866AB2F8', 'FieldCategoryInfo', '{"Animal Profile":{"icon":"fa fa-dog","description":"Core identity and biological information for the animal"},"Identification and Status":{"icon":"fa fa-id-card","description":"Tracking identifiers and current workflow status"},"Intake Details":{"icon":"fa fa-sign-in-alt","description":"Information regarding the animal''s arrival at the shelter"},"Health and Description":{"icon":"fa fa-notes-medical","description":"Physical attributes, health metrics, and descriptive notes"},"System Metadata":{"icon":"fa fa-cog","description":"System-managed audit and tracking fields"}}', GETUTCDATE(), GETUTCDATE());
/* Insert FieldCategoryIcons setting (legacy) */

               INSERT INTO [${flyway:defaultSchema}].[EntitySetting] ([ID], [EntityID], [Name], [Value], [__mj_CreatedAt], [__mj_UpdatedAt])
               VALUES ('e16697dc-bbaa-4479-8115-f8dafb8ff56b', '70D5576A-43D5-4E26-AACB-19CD866AB2F8', 'FieldCategoryIcons', '{"Animal Profile":"fa fa-dog","Identification and Status":"fa fa-id-card","Intake Details":"fa fa-sign-in-alt","Health and Description":"fa fa-notes-medical","System Metadata":"fa fa-cog"}', GETUTCDATE(), GETUTCDATE());
/* Set DefaultForNewUser=true for NEW entity (category: primary, confidence: high) */

         UPDATE [${flyway:defaultSchema}].[ApplicationEntity]
         SET [DefaultForNewUser] = 1, [__mj_UpdatedAt] = GETUTCDATE()
         WHERE [EntityID] = '70D5576A-43D5-4E26-AACB-19CD866AB2F8';
/* Generated Validation Functions for MJ: Animals */
-- CHECK constraint for MJ: Animals: Field: WeightKg was newly set or modified since the last generation of the validation function, the code was regenerated and updating the GeneratedCode table with the new generated validation function
INSERT INTO [${flyway:defaultSchema}].[GeneratedCode] ([CategoryID], [GeneratedByModelID], [GeneratedAt], [Language], [Status], [Source], [Code], [Description], [Name], [LinkedEntityID], [LinkedRecordPrimaryKey])
                      VALUES ((SELECT [ID] FROM [${flyway:defaultSchema}].[vwGeneratedCodeCategories] WHERE [Name]='CodeGen: Validators'), 'C43229F6-4CC8-4838-9D04-03419A2DA191', GETUTCDATE(), 'TypeScript', 'Approved', '([WeightKg] IS NULL OR [WeightKg]>(0))', 'public ValidateWeightKgGreaterThanZero(result: ValidationResult) {
	if (this.WeightKg != null && this.WeightKg <= 0) {
		result.Errors.push(new ValidationErrorInfo(
			"WeightKg",
			"Weight must be greater than 0 kg.",
			this.WeightKg,
			ValidationErrorType.Failure
		));
	}
}', 'The weight of the animal must be greater than 0 kg if it is specified.', 'ValidateWeightKgGreaterThanZero', 'DF238F34-2837-EF11-86D4-6045BDEE16E6', '5FD993EE-B784-4EF7-9242-3A6863F4B52F');
/* Generated Validation Functions for MJ: Breeds */
-- CHECK constraint for MJ: Breeds: Field: TypicalLifespanYears was newly set or modified since the last generation of the validation function, the code was regenerated and updating the GeneratedCode table with the new generated validation function
INSERT INTO [${flyway:defaultSchema}].[GeneratedCode] ([CategoryID], [GeneratedByModelID], [GeneratedAt], [Language], [Status], [Source], [Code], [Description], [Name], [LinkedEntityID], [LinkedRecordPrimaryKey])
                      VALUES ((SELECT [ID] FROM [${flyway:defaultSchema}].[vwGeneratedCodeCategories] WHERE [Name]='CodeGen: Validators'), 'C43229F6-4CC8-4838-9D04-03419A2DA191', GETUTCDATE(), 'TypeScript', 'Approved', '([TypicalLifespanYears] IS NULL OR [TypicalLifespanYears]>(0))', 'public ValidateTypicalLifespanYearsPositive(result: ValidationResult) {
	if (this.TypicalLifespanYears != null && this.TypicalLifespanYears <= 0) {
		result.Errors.push(new ValidationErrorInfo(
			"TypicalLifespanYears",
			"Typical lifespan must be greater than 0 years.",
			this.TypicalLifespanYears,
			ValidationErrorType.Failure
		));
	}
}', 'The typical lifespan in years, if specified, must be a positive number greater than zero.', 'ValidateTypicalLifespanYearsPositive', 'DF238F34-2837-EF11-86D4-6045BDEE16E6', 'EFC94585-72EE-453B-A991-C63A4DF8964E');
