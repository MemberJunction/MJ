-- A field claim covers a set of fields, not one.
--
-- Replacing a single input turned out to be the narrow case: a panel that stands in for
-- an address usually stands in for the whole group of inputs that made it up. The column
-- becomes a JSON array of field names, matching `FormChromeRule.JoinFields`, which is the
-- same shape for the same reason in the same part of the form runtime.
--
-- Every field named must belong to one section. The panel renders at the top of that
-- section, so a claim spread over two sections has no single place to draw.

ALTER TABLE ${flyway:defaultSchema}.EntityFormContribution
    ADD ReplacesFieldNames NVARCHAR(MAX) NULL;
GO

-- Carry over the single-field claims written before this change.
UPDATE ${flyway:defaultSchema}.EntityFormContribution
SET ReplacesFieldNames = '["' + REPLACE(ReplacesFieldName, '"', '\"') + '"]'
WHERE ReplacesFieldName IS NOT NULL AND LEN(LTRIM(RTRIM(ReplacesFieldName))) > 0;
GO

ALTER TABLE ${flyway:defaultSchema}.EntityFormContribution
    DROP CONSTRAINT CK_EntityFormContribution_OneClaim;
GO

ALTER TABLE ${flyway:defaultSchema}.EntityFormContribution
    DROP COLUMN ReplacesFieldName;
GO

ALTER TABLE ${flyway:defaultSchema}.EntityFormContribution
    ADD CONSTRAINT CK_EntityFormContribution_OneClaim
        CHECK (
            (CASE WHEN ReplacesSectionKey IS NULL THEN 0 ELSE 1 END) +
            (CASE WHEN RelatedEntityID    IS NULL THEN 0 ELSE 1 END) +
            (CASE WHEN ReplacesFieldNames IS NULL THEN 0 ELSE 1 END) <= 1
        );
GO

-- Rejects a non-array and an empty array alike: a field claim that names no field is a
-- claim the runtime can never match, so it would read as applied and do nothing.
--
-- Emptiness is tested by stripping whitespace rather than by counting with OPENJSON,
-- because a CHECK constraint may not contain a subquery.
ALTER TABLE ${flyway:defaultSchema}.EntityFormContribution
    ADD CONSTRAINT CK_EntityFormContribution_ReplacesFieldNamesShape
        CHECK (
            ReplacesFieldNames IS NULL
            OR (ISJSON(ReplacesFieldNames) = 1
                AND LEFT(LTRIM(ReplacesFieldNames), 1) = '['
                AND REPLACE(REPLACE(REPLACE(REPLACE(ReplacesFieldNames,
                        CHAR(32), ''), CHAR(9), ''), CHAR(13), ''), CHAR(10), '') <> '[]')
        );
GO

EXEC sp_addextendedproperty @name = N'MS_Description',
    @value = N'JSON array of field names this contribution stands in for, all within one section. The panel renders at the top of that section and the named fields are not drawn. Mutually exclusive with ReplacesSectionKey and RelatedEntityID.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'EntityFormContribution',
    @level2type = N'COLUMN', @level2name = N'ReplacesFieldNames';
GO
/* SQL text to insert 1 new entity field(s) */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'a2edd95b-d198-4587-a452-e28d64768e35' OR (EntityID = 'CFC1ACD7-223C-423F-9777-959EC95DB70E' AND Name = 'ReplacesFieldNames')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'a2edd95b-d198-4587-a452-e28d64768e35',
            'CFC1ACD7-223C-423F-9777-959EC95DB70E', -- Entity: MJ: Entity Form Contributions
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'CFC1ACD7-223C-423F-9777-959EC95DB70E'),
            'ReplacesFieldNames',
            'Replaces Field Names',
            'JSON array of field names this contribution stands in for, all within one section. The panel renders at the top of that section and the named fields are not drawn. Mutually exclusive with ReplacesSectionKey and RelatedEntityID.',
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

/* Index for Foreign Keys for EntityFormContribution */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Entity Form Contributions
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key EntityID in table EntityFormContribution
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_EntityFormContribution_EntityID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[EntityFormContribution]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_EntityFormContribution_EntityID ON [${flyway:defaultSchema}].[EntityFormContribution] ([EntityID]);

-- Index for foreign key ComponentID in table EntityFormContribution
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_EntityFormContribution_ComponentID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[EntityFormContribution]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_EntityFormContribution_ComponentID ON [${flyway:defaultSchema}].[EntityFormContribution] ([ComponentID]);

-- Index for foreign key RelatedEntityID in table EntityFormContribution
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_EntityFormContribution_RelatedEntityID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[EntityFormContribution]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_EntityFormContribution_RelatedEntityID ON [${flyway:defaultSchema}].[EntityFormContribution] ([RelatedEntityID]);

-- Index for foreign key UserID in table EntityFormContribution
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_EntityFormContribution_UserID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[EntityFormContribution]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_EntityFormContribution_UserID ON [${flyway:defaultSchema}].[EntityFormContribution] ([UserID]);

-- Index for foreign key RoleID in table EntityFormContribution
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_EntityFormContribution_RoleID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[EntityFormContribution]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_EntityFormContribution_RoleID ON [${flyway:defaultSchema}].[EntityFormContribution] ([RoleID]);

/* Base View SQL for MJ: Entity Form Contributions */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Entity Form Contributions
-- Item: vwEntityFormContributions
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: Entity Form Contributions
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  EntityFormContribution
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwEntityFormContributions]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwEntityFormContributions];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwEntityFormContributions]
AS
SELECT
    e.*,
    MJEntity_EntityID.[Name] AS [Entity],
    MJComponent_ComponentID.[Name] AS [Component],
    MJEntity_RelatedEntityID.[Name] AS [RelatedEntity],
    MJUser_UserID.[Name] AS [User],
    MJRole_RoleID.[Name] AS [Role]
FROM
    [${flyway:defaultSchema}].[EntityFormContribution] AS e
INNER JOIN
    [${flyway:defaultSchema}].[Entity] AS MJEntity_EntityID
  ON
    [e].[EntityID] = MJEntity_EntityID.[ID]
INNER JOIN
    [${flyway:defaultSchema}].[Component] AS MJComponent_ComponentID
  ON
    [e].[ComponentID] = MJComponent_ComponentID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[Entity] AS MJEntity_RelatedEntityID
  ON
    [e].[RelatedEntityID] = MJEntity_RelatedEntityID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[User] AS MJUser_UserID
  ON
    [e].[UserID] = MJUser_UserID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[Role] AS MJRole_RoleID
  ON
    [e].[RoleID] = MJRole_RoleID.[ID]
GO
REVOKE SELECT ON [${flyway:defaultSchema}].[vwEntityFormContributions] FROM [cdp_Developer]
REVOKE SELECT ON [${flyway:defaultSchema}].[vwEntityFormContributions] FROM [cdp_Integration]
REVOKE SELECT ON [${flyway:defaultSchema}].[vwEntityFormContributions] FROM [cdp_UI]
GRANT SELECT ON [${flyway:defaultSchema}].[vwEntityFormContributions] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* Base View Permissions SQL for MJ: Entity Form Contributions */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Entity Form Contributions
-- Item: Permissions for vwEntityFormContributions
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

REVOKE SELECT ON [${flyway:defaultSchema}].[vwEntityFormContributions] FROM [cdp_Developer]
REVOKE SELECT ON [${flyway:defaultSchema}].[vwEntityFormContributions] FROM [cdp_Integration]
REVOKE SELECT ON [${flyway:defaultSchema}].[vwEntityFormContributions] FROM [cdp_UI]
GRANT SELECT ON [${flyway:defaultSchema}].[vwEntityFormContributions] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* spCreate SQL for MJ: Entity Form Contributions */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Entity Form Contributions
-- Item: spCreateEntityFormContribution
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR EntityFormContribution
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateEntityFormContribution]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateEntityFormContribution];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateEntityFormContribution]
    @ID uniqueidentifier = NULL,
    @EntityID uniqueidentifier,
    @ComponentID uniqueidentifier,
    @Name nvarchar(255),
    @Description_Clear bit = 0,
    @Description nvarchar(MAX) = NULL,
    @Slot nvarchar(30) = NULL,
    @SortKey int = NULL,
    @ContributionKey_Clear bit = 0,
    @ContributionKey nvarchar(256) = NULL,
    @RelatedEntityID_Clear bit = 0,
    @RelatedEntityID uniqueidentifier = NULL,
    @RelatedJoinField_Clear bit = 0,
    @RelatedJoinField nvarchar(255) = NULL,
    @ReplacesSectionKey_Clear bit = 0,
    @ReplacesSectionKey nvarchar(255) = NULL,
    @Inclusion_Clear bit = 0,
    @Inclusion nvarchar(10) = NULL,
    @ChromeGroup_Clear bit = 0,
    @ChromeGroup nvarchar(10) = NULL,
    @Presentation nvarchar(10) = NULL,
    @Title_Clear bit = 0,
    @Title nvarchar(255) = NULL,
    @Icon_Clear bit = 0,
    @Icon nvarchar(100) = NULL,
    @Scope nvarchar(20) = NULL,
    @UserID_Clear bit = 0,
    @UserID uniqueidentifier = NULL,
    @RoleID_Clear bit = 0,
    @RoleID uniqueidentifier = NULL,
    @Precedence int = NULL,
    @Status nvarchar(20) = NULL,
    @Configuration_Clear bit = 0,
    @Configuration nvarchar(MAX) = NULL,
    @Notes_Clear bit = 0,
    @Notes nvarchar(MAX) = NULL,
    @ReplacesFieldNames_Clear bit = 0,
    @ReplacesFieldNames nvarchar(MAX) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)

    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[EntityFormContribution]
            (
                [ID],
                [EntityID],
                [ComponentID],
                [Name],
                [Description],
                [Slot],
                [SortKey],
                [ContributionKey],
                [RelatedEntityID],
                [RelatedJoinField],
                [ReplacesSectionKey],
                [Inclusion],
                [ChromeGroup],
                [Presentation],
                [Title],
                [Icon],
                [Scope],
                [UserID],
                [RoleID],
                [Precedence],
                [Status],
                [Configuration],
                [Notes],
                [ReplacesFieldNames]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @EntityID,
                @ComponentID,
                @Name,
                CASE WHEN @Description_Clear = 1 THEN NULL ELSE ISNULL(@Description, NULL) END,
                ISNULL(@Slot, 'after-fields'),
                ISNULL(@SortKey, 0),
                CASE WHEN @ContributionKey_Clear = 1 THEN NULL ELSE ISNULL(@ContributionKey, NULL) END,
                CASE WHEN @RelatedEntityID_Clear = 1 THEN NULL ELSE ISNULL(@RelatedEntityID, NULL) END,
                CASE WHEN @RelatedJoinField_Clear = 1 THEN NULL ELSE ISNULL(@RelatedJoinField, NULL) END,
                CASE WHEN @ReplacesSectionKey_Clear = 1 THEN NULL ELSE ISNULL(@ReplacesSectionKey, NULL) END,
                CASE WHEN @Inclusion_Clear = 1 THEN NULL ELSE ISNULL(@Inclusion, NULL) END,
                CASE WHEN @ChromeGroup_Clear = 1 THEN NULL ELSE ISNULL(@ChromeGroup, NULL) END,
                ISNULL(@Presentation, 'panel'),
                CASE WHEN @Title_Clear = 1 THEN NULL ELSE ISNULL(@Title, NULL) END,
                CASE WHEN @Icon_Clear = 1 THEN NULL ELSE ISNULL(@Icon, NULL) END,
                ISNULL(@Scope, 'User'),
                CASE WHEN @UserID_Clear = 1 THEN NULL ELSE ISNULL(@UserID, NULL) END,
                CASE WHEN @RoleID_Clear = 1 THEN NULL ELSE ISNULL(@RoleID, NULL) END,
                ISNULL(@Precedence, 0),
                ISNULL(@Status, 'Pending'),
                CASE WHEN @Configuration_Clear = 1 THEN NULL ELSE ISNULL(@Configuration, NULL) END,
                CASE WHEN @Notes_Clear = 1 THEN NULL ELSE ISNULL(@Notes, NULL) END,
                CASE WHEN @ReplacesFieldNames_Clear = 1 THEN NULL ELSE ISNULL(@ReplacesFieldNames, NULL) END
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[EntityFormContribution]
            (
                [EntityID],
                [ComponentID],
                [Name],
                [Description],
                [Slot],
                [SortKey],
                [ContributionKey],
                [RelatedEntityID],
                [RelatedJoinField],
                [ReplacesSectionKey],
                [Inclusion],
                [ChromeGroup],
                [Presentation],
                [Title],
                [Icon],
                [Scope],
                [UserID],
                [RoleID],
                [Precedence],
                [Status],
                [Configuration],
                [Notes],
                [ReplacesFieldNames]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @EntityID,
                @ComponentID,
                @Name,
                CASE WHEN @Description_Clear = 1 THEN NULL ELSE ISNULL(@Description, NULL) END,
                ISNULL(@Slot, 'after-fields'),
                ISNULL(@SortKey, 0),
                CASE WHEN @ContributionKey_Clear = 1 THEN NULL ELSE ISNULL(@ContributionKey, NULL) END,
                CASE WHEN @RelatedEntityID_Clear = 1 THEN NULL ELSE ISNULL(@RelatedEntityID, NULL) END,
                CASE WHEN @RelatedJoinField_Clear = 1 THEN NULL ELSE ISNULL(@RelatedJoinField, NULL) END,
                CASE WHEN @ReplacesSectionKey_Clear = 1 THEN NULL ELSE ISNULL(@ReplacesSectionKey, NULL) END,
                CASE WHEN @Inclusion_Clear = 1 THEN NULL ELSE ISNULL(@Inclusion, NULL) END,
                CASE WHEN @ChromeGroup_Clear = 1 THEN NULL ELSE ISNULL(@ChromeGroup, NULL) END,
                ISNULL(@Presentation, 'panel'),
                CASE WHEN @Title_Clear = 1 THEN NULL ELSE ISNULL(@Title, NULL) END,
                CASE WHEN @Icon_Clear = 1 THEN NULL ELSE ISNULL(@Icon, NULL) END,
                ISNULL(@Scope, 'User'),
                CASE WHEN @UserID_Clear = 1 THEN NULL ELSE ISNULL(@UserID, NULL) END,
                CASE WHEN @RoleID_Clear = 1 THEN NULL ELSE ISNULL(@RoleID, NULL) END,
                ISNULL(@Precedence, 0),
                ISNULL(@Status, 'Pending'),
                CASE WHEN @Configuration_Clear = 1 THEN NULL ELSE ISNULL(@Configuration, NULL) END,
                CASE WHEN @Notes_Clear = 1 THEN NULL ELSE ISNULL(@Notes, NULL) END,
                CASE WHEN @ReplacesFieldNames_Clear = 1 THEN NULL ELSE ISNULL(@ReplacesFieldNames, NULL) END
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwEntityFormContributions] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spCreateEntityFormContribution] FROM [cdp_Developer]
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spCreateEntityFormContribution] FROM [cdp_Integration]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateEntityFormContribution] TO [cdp_Developer], [cdp_Integration];

/* spCreate Permissions for MJ: Entity Form Contributions */

REVOKE EXECUTE ON [${flyway:defaultSchema}].[spCreateEntityFormContribution] FROM [cdp_Developer]
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spCreateEntityFormContribution] FROM [cdp_Integration]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateEntityFormContribution] TO [cdp_Developer], [cdp_Integration];

/* spUpdate SQL for MJ: Entity Form Contributions */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Entity Form Contributions
-- Item: spUpdateEntityFormContribution
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR EntityFormContribution
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateEntityFormContribution]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateEntityFormContribution];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateEntityFormContribution]
    @ID uniqueidentifier,
    @EntityID uniqueidentifier = NULL,
    @ComponentID uniqueidentifier = NULL,
    @Name nvarchar(255) = NULL,
    @Description_Clear bit = 0,
    @Description nvarchar(MAX) = NULL,
    @Slot nvarchar(30) = NULL,
    @SortKey int = NULL,
    @ContributionKey_Clear bit = 0,
    @ContributionKey nvarchar(256) = NULL,
    @RelatedEntityID_Clear bit = 0,
    @RelatedEntityID uniqueidentifier = NULL,
    @RelatedJoinField_Clear bit = 0,
    @RelatedJoinField nvarchar(255) = NULL,
    @ReplacesSectionKey_Clear bit = 0,
    @ReplacesSectionKey nvarchar(255) = NULL,
    @Inclusion_Clear bit = 0,
    @Inclusion nvarchar(10) = NULL,
    @ChromeGroup_Clear bit = 0,
    @ChromeGroup nvarchar(10) = NULL,
    @Presentation nvarchar(10) = NULL,
    @Title_Clear bit = 0,
    @Title nvarchar(255) = NULL,
    @Icon_Clear bit = 0,
    @Icon nvarchar(100) = NULL,
    @Scope nvarchar(20) = NULL,
    @UserID_Clear bit = 0,
    @UserID uniqueidentifier = NULL,
    @RoleID_Clear bit = 0,
    @RoleID uniqueidentifier = NULL,
    @Precedence int = NULL,
    @Status nvarchar(20) = NULL,
    @Configuration_Clear bit = 0,
    @Configuration nvarchar(MAX) = NULL,
    @Notes_Clear bit = 0,
    @Notes nvarchar(MAX) = NULL,
    @ReplacesFieldNames_Clear bit = 0,
    @ReplacesFieldNames nvarchar(MAX) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[EntityFormContribution]
    SET
        [EntityID] = ISNULL(@EntityID, [EntityID]),
        [ComponentID] = ISNULL(@ComponentID, [ComponentID]),
        [Name] = ISNULL(@Name, [Name]),
        [Description] = CASE WHEN @Description_Clear = 1 THEN NULL ELSE ISNULL(@Description, [Description]) END,
        [Slot] = ISNULL(@Slot, [Slot]),
        [SortKey] = ISNULL(@SortKey, [SortKey]),
        [ContributionKey] = CASE WHEN @ContributionKey_Clear = 1 THEN NULL ELSE ISNULL(@ContributionKey, [ContributionKey]) END,
        [RelatedEntityID] = CASE WHEN @RelatedEntityID_Clear = 1 THEN NULL ELSE ISNULL(@RelatedEntityID, [RelatedEntityID]) END,
        [RelatedJoinField] = CASE WHEN @RelatedJoinField_Clear = 1 THEN NULL ELSE ISNULL(@RelatedJoinField, [RelatedJoinField]) END,
        [ReplacesSectionKey] = CASE WHEN @ReplacesSectionKey_Clear = 1 THEN NULL ELSE ISNULL(@ReplacesSectionKey, [ReplacesSectionKey]) END,
        [Inclusion] = CASE WHEN @Inclusion_Clear = 1 THEN NULL ELSE ISNULL(@Inclusion, [Inclusion]) END,
        [ChromeGroup] = CASE WHEN @ChromeGroup_Clear = 1 THEN NULL ELSE ISNULL(@ChromeGroup, [ChromeGroup]) END,
        [Presentation] = ISNULL(@Presentation, [Presentation]),
        [Title] = CASE WHEN @Title_Clear = 1 THEN NULL ELSE ISNULL(@Title, [Title]) END,
        [Icon] = CASE WHEN @Icon_Clear = 1 THEN NULL ELSE ISNULL(@Icon, [Icon]) END,
        [Scope] = ISNULL(@Scope, [Scope]),
        [UserID] = CASE WHEN @UserID_Clear = 1 THEN NULL ELSE ISNULL(@UserID, [UserID]) END,
        [RoleID] = CASE WHEN @RoleID_Clear = 1 THEN NULL ELSE ISNULL(@RoleID, [RoleID]) END,
        [Precedence] = ISNULL(@Precedence, [Precedence]),
        [Status] = ISNULL(@Status, [Status]),
        [Configuration] = CASE WHEN @Configuration_Clear = 1 THEN NULL ELSE ISNULL(@Configuration, [Configuration]) END,
        [Notes] = CASE WHEN @Notes_Clear = 1 THEN NULL ELSE ISNULL(@Notes, [Notes]) END,
        [ReplacesFieldNames] = CASE WHEN @ReplacesFieldNames_Clear = 1 THEN NULL ELSE ISNULL(@ReplacesFieldNames, [ReplacesFieldNames]) END
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwEntityFormContributions] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwEntityFormContributions]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

REVOKE EXECUTE ON [${flyway:defaultSchema}].[spUpdateEntityFormContribution] FROM [cdp_Developer]
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spUpdateEntityFormContribution] FROM [cdp_Integration]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateEntityFormContribution] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the EntityFormContribution table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateEntityFormContribution]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateEntityFormContribution];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateEntityFormContribution
ON [${flyway:defaultSchema}].[EntityFormContribution]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[EntityFormContribution]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[EntityFormContribution] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO

/* spUpdate Permissions for MJ: Entity Form Contributions */

REVOKE EXECUTE ON [${flyway:defaultSchema}].[spUpdateEntityFormContribution] FROM [cdp_Developer]
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spUpdateEntityFormContribution] FROM [cdp_Integration]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateEntityFormContribution] TO [cdp_Developer], [cdp_Integration];

/* spDelete SQL for MJ: Entity Form Contributions */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Entity Form Contributions
-- Item: spDeleteEntityFormContribution
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR EntityFormContribution
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteEntityFormContribution]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteEntityFormContribution];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteEntityFormContribution]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[EntityFormContribution]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spDeleteEntityFormContribution] FROM [cdp_Developer]
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spDeleteEntityFormContribution] FROM [cdp_Integration]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteEntityFormContribution] TO [cdp_Developer], [cdp_Integration];

/* spDelete Permissions for MJ: Entity Form Contributions */

REVOKE EXECUTE ON [${flyway:defaultSchema}].[spDeleteEntityFormContribution] FROM [cdp_Developer]
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spDeleteEntityFormContribution] FROM [cdp_Integration]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteEntityFormContribution] TO [cdp_Developer], [cdp_Integration];

/* Set categories for 1 fields */

-- UPDATE Entity Field Category Info MJ: Entity Form Contributions.ReplacesFieldNames 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Layout Configuration',
   GeneratedFormSection = 'Category',
   DisplayName = 'Replaced Field Names',
   ExtendedType = 'JSON'
WHERE 
   ID = 'A2EDD95B-D198-4587-A452-E28D64768E35';

/* Generated Validation Functions for MJ: Entity Form Contributions */
-- CHECK constraint for MJ: Entity Form Contributions: Field: ReplacesFieldNames was newly set or modified since the last generation of the validation function, the code was regenerated and updating the GeneratedCode table with the new generated validation function
IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[GeneratedCode] WHERE [CategoryID] = (SELECT [ID] FROM [${flyway:defaultSchema}].[vwGeneratedCodeCategories] WHERE [Name]='CodeGen: Validators') AND [LinkedEntityID] = 'DF238F34-2837-EF11-86D4-6045BDEE16E6' AND [LinkedRecordPrimaryKey] = 'A2EDD95B-D198-4587-A452-E28D64768E35'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[GeneratedCode] ([ID], [CategoryID], [GeneratedByModelID], [GeneratedAt], [Language], [Status], [Source], [Code], [Description], [Name], [LinkedEntityID], [LinkedRecordPrimaryKey])
VALUES ('f0c4beda-2cd8-4fb8-87e7-09fd3fe08fc5', (SELECT [ID] FROM [${flyway:defaultSchema}].[vwGeneratedCodeCategories] WHERE [Name]='CodeGen: Validators'), 'C43229F6-4CC8-4838-9D04-03419A2DA191', GETUTCDATE(), 'TypeScript', 'Approved', '([ReplacesFieldNames] IS NULL OR isjson([ReplacesFieldNames])=(1) AND left(ltrim([ReplacesFieldNames]),(1))=''['' AND replace(replace(replace(replace([ReplacesFieldNames],char((32)),''''),char((9)),''''),char((13)),''''),char((10)),'''')<>''[]'')', 'public ValidateReplacesFieldNamesIsNonEmptyJsonArray(result: ValidationResult) {
	if (this.ReplacesFieldNames != null && this.ReplacesFieldNames.trim() !== "") {
		try {
			const parsed = JSON.parse(this.ReplacesFieldNames);
			if (!Array.isArray(parsed)) {
				result.Errors.push(new ValidationErrorInfo(
					"ReplacesFieldNames",
					"Replaces Field Names must be a valid JSON array starting with ''[''.",
					this.ReplacesFieldNames,
					ValidationErrorType.Failure
				));
			} else if (parsed.length === 0) {
				result.Errors.push(new ValidationErrorInfo(
					"ReplacesFieldNames",
					"Replaces Field Names cannot be an empty array.",
					this.ReplacesFieldNames,
					ValidationErrorType.Failure
				));
			}
		} catch (e) {
			result.Errors.push(new ValidationErrorInfo(
				"ReplacesFieldNames",
				"Replaces Field Names must be a valid JSON string.",
				this.ReplacesFieldNames,
				ValidationErrorType.Failure
			));
		}
	}
}', 'If Replaces Field Names is provided, it must be a valid, non-empty JSON array to ensure that a structured list of field overrides is correctly defined.', 'ValidateReplacesFieldNamesIsNonEmptyJsonArray', 'DF238F34-2837-EF11-86D4-6045BDEE16E6', 'A2EDD95B-D198-4587-A452-E28D64768E35')
   END;

-- CHECK constraint for MJ: Entity Form Contributions @ Table Level was newly set or modified since the last generation of the validation function, the code was regenerated and updating the GeneratedCode table with the new generated validation function
IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[GeneratedCode] WHERE [CategoryID] = (SELECT [ID] FROM [${flyway:defaultSchema}].[vwGeneratedCodeCategories] WHERE [Name]='CodeGen: Validators') AND [LinkedEntityID] = 'E0238F34-2837-EF11-86D4-6045BDEE16E6' AND [LinkedRecordPrimaryKey] = 'CFC1ACD7-223C-423F-9777-959EC95DB70E'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[GeneratedCode] ([ID], [CategoryID], [GeneratedByModelID], [GeneratedAt], [Language], [Status], [Source], [Code], [Description], [Name], [LinkedEntityID], [LinkedRecordPrimaryKey])
VALUES ('3798255c-1b03-485a-b807-c9c21e2b4754', (SELECT [ID] FROM [${flyway:defaultSchema}].[vwGeneratedCodeCategories] WHERE [Name]='CodeGen: Validators'), 'C43229F6-4CC8-4838-9D04-03419A2DA191', GETUTCDATE(), 'TypeScript', 'Approved', '(((case when [ReplacesSectionKey] IS NULL then (0) else (1) end+case when [RelatedEntityID] IS NULL then (0) else (1) end)+case when [ReplacesFieldNames] IS NULL then (0) else (1) end)<=(1))', 'public ValidateMutuallyExclusiveReplacementAndRelationFields(result: ValidationResult) {
	let count = 0;
	if (this.ReplacesSectionKey != null) {
		count++;
	}
	if (this.RelatedEntityID != null) {
		count++;
	}
	if (this.ReplacesFieldNames != null) {
		count++;
	}

	if (count > 1) {
		const errorMessage = "Only one of Replaces Section Key, Related Entity ID, or Replaces Field Names can be configured at a time.";
		result.Errors.push(new ValidationErrorInfo(
			"ReplacesSectionKey",
			errorMessage,
			this.ReplacesSectionKey,
			ValidationErrorType.Failure
		));
		result.Errors.push(new ValidationErrorInfo(
			"RelatedEntityID",
			errorMessage,
			this.RelatedEntityID,
			ValidationErrorType.Failure
		));
		result.Errors.push(new ValidationErrorInfo(
			"ReplacesFieldNames",
			errorMessage,
			this.ReplacesFieldNames,
			ValidationErrorType.Failure
		));
	}
}', 'At most one of the following fields can be configured for a component: Replaces Section Key, Related Entity ID, or Replaces Field Names. This ensures that the component does not have conflicting replacement or relation behaviors defined simultaneously.', 'ValidateMutuallyExclusiveReplacementAndRelationFields', 'E0238F34-2837-EF11-86D4-6045BDEE16E6', 'CFC1ACD7-223C-423F-9777-959EC95DB70E')
   END;

-- CHECK constraint for MJ: Entity Form Contributions @ Table Level was newly set or modified since the last generation of the validation function, the code was regenerated and updating the GeneratedCode table with the new generated validation function
IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[GeneratedCode] WHERE [CategoryID] = (SELECT [ID] FROM [${flyway:defaultSchema}].[vwGeneratedCodeCategories] WHERE [Name]='CodeGen: Validators') AND [LinkedEntityID] = 'E0238F34-2837-EF11-86D4-6045BDEE16E6' AND [LinkedRecordPrimaryKey] = 'CFC1ACD7-223C-423F-9777-959EC95DB70E'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[GeneratedCode] ([ID], [CategoryID], [GeneratedByModelID], [GeneratedAt], [Language], [Status], [Source], [Code], [Description], [Name], [LinkedEntityID], [LinkedRecordPrimaryKey])
VALUES ('f0c8d3c2-2131-411d-af62-1033d83cd88e', (SELECT [ID] FROM [${flyway:defaultSchema}].[vwGeneratedCodeCategories] WHERE [Name]='CodeGen: Validators'), 'C43229F6-4CC8-4838-9D04-03419A2DA191', GETUTCDATE(), 'TypeScript', 'Approved', '([Presentation]<>''bare'' OR [Inclusion] IS NULL AND [ChromeGroup] IS NULL)', 'public ValidatePresentationBareExcludesInclusionAndChromeGroup(result: ValidationResult) {
    if (this.Presentation === "bare") {
        if (this.Inclusion != null || this.ChromeGroup != null) {
            result.Errors.push(new ValidationErrorInfo(
                "Presentation",
                "When Presentation is set to ''bare'', both Inclusion and ChromeGroup must be empty.",
                this.Presentation,
                ValidationErrorType.Failure
            ));
        }
    }
}', 'If the presentation style is set to ''bare'', then both inclusion and chrome group must be empty.', 'ValidatePresentationBareExcludesInclusionAndChromeGroup', 'E0238F34-2837-EF11-86D4-6045BDEE16E6', 'CFC1ACD7-223C-423F-9777-959EC95DB70E')
   END;

-- CHECK constraint for MJ: Entity Form Contributions @ Table Level was newly set or modified since the last generation of the validation function, the code was regenerated and updating the GeneratedCode table with the new generated validation function
IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[GeneratedCode] WHERE [CategoryID] = (SELECT [ID] FROM [${flyway:defaultSchema}].[vwGeneratedCodeCategories] WHERE [Name]='CodeGen: Validators') AND [LinkedEntityID] = 'E0238F34-2837-EF11-86D4-6045BDEE16E6' AND [LinkedRecordPrimaryKey] = 'CFC1ACD7-223C-423F-9777-959EC95DB70E'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[GeneratedCode] ([ID], [CategoryID], [GeneratedByModelID], [GeneratedAt], [Language], [Status], [Source], [Code], [Description], [Name], [LinkedEntityID], [LinkedRecordPrimaryKey])
VALUES ('25a9780d-0327-4559-a178-e8e53c549cf7', (SELECT [ID] FROM [${flyway:defaultSchema}].[vwGeneratedCodeCategories] WHERE [Name]='CodeGen: Validators'), 'C43229F6-4CC8-4838-9D04-03419A2DA191', GETUTCDATE(), 'TypeScript', 'Approved', '([RelatedJoinField] IS NULL OR [RelatedEntityID] IS NOT NULL)', '	public ValidateRelatedJoinFieldRequiresRelatedEntity(result: ValidationResult) {
		if (this.RelatedJoinField != null && this.RelatedJoinField !== "" && this.RelatedEntityID == null) {
			result.Errors.push(new ValidationErrorInfo(
				"RelatedEntityID",
				"A Related Entity must be specified when a Related Join Field is provided.",
				this.RelatedEntityID,
				ValidationErrorType.Failure
			));
		}
	}', 'If a related join field is specified, a related entity must also be provided to ensure the join relationship is fully defined.', 'ValidateRelatedJoinFieldRequiresRelatedEntity', 'E0238F34-2837-EF11-86D4-6045BDEE16E6', 'CFC1ACD7-223C-423F-9777-959EC95DB70E')
   END;

-- CHECK constraint for MJ: Entity Form Contributions @ Table Level was newly set or modified since the last generation of the validation function, the code was regenerated and updating the GeneratedCode table with the new generated validation function
IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[GeneratedCode] WHERE [CategoryID] = (SELECT [ID] FROM [${flyway:defaultSchema}].[vwGeneratedCodeCategories] WHERE [Name]='CodeGen: Validators') AND [LinkedEntityID] = 'E0238F34-2837-EF11-86D4-6045BDEE16E6' AND [LinkedRecordPrimaryKey] = 'CFC1ACD7-223C-423F-9777-959EC95DB70E'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[GeneratedCode] ([ID], [CategoryID], [GeneratedByModelID], [GeneratedAt], [Language], [Status], [Source], [Code], [Description], [Name], [LinkedEntityID], [LinkedRecordPrimaryKey])
VALUES ('4265d214-8d47-405b-873c-2753376c339d', (SELECT [ID] FROM [${flyway:defaultSchema}].[vwGeneratedCodeCategories] WHERE [Name]='CodeGen: Validators'), 'C43229F6-4CC8-4838-9D04-03419A2DA191', GETUTCDATE(), 'TypeScript', 'Approved', '([Scope]=''User'' AND [UserID] IS NOT NULL AND [RoleID] IS NULL OR [Scope]=''Role'' AND [RoleID] IS NOT NULL AND [UserID] IS NULL OR [Scope]=''Global'' AND [UserID] IS NULL AND [RoleID] IS NULL)', 'public ValidateScopeUserRoleRelationship(result: ValidationResult) {
	if (this.Scope === "User") {
		if (this.UserID == null) {
			result.Errors.push(new ValidationErrorInfo(
				"UserID",
				"User ID is required when Scope is set to ''User''.",
				this.UserID,
				ValidationErrorType.Failure
			));
		}
		if (this.RoleID != null) {
			result.Errors.push(new ValidationErrorInfo(
				"RoleID",
				"Role ID must be empty when Scope is set to ''User''.",
				this.RoleID,
				ValidationErrorType.Failure
			));
		}
	} else if (this.Scope === "Role") {
		if (this.RoleID == null) {
			result.Errors.push(new ValidationErrorInfo(
				"RoleID",
				"Role ID is required when Scope is set to ''Role''.",
				this.RoleID,
				ValidationErrorType.Failure
			));
		}
		if (this.UserID != null) {
			result.Errors.push(new ValidationErrorInfo(
				"UserID",
				"User ID must be empty when Scope is set to ''Role''.",
				this.UserID,
				ValidationErrorType.Failure
			));
		}
	} else if (this.Scope === "Global") {
		if (this.UserID != null) {
			result.Errors.push(new ValidationErrorInfo(
				"UserID",
				"User ID must be empty when Scope is set to ''Global''.",
				this.UserID,
				ValidationErrorType.Failure
			));
		}
		if (this.RoleID != null) {
			result.Errors.push(new ValidationErrorInfo(
				"RoleID",
				"Role ID must be empty when Scope is set to ''Global''.",
				this.RoleID,
				ValidationErrorType.Failure
			));
		}
	}
}', 'Ensures that the User ID and Role ID fields are correctly populated or left empty based on the selected Scope: ''User'' scope requires a User ID and no Role ID, ''Role'' scope requires a Role ID and no User ID, and ''Global'' scope requires both fields to be empty.', 'ValidateScopeUserRoleRelationship', 'E0238F34-2837-EF11-86D4-6045BDEE16E6', 'CFC1ACD7-223C-423F-9777-959EC95DB70E')
   END;

