/* SQL text to insert 6 new entity field(s) */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'd900ce97-0bab-4d44-8a73-e3f2a0e92985' OR (EntityID = '8BA0CCA7-35C1-4482-ADFD-2285D3CEBDE8' AND Name = 'AssignedByStaff')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'd900ce97-0bab-4d44-8a73-e3f2a0e92985',
            '8BA0CCA7-35C1-4482-ADFD-2285D3CEBDE8', -- Entity: Dog Traits
            (SELECT COALESCE(MAX([Sequence]), 0) FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '8BA0CCA7-35C1-4482-ADFD-2285D3CEBDE8') + 11,
            'AssignedByStaff',
            'Assigned By Staff',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '153d136f-3909-4a95-81cb-d8282d3ce336' OR (EntityID = 'D2AA9349-07E7-4C1D-B03C-2DFA4A00FDB7' AND Name = 'Adopter')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '153d136f-3909-4a95-81cb-d8282d3ce336',
            'D2AA9349-07E7-4C1D-B03C-2DFA4A00FDB7', -- Entity: Adoption Applications
            (SELECT COALESCE(MAX([Sequence]), 0) FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'D2AA9349-07E7-4C1D-B03C-2DFA4A00FDB7') + 15,
            'Adopter',
            'Adopter',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'e3df8bf5-2163-4311-9f70-2f6ebef8afc6' OR (EntityID = 'D2AA9349-07E7-4C1D-B03C-2DFA4A00FDB7' AND Name = 'ReviewedByStaff')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'e3df8bf5-2163-4311-9f70-2f6ebef8afc6',
            'D2AA9349-07E7-4C1D-B03C-2DFA4A00FDB7', -- Entity: Adoption Applications
            (SELECT COALESCE(MAX([Sequence]), 0) FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'D2AA9349-07E7-4C1D-B03C-2DFA4A00FDB7') + 16,
            'ReviewedByStaff',
            'Reviewed By Staff',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '813d213e-c3e1-482a-8b78-1caf44be83f5' OR (EntityID = '55903600-D02D-4E83-8614-3D989DF836A8' AND Name = 'FosterAdopter')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '813d213e-c3e1-482a-8b78-1caf44be83f5',
            '55903600-D02D-4E83-8614-3D989DF836A8', -- Entity: Foster Placements
            (SELECT COALESCE(MAX([Sequence]), 0) FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '55903600-D02D-4E83-8614-3D989DF836A8') + 12,
            'FosterAdopter',
            'Foster Adopter',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'd79c1f12-60e5-4815-8251-6e84c370c55d' OR (EntityID = 'F476381C-DFDA-4E8B-B1B5-6250297DE5AF' AND Name = 'Supervisor')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'd79c1f12-60e5-4815-8251-6e84c370c55d',
            'F476381C-DFDA-4E8B-B1B5-6250297DE5AF', -- Entity: Staffs
            (SELECT COALESCE(MAX([Sequence]), 0) FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'F476381C-DFDA-4E8B-B1B5-6250297DE5AF') + 15,
            'Supervisor',
            'Supervisor',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '4c659c8c-1fbe-4bf2-bf9c-f8c045c3ee29' OR (EntityID = 'BB0DBA63-9E3E-4327-84DF-A0F33A8CB8B7' AND Name = 'VeterinarianStaff')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '4c659c8c-1fbe-4bf2-bf9c-f8c045c3ee29',
            'BB0DBA63-9E3E-4327-84DF-A0F33A8CB8B7', -- Entity: Medical Records
            (SELECT COALESCE(MAX([Sequence]), 0) FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'BB0DBA63-9E3E-4327-84DF-A0F33A8CB8B7') + 13,
            'VeterinarianStaff',
            'Veterinarian Staff',
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
    DogShelterDog_DogID.[Name] AS [Dog],
    DogShelterAdopter_AdopterID.[FirstName] AS [Adopter],
    DogShelterStaff_ReviewedByStaffID.[FirstName] AS [ReviewedByStaff]
FROM
    [DogShelter].[AdoptionApplication] AS a
INNER JOIN
    [DogShelter].[Dog] AS DogShelterDog_DogID
  ON
    [a].[DogID] = DogShelterDog_DogID.[ID]
INNER JOIN
    [DogShelter].[Adopter] AS DogShelterAdopter_AdopterID
  ON
    [a].[AdopterID] = DogShelterAdopter_AdopterID.[ID]
LEFT OUTER JOIN
    [DogShelter].[Staff] AS DogShelterStaff_ReviewedByStaffID
  ON
    [a].[ReviewedByStaffID] = DogShelterStaff_ReviewedByStaffID.[ID]
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
    DogShelterTrait_TraitID.[Name] AS [Trait],
    DogShelterStaff_AssignedByStaffID.[FirstName] AS [AssignedByStaff]
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
LEFT OUTER JOIN
    [DogShelter].[Staff] AS DogShelterStaff_AssignedByStaffID
  ON
    [d].[AssignedByStaffID] = DogShelterStaff_AssignedByStaffID.[ID]
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
    DogShelterDog_DogID.[Name] AS [Dog],
    DogShelterAdopter_FosterAdopterID.[FirstName] AS [FosterAdopter]
FROM
    [DogShelter].[FosterPlacement] AS f
INNER JOIN
    [DogShelter].[Dog] AS DogShelterDog_DogID
  ON
    [f].[DogID] = DogShelterDog_DogID.[ID]
INNER JOIN
    [DogShelter].[Adopter] AS DogShelterAdopter_FosterAdopterID
  ON
    [f].[FosterAdopterID] = DogShelterAdopter_FosterAdopterID.[ID]
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
    DogShelterDog_DogID.[Name] AS [Dog],
    DogShelterStaff_VeterinarianStaffID.[FirstName] AS [VeterinarianStaff]
FROM
    [DogShelter].[MedicalRecord] AS m
INNER JOIN
    [DogShelter].[Dog] AS DogShelterDog_DogID
  ON
    [m].[DogID] = DogShelterDog_DogID.[ID]
LEFT OUTER JOIN
    [DogShelter].[Staff] AS DogShelterStaff_VeterinarianStaffID
  ON
    [m].[VeterinarianStaffID] = DogShelterStaff_VeterinarianStaffID.[ID]
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
    DogShelterStaff_SupervisorID.[FirstName] AS [Supervisor],
    root_SupervisorID.RootID AS [RootSupervisorID]
FROM
    [DogShelter].[Staff] AS s
INNER JOIN
    [DogShelter].[Shelter] AS DogShelterShelter_ShelterID
  ON
    [s].[ShelterID] = DogShelterShelter_ShelterID.[ID]
LEFT OUTER JOIN
    [DogShelter].[Staff] AS DogShelterStaff_SupervisorID
  ON
    [s].[SupervisorID] = DogShelterStaff_SupervisorID.[ID]
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

/* Set field properties for entity */

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = 'D900CE97-0BAB-4D44-8A73-E3F2A0E92985'
               AND AutoUpdateDefaultInView = 1;

/* Set field properties for entity */

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '813D213E-C3E1-482A-8B78-1CAF44BE83F5'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '813D213E-C3E1-482A-8B78-1CAF44BE83F5'
               AND AutoUpdateIncludeInUserSearchAPI = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET UserSearchPredicateAPI = 'BeginsWith'
               WHERE ID = '813D213E-C3E1-482A-8B78-1CAF44BE83F5'
               AND AutoUpdateUserSearchPredicate = 1;

/* Set field properties for entity */

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '153D136F-3909-4A95-81CB-D8282D3CE336'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '153D136F-3909-4A95-81CB-D8282D3CE336'
               AND AutoUpdateIncludeInUserSearchAPI = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET UserSearchPredicateAPI = 'BeginsWith'
               WHERE ID = '153D136F-3909-4A95-81CB-D8282D3CE336'
               AND AutoUpdateUserSearchPredicate = 1;

/* Set field properties for entity */

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = 'AE2E2381-8BB7-4235-993A-8FE6444F590F'
               AND AutoUpdateDefaultInView = 1;

/* Set categories for 12 fields */

-- UPDATE Entity Field Category Info Foster Placements.ID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '2B712EA9-18F3-4A46-87DD-B024C868292B' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info Foster Placements.DogID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'CC9CC857-FBEF-42FB-AF2A-D61E7BA8FA52' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info Foster Placements.FosterAdopterID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'B9FBBAA0-1DFE-4441-BD20-05DA44483395' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info Foster Placements.Dog 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '9CEC96F5-42DF-4AD7-A9EC-8013B8F82519' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info Foster Placements.FosterAdopter 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Placement Details',
   GeneratedFormSection = 'Category',
   DisplayName = 'Foster Caregiver Name',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '813D213E-C3E1-482A-8B78-1CAF44BE83F5' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info Foster Placements.StartDate 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'F6A589BD-65E6-4C22-98E8-6F8346A6B682' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info Foster Placements.EndDate 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '51763C24-B9E6-4FE2-A694-60C2203D6AA5' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info Foster Placements.Status 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   DisplayName = 'Placement Status',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '56102C23-F258-4D60-A58F-D1D2DCE99FBB' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info Foster Placements.Reason 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '0C04C57F-0317-4685-B8DA-F541F184CBA8' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info Foster Placements.Notes 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   DisplayName = 'Foster Notes',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '8AA9DECE-8685-4166-8E86-818AFA86B670' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info Foster Placements.__mj_CreatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'DC90A9D3-8EAB-4219-A2E0-F4D35631B8FA' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info Foster Placements.__mj_UpdatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '3E0C8A34-E425-43A6-A7F0-EDC59BB2F2EC' AND AutoUpdateCategory = 1;

/* Set categories for 11 fields */

-- UPDATE Entity Field Category Info Dog Traits.ID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '47E8B615-4E74-4868-99F6-CEE9F0C8394B' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info Dog Traits.DogID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '1607EEAA-F6D8-4E2C-8D50-BB6E214A33B0' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info Dog Traits.TraitID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '8A3EC8FD-6627-4E1C-8FCC-C0475644E7D0' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info Dog Traits.AssignedByStaffID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '034525F7-8550-4842-BA83-936EEA410415' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info Dog Traits.AssignedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '21CFE73B-5382-4166-9AD0-BFBC15103A23' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info Dog Traits.Notes 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'EE0708DE-3424-4A51-B3B5-022CA423A0FC' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info Dog Traits.__mj_CreatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '34D274FA-9D5D-49E0-B895-E8DF8F398F23' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info Dog Traits.__mj_UpdatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '8B549AEF-4878-418B-9BCD-E7CDAD3E5999' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info Dog Traits.Dog 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'CF0250EB-E235-4E4D-AFDE-A59223C0D29A' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info Dog Traits.Trait 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '21B2BACA-0369-4F35-B3D7-9BD27C0213DB' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info Dog Traits.AssignedByStaff 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Assignment Details',
   GeneratedFormSection = 'Category',
   DisplayName = 'Assigned By Staff Name',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'D900CE97-0BAB-4D44-8A73-E3F2A0E92985' AND AutoUpdateCategory = 1;

/* Set categories for 13 fields */

-- UPDATE Entity Field Category Info Medical Records.ID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'F31AE351-F826-4577-BBF2-0E330577531E' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info Medical Records.__mj_CreatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'FCFDBAA8-44EB-452F-BEBB-F81E20A1841D' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info Medical Records.__mj_UpdatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '4BBE4762-336F-4CC9-AF3B-08BCCCCDB1AE' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info Medical Records.DogID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '672904DF-FFEE-4C3E-BC5F-BFB873A6DF6A' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info Medical Records.RecordDate 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '34F764A7-E8E5-4765-8C82-5F7BFB3ADE47' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info Medical Records.RecordType 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '98870AE1-4AF1-4974-8FB2-1A1C2DC43BE1' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info Medical Records.Description 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'A55093F1-B990-4587-B3B7-992F91EA719A' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info Medical Records.Dog 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'AE2E2381-8BB7-4235-993A-8FE6444F590F' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info Medical Records.VeterinarianStaffID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   DisplayName = 'Veterinarian Staff',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '4ABB5BF0-564B-4E35-8DE9-1FA47BEBAF03' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info Medical Records.FollowUpDate 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '1C833434-D395-427C-8533-84554C6301E1' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info Medical Records.Notes 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   DisplayName = 'Notes',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '3ECB2CD5-4122-4E42-9D81-A5BFA13DD017' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info Medical Records.VeterinarianStaff 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Clinical Staff and Follow-up',
   GeneratedFormSection = 'Category',
   DisplayName = 'Staff Name',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '4C659C8C-1FBE-4BF2-BF9C-F8C045C3EE29' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info Medical Records.Cost 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '0401E99B-EF30-4602-9FAB-627A52BC5830' AND AutoUpdateCategory = 1;

/* Set categories for 16 fields */

-- UPDATE Entity Field Category Info Staffs.ID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'C57B3CAC-C91B-4537-811E-F16287CA4F32' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info Staffs.__mj_CreatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'BB4871D4-BDD5-4932-AEF8-C240A3B8DCA9' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info Staffs.__mj_UpdatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '8A62F8F4-4A61-4772-BAAA-74D66201B26C' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info Staffs.ShelterID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   DisplayName = 'Shelter ID',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '630B7D99-3F7E-415A-A9E4-6DA651EF25AB' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info Staffs.Role 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '6BA3A69E-7935-4B85-9653-B2B41512A0D5' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info Staffs.HireDate 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '5A52D968-929F-4F42-A846-C5DCF946BEEE' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info Staffs.IsActive 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'BB738FF1-80C1-43E6-80AE-EA07C2CFFC9B' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info Staffs.Shelter 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   DisplayName = 'Shelter',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '9141526B-6DF2-41A6-80C8-BD5F1A38E737' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info Staffs.FirstName 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'D7EFA1DD-769C-45C0-B5DC-3EEF1201FE11' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info Staffs.LastName 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'B34388A0-EF51-4E2B-982C-CB52114F5D27' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info Staffs.FullName 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '486275CA-9E7F-44FA-B685-73B5526FA624' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info Staffs.Email 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = 'Email',
   CodeType = NULL
WHERE 
   ID = '15D0CC3A-D50B-44AD-A195-6C366B106CA0' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info Staffs.Phone 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = 'Tel',
   CodeType = NULL
WHERE 
   ID = 'C23E0297-D40A-49A1-AAF5-5A6168FDF94B' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info Staffs.SupervisorID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   DisplayName = 'Supervisor ID',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '0D0C8800-26AA-4591-B597-DE850D60EBF8' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info Staffs.Supervisor 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Organizational Hierarchy',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'D79C1F12-60E5-4815-8251-6E84C370C55D' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info Staffs.RootSupervisorID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   DisplayName = 'Root Supervisor ID',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '8E6E1577-FB81-43A9-BCBF-55DA0C4370F6' AND AutoUpdateCategory = 1;

/* Set categories for 16 fields */

-- UPDATE Entity Field Category Info Adoption Applications.ID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '4AD9F802-E347-469F-8463-32E91EDF513B' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info Adoption Applications.__mj_CreatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '4769EA7F-A6F0-430E-BC65-740A3E47C782' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info Adoption Applications.__mj_UpdatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '1BF9C770-AD75-45B1-BB68-38B7474D1F29' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info Adoption Applications.DogID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '93C2B8C4-734B-4E55-A3A2-FBF6FB2B52D5' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info Adoption Applications.Dog 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '7581FC66-4E27-44EF-8532-DA6AE7216C51' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info Adoption Applications.AdopterID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'E800A2EC-0941-4242-9226-78072855A718' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info Adoption Applications.Adopter 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Application Context',
   GeneratedFormSection = 'Category',
   DisplayName = 'Adopter Name',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '153D136F-3909-4A95-81CB-D8282D3CE336' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info Adoption Applications.SubmittedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '7863A449-ED62-4EC5-BFA0-8BA562B7F59C' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info Adoption Applications.HomeVisitDate 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '55654386-D8DF-49AC-B392-DE031AD1E2AB' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info Adoption Applications.AdoptionDate 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '207F6CDC-3C84-4657-9EDC-CEE485541EA4' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info Adoption Applications.Status 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'CC6188BF-960A-41E9-9C0F-68AC876B3ED9' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info Adoption Applications.ReviewedByStaffID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '7BEF2939-5E24-4CFB-AA8F-A08A59197451' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info Adoption Applications.ReviewedByStaff 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Workflow and Review',
   GeneratedFormSection = 'Category',
   DisplayName = 'Reviewer Name',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'E3DF8BF5-2163-4311-9F70-2F6EBEF8AFC6' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info Adoption Applications.ReviewedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '2A1977D6-F366-420D-983A-252B5007F184' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info Adoption Applications.DecisionNotes 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '0B68C3C6-3D52-40CC-AF41-B59CB98B648A' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info Adoption Applications.FeePaid 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '2097EA3F-2791-44BD-A783-97DC5F23B836' AND AutoUpdateCategory = 1;

