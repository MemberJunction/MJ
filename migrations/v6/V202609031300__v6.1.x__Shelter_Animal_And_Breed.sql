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





























































/* ==============================================================================================
   Codegen Output below this point
   ============================================================================================== */
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
         'a40310aa-94bf-43b5-9aa5-6e2757ff1405',
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
                                       ('EBA5CCEC-6A37-EF11-86D4-000D3A4E707E', 'a40310aa-94bf-43b5-9aa5-6e2757ff1405', (SELECT COALESCE(MAX([Sequence]),0)+1 FROM [${flyway:defaultSchema}].[ApplicationEntity] WHERE [ApplicationID] = 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E'), GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity MJ: Breeds for role UI */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('a40310aa-94bf-43b5-9aa5-6e2757ff1405', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0, 0, 0, GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity MJ: Breeds for role Developer */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('a40310aa-94bf-43b5-9aa5-6e2757ff1405', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity MJ: Breeds for role Integration */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('a40310aa-94bf-43b5-9aa5-6e2757ff1405', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE());

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
         '22e4f4de-9a9b-4fe3-ab1a-ecac7ef5ef9d',
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
                                       ('EBA5CCEC-6A37-EF11-86D4-000D3A4E707E', '22e4f4de-9a9b-4fe3-ab1a-ecac7ef5ef9d', (SELECT COALESCE(MAX([Sequence]),0)+1 FROM [${flyway:defaultSchema}].[ApplicationEntity] WHERE [ApplicationID] = 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E'), GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity MJ: Animals for role UI */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('22e4f4de-9a9b-4fe3-ab1a-ecac7ef5ef9d', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0, 0, 0, GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity MJ: Animals for role Developer */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('22e4f4de-9a9b-4fe3-ab1a-ecac7ef5ef9d', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity MJ: Animals for role Integration */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('22e4f4de-9a9b-4fe3-ab1a-ecac7ef5ef9d', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE());

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

/* SQL text to insert 25 new entity field(s) */
UPDATE [${flyway:defaultSchema}].[EntityField]
         SET [Sequence] = [Sequence] + 100000
       WHERE [EntityID] = 'A40310AA-94BF-43B5-9AA5-6E2757FF1405'
         AND [Sequence] < 100000;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '41020086-e1b4-4dd5-935e-c548c37b8b26' OR (EntityID = 'A40310AA-94BF-43B5-9AA5-6E2757FF1405' AND Name = 'ID')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '41020086-e1b4-4dd5-935e-c548c37b8b26',
            'A40310AA-94BF-43B5-9AA5-6E2757FF1405', -- Entity: MJ: Breeds
            (SELECT COALESCE(MAX([Sequence]), 0) FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'A40310AA-94BF-43B5-9AA5-6E2757FF1405') + 1,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '4788c3e9-380e-4d0c-9d09-455fd86f225d' OR (EntityID = 'A40310AA-94BF-43B5-9AA5-6E2757FF1405' AND Name = 'Name')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '4788c3e9-380e-4d0c-9d09-455fd86f225d',
            'A40310AA-94BF-43B5-9AA5-6E2757FF1405', -- Entity: MJ: Breeds
            (SELECT COALESCE(MAX([Sequence]), 0) FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'A40310AA-94BF-43B5-9AA5-6E2757FF1405') + 2,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '0f724c37-5d74-4ac2-b61e-eaef82511504' OR (EntityID = 'A40310AA-94BF-43B5-9AA5-6E2757FF1405' AND Name = 'Species')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '0f724c37-5d74-4ac2-b61e-eaef82511504',
            'A40310AA-94BF-43B5-9AA5-6E2757FF1405', -- Entity: MJ: Breeds
            (SELECT COALESCE(MAX([Sequence]), 0) FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'A40310AA-94BF-43B5-9AA5-6E2757FF1405') + 3,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'df85a3b5-c312-4e9f-8bf9-1e288f83a8c0' OR (EntityID = 'A40310AA-94BF-43B5-9AA5-6E2757FF1405' AND Name = 'SizeCategory')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'df85a3b5-c312-4e9f-8bf9-1e288f83a8c0',
            'A40310AA-94BF-43B5-9AA5-6E2757FF1405', -- Entity: MJ: Breeds
            (SELECT COALESCE(MAX([Sequence]), 0) FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'A40310AA-94BF-43B5-9AA5-6E2757FF1405') + 4,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '3fa1cded-1af0-428e-8b4d-375e0800a008' OR (EntityID = 'A40310AA-94BF-43B5-9AA5-6E2757FF1405' AND Name = 'TypicalLifespanYears')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '3fa1cded-1af0-428e-8b4d-375e0800a008',
            'A40310AA-94BF-43B5-9AA5-6E2757FF1405', -- Entity: MJ: Breeds
            (SELECT COALESCE(MAX([Sequence]), 0) FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'A40310AA-94BF-43B5-9AA5-6E2757FF1405') + 5,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '724c713e-1d25-4486-9d3b-174220e5dbd0' OR (EntityID = 'A40310AA-94BF-43B5-9AA5-6E2757FF1405' AND Name = 'IsActive')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '724c713e-1d25-4486-9d3b-174220e5dbd0',
            'A40310AA-94BF-43B5-9AA5-6E2757FF1405', -- Entity: MJ: Breeds
            (SELECT COALESCE(MAX([Sequence]), 0) FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'A40310AA-94BF-43B5-9AA5-6E2757FF1405') + 6,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '1c27c211-40ae-4c14-a9ea-ceb0ba2d7777' OR (EntityID = 'A40310AA-94BF-43B5-9AA5-6E2757FF1405' AND Name = '__mj_CreatedAt')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '1c27c211-40ae-4c14-a9ea-ceb0ba2d7777',
            'A40310AA-94BF-43B5-9AA5-6E2757FF1405', -- Entity: MJ: Breeds
            (SELECT COALESCE(MAX([Sequence]), 0) FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'A40310AA-94BF-43B5-9AA5-6E2757FF1405') + 7,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'ab6c801c-49c4-4136-80b4-35b151ba9934' OR (EntityID = 'A40310AA-94BF-43B5-9AA5-6E2757FF1405' AND Name = '__mj_UpdatedAt')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'ab6c801c-49c4-4136-80b4-35b151ba9934',
            'A40310AA-94BF-43B5-9AA5-6E2757FF1405', -- Entity: MJ: Breeds
            (SELECT COALESCE(MAX([Sequence]), 0) FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'A40310AA-94BF-43B5-9AA5-6E2757FF1405') + 8,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '7556a7f6-61ee-4c02-b410-d0de79c4d61b' OR (EntityID = '22E4F4DE-9A9B-4FE3-AB1A-ECAC7EF5EF9D' AND Name = 'ID')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '7556a7f6-61ee-4c02-b410-d0de79c4d61b',
            '22E4F4DE-9A9B-4FE3-AB1A-ECAC7EF5EF9D', -- Entity: MJ: Animals
            (SELECT COALESCE(MAX([Sequence]), 0) FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '22E4F4DE-9A9B-4FE3-AB1A-ECAC7EF5EF9D') + 1,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'c755a802-fa0c-4100-9795-93fbb9a09cad' OR (EntityID = '22E4F4DE-9A9B-4FE3-AB1A-ECAC7EF5EF9D' AND Name = 'Name')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'c755a802-fa0c-4100-9795-93fbb9a09cad',
            '22E4F4DE-9A9B-4FE3-AB1A-ECAC7EF5EF9D', -- Entity: MJ: Animals
            (SELECT COALESCE(MAX([Sequence]), 0) FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '22E4F4DE-9A9B-4FE3-AB1A-ECAC7EF5EF9D') + 2,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '14af4223-9395-490a-9379-15cdb9d03097' OR (EntityID = '22E4F4DE-9A9B-4FE3-AB1A-ECAC7EF5EF9D' AND Name = 'Species')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '14af4223-9395-490a-9379-15cdb9d03097',
            '22E4F4DE-9A9B-4FE3-AB1A-ECAC7EF5EF9D', -- Entity: MJ: Animals
            (SELECT COALESCE(MAX([Sequence]), 0) FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '22E4F4DE-9A9B-4FE3-AB1A-ECAC7EF5EF9D') + 3,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'b296835d-7a50-4208-9671-0eaac207f239' OR (EntityID = '22E4F4DE-9A9B-4FE3-AB1A-ECAC7EF5EF9D' AND Name = 'BreedID')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'b296835d-7a50-4208-9671-0eaac207f239',
            '22E4F4DE-9A9B-4FE3-AB1A-ECAC7EF5EF9D', -- Entity: MJ: Animals
            (SELECT COALESCE(MAX([Sequence]), 0) FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '22E4F4DE-9A9B-4FE3-AB1A-ECAC7EF5EF9D') + 4,
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
            'A40310AA-94BF-43B5-9AA5-6E2757FF1405',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '57a8ee40-9cd3-47ea-afe0-937a5a5fcf7e' OR (EntityID = '22E4F4DE-9A9B-4FE3-AB1A-ECAC7EF5EF9D' AND Name = 'MicrochipNumber')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '57a8ee40-9cd3-47ea-afe0-937a5a5fcf7e',
            '22E4F4DE-9A9B-4FE3-AB1A-ECAC7EF5EF9D', -- Entity: MJ: Animals
            (SELECT COALESCE(MAX([Sequence]), 0) FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '22E4F4DE-9A9B-4FE3-AB1A-ECAC7EF5EF9D') + 5,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '4992e657-62fc-4b60-8b44-ae19b2643091' OR (EntityID = '22E4F4DE-9A9B-4FE3-AB1A-ECAC7EF5EF9D' AND Name = 'IntakeDate')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '4992e657-62fc-4b60-8b44-ae19b2643091',
            '22E4F4DE-9A9B-4FE3-AB1A-ECAC7EF5EF9D', -- Entity: MJ: Animals
            (SELECT COALESCE(MAX([Sequence]), 0) FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '22E4F4DE-9A9B-4FE3-AB1A-ECAC7EF5EF9D') + 6,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '08050f3d-9b49-49d5-bca2-8a416bc864ed' OR (EntityID = '22E4F4DE-9A9B-4FE3-AB1A-ECAC7EF5EF9D' AND Name = 'IntakeReason')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '08050f3d-9b49-49d5-bca2-8a416bc864ed',
            '22E4F4DE-9A9B-4FE3-AB1A-ECAC7EF5EF9D', -- Entity: MJ: Animals
            (SELECT COALESCE(MAX([Sequence]), 0) FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '22E4F4DE-9A9B-4FE3-AB1A-ECAC7EF5EF9D') + 7,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '61f9a077-4288-4ddd-9e7d-101952be8e0e' OR (EntityID = '22E4F4DE-9A9B-4FE3-AB1A-ECAC7EF5EF9D' AND Name = 'Sex')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '61f9a077-4288-4ddd-9e7d-101952be8e0e',
            '22E4F4DE-9A9B-4FE3-AB1A-ECAC7EF5EF9D', -- Entity: MJ: Animals
            (SELECT COALESCE(MAX([Sequence]), 0) FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '22E4F4DE-9A9B-4FE3-AB1A-ECAC7EF5EF9D') + 8,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '3379a4db-a473-4fa1-aa5b-4ff5508781be' OR (EntityID = '22E4F4DE-9A9B-4FE3-AB1A-ECAC7EF5EF9D' AND Name = 'EstimatedBirthDate')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '3379a4db-a473-4fa1-aa5b-4ff5508781be',
            '22E4F4DE-9A9B-4FE3-AB1A-ECAC7EF5EF9D', -- Entity: MJ: Animals
            (SELECT COALESCE(MAX([Sequence]), 0) FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '22E4F4DE-9A9B-4FE3-AB1A-ECAC7EF5EF9D') + 9,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'a26ee0ea-5b2e-4cdc-b458-64861b812713' OR (EntityID = '22E4F4DE-9A9B-4FE3-AB1A-ECAC7EF5EF9D' AND Name = 'WeightKg')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'a26ee0ea-5b2e-4cdc-b458-64861b812713',
            '22E4F4DE-9A9B-4FE3-AB1A-ECAC7EF5EF9D', -- Entity: MJ: Animals
            (SELECT COALESCE(MAX([Sequence]), 0) FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '22E4F4DE-9A9B-4FE3-AB1A-ECAC7EF5EF9D') + 10,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'c4c52249-5eb8-4886-8431-87e2f1d6d1a0' OR (EntityID = '22E4F4DE-9A9B-4FE3-AB1A-ECAC7EF5EF9D' AND Name = 'Status')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'c4c52249-5eb8-4886-8431-87e2f1d6d1a0',
            '22E4F4DE-9A9B-4FE3-AB1A-ECAC7EF5EF9D', -- Entity: MJ: Animals
            (SELECT COALESCE(MAX([Sequence]), 0) FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '22E4F4DE-9A9B-4FE3-AB1A-ECAC7EF5EF9D') + 11,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '5b541036-b1db-4a16-8873-73e4a880e923' OR (EntityID = '22E4F4DE-9A9B-4FE3-AB1A-ECAC7EF5EF9D' AND Name = 'Description')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '5b541036-b1db-4a16-8873-73e4a880e923',
            '22E4F4DE-9A9B-4FE3-AB1A-ECAC7EF5EF9D', -- Entity: MJ: Animals
            (SELECT COALESCE(MAX([Sequence]), 0) FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '22E4F4DE-9A9B-4FE3-AB1A-ECAC7EF5EF9D') + 12,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '7532c9f4-ceab-44b0-80c1-218fe913c9bb' OR (EntityID = '22E4F4DE-9A9B-4FE3-AB1A-ECAC7EF5EF9D' AND Name = 'PhotoBase64')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '7532c9f4-ceab-44b0-80c1-218fe913c9bb',
            '22E4F4DE-9A9B-4FE3-AB1A-ECAC7EF5EF9D', -- Entity: MJ: Animals
            (SELECT COALESCE(MAX([Sequence]), 0) FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '22E4F4DE-9A9B-4FE3-AB1A-ECAC7EF5EF9D') + 13,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '5f1c007e-9158-4fda-b394-e4720ce1dc0d' OR (EntityID = '22E4F4DE-9A9B-4FE3-AB1A-ECAC7EF5EF9D' AND Name = '__mj_CreatedAt')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '5f1c007e-9158-4fda-b394-e4720ce1dc0d',
            '22E4F4DE-9A9B-4FE3-AB1A-ECAC7EF5EF9D', -- Entity: MJ: Animals
            (SELECT COALESCE(MAX([Sequence]), 0) FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '22E4F4DE-9A9B-4FE3-AB1A-ECAC7EF5EF9D') + 14,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '6c4c487e-6616-43a0-b731-e02749033e17' OR (EntityID = '22E4F4DE-9A9B-4FE3-AB1A-ECAC7EF5EF9D' AND Name = '__mj_UpdatedAt')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '6c4c487e-6616-43a0-b731-e02749033e17',
            '22E4F4DE-9A9B-4FE3-AB1A-ECAC7EF5EF9D', -- Entity: MJ: Animals
            (SELECT COALESCE(MAX([Sequence]), 0) FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '22E4F4DE-9A9B-4FE3-AB1A-ECAC7EF5EF9D') + 15,
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

/* SQL text to insert entity field value with ID 1e56443f-1bce-4eaa-964e-cf41a03d9414 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('1e56443f-1bce-4eaa-964e-cf41a03d9414', '0F724C37-5D74-4AC2-B61E-EAEF82511504', 1, 'Cat', 'Cat', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID e1ca93fc-b36c-4623-8adc-e6416361c670 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('e1ca93fc-b36c-4623-8adc-e6416361c670', '0F724C37-5D74-4AC2-B61E-EAEF82511504', 2, 'Dog', 'Dog', GETUTCDATE(), GETUTCDATE());

/* SQL text to update ValueListType for entity field ID 0F724C37-5D74-4AC2-B61E-EAEF82511504 */
UPDATE [${flyway:defaultSchema}].[EntityField] SET ValueListType='List' WHERE ID='0F724C37-5D74-4AC2-B61E-EAEF82511504';

/* SQL text to insert entity field value with ID 2463b356-cae6-43d8-80cb-8d00f1f27dd4 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('2463b356-cae6-43d8-80cb-8d00f1f27dd4', 'DF85A3B5-C312-4E9F-8BF9-1E288F83A8C0', 1, 'Giant', 'Giant', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 772a67f4-1245-4831-8126-0f5e7f2d39e3 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('772a67f4-1245-4831-8126-0f5e7f2d39e3', 'DF85A3B5-C312-4E9F-8BF9-1E288F83A8C0', 2, 'Large', 'Large', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 0720d4ba-581a-498c-8e2e-f21e244f6eec */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('0720d4ba-581a-498c-8e2e-f21e244f6eec', 'DF85A3B5-C312-4E9F-8BF9-1E288F83A8C0', 3, 'Medium', 'Medium', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 6be48a4e-736b-4fa0-8356-475fdd3e2187 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('6be48a4e-736b-4fa0-8356-475fdd3e2187', 'DF85A3B5-C312-4E9F-8BF9-1E288F83A8C0', 4, 'Small', 'Small', GETUTCDATE(), GETUTCDATE());

/* SQL text to update ValueListType for entity field ID DF85A3B5-C312-4E9F-8BF9-1E288F83A8C0 */
UPDATE [${flyway:defaultSchema}].[EntityField] SET ValueListType='List' WHERE ID='DF85A3B5-C312-4E9F-8BF9-1E288F83A8C0';

/* SQL text to insert entity field value with ID 4ca30bf9-db53-40c4-a22f-d88f163dda67 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('4ca30bf9-db53-40c4-a22f-d88f163dda67', '14AF4223-9395-490A-9379-15CDB9D03097', 1, 'Cat', 'Cat', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID d12e793a-859c-4ce4-bf1d-c6ccbe92e6c4 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('d12e793a-859c-4ce4-bf1d-c6ccbe92e6c4', '14AF4223-9395-490A-9379-15CDB9D03097', 2, 'Dog', 'Dog', GETUTCDATE(), GETUTCDATE());

/* SQL text to update ValueListType for entity field ID 14AF4223-9395-490A-9379-15CDB9D03097 */
UPDATE [${flyway:defaultSchema}].[EntityField] SET ValueListType='List' WHERE ID='14AF4223-9395-490A-9379-15CDB9D03097';

/* SQL text to insert entity field value with ID 7abcee97-dcde-4bf8-be56-d5a4d0d1b752 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('7abcee97-dcde-4bf8-be56-d5a4d0d1b752', '61F9A077-4288-4DDD-9E7D-101952BE8E0E', 1, 'Female', 'Female', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID ed6ef6a2-a5c3-4946-bf93-2fb3b5551cc9 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('ed6ef6a2-a5c3-4946-bf93-2fb3b5551cc9', '61F9A077-4288-4DDD-9E7D-101952BE8E0E', 2, 'Male', 'Male', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 4c23dfb9-034c-4085-95ac-c07170aec62c */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('4c23dfb9-034c-4085-95ac-c07170aec62c', '61F9A077-4288-4DDD-9E7D-101952BE8E0E', 3, 'Unknown', 'Unknown', GETUTCDATE(), GETUTCDATE());

/* SQL text to update ValueListType for entity field ID 61F9A077-4288-4DDD-9E7D-101952BE8E0E */
UPDATE [${flyway:defaultSchema}].[EntityField] SET ValueListType='List' WHERE ID='61F9A077-4288-4DDD-9E7D-101952BE8E0E';

/* SQL text to insert entity field value with ID 4d5b2151-ace9-4de4-8856-5a47d254f4b6 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('4d5b2151-ace9-4de4-8856-5a47d254f4b6', '08050F3D-9B49-49D5-BCA2-8A416BC864ED', 1, 'Other', 'Other', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID a5ff581f-6da2-4894-b054-77d19530c2ab */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('a5ff581f-6da2-4894-b054-77d19530c2ab', '08050F3D-9B49-49D5-BCA2-8A416BC864ED', 2, 'Returned', 'Returned', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 14d0cb5d-e14c-4f6d-a4c2-806083c473bb */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('14d0cb5d-e14c-4f6d-a4c2-806083c473bb', '08050F3D-9B49-49D5-BCA2-8A416BC864ED', 3, 'Stray', 'Stray', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID d0172605-9a2a-4e73-a699-de5124746743 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('d0172605-9a2a-4e73-a699-de5124746743', '08050F3D-9B49-49D5-BCA2-8A416BC864ED', 4, 'Surrender', 'Surrender', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID fb2eb099-a938-4f8a-95d2-085341283d5b */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('fb2eb099-a938-4f8a-95d2-085341283d5b', '08050F3D-9B49-49D5-BCA2-8A416BC864ED', 5, 'Transfer', 'Transfer', GETUTCDATE(), GETUTCDATE());

/* SQL text to update ValueListType for entity field ID 08050F3D-9B49-49D5-BCA2-8A416BC864ED */
UPDATE [${flyway:defaultSchema}].[EntityField] SET ValueListType='List' WHERE ID='08050F3D-9B49-49D5-BCA2-8A416BC864ED';

/* SQL text to insert entity field value with ID 909b0765-3be6-4890-87da-ee1c398edade */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('909b0765-3be6-4890-87da-ee1c398edade', 'C4C52249-5EB8-4886-8431-87E2F1D6D1A0', 1, 'Adopted', 'Adopted', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID b85bf995-7097-40aa-bc7d-8a8e82e5d6bb */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('b85bf995-7097-40aa-bc7d-8a8e82e5d6bb', 'C4C52249-5EB8-4886-8431-87E2F1D6D1A0', 2, 'Available', 'Available', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID a138e61a-aadb-4a5f-89a1-4aa9db2be329 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('a138e61a-aadb-4a5f-89a1-4aa9db2be329', 'C4C52249-5EB8-4886-8431-87E2F1D6D1A0', 3, 'Hold', 'Hold', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 7ecc910f-f107-4c0e-8f69-bb96a6ff8975 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('7ecc910f-f107-4c0e-8f69-bb96a6ff8975', 'C4C52249-5EB8-4886-8431-87E2F1D6D1A0', 4, 'Intake', 'Intake', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID bc1003dc-0235-432f-93c2-7121b473cfe8 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('bc1003dc-0235-432f-93c2-7121b473cfe8', 'C4C52249-5EB8-4886-8431-87E2F1D6D1A0', 5, 'Transferred', 'Transferred', GETUTCDATE(), GETUTCDATE());

/* SQL text to update ValueListType for entity field ID C4C52249-5EB8-4886-8431-87E2F1D6D1A0 */
UPDATE [${flyway:defaultSchema}].[EntityField] SET ValueListType='List' WHERE ID='C4C52249-5EB8-4886-8431-87E2F1D6D1A0';


/* Create Entity Relationship: MJ: Breeds -> MJ: Animals (One To Many via BreedID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = '2522580f-6378-49f4-a82c-7e74bca63c8f'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('2522580f-6378-49f4-a82c-7e74bca63c8f', 'A40310AA-94BF-43B5-9AA5-6E2757FF1405', '22E4F4DE-9A9B-4FE3-AB1A-ECAC7EF5EF9D', 'BreedID', 'One To Many', 1, 1, 1, GETUTCDATE(), GETUTCDATE())
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

/* SQL text to update entity field related entity name field map for entity field ID B296835D-7A50-4208-9671-0EAAC207F239 */
EXEC [${flyway:defaultSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='B296835D-7A50-4208-9671-0EAAC207F239', @RelatedEntityNameFieldMap='Breed';

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
       WHERE [EntityID] = '22E4F4DE-9A9B-4FE3-AB1A-ECAC7EF5EF9D'
         AND [Sequence] < 100000;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'a2fa8364-00bc-4b78-b404-b62fe5fbc819' OR (EntityID = '22E4F4DE-9A9B-4FE3-AB1A-ECAC7EF5EF9D' AND Name = 'Breed')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'a2fa8364-00bc-4b78-b404-b62fe5fbc819',
            '22E4F4DE-9A9B-4FE3-AB1A-ECAC7EF5EF9D', -- Entity: MJ: Animals
            (SELECT COALESCE(MAX([Sequence]), 0) FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '22E4F4DE-9A9B-4FE3-AB1A-ECAC7EF5EF9D') + 16,
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
               WHERE ID = '0F724C37-5D74-4AC2-B61E-EAEF82511504'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = 'DF85A3B5-C312-4E9F-8BF9-1E288F83A8C0'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '724C713E-1D25-4486-9D3B-174220E5DBD0'
               AND AutoUpdateDefaultInView = 1;

            UPDATE [${flyway:defaultSchema}].[Entity]
            SET AllowUserSearchAPI = 0
            WHERE ID = 'A40310AA-94BF-43B5-9AA5-6E2757FF1405'
            AND AutoUpdateAllowUserSearchAPI = 1;

/* Set field properties for entity */

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '14AF4223-9395-490A-9379-15CDB9D03097'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '4992E657-62FC-4B60-8B44-AE19B2643091'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = 'C4C52249-5EB8-4886-8431-87E2F1D6D1A0'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = 'A2FA8364-00BC-4B78-B404-B62FE5FBC819'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '57A8EE40-9CD3-47EA-AFE0-937A5A5FCF7E'
               AND AutoUpdateIncludeInUserSearchAPI = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET UserSearchPredicateAPI = 'BeginsWith'
               WHERE ID = 'C755A802-FA0C-4100-9795-93FBB9A09CAD'
               AND AutoUpdateUserSearchPredicate = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET UserSearchPredicateAPI = 'Exact'
               WHERE ID = '57A8EE40-9CD3-47EA-AFE0-937A5A5FCF7E'
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
   ID = '41020086-E1B4-4DD5-935E-C548C37B8B26' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Breeds.Name 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Breed Details',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '4788C3E9-380E-4D0C-9D09-455FD86F225D' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Breeds.Species 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Breed Details',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '0F724C37-5D74-4AC2-B61E-EAEF82511504' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Breeds.SizeCategory 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Breed Details',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'DF85A3B5-C312-4E9F-8BF9-1E288F83A8C0' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Breeds.TypicalLifespanYears 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Breed Details',
   GeneratedFormSection = 'Category',
   DisplayName = 'Typical Lifespan (Years)',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '3FA1CDED-1AF0-428E-8B4D-375E0800A008' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Breeds.IsActive 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Breed Details',
   GeneratedFormSection = 'Category',
   DisplayName = 'Active',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '724C713E-1D25-4486-9D3B-174220E5DBD0' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Breeds.__mj_CreatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '1C27C211-40AE-4C14-A9EA-CEB0BA2D7777' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Breeds.__mj_UpdatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'AB6C801C-49C4-4136-80B4-35B151BA9934' AND AutoUpdateCategory = 1;

/* Set entity icon to fa fa-paw */

               UPDATE [${flyway:defaultSchema}].[Entity]
               SET [Icon] = 'fa fa-paw', [__mj_UpdatedAt] = GETUTCDATE()
               WHERE [ID] = 'A40310AA-94BF-43B5-9AA5-6E2757FF1405';

/* Insert FieldCategoryInfo setting for entity */

               INSERT INTO [${flyway:defaultSchema}].[EntitySetting] ([ID], [EntityID], [Name], [Value], [__mj_CreatedAt], [__mj_UpdatedAt])
               VALUES ('190cf227-eee2-4ebc-8911-24bb06518579', 'A40310AA-94BF-43B5-9AA5-6E2757FF1405', 'FieldCategoryInfo', '{"Breed Details":{"icon":"fa fa-info-circle","description":"Descriptive attributes of the animal breed including species, size, and lifespan"},"System Metadata":{"icon":"fa fa-cog","description":"System-managed audit and tracking fields"}}', GETUTCDATE(), GETUTCDATE());

/* Insert FieldCategoryIcons setting (legacy) */

               INSERT INTO [${flyway:defaultSchema}].[EntitySetting] ([ID], [EntityID], [Name], [Value], [__mj_CreatedAt], [__mj_UpdatedAt])
               VALUES ('b63c0d6d-a843-4aa4-8a05-00945f1bbbd1', 'A40310AA-94BF-43B5-9AA5-6E2757FF1405', 'FieldCategoryIcons', '{"Breed Details":"fa fa-info-circle","System Metadata":"fa fa-cog"}', GETUTCDATE(), GETUTCDATE());

/* Set DefaultForNewUser=false for NEW entity (category: reference, confidence: high) */

         UPDATE [${flyway:defaultSchema}].[ApplicationEntity]
         SET [DefaultForNewUser] = 0, [__mj_UpdatedAt] = GETUTCDATE()
         WHERE [EntityID] = 'A40310AA-94BF-43B5-9AA5-6E2757FF1405';

/* Set categories for 16 fields */

-- UPDATE Entity Field Category Info MJ: Animals.ID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '7556A7F6-61EE-4C02-B410-D0DE79C4D61B' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Animals.Name 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Animal Identity',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'C755A802-FA0C-4100-9795-93FBB9A09CAD' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Animals.Species 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Animal Identity',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '14AF4223-9395-490A-9379-15CDB9D03097' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Animals.Breed 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Animal Identity',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'A2FA8364-00BC-4B78-B404-B62FE5FBC819' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Animals.BreedID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Animal Identity',
   GeneratedFormSection = 'Category',
   DisplayName = 'Breed Reference',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'B296835D-7A50-4208-9671-0EAAC207F239' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Animals.MicrochipNumber 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Animal Identity',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '57A8EE40-9CD3-47EA-AFE0-937A5A5FCF7E' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Animals.IntakeDate 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Shelter History',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '4992E657-62FC-4B60-8B44-AE19B2643091' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Animals.IntakeReason 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Shelter History',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '08050F3D-9B49-49D5-BCA2-8A416BC864ED' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Animals.Status 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Shelter History',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'C4C52249-5EB8-4886-8431-87E2F1D6D1A0' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Animals.Sex 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Physical Attributes',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '61F9A077-4288-4DDD-9E7D-101952BE8E0E' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Animals.EstimatedBirthDate 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Physical Attributes',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '3379A4DB-A473-4FA1-AA5B-4FF5508781BE' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Animals.WeightKg 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Physical Attributes',
   GeneratedFormSection = 'Category',
   DisplayName = 'Weight (kg)',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'A26EE0EA-5B2E-4CDC-B458-64861B812713' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Animals.Description 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Animal Profile',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '5B541036-B1DB-4A16-8873-73E4A880E923' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Animals.PhotoBase64 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Animal Profile',
   GeneratedFormSection = 'Category',
   DisplayName = 'Photo',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '7532C9F4-CEAB-44B0-80C1-218FE913C9BB' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Animals.__mj_CreatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '5F1C007E-9158-4FDA-B394-E4720CE1DC0D' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Animals.__mj_UpdatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '6C4C487E-6616-43A0-B731-E02749033E17' AND AutoUpdateCategory = 1;

/* Set entity icon to fa fa-paw */

               UPDATE [${flyway:defaultSchema}].[Entity]
               SET [Icon] = 'fa fa-paw', [__mj_UpdatedAt] = GETUTCDATE()
               WHERE [ID] = '22E4F4DE-9A9B-4FE3-AB1A-ECAC7EF5EF9D';

/* Insert FieldCategoryInfo setting for entity */

               INSERT INTO [${flyway:defaultSchema}].[EntitySetting] ([ID], [EntityID], [Name], [Value], [__mj_CreatedAt], [__mj_UpdatedAt])
               VALUES ('ecb58174-c7f1-4030-8c0b-8546a05988ea', '22E4F4DE-9A9B-4FE3-AB1A-ECAC7EF5EF9D', 'FieldCategoryInfo', '{"Animal Identity":{"icon":"fa fa-id-card","description":"Core identifying details including name, species, breed, and microchip information"},"Shelter History":{"icon":"fa fa-history","description":"Information regarding intake, shelter workflow status, and arrival context"},"Physical Attributes":{"icon":"fa fa-weight","description":"Biological and physical characteristics including sex, age, and weight"},"Animal Profile":{"icon":"fa fa-align-left","description":"Descriptive notes and visual media for the animal"},"System Metadata":{"icon":"fa fa-cog","description":"System-managed audit and tracking fields"}}', GETUTCDATE(), GETUTCDATE());

/* Insert FieldCategoryIcons setting (legacy) */

               INSERT INTO [${flyway:defaultSchema}].[EntitySetting] ([ID], [EntityID], [Name], [Value], [__mj_CreatedAt], [__mj_UpdatedAt])
               VALUES ('38ba5c2a-1607-4a7a-ad9b-5e9058ccfceb', '22E4F4DE-9A9B-4FE3-AB1A-ECAC7EF5EF9D', 'FieldCategoryIcons', '{"Animal Identity":"fa fa-id-card","Shelter History":"fa fa-history","Physical Attributes":"fa fa-weight","Animal Profile":"fa fa-align-left","System Metadata":"fa fa-cog"}', GETUTCDATE(), GETUTCDATE());

/* Set DefaultForNewUser=true for NEW entity (category: primary, confidence: high) */

         UPDATE [${flyway:defaultSchema}].[ApplicationEntity]
         SET [DefaultForNewUser] = 1, [__mj_UpdatedAt] = GETUTCDATE()
         WHERE [EntityID] = '22E4F4DE-9A9B-4FE3-AB1A-ECAC7EF5EF9D';

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
}', 'If the animal''s weight is specified, it must be greater than 0 kg to ensure realistic and accurate physical measurements.', 'ValidateWeightKgGreaterThanZero', 'DF238F34-2837-EF11-86D4-6045BDEE16E6', 'A26EE0EA-5B2E-4CDC-B458-64861B812713');

/* Generated Validation Functions for MJ: Breeds */
-- CHECK constraint for MJ: Breeds: Field: TypicalLifespanYears was newly set or modified since the last generation of the validation function, the code was regenerated and updating the GeneratedCode table with the new generated validation function
INSERT INTO [${flyway:defaultSchema}].[GeneratedCode] ([CategoryID], [GeneratedByModelID], [GeneratedAt], [Language], [Status], [Source], [Code], [Description], [Name], [LinkedEntityID], [LinkedRecordPrimaryKey])
                      VALUES ((SELECT [ID] FROM [${flyway:defaultSchema}].[vwGeneratedCodeCategories] WHERE [Name]='CodeGen: Validators'), 'C43229F6-4CC8-4838-9D04-03419A2DA191', GETUTCDATE(), 'TypeScript', 'Approved', '([TypicalLifespanYears] IS NULL OR [TypicalLifespanYears]>(0))', 'public ValidateTypicalLifespanYearsGreaterThanZero(result: ValidationResult) {
	if (this.TypicalLifespanYears != null && this.TypicalLifespanYears <= 0) {
		result.Errors.push(new ValidationErrorInfo(
			"TypicalLifespanYears",
			"Typical lifespan years must be a positive number greater than zero.",
			this.TypicalLifespanYears,
			ValidationErrorType.Failure
		));
	}
}', 'The typical lifespan in years, if provided, must be a positive number greater than zero.', 'ValidateTypicalLifespanYearsGreaterThanZero', 'DF238F34-2837-EF11-86D4-6045BDEE16E6', '3FA1CDED-1AF0-428E-8B4D-375E0800A008');

