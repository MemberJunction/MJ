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

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.IdentityClaim */
DECLARE @constraintName NVARCHAR(255);

SELECT @constraintName = d.name
FROM sys.tables t
JOIN sys.schemas s ON t.schema_id = s.schema_id
JOIN sys.columns c ON t.object_id = c.object_id
JOIN sys.default_constraints d ON c.default_object_id = d.object_id
WHERE s.name = '${flyway:defaultSchema}'
AND t.name = 'IdentityClaim'
AND c.name = '__mj_CreatedAt';

IF @constraintName IS NOT NULL
BEGIN
    EXEC('ALTER TABLE [${flyway:defaultSchema}].[IdentityClaim] DROP CONSTRAINT ' + @constraintName);
END;

/* SQL text to add default constraint for special date field __mj_CreatedAt in entity ${flyway:defaultSchema}.IdentityClaim */
ALTER TABLE [${flyway:defaultSchema}].[IdentityClaim] ADD CONSTRAINT [DF___mj_IdentityClaim___mj_CreatedAt] DEFAULT GETUTCDATE() FOR [__mj_CreatedAt];

GO
-- ┌─ MJ ACADEMY HAND EDIT — batch separator only, no CodeGen output changed ─────────────┐
-- │ CodeGen emits consecutive "drop default existing default constraints" blocks that    │
-- │ EACH declare @constraintName, with no GO between them. Replaying the capture then    │
-- │ fails: "The variable name '@constraintName' has already been declared."               │
-- │ CodeGen never hits this because it executes each block as its own statement -- only   │
-- │ the concatenated log is invalid. Reproduced from zero on v6.1.0-edge.4 AND on         │
-- │ origin/next with cli 6.1.0-edge.5, so it is not fixed upstream. Reported separately.  │
-- │ The ONLY change is the GO added above; not one line of generated SQL was altered.     │
-- └──────────────────────────────────────────────────────────────────────────────────────┘
/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.IdentityClaim */
DECLARE @constraintName NVARCHAR(255);

SELECT @constraintName = d.name
FROM sys.tables t
JOIN sys.schemas s ON t.schema_id = s.schema_id
JOIN sys.columns c ON t.object_id = c.object_id
JOIN sys.default_constraints d ON c.default_object_id = d.object_id
WHERE s.name = '${flyway:defaultSchema}'
AND t.name = 'IdentityClaim'
AND c.name = '__mj_UpdatedAt';

IF @constraintName IS NOT NULL
BEGIN
    EXEC('ALTER TABLE [${flyway:defaultSchema}].[IdentityClaim] DROP CONSTRAINT ' + @constraintName);
END;

/* SQL text to add default constraint for special date field __mj_UpdatedAt in entity ${flyway:defaultSchema}.IdentityClaim */
ALTER TABLE [${flyway:defaultSchema}].[IdentityClaim] ADD CONSTRAINT [DF___mj_IdentityClaim___mj_UpdatedAt] DEFAULT GETUTCDATE() FOR [__mj_UpdatedAt];

GO
/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.IdentityClaimType */
DECLARE @constraintName NVARCHAR(255);

SELECT @constraintName = d.name
FROM sys.tables t
JOIN sys.schemas s ON t.schema_id = s.schema_id
JOIN sys.columns c ON t.object_id = c.object_id
JOIN sys.default_constraints d ON c.default_object_id = d.object_id
WHERE s.name = '${flyway:defaultSchema}'
AND t.name = 'IdentityClaimType'
AND c.name = '__mj_CreatedAt';

IF @constraintName IS NOT NULL
BEGIN
    EXEC('ALTER TABLE [${flyway:defaultSchema}].[IdentityClaimType] DROP CONSTRAINT ' + @constraintName);
END;

/* SQL text to add default constraint for special date field __mj_CreatedAt in entity ${flyway:defaultSchema}.IdentityClaimType */
ALTER TABLE [${flyway:defaultSchema}].[IdentityClaimType] ADD CONSTRAINT [DF___mj_IdentityClaimType___mj_CreatedAt] DEFAULT GETUTCDATE() FOR [__mj_CreatedAt];

GO
/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.IdentityClaimType */
DECLARE @constraintName NVARCHAR(255);

SELECT @constraintName = d.name
FROM sys.tables t
JOIN sys.schemas s ON t.schema_id = s.schema_id
JOIN sys.columns c ON t.object_id = c.object_id
JOIN sys.default_constraints d ON c.default_object_id = d.object_id
WHERE s.name = '${flyway:defaultSchema}'
AND t.name = 'IdentityClaimType'
AND c.name = '__mj_UpdatedAt';

IF @constraintName IS NOT NULL
BEGIN
    EXEC('ALTER TABLE [${flyway:defaultSchema}].[IdentityClaimType] DROP CONSTRAINT ' + @constraintName);
END;

/* SQL text to add default constraint for special date field __mj_UpdatedAt in entity ${flyway:defaultSchema}.IdentityClaimType */
ALTER TABLE [${flyway:defaultSchema}].[IdentityClaimType] ADD CONSTRAINT [DF___mj_IdentityClaimType___mj_UpdatedAt] DEFAULT GETUTCDATE() FOR [__mj_UpdatedAt];

/* SQL text to insert entity field value with ID f0964918-5589-45db-8806-852038db4a50 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('f0964918-5589-45db-8806-852038db4a50', 'F925BD99-4B5A-48A4-878A-385E8F2D87E7', 1, 'Claimed', 'Claimed', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID a532c5af-c6e7-402d-bb91-201e72abf78c */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('a532c5af-c6e7-402d-bb91-201e72abf78c', 'F925BD99-4B5A-48A4-878A-385E8F2D87E7', 2, 'Expired', 'Expired', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID e7372fc5-62ac-40bd-bc38-7d4c13e6715e */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('e7372fc5-62ac-40bd-bc38-7d4c13e6715e', 'F925BD99-4B5A-48A4-878A-385E8F2D87E7', 3, 'Pending', 'Pending', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 03a3472a-36ec-46e1-acb5-37d6d13076b5 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('03a3472a-36ec-46e1-acb5-37d6d13076b5', 'F925BD99-4B5A-48A4-878A-385E8F2D87E7', 4, 'Revoked', 'Revoked', GETUTCDATE(), GETUTCDATE());

/* SQL text to update ValueListType for entity field ID F925BD99-4B5A-48A4-878A-385E8F2D87E7 */
UPDATE [${flyway:defaultSchema}].[EntityField] SET ValueListType='List' WHERE ID='F925BD99-4B5A-48A4-878A-385E8F2D87E7';


/* Create Entity Relationship: MJ: Entities -> MJ: Identity Claims (One To Many via EntityID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = 'fba3f9fc-044d-4430-ab2e-d8147eea37ad'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('fba3f9fc-044d-4430-ab2e-d8147eea37ad', 'E0238F34-2837-EF11-86D4-6045BDEE16E6', '58C8C895-E3AA-48C2-BA68-808337235873', 'EntityID', 'One To Many', 1, 1, 78, GETUTCDATE(), GETUTCDATE())
   END;


/* Create Entity Relationship: MJ: Users -> MJ: Identity Claims (One To Many via ClaimedByUserID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = '06f23ad2-1b36-414e-b48f-0d0eabefa025'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('06f23ad2-1b36-414e-b48f-0d0eabefa025', 'E1238F34-2837-EF11-86D4-6045BDEE16E6', '58C8C895-E3AA-48C2-BA68-808337235873', 'ClaimedByUserID', 'One To Many', 1, 1, 105, GETUTCDATE(), GETUTCDATE())
   END;


/* Create Entity Relationship: MJ: Identity Claim Types -> MJ: Identity Claims (One To Many via ClaimTypeID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = 'dfd31858-4321-4a35-8c44-ac010975c4ce'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('dfd31858-4321-4a35-8c44-ac010975c4ce', '38D9DE43-C0C2-45DA-81BB-A815B30F86FB', '58C8C895-E3AA-48C2-BA68-808337235873', 'ClaimTypeID', 'One To Many', 1, 1, 1, GETUTCDATE(), GETUTCDATE())
   END;


/* Create Entity Relationship: MJ: Magic Link Invites -> MJ: Identity Claims (One To Many via MagicLinkInviteID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = '7a830abe-459c-468c-8888-7cdbfeee08c0'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('7a830abe-459c-468c-8888-7cdbfeee08c0', 'E41A5DEE-C259-4B6E-A3C5-BB022BD5F10A', '58C8C895-E3AA-48C2-BA68-808337235873', 'MagicLinkInviteID', 'One To Many', 1, 1, 6, GETUTCDATE(), GETUTCDATE())
   END;

/* Index for Foreign Keys for IdentityClaimType */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Identity Claim Types
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------;

/* Index for Foreign Keys for IdentityClaim */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Identity Claims
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key ClaimTypeID in table IdentityClaim
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_IdentityClaim_ClaimTypeID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[IdentityClaim]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_IdentityClaim_ClaimTypeID ON [${flyway:defaultSchema}].[IdentityClaim] ([ClaimTypeID]);

-- Index for foreign key EntityID in table IdentityClaim
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_IdentityClaim_EntityID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[IdentityClaim]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_IdentityClaim_EntityID ON [${flyway:defaultSchema}].[IdentityClaim] ([EntityID]);

-- Index for foreign key ClaimedByUserID in table IdentityClaim
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_IdentityClaim_ClaimedByUserID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[IdentityClaim]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_IdentityClaim_ClaimedByUserID ON [${flyway:defaultSchema}].[IdentityClaim] ([ClaimedByUserID]);

-- Index for foreign key MagicLinkInviteID in table IdentityClaim
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_IdentityClaim_MagicLinkInviteID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[IdentityClaim]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_IdentityClaim_MagicLinkInviteID ON [${flyway:defaultSchema}].[IdentityClaim] ([MagicLinkInviteID]);

/* SQL text to update entity field related entity name field map for entity field ID 505DF1FB-2C77-40CD-80D6-6AFDAF64840F */
EXEC [${flyway:defaultSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='505DF1FB-2C77-40CD-80D6-6AFDAF64840F', @RelatedEntityNameFieldMap='ClaimType';

/* Base View SQL for MJ: Identity Claim Types */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Identity Claim Types
-- Item: vwIdentityClaimTypes
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: Identity Claim Types
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  IdentityClaimType
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwIdentityClaimTypes]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwIdentityClaimTypes];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwIdentityClaimTypes]
AS
SELECT
    i.*
FROM
    [${flyway:defaultSchema}].[IdentityClaimType] AS i
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwIdentityClaimTypes] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* Base View Permissions SQL for MJ: Identity Claim Types */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Identity Claim Types
-- Item: Permissions for vwIdentityClaimTypes
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwIdentityClaimTypes] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* spCreate SQL for MJ: Identity Claim Types */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Identity Claim Types
-- Item: spCreateIdentityClaimType
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR IdentityClaimType
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateIdentityClaimType]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateIdentityClaimType];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateIdentityClaimType]
    @ID uniqueidentifier = NULL,
    @Name nvarchar(100),
    @Description_Clear bit = 0,
    @Description nvarchar(MAX) = NULL,
    @DriverClass nvarchar(255),
    @Configuration_Clear bit = 0,
    @Configuration nvarchar(MAX) = NULL,
    @DefaultExpirationDays int = NULL,
    @IsActive bit = NULL
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)

    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[IdentityClaimType]
            (
                [ID],
                [Name],
                [Description],
                [DriverClass],
                [Configuration],
                [DefaultExpirationDays],
                [IsActive]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @Name,
                CASE WHEN @Description_Clear = 1 THEN NULL ELSE ISNULL(@Description, NULL) END,
                @DriverClass,
                CASE WHEN @Configuration_Clear = 1 THEN NULL ELSE ISNULL(@Configuration, NULL) END,
                ISNULL(@DefaultExpirationDays, 30),
                ISNULL(@IsActive, 1)
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[IdentityClaimType]
            (
                [Name],
                [Description],
                [DriverClass],
                [Configuration],
                [DefaultExpirationDays],
                [IsActive]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @Name,
                CASE WHEN @Description_Clear = 1 THEN NULL ELSE ISNULL(@Description, NULL) END,
                @DriverClass,
                CASE WHEN @Configuration_Clear = 1 THEN NULL ELSE ISNULL(@Configuration, NULL) END,
                ISNULL(@DefaultExpirationDays, 30),
                ISNULL(@IsActive, 1)
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwIdentityClaimTypes] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateIdentityClaimType] TO [cdp_Developer], [cdp_Integration];

/* spCreate Permissions for MJ: Identity Claim Types */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateIdentityClaimType] TO [cdp_Developer], [cdp_Integration];

/* spUpdate SQL for MJ: Identity Claim Types */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Identity Claim Types
-- Item: spUpdateIdentityClaimType
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR IdentityClaimType
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateIdentityClaimType]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateIdentityClaimType];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateIdentityClaimType]
    @ID uniqueidentifier,
    @Name nvarchar(100) = NULL,
    @Description_Clear bit = 0,
    @Description nvarchar(MAX) = NULL,
    @DriverClass nvarchar(255) = NULL,
    @Configuration_Clear bit = 0,
    @Configuration nvarchar(MAX) = NULL,
    @DefaultExpirationDays int = NULL,
    @IsActive bit = NULL
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[IdentityClaimType]
    SET
        [Name] = ISNULL(@Name, [Name]),
        [Description] = CASE WHEN @Description_Clear = 1 THEN NULL ELSE ISNULL(@Description, [Description]) END,
        [DriverClass] = ISNULL(@DriverClass, [DriverClass]),
        [Configuration] = CASE WHEN @Configuration_Clear = 1 THEN NULL ELSE ISNULL(@Configuration, [Configuration]) END,
        [DefaultExpirationDays] = ISNULL(@DefaultExpirationDays, [DefaultExpirationDays]),
        [IsActive] = ISNULL(@IsActive, [IsActive])
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwIdentityClaimTypes] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwIdentityClaimTypes]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateIdentityClaimType] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the IdentityClaimType table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateIdentityClaimType]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateIdentityClaimType];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateIdentityClaimType
ON [${flyway:defaultSchema}].[IdentityClaimType]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[IdentityClaimType]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[IdentityClaimType] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO

/* spUpdate Permissions for MJ: Identity Claim Types */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateIdentityClaimType] TO [cdp_Developer], [cdp_Integration];

/* spDelete SQL for MJ: Identity Claim Types */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Identity Claim Types
-- Item: spDeleteIdentityClaimType
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR IdentityClaimType
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteIdentityClaimType]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteIdentityClaimType];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteIdentityClaimType]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[IdentityClaimType]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteIdentityClaimType] TO [cdp_Developer], [cdp_Integration];

/* spDelete Permissions for MJ: Identity Claim Types */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteIdentityClaimType] TO [cdp_Developer], [cdp_Integration];

/* SQL text to update entity field related entity name field map for entity field ID 23CE09B7-480A-4A7B-8167-C6883F5657C3 */
EXEC [${flyway:defaultSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='23CE09B7-480A-4A7B-8167-C6883F5657C3', @RelatedEntityNameFieldMap='Entity';

/* SQL text to update entity field related entity name field map for entity field ID FF9B7A6A-B843-4738-BD9C-4A4375C419D5 */
EXEC [${flyway:defaultSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='FF9B7A6A-B843-4738-BD9C-4A4375C419D5', @RelatedEntityNameFieldMap='ClaimedByUser';

/* Base View SQL for MJ: Identity Claims */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Identity Claims
-- Item: vwIdentityClaims
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: Identity Claims
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  IdentityClaim
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwIdentityClaims]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwIdentityClaims];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwIdentityClaims]
AS
SELECT
    i.*,
    MJIdentityClaimType_ClaimTypeID.[Name] AS [ClaimType],
    MJEntity_EntityID.[Name] AS [Entity],
    MJUser_ClaimedByUserID.[Name] AS [ClaimedByUser]
FROM
    [${flyway:defaultSchema}].[IdentityClaim] AS i
INNER JOIN
    [${flyway:defaultSchema}].[IdentityClaimType] AS MJIdentityClaimType_ClaimTypeID
  ON
    [i].[ClaimTypeID] = MJIdentityClaimType_ClaimTypeID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[Entity] AS MJEntity_EntityID
  ON
    [i].[EntityID] = MJEntity_EntityID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[User] AS MJUser_ClaimedByUserID
  ON
    [i].[ClaimedByUserID] = MJUser_ClaimedByUserID.[ID]
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwIdentityClaims] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* Base View Permissions SQL for MJ: Identity Claims */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Identity Claims
-- Item: Permissions for vwIdentityClaims
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwIdentityClaims] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* spCreate SQL for MJ: Identity Claims */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Identity Claims
-- Item: spCreateIdentityClaim
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR IdentityClaim
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateIdentityClaim]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateIdentityClaim];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateIdentityClaim]
    @ID uniqueidentifier = NULL,
    @ClaimTypeID uniqueidentifier,
    @NormalizedEmail nvarchar(255),
    @EntityID_Clear bit = 0,
    @EntityID uniqueidentifier = NULL,
    @RecordID_Clear bit = 0,
    @RecordID nvarchar(255) = NULL,
    @PayloadJSON_Clear bit = 0,
    @PayloadJSON nvarchar(MAX) = NULL,
    @Status nvarchar(20) = NULL,
    @ExpiresAt datetimeoffset,
    @ClaimedAt_Clear bit = 0,
    @ClaimedAt datetimeoffset = NULL,
    @ClaimedByUserID_Clear bit = 0,
    @ClaimedByUserID uniqueidentifier = NULL,
    @MagicLinkInviteID_Clear bit = 0,
    @MagicLinkInviteID uniqueidentifier = NULL,
    @MetadataJSON_Clear bit = 0,
    @MetadataJSON nvarchar(MAX) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)

    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[IdentityClaim]
            (
                [ID],
                [ClaimTypeID],
                [NormalizedEmail],
                [EntityID],
                [RecordID],
                [PayloadJSON],
                [Status],
                [ExpiresAt],
                [ClaimedAt],
                [ClaimedByUserID],
                [MagicLinkInviteID],
                [MetadataJSON]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @ClaimTypeID,
                @NormalizedEmail,
                CASE WHEN @EntityID_Clear = 1 THEN NULL ELSE ISNULL(@EntityID, NULL) END,
                CASE WHEN @RecordID_Clear = 1 THEN NULL ELSE ISNULL(@RecordID, NULL) END,
                CASE WHEN @PayloadJSON_Clear = 1 THEN NULL ELSE ISNULL(@PayloadJSON, NULL) END,
                ISNULL(@Status, 'Pending'),
                @ExpiresAt,
                CASE WHEN @ClaimedAt_Clear = 1 THEN NULL ELSE ISNULL(@ClaimedAt, NULL) END,
                CASE WHEN @ClaimedByUserID_Clear = 1 THEN NULL ELSE ISNULL(@ClaimedByUserID, NULL) END,
                CASE WHEN @MagicLinkInviteID_Clear = 1 THEN NULL ELSE ISNULL(@MagicLinkInviteID, NULL) END,
                CASE WHEN @MetadataJSON_Clear = 1 THEN NULL ELSE ISNULL(@MetadataJSON, NULL) END
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[IdentityClaim]
            (
                [ClaimTypeID],
                [NormalizedEmail],
                [EntityID],
                [RecordID],
                [PayloadJSON],
                [Status],
                [ExpiresAt],
                [ClaimedAt],
                [ClaimedByUserID],
                [MagicLinkInviteID],
                [MetadataJSON]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ClaimTypeID,
                @NormalizedEmail,
                CASE WHEN @EntityID_Clear = 1 THEN NULL ELSE ISNULL(@EntityID, NULL) END,
                CASE WHEN @RecordID_Clear = 1 THEN NULL ELSE ISNULL(@RecordID, NULL) END,
                CASE WHEN @PayloadJSON_Clear = 1 THEN NULL ELSE ISNULL(@PayloadJSON, NULL) END,
                ISNULL(@Status, 'Pending'),
                @ExpiresAt,
                CASE WHEN @ClaimedAt_Clear = 1 THEN NULL ELSE ISNULL(@ClaimedAt, NULL) END,
                CASE WHEN @ClaimedByUserID_Clear = 1 THEN NULL ELSE ISNULL(@ClaimedByUserID, NULL) END,
                CASE WHEN @MagicLinkInviteID_Clear = 1 THEN NULL ELSE ISNULL(@MagicLinkInviteID, NULL) END,
                CASE WHEN @MetadataJSON_Clear = 1 THEN NULL ELSE ISNULL(@MetadataJSON, NULL) END
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwIdentityClaims] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateIdentityClaim] TO [cdp_Developer], [cdp_Integration];

/* spCreate Permissions for MJ: Identity Claims */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateIdentityClaim] TO [cdp_Developer], [cdp_Integration];

/* spUpdate SQL for MJ: Identity Claims */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Identity Claims
-- Item: spUpdateIdentityClaim
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR IdentityClaim
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateIdentityClaim]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateIdentityClaim];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateIdentityClaim]
    @ID uniqueidentifier,
    @ClaimTypeID uniqueidentifier = NULL,
    @NormalizedEmail nvarchar(255) = NULL,
    @EntityID_Clear bit = 0,
    @EntityID uniqueidentifier = NULL,
    @RecordID_Clear bit = 0,
    @RecordID nvarchar(255) = NULL,
    @PayloadJSON_Clear bit = 0,
    @PayloadJSON nvarchar(MAX) = NULL,
    @Status nvarchar(20) = NULL,
    @ExpiresAt datetimeoffset = NULL,
    @ClaimedAt_Clear bit = 0,
    @ClaimedAt datetimeoffset = NULL,
    @ClaimedByUserID_Clear bit = 0,
    @ClaimedByUserID uniqueidentifier = NULL,
    @MagicLinkInviteID_Clear bit = 0,
    @MagicLinkInviteID uniqueidentifier = NULL,
    @MetadataJSON_Clear bit = 0,
    @MetadataJSON nvarchar(MAX) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[IdentityClaim]
    SET
        [ClaimTypeID] = ISNULL(@ClaimTypeID, [ClaimTypeID]),
        [NormalizedEmail] = ISNULL(@NormalizedEmail, [NormalizedEmail]),
        [EntityID] = CASE WHEN @EntityID_Clear = 1 THEN NULL ELSE ISNULL(@EntityID, [EntityID]) END,
        [RecordID] = CASE WHEN @RecordID_Clear = 1 THEN NULL ELSE ISNULL(@RecordID, [RecordID]) END,
        [PayloadJSON] = CASE WHEN @PayloadJSON_Clear = 1 THEN NULL ELSE ISNULL(@PayloadJSON, [PayloadJSON]) END,
        [Status] = ISNULL(@Status, [Status]),
        [ExpiresAt] = ISNULL(@ExpiresAt, [ExpiresAt]),
        [ClaimedAt] = CASE WHEN @ClaimedAt_Clear = 1 THEN NULL ELSE ISNULL(@ClaimedAt, [ClaimedAt]) END,
        [ClaimedByUserID] = CASE WHEN @ClaimedByUserID_Clear = 1 THEN NULL ELSE ISNULL(@ClaimedByUserID, [ClaimedByUserID]) END,
        [MagicLinkInviteID] = CASE WHEN @MagicLinkInviteID_Clear = 1 THEN NULL ELSE ISNULL(@MagicLinkInviteID, [MagicLinkInviteID]) END,
        [MetadataJSON] = CASE WHEN @MetadataJSON_Clear = 1 THEN NULL ELSE ISNULL(@MetadataJSON, [MetadataJSON]) END
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwIdentityClaims] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwIdentityClaims]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateIdentityClaim] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the IdentityClaim table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateIdentityClaim]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateIdentityClaim];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateIdentityClaim
ON [${flyway:defaultSchema}].[IdentityClaim]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[IdentityClaim]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[IdentityClaim] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO

/* spUpdate Permissions for MJ: Identity Claims */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateIdentityClaim] TO [cdp_Developer], [cdp_Integration];

/* spDelete SQL for MJ: Identity Claims */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Identity Claims
-- Item: spDeleteIdentityClaim
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR IdentityClaim
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteIdentityClaim]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteIdentityClaim];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteIdentityClaim]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[IdentityClaim]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteIdentityClaim] TO [cdp_Developer], [cdp_Integration];

/* spDelete Permissions for MJ: Identity Claims */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteIdentityClaim] TO [cdp_Developer], [cdp_Integration];

/* Set field properties for entity */

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = 'DA33F399-95BD-4567-A075-F2AA566FE171'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '9980B013-AD4C-4F3B-845E-C5F85BB84BF2'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '9DF9130E-2F49-4FE4-88EA-E3553132008B'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = 'B1E4E5D4-99DA-4F84-84F4-4ADEA963CBA5'
               AND AutoUpdateDefaultInView = 1;

/* Set field properties for entity */

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '58A944F6-B04C-4779-A18B-3BC1F69B0DE5'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = 'F925BD99-4B5A-48A4-878A-385E8F2D87E7'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '92AFA877-0447-4DC3-996B-092937CA4588'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = 'E56874D9-11BB-46AC-A9DA-9E4CD8E063E9'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = 'F422E0D8-C434-426A-86F3-36855CD0B19B'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '58A944F6-B04C-4779-A18B-3BC1F69B0DE5'
               AND AutoUpdateIncludeInUserSearchAPI = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET UserSearchPredicateAPI = 'Exact'
               WHERE ID = '58A944F6-B04C-4779-A18B-3BC1F69B0DE5'
               AND AutoUpdateUserSearchPredicate = 1;

            UPDATE [${flyway:defaultSchema}].[Entity]
            SET AllowUserSearchAPI = 1
            WHERE ID = '58C8C895-E3AA-48C2-BA68-808337235873'
            AND AutoUpdateAllowUserSearchAPI = 1;

/* Set categories for 9 fields */

-- UPDATE Entity Field Category Info MJ: Identity Claim Types.ID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '949B9775-418F-4BAB-B327-05173CFC8E2E' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Identity Claim Types.Name 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Claim Type Details',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'DA33F399-95BD-4567-A075-F2AA566FE171' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Identity Claim Types.Description 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Claim Type Details',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '9F45D75B-134A-47D9-B658-818665B77CCE' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Identity Claim Types.DriverClass 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Integration and Behavior',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '9980B013-AD4C-4F3B-845E-C5F85BB84BF2' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Identity Claim Types.Configuration 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Integration and Behavior',
   GeneratedFormSection = 'Category',
   ExtendedType = 'Code',
   CodeType = 'Other'
WHERE 
   ID = '741E180B-317E-49DC-BAC6-8E926B333DA3' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Identity Claim Types.DefaultExpirationDays 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Claim Lifecycle',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '9DF9130E-2F49-4FE4-88EA-E3553132008B' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Identity Claim Types.IsActive 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Claim Lifecycle',
   GeneratedFormSection = 'Category',
   DisplayName = 'Active',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'B1E4E5D4-99DA-4F84-84F4-4ADEA963CBA5' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Identity Claim Types.__mj_CreatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '86ABE3CF-1DDD-47A8-82AD-D372708BE687' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Identity Claim Types.__mj_UpdatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '45DEA1D2-7DB0-40F9-A8A0-E740C322F3AF' AND AutoUpdateCategory = 1;

/* Set entity icon to fa fa-shield-alt */

               UPDATE [${flyway:defaultSchema}].[Entity]
               SET [Icon] = 'fa fa-shield-alt', [__mj_UpdatedAt] = GETUTCDATE()
               WHERE [ID] = '38D9DE43-C0C2-45DA-81BB-A815B30F86FB';

/* Insert FieldCategoryInfo setting for entity */

               INSERT INTO [${flyway:defaultSchema}].[EntitySetting] ([ID], [EntityID], [Name], [Value], [__mj_CreatedAt], [__mj_UpdatedAt])
               VALUES ('ca20df26-ead5-42bf-a3df-c50f6ce2349e', '38D9DE43-C0C2-45DA-81BB-A815B30F86FB', 'FieldCategoryInfo', '{"Claim Type Details":{"icon":"fa fa-info-circle","description":"Core identification and descriptive information for the identity claim type"},"Integration and Behavior":{"icon":"fa fa-plug","description":"Technical configuration and driver implementation details"},"Claim Lifecycle":{"icon":"fa fa-history","description":"Operational settings governing the lifespan and availability of claims"},"System Metadata":{"icon":"fa fa-cog","description":"System-managed audit and tracking fields"}}', GETUTCDATE(), GETUTCDATE());

/* Insert FieldCategoryIcons setting (legacy) */

               INSERT INTO [${flyway:defaultSchema}].[EntitySetting] ([ID], [EntityID], [Name], [Value], [__mj_CreatedAt], [__mj_UpdatedAt])
               VALUES ('beeb1c0f-f30f-47e4-bd30-38c52af18aa0', '38D9DE43-C0C2-45DA-81BB-A815B30F86FB', 'FieldCategoryIcons', '{"Claim Type Details":"fa fa-info-circle","Integration and Behavior":"fa fa-plug","Claim Lifecycle":"fa fa-history","System Metadata":"fa fa-cog"}', GETUTCDATE(), GETUTCDATE());

/* Set categories for 17 fields */

-- UPDATE Entity Field Category Info MJ: Identity Claims.ID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '30BBD5D1-7CB6-497F-AEF0-D09D877A77BE' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Identity Claims.ClaimTypeID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Claim Definition',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '505DF1FB-2C77-40CD-80D6-6AFDAF64840F' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Identity Claims.ClaimType 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Claim Definition',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'F422E0D8-C434-426A-86F3-36855CD0B19B' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Identity Claims.NormalizedEmail 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Claimant Information',
   GeneratedFormSection = 'Category',
   DisplayName = 'Normalized Email',
   ExtendedType = 'Email',
   CodeType = NULL
WHERE 
   ID = '58A944F6-B04C-4779-A18B-3BC1F69B0DE5' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Identity Claims.EntityID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Claim Target',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '23CE09B7-480A-4A7B-8167-C6883F5657C3' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Identity Claims.Entity 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Claim Target',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '5EAE7159-786D-437F-9C15-15F95636D671' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Identity Claims.RecordID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Claim Target',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '4A3B8B1C-CF1D-4E4C-B121-3867182AE9CA' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Identity Claims.PayloadJSON 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Claim Configuration',
   GeneratedFormSection = 'Category',
   DisplayName = 'Payload JSON',
   ExtendedType = 'Code',
   CodeType = 'Other'
WHERE 
   ID = 'FFF9A882-5BC1-4173-96EF-29750C1F6044' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Identity Claims.MetadataJSON 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Claim Configuration',
   GeneratedFormSection = 'Category',
   DisplayName = 'Metadata JSON',
   ExtendedType = 'Code',
   CodeType = 'Other'
WHERE 
   ID = 'E10A6C7E-4E18-4CE0-98B8-C7E8E71A8793' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Identity Claims.Status 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Claim Lifecycle',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'F925BD99-4B5A-48A4-878A-385E8F2D87E7' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Identity Claims.ExpiresAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Claim Lifecycle',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '92AFA877-0447-4DC3-996B-092937CA4588' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Identity Claims.ClaimedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Claim Lifecycle',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'E56874D9-11BB-46AC-A9DA-9E4CD8E063E9' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Identity Claims.ClaimedByUserID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Claimant Information',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'FF9B7A6A-B843-4738-BD9C-4A4375C419D5' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Identity Claims.ClaimedByUser 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Claimant Information',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'CB5FD7B8-DE25-4DC2-831F-E56D84B6A342' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Identity Claims.MagicLinkInviteID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Claim Configuration',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'BC1D99CC-1017-4E62-A6F0-E3F51F09FD61' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Identity Claims.__mj_CreatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '0812F91A-485A-4034-B5F2-6A899EC31092' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Identity Claims.__mj_UpdatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '08A875E4-26CF-497D-852C-51C80A0366BA' AND AutoUpdateCategory = 1;

/* Set entity icon to fa fa-shield-alt */

               UPDATE [${flyway:defaultSchema}].[Entity]
               SET [Icon] = 'fa fa-shield-alt', [__mj_UpdatedAt] = GETUTCDATE()
               WHERE [ID] = '58C8C895-E3AA-48C2-BA68-808337235873';

/* Insert FieldCategoryInfo setting for entity */

               INSERT INTO [${flyway:defaultSchema}].[EntitySetting] ([ID], [EntityID], [Name], [Value], [__mj_CreatedAt], [__mj_UpdatedAt])
               VALUES ('f991d272-d4be-4e7f-b35c-c4780acf72a5', '58C8C895-E3AA-48C2-BA68-808337235873', 'FieldCategoryInfo', '{"Claim Definition":{"icon":"fa fa-tags","description":"Definition and classification details for the identity claim"},"Claimant Information":{"icon":"fa fa-user-check","description":"Details about the intended claimant and the user who performed the redemption"},"Claim Target":{"icon":"fa fa-crosshairs","description":"Information identifying the specific resource or entity being claimed"},"Claim Configuration":{"icon":"fa fa-cogs","description":"Technical configuration, payloads, and metadata for claim processing"},"Claim Lifecycle":{"icon":"fa fa-clock","description":"Status and timeline tracking for the claim''s lifecycle"},"System Metadata":{"icon":"fa fa-database","description":"System-managed audit and tracking fields"}}', GETUTCDATE(), GETUTCDATE());

/* Insert FieldCategoryIcons setting (legacy) */

               INSERT INTO [${flyway:defaultSchema}].[EntitySetting] ([ID], [EntityID], [Name], [Value], [__mj_CreatedAt], [__mj_UpdatedAt])
               VALUES ('7d8f2eaa-bf76-4517-b24c-c45d6aeac63e', '58C8C895-E3AA-48C2-BA68-808337235873', 'FieldCategoryIcons', '{"Claim Definition":"fa fa-tags","Claimant Information":"fa fa-user-check","Claim Target":"fa fa-crosshairs","Claim Configuration":"fa fa-cogs","Claim Lifecycle":"fa fa-clock","System Metadata":"fa fa-database"}', GETUTCDATE(), GETUTCDATE());

/* Generated Validation Functions for MJ: Form Chrome Rules */
-- CHECK constraint for MJ: Form Chrome Rules @ Table Level was newly set or modified since the last generation of the validation function, the code was regenerated and updating the GeneratedCode table with the new generated validation function
INSERT INTO [${flyway:defaultSchema}].[GeneratedCode] ([CategoryID], [GeneratedByModelID], [GeneratedAt], [Language], [Status], [Source], [Code], [Description], [Name], [LinkedEntityID], [LinkedRecordPrimaryKey])
                      VALUES ((SELECT [ID] FROM [${flyway:defaultSchema}].[vwGeneratedCodeCategories] WHERE [Name]='CodeGen: Validators'), 'C43229F6-4CC8-4838-9D04-03419A2DA191', GETUTCDATE(), 'TypeScript', 'Approved', '([TargetKind]=''Relationship'' AND [RelatedEntityID] IS NOT NULL AND [ContributionKey] IS NULL OR [TargetKind]=''Contribution'' AND [ContributionKey] IS NOT NULL AND [RelatedEntityID] IS NULL)', 'public ValidateTargetKindFieldsConsistency(result: ValidationResult) {
    const isRelationshipValid = this.TargetKind === "Relationship" && this.RelatedEntityID != null && this.ContributionKey == null;
    const isContributionValid = this.TargetKind === "Contribution" && this.ContributionKey != null && this.RelatedEntityID == null;

    if (!isRelationshipValid && !isContributionValid) {
        result.Errors.push(new ValidationErrorInfo(
            "TargetKind",
            "For a ''Relationship'' target, Related Entity is required and Contribution Key must be empty. For a ''Contribution'' target, Contribution Key is required and Related Entity must be empty.",
            this.TargetKind,
            ValidationErrorType.Failure
        ));
    }
}', 'If the target kind is ''Relationship'', a related entity must be specified and the contribution key must be left blank. If the target kind is ''Contribution'', a contribution key must be specified and the related entity must be left blank.', 'ValidateTargetKindFieldsConsistency', 'E0238F34-2837-EF11-86D4-6045BDEE16E6', '53695C5D-E659-4025-825A-23C5FA873B6A');

