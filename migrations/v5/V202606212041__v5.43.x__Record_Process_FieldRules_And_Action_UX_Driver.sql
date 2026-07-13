-- =====================================================================================================
-- Record Process: add the 'FieldRules' WorkType (rules-based bulk update), and give Entity Action
-- Invocations an OPTIONAL pluggable runtime-UX driver so an action can declare a richer invocation
-- experience (parameter collection / dry-run preview / confirmation / progress) WITHOUT the grid or
-- toolbar knowing anything operation-specific. The runtime-UX driver is the generic seam that the
-- rules-based bulk-update "Run Record Process" experience is the first consumer of.
-- =====================================================================================================

-- 1) Extend RecordProcess.WorkType to include 'FieldRules'. CodeGen reads this CHECK constraint to
--    regenerate both the TypeScript union and the field's value list, so this is the single source.
ALTER TABLE ${flyway:defaultSchema}.RecordProcess DROP CONSTRAINT IF EXISTS CK_RecordProcess_WorkType;

ALTER TABLE ${flyway:defaultSchema}.RecordProcess ADD CONSTRAINT CK_RecordProcess_WorkType
    CHECK ([WorkType] IN ('Action', 'Agent', 'Infer', 'FieldRules'));

-- 2) Optional runtime-UX driver class on an Entity Action Invocation.
ALTER TABLE ${flyway:defaultSchema}.EntityActionInvocation ADD
    RuntimeUXDriverClass NVARCHAR(255) NULL;

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Optional class name of a registered runtime-UX driver component (a BaseEntityActionRuntimeUX subclass resolved via MJGlobal.ClassFactory) that owns this invocation''s interaction — parameter collection, dry-run preview, confirmation, and progress. NULL invokes the action directly with no custom UX. This lets any action opt into a richer, reusable runtime experience while the grid/toolbar stays operation-agnostic.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'EntityActionInvocation',
    @level2type = N'COLUMN', @level2name = N'RuntimeUXDriverClass';















-- Adding the timestamp here ensures the checksum changes each time so this runs every time
-- ${flyway:timestamp}

/* SQL text to recompile all views */
EXEC [${flyway:defaultSchema}].spRecompileAllViews

/* SQL text to update existing entities from schema */
EXEC [${flyway:defaultSchema}].spUpdateExistingEntitiesFromSchema @ExcludedSchemaNames='sys,staging'

/* SQL text to sync schema info from database schemas */
EXEC [${flyway:defaultSchema}].spUpdateSchemaInfoFromDatabase @ExcludedSchemaNames='sys,staging'

/* SQL text to delete unneeded entity fields */
EXEC [${flyway:defaultSchema}].spDeleteUnneededEntityFields @ExcludedSchemaNames='sys,staging'

/* SQL text to update existing entity fields from schema */
EXEC [${flyway:defaultSchema}].spUpdateExistingEntityFieldsFromSchema @ExcludedSchemaNames='sys,staging'

/* SQL text to set default column width where needed */
EXEC [${flyway:defaultSchema}].spSetDefaultColumnWidthWhereNeeded @ExcludedSchemaNames='sys,staging'

/* SQL text to recompile all stored procedures in dependency order */
EXEC [${flyway:defaultSchema}].spRecompileAllProceduresInDependencyOrder @ExcludedSchemaNames='sys,staging', @LogOutput=0, @ContinueOnError=1




-- ═════════════════════════════════════════════════════════════════════════════════════════════════════
-- ═════════════════════════════════════════════════════════════════════════════════════════════════════
--
--    ▼▼▼   CODEGEN OUTPUT (auto-generated — folded into this migration so it travels as one unit)   ▼▼▼
--
--    Everything below this banner was produced by `mj codegen` AFTER the hand-written schema changes
--    above were applied. It (re)generates: the EntityField metadata for EntityActionInvocation
--    .RuntimeUXDriverClass, the 'FieldRules' RecordProcess.WorkType value-list entry, and the view +
--    CRUD stored procedures for the EntityActionInvocation entity. Do NOT hand-edit — re-run CodeGen.
--
-- ═════════════════════════════════════════════════════════════════════════════════════════════════════
-- ═════════════════════════════════════════════════════════════════════════════════════════════════════


/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '596f0ffe-6e36-4e9b-90d2-eb5bd65933d6' OR (EntityID = '35248F34-2837-EF11-86D4-6045BDEE16E6' AND Name = 'RuntimeUXDriverClass')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '596f0ffe-6e36-4e9b-90d2-eb5bd65933d6',
            '35248F34-2837-EF11-86D4-6045BDEE16E6', -- Entity: MJ: Entity Action Invocations
            100016,
            'RuntimeUXDriverClass',
            'Runtime UX Driver Class',
            'Optional class name of a registered runtime-UX driver component (a BaseEntityActionRuntimeUX subclass resolved via MJGlobal.ClassFactory) that owns this invocation''s interaction — parameter collection, dry-run preview, confirmation, and progress. NULL invokes the action directly with no custom UX. This lets any action opt into a richer, reusable runtime experience while the grid/toolbar stays operation-agnostic.',
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

/* SQL text to insert entity field value with ID d355dd72-601d-4ceb-a7e3-709c2c8b2e98 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('d355dd72-601d-4ceb-a7e3-709c2c8b2e98', '58345D95-711E-470F-BD28-1AA4AD8214D2', 3, 'FieldRules', 'FieldRules', GETUTCDATE(), GETUTCDATE());

/* SQL text to update entity field value sequence */
UPDATE [${flyway:defaultSchema}].[EntityFieldValue] SET Sequence=4 WHERE ID='17B04C7F-47ED-49ED-B92E-C069F2ED620E';

/* Index for Foreign Keys for EntityActionInvocation */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Entity Action Invocations
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key EntityActionID in table EntityActionInvocation
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_EntityActionInvocation_EntityActionID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[EntityActionInvocation]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_EntityActionInvocation_EntityActionID ON [${flyway:defaultSchema}].[EntityActionInvocation] ([EntityActionID]);

-- Index for foreign key InvocationTypeID in table EntityActionInvocation
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_EntityActionInvocation_InvocationTypeID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[EntityActionInvocation]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_EntityActionInvocation_InvocationTypeID ON [${flyway:defaultSchema}].[EntityActionInvocation] ([InvocationTypeID]);

/* Base View SQL for MJ: Entity Action Invocations */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Entity Action Invocations
-- Item: vwEntityActionInvocations
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: Entity Action Invocations
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  EntityActionInvocation
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwEntityActionInvocations]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwEntityActionInvocations];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwEntityActionInvocations]
AS
SELECT
    e.*,
    MJEntityAction_EntityActionID.[Action] AS [EntityAction],
    MJEntityActionInvocationType_InvocationTypeID.[Name] AS [InvocationType]
FROM
    [${flyway:defaultSchema}].[EntityActionInvocation] AS e
INNER JOIN
    [${flyway:defaultSchema}].[vwEntityActions] AS MJEntityAction_EntityActionID
  ON
    [e].[EntityActionID] = MJEntityAction_EntityActionID.[ID]
INNER JOIN
    [${flyway:defaultSchema}].[EntityActionInvocationType] AS MJEntityActionInvocationType_InvocationTypeID
  ON
    [e].[InvocationTypeID] = MJEntityActionInvocationType_InvocationTypeID.[ID]
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwEntityActionInvocations] TO [cdp_Integration], [cdp_UI], [cdp_Developer];

/* Base View Permissions SQL for MJ: Entity Action Invocations */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Entity Action Invocations
-- Item: Permissions for vwEntityActionInvocations
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwEntityActionInvocations] TO [cdp_Integration], [cdp_UI], [cdp_Developer];

/* spCreate SQL for MJ: Entity Action Invocations */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Entity Action Invocations
-- Item: spCreateEntityActionInvocation
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR EntityActionInvocation
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateEntityActionInvocation]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateEntityActionInvocation];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateEntityActionInvocation]
    @ID uniqueidentifier = NULL,
    @EntityActionID uniqueidentifier,
    @InvocationTypeID uniqueidentifier,
    @Status nvarchar(20) = NULL,
    @RuntimeUXDriverClass_Clear bit = 0,
    @RuntimeUXDriverClass nvarchar(255) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)

    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[EntityActionInvocation]
            (
                [ID],
                [EntityActionID],
                [InvocationTypeID],
                [Status],
                [RuntimeUXDriverClass]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @EntityActionID,
                @InvocationTypeID,
                ISNULL(@Status, 'Pending'),
                CASE WHEN @RuntimeUXDriverClass_Clear = 1 THEN NULL ELSE ISNULL(@RuntimeUXDriverClass, NULL) END
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[EntityActionInvocation]
            (
                [EntityActionID],
                [InvocationTypeID],
                [Status],
                [RuntimeUXDriverClass]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @EntityActionID,
                @InvocationTypeID,
                ISNULL(@Status, 'Pending'),
                CASE WHEN @RuntimeUXDriverClass_Clear = 1 THEN NULL ELSE ISNULL(@RuntimeUXDriverClass, NULL) END
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwEntityActionInvocations] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateEntityActionInvocation] TO [cdp_Integration], [cdp_Developer];

/* spCreate Permissions for MJ: Entity Action Invocations */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateEntityActionInvocation] TO [cdp_Integration], [cdp_Developer];

/* spUpdate SQL for MJ: Entity Action Invocations */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Entity Action Invocations
-- Item: spUpdateEntityActionInvocation
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR EntityActionInvocation
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateEntityActionInvocation]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateEntityActionInvocation];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateEntityActionInvocation]
    @ID uniqueidentifier,
    @EntityActionID uniqueidentifier = NULL,
    @InvocationTypeID uniqueidentifier = NULL,
    @Status nvarchar(20) = NULL,
    @RuntimeUXDriverClass_Clear bit = 0,
    @RuntimeUXDriverClass nvarchar(255) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[EntityActionInvocation]
    SET
        [EntityActionID] = ISNULL(@EntityActionID, [EntityActionID]),
        [InvocationTypeID] = ISNULL(@InvocationTypeID, [InvocationTypeID]),
        [Status] = ISNULL(@Status, [Status]),
        [RuntimeUXDriverClass] = CASE WHEN @RuntimeUXDriverClass_Clear = 1 THEN NULL ELSE ISNULL(@RuntimeUXDriverClass, [RuntimeUXDriverClass]) END
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwEntityActionInvocations] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwEntityActionInvocations]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateEntityActionInvocation] TO [cdp_Integration], [cdp_Developer]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the EntityActionInvocation table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateEntityActionInvocation]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateEntityActionInvocation];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateEntityActionInvocation
ON [${flyway:defaultSchema}].[EntityActionInvocation]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[EntityActionInvocation]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[EntityActionInvocation] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO

/* spUpdate Permissions for MJ: Entity Action Invocations */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateEntityActionInvocation] TO [cdp_Integration], [cdp_Developer];

/* spDelete SQL for MJ: Entity Action Invocations */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Entity Action Invocations
-- Item: spDeleteEntityActionInvocation
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR EntityActionInvocation
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteEntityActionInvocation]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteEntityActionInvocation];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteEntityActionInvocation]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[EntityActionInvocation]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteEntityActionInvocation] TO [cdp_Integration], [cdp_Developer];

/* spDelete Permissions for MJ: Entity Action Invocations */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteEntityActionInvocation] TO [cdp_Integration], [cdp_Developer];

/* Set field properties for entity */

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET IsNameField = 0
               WHERE ID = '8BADDA90-4D3C-4D2A-8E7E-52CF83ABBE0D'
               AND AutoUpdateIsNameField = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET IsNameField = 0
               WHERE ID = '6A5717F0-6F36-EF11-86D4-6045BDEE16E6'
               AND AutoUpdateIsNameField = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET UserSearchPredicateAPI = 'Exact'
               WHERE ID = '7E4C17F0-6F36-EF11-86D4-6045BDEE16E6'
               AND AutoUpdateUserSearchPredicate = 1;

            UPDATE [${flyway:defaultSchema}].[Entity]
            SET AllowUserSearchAPI = 1
            WHERE ID = '35248F34-2837-EF11-86D4-6045BDEE16E6'
            AND AutoUpdateAllowUserSearchAPI = 1;

/* Set categories for 9 fields */

-- UPDATE Entity Field Category Info MJ: Entity Action Invocations.ID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '7B4C17F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Entity Action Invocations.__mj_CreatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '1C4D17F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Entity Action Invocations.__mj_UpdatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '1D4D17F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Entity Action Invocations.EntityActionID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '7C4C17F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Entity Action Invocations.InvocationTypeID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '7D4C17F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Entity Action Invocations.EntityAction 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '8BADDA90-4D3C-4D2A-8E7E-52CF83ABBE0D' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Entity Action Invocations.InvocationType 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '6A5717F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Entity Action Invocations.RuntimeUXDriverClass 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Invocation Configuration',
   GeneratedFormSection = 'Category',
   ExtendedType = 'Code',
   CodeType = 'Other'
WHERE 
   ID = '596F0FFE-6E36-4E9B-90D2-EB5BD65933D6' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Entity Action Invocations.Status 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '7E4C17F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1;

