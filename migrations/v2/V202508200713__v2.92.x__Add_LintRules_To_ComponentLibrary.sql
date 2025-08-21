-- =====================================================================================================================
-- Migration: Add LintRules field to ComponentLibrary table for extensible component-specific linting
-- Version: 2.92
-- Description: Adds LintRules column to store JSON configuration for library-specific lint rules
-- Author: MemberJunction
-- Date: 2025-08-20
-- =====================================================================================================================








-- Save MJ: Component Libraries (core SP call only)
DECLARE @ID_d12a25ea UNIQUEIDENTIFIER,
@Name_d12a25ea NVARCHAR(500),
@DisplayName_d12a25ea NVARCHAR(500),
@Version_d12a25ea NVARCHAR(100),
@GlobalVariable_d12a25ea NVARCHAR(255),
@Category_d12a25ea NVARCHAR(100),
@CDNUrl_d12a25ea NVARCHAR(1000),
@CDNCssUrl_d12a25ea NVARCHAR(1000),
@Description_d12a25ea NVARCHAR(MAX),
@Status_d12a25ea NVARCHAR(20)
SET
  @ID_d12a25ea = '94552655-B996-4791-9008-A2D6AAC526AC'
SET
  @Name_d12a25ea = N'date-fns'
SET
  @DisplayName_d12a25ea = N'date-fns'
SET
  @Version_d12a25ea = N'3.0.6'
SET
  @GlobalVariable_d12a25ea = N'dateFns'
SET
  @Category_d12a25ea = N'Utility'
SET
  @CDNUrl_d12a25ea = N'https://cdn.jsdelivr.net/npm/date-fns@3.0.6/cdn.min.js'
SET
  @Description_d12a25ea = N'Modern JavaScript date utility library'
SET
  @Status_d12a25ea = N'Deprecated'
EXEC [${flyway:defaultSchema}].spCreateComponentLibrary @ID = @ID_d12a25ea,
  @Name = @Name_d12a25ea,
  @DisplayName = @DisplayName_d12a25ea,
  @Version = @Version_d12a25ea,
  @GlobalVariable = @GlobalVariable_d12a25ea,
  @Category = @Category_d12a25ea,
  @CDNUrl = @CDNUrl_d12a25ea,
  @CDNCssUrl = @CDNCssUrl_d12a25ea,
  @Description = @Description_d12a25ea,
  @Status = @Status_d12a25ea;

-- Save MJ: Component Libraries (core SP call only)
DECLARE @ID_215dcbf8 UNIQUEIDENTIFIER,
@Name_215dcbf8 NVARCHAR(500),
@DisplayName_215dcbf8 NVARCHAR(500),
@Version_215dcbf8 NVARCHAR(100),
@GlobalVariable_215dcbf8 NVARCHAR(255),
@Category_215dcbf8 NVARCHAR(100),
@CDNUrl_215dcbf8 NVARCHAR(1000),
@CDNCssUrl_215dcbf8 NVARCHAR(1000),
@Description_215dcbf8 NVARCHAR(MAX),
@Status_215dcbf8 NVARCHAR(20)
SET
  @ID_215dcbf8 = '8086FB43-A9A6-4CB4-B0BA-64DF478429F7'
SET
  @Name_215dcbf8 = N'classnames'
SET
  @DisplayName_215dcbf8 = N'Classnames'
SET
  @Version_215dcbf8 = N'2.5.1'
SET
  @GlobalVariable_215dcbf8 = N'classNames'
SET
  @Category_215dcbf8 = N'Utility'
SET
  @CDNUrl_215dcbf8 = N'https://cdn.jsdelivr.net/npm/classnames@2.5.1/index.min.js'
SET
  @Description_215dcbf8 = N'Utility for conditionally joining classNames together'
SET
  @Status_215dcbf8 = N'Deprecated'
EXEC [${flyway:defaultSchema}].spCreateComponentLibrary @ID = @ID_215dcbf8,
  @Name = @Name_215dcbf8,
  @DisplayName = @DisplayName_215dcbf8,
  @Version = @Version_215dcbf8,
  @GlobalVariable = @GlobalVariable_215dcbf8,
  @Category = @Category_215dcbf8,
  @CDNUrl = @CDNUrl_215dcbf8,
  @CDNCssUrl = @CDNCssUrl_215dcbf8,
  @Description = @Description_215dcbf8,
  @Status = @Status_215dcbf8;

-- Save MJ: Component Libraries (core SP call only)
DECLARE @ID_6e09df4a UNIQUEIDENTIFIER,
@Name_6e09df4a NVARCHAR(500),
@DisplayName_6e09df4a NVARCHAR(500),
@Version_6e09df4a NVARCHAR(100),
@GlobalVariable_6e09df4a NVARCHAR(255),
@Category_6e09df4a NVARCHAR(100),
@CDNUrl_6e09df4a NVARCHAR(1000),
@CDNCssUrl_6e09df4a NVARCHAR(1000),
@Description_6e09df4a NVARCHAR(MAX),
@Status_6e09df4a NVARCHAR(20)
SET
  @ID_6e09df4a = 'BBABE030-7C12-4080-8DFD-ECB634C8615E'
SET
  @Name_6e09df4a = N'material-table'
SET
  @DisplayName_6e09df4a = N'Material Table'
SET
  @Version_6e09df4a = N'2.0.5'
SET
  @GlobalVariable_6e09df4a = N'MaterialTable'
SET
  @Category_6e09df4a = N'UI'
SET
  @CDNUrl_6e09df4a = N'https://cdn.jsdelivr.net/npm/material-table@2.0.5/dist/material-table.min.js'
SET
  @Description_6e09df4a = N'Datatable for React based on Material-UI'
SET
  @Status_6e09df4a = N'Disabled'
EXEC [${flyway:defaultSchema}].spCreateComponentLibrary @ID = @ID_6e09df4a,
  @Name = @Name_6e09df4a,
  @DisplayName = @DisplayName_6e09df4a,
  @Version = @Version_6e09df4a,
  @GlobalVariable = @GlobalVariable_6e09df4a,
  @Category = @Category_6e09df4a,
  @CDNUrl = @CDNUrl_6e09df4a,
  @CDNCssUrl = @CDNCssUrl_6e09df4a,
  @Description = @Description_6e09df4a,
  @Status = @Status_6e09df4a;

-- Save MJ: Component Libraries (core SP call only)
DECLARE @ID_4991344c UNIQUEIDENTIFIER,
@Name_4991344c NVARCHAR(500),
@DisplayName_4991344c NVARCHAR(500),
@Version_4991344c NVARCHAR(100),
@GlobalVariable_4991344c NVARCHAR(255),
@Category_4991344c NVARCHAR(100),
@CDNUrl_4991344c NVARCHAR(1000),
@CDNCssUrl_4991344c NVARCHAR(1000),
@Description_4991344c NVARCHAR(MAX),
@Status_4991344c NVARCHAR(20)
SET
  @ID_4991344c = 'DB3D64C3-0D00-4D40-9AA7-99243916CF38'
SET
  @Name_4991344c = N'framer-motion'
SET
  @DisplayName_4991344c = N'Framer Motion'
SET
  @Version_4991344c = N'10.16.16'
SET
  @GlobalVariable_4991344c = N'FramerMotion'
SET
  @Category_4991344c = N'UI'
SET
  @CDNUrl_4991344c = N'https://cdn.jsdelivr.net/npm/framer-motion@10.16.16/dist/framer-motion.js'
SET
  @Description_4991344c = N'Production-ready motion library for React'
SET
  @Status_4991344c = N'Disabled'
EXEC [${flyway:defaultSchema}].spCreateComponentLibrary @ID = @ID_4991344c,
  @Name = @Name_4991344c,
  @DisplayName = @DisplayName_4991344c,
  @Version = @Version_4991344c,
  @GlobalVariable = @GlobalVariable_4991344c,
  @Category = @Category_4991344c,
  @CDNUrl = @CDNUrl_4991344c,
  @CDNCssUrl = @CDNCssUrl_4991344c,
  @Description = @Description_4991344c,
  @Status = @Status_4991344c;

-- Save MJ: Component Libraries (core SP call only)
DECLARE @ID_96a69407 UNIQUEIDENTIFIER,
@Name_96a69407 NVARCHAR(500),
@DisplayName_96a69407 NVARCHAR(500),
@Version_96a69407 NVARCHAR(100),
@GlobalVariable_96a69407 NVARCHAR(255),
@Category_96a69407 NVARCHAR(100),
@CDNUrl_96a69407 NVARCHAR(1000),
@CDNCssUrl_96a69407 NVARCHAR(1000),
@Description_96a69407 NVARCHAR(MAX),
@Status_96a69407 NVARCHAR(20)
SET
  @ID_96a69407 = '3B520A11-731D-4C7B-9699-18906BB4CA53'
SET
  @Name_96a69407 = N'react-select'
SET
  @DisplayName_96a69407 = N'React Select'
SET
  @Version_96a69407 = N'2.1.2'
SET
  @GlobalVariable_96a69407 = N'ReactSelect'
SET
  @Category_96a69407 = N'UI'
SET
  @CDNUrl_96a69407 = N'https://unpkg.com/react-select@2.1.2/dist/react-select.min.js'
SET
  @Description_96a69407 = N'Flexible and customizable Select Input control for React'
SET
  @Status_96a69407 = N'Disabled'
EXEC [${flyway:defaultSchema}].spCreateComponentLibrary @ID = @ID_96a69407,
  @Name = @Name_96a69407,
  @DisplayName = @DisplayName_96a69407,
  @Version = @Version_96a69407,
  @GlobalVariable = @GlobalVariable_96a69407,
  @Category = @Category_96a69407,
  @CDNUrl = @CDNUrl_96a69407,
  @CDNCssUrl = @CDNCssUrl_96a69407,
  @Description = @Description_96a69407,
  @Status = @Status_96a69407;











-- Add LintRules column to ComponentLibrary table
ALTER TABLE ${flyway:defaultSchema}.ComponentLibrary
ADD LintRules NVARCHAR(MAX) NULL;
GO

-- Add extended property description for the new column
EXEC sp_addextendedproperty 
    @name = N'MS_Description',
    @value = N'JSON configuration for library-specific lint rules that are applied during component validation. This field contains structured rules that define how components using this library should be validated, including DOM element requirements, initialization patterns, lifecycle methods, and common error patterns. Example structure: {"initialization": {"constructorName": "Chart", "elementType": "canvas"}, "lifecycle": {"requiredMethods": ["render"], "cleanupMethods": ["destroy"]}}. The linter dynamically applies these rules based on the libraries referenced in a component spec, enabling extensible validation without hardcoding library-specific logic.',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = 'ComponentLibrary',
    @level2type = N'COLUMN', @level2name = 'LintRules';





--- CODE GEN RUN 
/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '84eb967a-67a4-41c8-ab1f-54042a66bbdf'  OR 
               (EntityID = '2264AA9A-2197-48E2-BB3D-A498006B37A5' AND Name = 'LintRules')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '84eb967a-67a4-41c8-ab1f-54042a66bbdf',
            '2264AA9A-2197-48E2-BB3D-A498006B37A5', -- Entity: MJ: Component Libraries
            100013,
            'LintRules',
            'Lint Rules',
            'JSON configuration for library-specific lint rules that are applied during component validation. This field contains structured rules that define how components using this library should be validated, including DOM element requirements, initialization patterns, lifecycle methods, and common error patterns. Example structure: {"initialization": {"constructorName": "Chart", "elementType": "canvas"}, "lifecycle": {"requiredMethods": ["render"], "cleanupMethods": ["destroy"]}}. The linter dynamically applies these rules based on the libraries referenced in a component spec, enabling extensible validation without hardcoding library-specific logic.',
            'nvarchar',
            -1,
            0,
            0,
            1,
            'null',
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
            'Search'
         )
      END

/* Index for Foreign Keys for ComponentLibrary */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Component Libraries
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------


/* Base View SQL for MJ: Component Libraries */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Component Libraries
-- Item: vwComponentLibraries
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: Component Libraries
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  ComponentLibrary
-----               PRIMARY KEY: ID
------------------------------------------------------------
DROP VIEW IF EXISTS [${flyway:defaultSchema}].[vwComponentLibraries]
GO

CREATE VIEW [${flyway:defaultSchema}].[vwComponentLibraries]
AS
SELECT
    c.*
FROM
    [${flyway:defaultSchema}].[ComponentLibrary] AS c
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwComponentLibraries] TO [cdp_UI], [cdp_Developer], [cdp_Integration]
    

/* Base View Permissions SQL for MJ: Component Libraries */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Component Libraries
-- Item: Permissions for vwComponentLibraries
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwComponentLibraries] TO [cdp_UI], [cdp_Developer], [cdp_Integration]

/* spCreate SQL for MJ: Component Libraries */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Component Libraries
-- Item: spCreateComponentLibrary
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR ComponentLibrary
------------------------------------------------------------
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spCreateComponentLibrary]
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateComponentLibrary]
    @ID uniqueidentifier = NULL,
    @Name nvarchar(500),
    @DisplayName nvarchar(500),
    @Version nvarchar(100),
    @GlobalVariable nvarchar(255),
    @Category nvarchar(100),
    @CDNUrl nvarchar(1000),
    @CDNCssUrl nvarchar(1000),
    @Description nvarchar(MAX),
    @Status nvarchar(20),
    @LintRules nvarchar(MAX)
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    
    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[ComponentLibrary]
            (
                [ID],
                [Name],
                [DisplayName],
                [Version],
                [GlobalVariable],
                [Category],
                [CDNUrl],
                [CDNCssUrl],
                [Description],
                [Status],
                [LintRules]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @Name,
                @DisplayName,
                @Version,
                @GlobalVariable,
                @Category,
                @CDNUrl,
                @CDNCssUrl,
                @Description,
                @Status,
                @LintRules
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[ComponentLibrary]
            (
                [Name],
                [DisplayName],
                [Version],
                [GlobalVariable],
                [Category],
                [CDNUrl],
                [CDNCssUrl],
                [Description],
                [Status],
                [LintRules]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @Name,
                @DisplayName,
                @Version,
                @GlobalVariable,
                @Category,
                @CDNUrl,
                @CDNCssUrl,
                @Description,
                @Status,
                @LintRules
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwComponentLibraries] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateComponentLibrary] TO [cdp_Developer], [cdp_Integration]
    

/* spCreate Permissions for MJ: Component Libraries */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateComponentLibrary] TO [cdp_Developer], [cdp_Integration]



/* spUpdate SQL for MJ: Component Libraries */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Component Libraries
-- Item: spUpdateComponentLibrary
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR ComponentLibrary
------------------------------------------------------------
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spUpdateComponentLibrary]
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateComponentLibrary]
    @ID uniqueidentifier,
    @Name nvarchar(500),
    @DisplayName nvarchar(500),
    @Version nvarchar(100),
    @GlobalVariable nvarchar(255),
    @Category nvarchar(100),
    @CDNUrl nvarchar(1000),
    @CDNCssUrl nvarchar(1000),
    @Description nvarchar(MAX),
    @Status nvarchar(20),
    @LintRules nvarchar(MAX)
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[ComponentLibrary]
    SET
        [Name] = @Name,
        [DisplayName] = @DisplayName,
        [Version] = @Version,
        [GlobalVariable] = @GlobalVariable,
        [Category] = @Category,
        [CDNUrl] = @CDNUrl,
        [CDNCssUrl] = @CDNCssUrl,
        [Description] = @Description,
        [Status] = @Status,
        [LintRules] = @LintRules
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwComponentLibraries] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwComponentLibraries]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateComponentLibrary] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the ComponentLibrary table
------------------------------------------------------------
DROP TRIGGER IF EXISTS [${flyway:defaultSchema}].trgUpdateComponentLibrary
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateComponentLibrary
ON [${flyway:defaultSchema}].[ComponentLibrary]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[ComponentLibrary]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[ComponentLibrary] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO
        

/* spUpdate Permissions for MJ: Component Libraries */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateComponentLibrary] TO [cdp_Developer], [cdp_Integration]



/* spDelete SQL for MJ: Component Libraries */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Component Libraries
-- Item: spDeleteComponentLibrary
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR ComponentLibrary
------------------------------------------------------------
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spDeleteComponentLibrary]
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteComponentLibrary]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[ComponentLibrary]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteComponentLibrary] TO [cdp_Integration]
    

/* spDelete Permissions for MJ: Component Libraries */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteComponentLibrary] TO [cdp_Integration]



