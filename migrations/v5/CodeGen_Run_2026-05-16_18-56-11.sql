/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'f8910808-2e8c-415c-9431-c39a607c7db8' OR (EntityID = '15C92AC0-94E9-49CB-8571-F25D4D49B275' AND Name = 'Entity')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'f8910808-2e8c-415c-9431-c39a607c7db8',
            '15C92AC0-94E9-49CB-8571-F25D4D49B275', -- Entity: MJ: Entity Form Overrides
            100025,
            'Entity',
            'Entity',
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

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '705ca801-f1b6-4b34-9255-eb1a259d3bc4' OR (EntityID = '15C92AC0-94E9-49CB-8571-F25D4D49B275' AND Name = 'Component')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '705ca801-f1b6-4b34-9255-eb1a259d3bc4',
            '15C92AC0-94E9-49CB-8571-F25D4D49B275', -- Entity: MJ: Entity Form Overrides
            100026,
            'Component',
            'Component',
            NULL,
            'nvarchar',
            1000,
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

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '79f38318-cebb-487d-8143-7836d6dd0a38' OR (EntityID = '15C92AC0-94E9-49CB-8571-F25D4D49B275' AND Name = 'User')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '79f38318-cebb-487d-8143-7836d6dd0a38',
            '15C92AC0-94E9-49CB-8571-F25D4D49B275', -- Entity: MJ: Entity Form Overrides
            100027,
            'User',
            'User',
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

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '51826715-e4c3-4183-affd-cb433a077d12' OR (EntityID = '15C92AC0-94E9-49CB-8571-F25D4D49B275' AND Name = 'Role')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '51826715-e4c3-4183-affd-cb433a077d12',
            '15C92AC0-94E9-49CB-8571-F25D4D49B275', -- Entity: MJ: Entity Form Overrides
            100028,
            'Role',
            'Role',
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

/* Index for Foreign Keys for EntityFormOverride */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Entity Form Overrides
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key EntityID in table EntityFormOverride
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_EntityFormOverride_EntityID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[EntityFormOverride]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_EntityFormOverride_EntityID ON [${flyway:defaultSchema}].[EntityFormOverride] ([EntityID]);

-- Index for foreign key ComponentID in table EntityFormOverride
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_EntityFormOverride_ComponentID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[EntityFormOverride]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_EntityFormOverride_ComponentID ON [${flyway:defaultSchema}].[EntityFormOverride] ([ComponentID]);

-- Index for foreign key UserID in table EntityFormOverride
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_EntityFormOverride_UserID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[EntityFormOverride]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_EntityFormOverride_UserID ON [${flyway:defaultSchema}].[EntityFormOverride] ([UserID]);

-- Index for foreign key RoleID in table EntityFormOverride
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_EntityFormOverride_RoleID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[EntityFormOverride]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_EntityFormOverride_RoleID ON [${flyway:defaultSchema}].[EntityFormOverride] ([RoleID]);

/* SQL text to update entity field related entity name field map for entity field ID 8158ECD2-0B85-44E3-A381-DA556674309E */
EXEC [${flyway:defaultSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='8158ECD2-0B85-44E3-A381-DA556674309E', @RelatedEntityNameFieldMap='Entity';

/* SQL text to update entity field related entity name field map for entity field ID 78458551-7631-4FAF-9FDC-0D06765A1E6B */
EXEC [${flyway:defaultSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='78458551-7631-4FAF-9FDC-0D06765A1E6B', @RelatedEntityNameFieldMap='Component';

/* Base View SQL for MJ: Entity Form Overrides */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Entity Form Overrides
-- Item: vwEntityFormOverrides
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: Entity Form Overrides
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  EntityFormOverride
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwEntityFormOverrides]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwEntityFormOverrides];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwEntityFormOverrides]
AS
SELECT
    e.*,
    MJEntity_EntityID.[Name] AS [Entity],
    MJComponent_ComponentID.[Name] AS [Component],
    MJUser_UserID.[Name] AS [User],
    MJRole_RoleID.[Name] AS [Role]
FROM
    [${flyway:defaultSchema}].[EntityFormOverride] AS e
INNER JOIN
    [${flyway:defaultSchema}].[Entity] AS MJEntity_EntityID
  ON
    [e].[EntityID] = MJEntity_EntityID.[ID]
INNER JOIN
    [${flyway:defaultSchema}].[Component] AS MJComponent_ComponentID
  ON
    [e].[ComponentID] = MJComponent_ComponentID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[User] AS MJUser_UserID
  ON
    [e].[UserID] = MJUser_UserID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[Role] AS MJRole_RoleID
  ON
    [e].[RoleID] = MJRole_RoleID.[ID]
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwEntityFormOverrides] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* Base View Permissions SQL for MJ: Entity Form Overrides */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Entity Form Overrides
-- Item: Permissions for vwEntityFormOverrides
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwEntityFormOverrides] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* spCreate SQL for MJ: Entity Form Overrides */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Entity Form Overrides
-- Item: spCreateEntityFormOverride
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR EntityFormOverride
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateEntityFormOverride]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateEntityFormOverride];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateEntityFormOverride]
    @ID uniqueidentifier = NULL,
    @EntityID uniqueidentifier,
    @ComponentID uniqueidentifier,
    @Name nvarchar(255),
    @Description_Clear bit = 0,
    @Description nvarchar(MAX) = NULL,
    @Scope nvarchar(20) = NULL,
    @UserID_Clear bit = 0,
    @UserID uniqueidentifier = NULL,
    @RoleID_Clear bit = 0,
    @RoleID uniqueidentifier = NULL,
    @Priority int = NULL,
    @Status nvarchar(20) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    
    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[EntityFormOverride]
            (
                [ID],
                [EntityID],
                [ComponentID],
                [Name],
                [Description],
                [Scope],
                [UserID],
                [RoleID],
                [Priority],
                [Status]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @EntityID,
                @ComponentID,
                @Name,
                CASE WHEN @Description_Clear = 1 THEN NULL ELSE ISNULL(@Description, NULL) END,
                ISNULL(@Scope, 'Global'),
                CASE WHEN @UserID_Clear = 1 THEN NULL ELSE ISNULL(@UserID, NULL) END,
                CASE WHEN @RoleID_Clear = 1 THEN NULL ELSE ISNULL(@RoleID, NULL) END,
                ISNULL(@Priority, 0),
                ISNULL(@Status, 'Active')
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[EntityFormOverride]
            (
                [EntityID],
                [ComponentID],
                [Name],
                [Description],
                [Scope],
                [UserID],
                [RoleID],
                [Priority],
                [Status]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @EntityID,
                @ComponentID,
                @Name,
                CASE WHEN @Description_Clear = 1 THEN NULL ELSE ISNULL(@Description, NULL) END,
                ISNULL(@Scope, 'Global'),
                CASE WHEN @UserID_Clear = 1 THEN NULL ELSE ISNULL(@UserID, NULL) END,
                CASE WHEN @RoleID_Clear = 1 THEN NULL ELSE ISNULL(@RoleID, NULL) END,
                ISNULL(@Priority, 0),
                ISNULL(@Status, 'Active')
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwEntityFormOverrides] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateEntityFormOverride] TO [cdp_Developer], [cdp_Integration];

/* spCreate Permissions for MJ: Entity Form Overrides */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateEntityFormOverride] TO [cdp_Developer], [cdp_Integration];

/* spUpdate SQL for MJ: Entity Form Overrides */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Entity Form Overrides
-- Item: spUpdateEntityFormOverride
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR EntityFormOverride
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateEntityFormOverride]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateEntityFormOverride];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateEntityFormOverride]
    @ID uniqueidentifier,
    @EntityID uniqueidentifier = NULL,
    @ComponentID uniqueidentifier = NULL,
    @Name nvarchar(255) = NULL,
    @Description_Clear bit = 0,
    @Description nvarchar(MAX) = NULL,
    @Scope nvarchar(20) = NULL,
    @UserID_Clear bit = 0,
    @UserID uniqueidentifier = NULL,
    @RoleID_Clear bit = 0,
    @RoleID uniqueidentifier = NULL,
    @Priority int = NULL,
    @Status nvarchar(20) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[EntityFormOverride]
    SET
        [EntityID] = ISNULL(@EntityID, [EntityID]),
        [ComponentID] = ISNULL(@ComponentID, [ComponentID]),
        [Name] = ISNULL(@Name, [Name]),
        [Description] = CASE WHEN @Description_Clear = 1 THEN NULL ELSE ISNULL(@Description, [Description]) END,
        [Scope] = ISNULL(@Scope, [Scope]),
        [UserID] = CASE WHEN @UserID_Clear = 1 THEN NULL ELSE ISNULL(@UserID, [UserID]) END,
        [RoleID] = CASE WHEN @RoleID_Clear = 1 THEN NULL ELSE ISNULL(@RoleID, [RoleID]) END,
        [Priority] = ISNULL(@Priority, [Priority]),
        [Status] = ISNULL(@Status, [Status])
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwEntityFormOverrides] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwEntityFormOverrides]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateEntityFormOverride] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the EntityFormOverride table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateEntityFormOverride]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateEntityFormOverride];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateEntityFormOverride
ON [${flyway:defaultSchema}].[EntityFormOverride]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[EntityFormOverride]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[EntityFormOverride] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO

/* spUpdate Permissions for MJ: Entity Form Overrides */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateEntityFormOverride] TO [cdp_Developer], [cdp_Integration];

/* spDelete SQL for MJ: Entity Form Overrides */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Entity Form Overrides
-- Item: spDeleteEntityFormOverride
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR EntityFormOverride
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteEntityFormOverride]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteEntityFormOverride];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteEntityFormOverride]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[EntityFormOverride]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteEntityFormOverride] TO [cdp_Integration];

/* spDelete Permissions for MJ: Entity Form Overrides */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteEntityFormOverride] TO [cdp_Integration];

/* Set field properties for entity */

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '22B48E33-905E-4B07-A911-1A7C8771C92C'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = 'D36AF1F4-E233-4089-8D7C-A097862BA85B'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = 'CE4DF7B3-5827-4F57-92CF-2529B7ED2519'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = 'F8910808-2E8C-415C-9431-C39A607C7DB8'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '22B48E33-905E-4B07-A911-1A7C8771C92C'
               AND AutoUpdateIncludeInUserSearchAPI = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET IncludeInUserSearchAPI = 1
               WHERE ID = 'CE4DF7B3-5827-4F57-92CF-2529B7ED2519'
               AND AutoUpdateIncludeInUserSearchAPI = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET IncludeInUserSearchAPI = 1
               WHERE ID = 'F8910808-2E8C-415C-9431-C39A607C7DB8'
               AND AutoUpdateIncludeInUserSearchAPI = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET UserSearchPredicateAPI = 'BeginsWith'
               WHERE ID = 'F8910808-2E8C-415C-9431-C39A607C7DB8'
               AND AutoUpdateUserSearchPredicate = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET UserSearchPredicateAPI = 'Exact'
               WHERE ID = '22B48E33-905E-4B07-A911-1A7C8771C92C'
               AND AutoUpdateUserSearchPredicate = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET UserSearchPredicateAPI = 'Exact'
               WHERE ID = 'CE4DF7B3-5827-4F57-92CF-2529B7ED2519'
               AND AutoUpdateUserSearchPredicate = 1;

/* Set categories for 16 fields */

-- UPDATE Entity Field Category Info MJ: Entity Form Overrides.ID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '5FFAC995-59A7-4097-A116-AD802DCCD894' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Entity Form Overrides.Name 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Override Configuration',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '673A88CA-DAFE-49D5-9332-734F486BBCC6' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Entity Form Overrides.Description 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Override Configuration',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '750F62B7-2206-4F62-823A-7012CDFDD8E0' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Entity Form Overrides.Status 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Override Configuration',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'CE4DF7B3-5827-4F57-92CF-2529B7ED2519' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Entity Form Overrides.EntityID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Targeting and Resolution',
   GeneratedFormSection = 'Category',
   DisplayName = 'Entity',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '8158ECD2-0B85-44E3-A381-DA556674309E' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Entity Form Overrides.ComponentID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Targeting and Resolution',
   GeneratedFormSection = 'Category',
   DisplayName = 'Component',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '78458551-7631-4FAF-9FDC-0D06765A1E6B' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Entity Form Overrides.Scope 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Targeting and Resolution',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '22B48E33-905E-4B07-A911-1A7C8771C92C' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Entity Form Overrides.Priority 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Targeting and Resolution',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'D36AF1F4-E233-4089-8D7C-A097862BA85B' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Entity Form Overrides.UserID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Scope Assignment',
   GeneratedFormSection = 'Category',
   DisplayName = 'User',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'ABA778C6-CD79-44ED-95B8-D91A83E6384F' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Entity Form Overrides.RoleID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Scope Assignment',
   GeneratedFormSection = 'Category',
   DisplayName = 'Role',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '1CC7E547-CEF7-420E-88AC-2222BF7298A2' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Entity Form Overrides.Entity 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Targeting and Resolution',
   GeneratedFormSection = 'Category',
   DisplayName = 'Entity Name',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'F8910808-2E8C-415C-9431-C39A607C7DB8' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Entity Form Overrides.Component 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Targeting and Resolution',
   GeneratedFormSection = 'Category',
   DisplayName = 'Component Name',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '705CA801-F1B6-4B34-9255-EB1A259D3BC4' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Entity Form Overrides.User 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Scope Assignment',
   GeneratedFormSection = 'Category',
   DisplayName = 'User Name',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '79F38318-CEBB-487D-8143-7836D6DD0A38' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Entity Form Overrides.Role 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Scope Assignment',
   GeneratedFormSection = 'Category',
   DisplayName = 'Role Name',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '51826715-E4C3-4183-AFFD-CB433A077D12' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Entity Form Overrides.__mj_CreatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'DD06F49C-D1CD-4D7C-99AB-D7ED3D2422A3' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Entity Form Overrides.__mj_UpdatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'F8F29CAA-5DED-4A83-80FB-AA8E11B41734' AND AutoUpdateCategory = 1;

/* Set entity icon to fa fa-layer-group */

               UPDATE [${flyway:defaultSchema}].[Entity]
               SET [Icon] = 'fa fa-layer-group', [__mj_UpdatedAt] = GETUTCDATE()
               WHERE [ID] = '15C92AC0-94E9-49CB-8571-F25D4D49B275';

/* Insert FieldCategoryInfo setting for entity */

               INSERT INTO [${flyway:defaultSchema}].[EntitySetting] ([ID], [EntityID], [Name], [Value], [__mj_CreatedAt], [__mj_UpdatedAt])
               VALUES ('2f639dfd-c546-4e94-9abc-0dcd05180bc0', '15C92AC0-94E9-49CB-8571-F25D4D49B275', 'FieldCategoryInfo', '{"Override Configuration":{"icon":"fa fa-sliders-h","description":"General settings and descriptive information for the form override"},"Targeting and Resolution":{"icon":"fa fa-bullseye","description":"Logic defining which entity and component are linked and their resolution priority"},"Scope Assignment":{"icon":"fa fa-user-tag","description":"Specific user or role assignments for scoped overrides"},"System Metadata":{"icon":"fa fa-cog","description":"System-managed audit and tracking fields"}}', GETUTCDATE(), GETUTCDATE());

/* Insert FieldCategoryIcons setting (legacy) */

               INSERT INTO [${flyway:defaultSchema}].[EntitySetting] ([ID], [EntityID], [Name], [Value], [__mj_CreatedAt], [__mj_UpdatedAt])
               VALUES ('3fc31799-dbf7-47bf-a0c9-4ba83e42f55c', '15C92AC0-94E9-49CB-8571-F25D4D49B275', 'FieldCategoryIcons', '{"Override Configuration":"fa fa-sliders-h","Targeting and Resolution":"fa fa-bullseye","Scope Assignment":"fa fa-user-tag","System Metadata":"fa fa-cog"}', GETUTCDATE(), GETUTCDATE());

