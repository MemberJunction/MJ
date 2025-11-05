/*
   Migration: Add Description column to SchemaInfo table
   Version: 2.116.x
   Date: 2025-11-04

   Description:
   Adds a nullable Description column of type nvarchar(max) to the __mj.SchemaInfo table
   to allow for documenting schema information entries.
*/

-- Add Description column to SchemaInfo table
ALTER TABLE [${flyway:defaultSchema}].[SchemaInfo]
ADD [Description] NVARCHAR(MAX) NULL;
GO

-- =============================================
-- __mj Schema - MemberJunction Core Platform
-- =============================================
EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'MemberJunction Core Platform Schema - A comprehensive metadata-driven application development platform that provides unified data management, business logic orchestration, and automated UI generation. This schema contains the foundational infrastructure for entities, fields, relationships, permissions, AI integration, communication framework, actions system, query management, templates, workflows, and versioning. MemberJunction serves as the Common Data Platform (CDP) enabling organizations to integrate data from multiple sources, auto-generate APIs and forms, implement enterprise security, and build scalable applications with minimal custom code.',
    @level0type = N'SCHEMA',
    @level0name = N'__mj';
GO

-----------------------------------------------------------------
-- Create view to query schemas with their extended properties
-----------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwSQLSchemas]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwSQLSchemas];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwSQLSchemas]
AS
SELECT
    s.schema_id AS SchemaID,
    s.name AS SchemaName,
    CAST(EP.value AS NVARCHAR(MAX)) AS SchemaDescription
FROM
    sys.schemas s
LEFT OUTER JOIN
    sys.extended_properties EP
ON
    EP.major_id = s.schema_id
    AND EP.minor_id = 0
    AND EP.class = 3  -- SCHEMA class
    AND EP.name = 'MS_Description'
LEFT OUTER JOIN
    sys.database_principals dp
ON
    s.principal_id = dp.principal_id
WHERE
    s.schema_id > 4  -- Exclude system schemas (sys, INFORMATION_SCHEMA, guest, db_*)
    AND s.name NOT IN ('sys', 'INFORMATION_SCHEMA', 'guest')
    AND (dp.type IS NULL OR dp.type <> 'R')  -- Exclude database role schemas (type 'R' = database role)
    AND (dp.is_fixed_role IS NULL OR dp.is_fixed_role = 0)  -- Exclude fixed database roles like db_owner, db_datareader, etc.
GO

GRANT SELECT ON [${flyway:defaultSchema}].[vwSQLSchemas] TO [cdp_Developer], [cdp_UI], [cdp_Integration]
GO

-----------------------------------------------------------------
-- Create stored procedure to sync Schema Info from database schemas
-----------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateSchemaInfoFromDatabase]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateSchemaInfoFromDatabase];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateSchemaInfoFromDatabase]
    @ExcludedSchemaNames NVARCHAR(MAX) = NULL
AS
BEGIN
    SET NOCOUNT ON;

    -- Parse excluded schema names into a table variable
    DECLARE @ExcludedSchemas TABLE (SchemaName NVARCHAR(128))

    IF @ExcludedSchemaNames IS NOT NULL AND LEN(@ExcludedSchemaNames) > 0
    BEGIN
        INSERT INTO @ExcludedSchemas (SchemaName)
        SELECT TRIM(value) FROM STRING_SPLIT(@ExcludedSchemaNames, ',')
        WHERE TRIM(value) <> ''
    END

    -- Update descriptions for existing SchemaInfo records from extended properties
    UPDATE si
    SET si.Description = ss.SchemaDescription
    FROM [${flyway:defaultSchema}].SchemaInfo si
    INNER JOIN [${flyway:defaultSchema}].vwSQLSchemas ss
        ON si.SchemaName = ss.SchemaName
    WHERE
        (si.Description IS NULL OR si.Description <> ISNULL(ss.SchemaDescription, ''))
        AND ss.SchemaName NOT IN (SELECT SchemaName FROM @ExcludedSchemas)

    -- Insert new SchemaInfo records for schemas that don't exist yet
    -- We'll use default entity ID ranges that can be updated later by administrators
    INSERT INTO [${flyway:defaultSchema}].SchemaInfo
    (
        SchemaName,
        EntityIDMin,
        EntityIDMax,
        Comments,
        Description
    )
    SELECT
        ss.SchemaName,
        1,  -- Default min ID, must be > 0 per CHECK constraint. Should be updated by administrator.
        999999999,  -- Default max ID, must be > 0 per CHECK constraint. Should be updated by administrator.
        'Auto-created by CodeGen. Please update EntityIDMin and EntityIDMax to appropriate values for this schema.',
        ss.SchemaDescription
    FROM
        [${flyway:defaultSchema}].vwSQLSchemas ss
    LEFT OUTER JOIN
        [${flyway:defaultSchema}].SchemaInfo si ON ss.SchemaName = si.SchemaName
    WHERE
        si.ID IS NULL  -- Schema doesn't exist in SchemaInfo yet
        AND ss.SchemaName NOT IN (SELECT SchemaName FROM @ExcludedSchemas)

    -- Return the updated/inserted records
    SELECT
        si.*
    FROM
        [${flyway:defaultSchema}].SchemaInfo si
    INNER JOIN
        [${flyway:defaultSchema}].vwSQLSchemas ss ON si.SchemaName = ss.SchemaName
    WHERE
        ss.SchemaName NOT IN (SELECT SchemaName FROM @ExcludedSchemas)
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateSchemaInfoFromDatabase] TO [cdp_Developer], [cdp_Integration]
GO

/******* CODEGEN RUN ********/

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '28cb0081-5381-4538-806c-a3382fd0bde1'  OR 
               (EntityID = '15248F34-2837-EF11-86D4-6045BDEE16E6' AND Name = 'Description')
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
            '28cb0081-5381-4538-806c-a3382fd0bde1',
            '15248F34-2837-EF11-86D4-6045BDEE16E6', -- Entity: Schema Info
            100015,
            'Description',
            'Description',
            NULL,
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
            'Dropdown'
         )
      END

/* Index for Foreign Keys for SchemaInfo */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Schema Info
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------


/* Base View SQL for Schema Info */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Schema Info
-- Item: vwSchemaInfos
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      Schema Info
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  SchemaInfo
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwSchemaInfos]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwSchemaInfos];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwSchemaInfos]
AS
SELECT
    s.*
FROM
    [${flyway:defaultSchema}].[SchemaInfo] AS s
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwSchemaInfos] TO [cdp_Developer], [cdp_UI], [cdp_Integration]
    

/* Base View Permissions SQL for Schema Info */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Schema Info
-- Item: Permissions for vwSchemaInfos
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwSchemaInfos] TO [cdp_Developer], [cdp_UI], [cdp_Integration]

/* spCreate SQL for Schema Info */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Schema Info
-- Item: spCreateSchemaInfo
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR SchemaInfo
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateSchemaInfo]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateSchemaInfo];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateSchemaInfo]
    @ID uniqueidentifier = NULL,
    @SchemaName nvarchar(50),
    @EntityIDMin int,
    @EntityIDMax int,
    @Comments nvarchar(MAX),
    @Description nvarchar(MAX)
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    
    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[SchemaInfo]
            (
                [ID],
                [SchemaName],
                [EntityIDMin],
                [EntityIDMax],
                [Comments],
                [Description]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @SchemaName,
                @EntityIDMin,
                @EntityIDMax,
                @Comments,
                @Description
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[SchemaInfo]
            (
                [SchemaName],
                [EntityIDMin],
                [EntityIDMax],
                [Comments],
                [Description]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @SchemaName,
                @EntityIDMin,
                @EntityIDMax,
                @Comments,
                @Description
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwSchemaInfos] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateSchemaInfo] TO [cdp_Developer], [cdp_Integration]
    

/* spCreate Permissions for Schema Info */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateSchemaInfo] TO [cdp_Developer], [cdp_Integration]



/* spUpdate SQL for Schema Info */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Schema Info
-- Item: spUpdateSchemaInfo
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR SchemaInfo
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateSchemaInfo]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateSchemaInfo];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateSchemaInfo]
    @ID uniqueidentifier,
    @SchemaName nvarchar(50),
    @EntityIDMin int,
    @EntityIDMax int,
    @Comments nvarchar(MAX),
    @Description nvarchar(MAX)
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[SchemaInfo]
    SET
        [SchemaName] = @SchemaName,
        [EntityIDMin] = @EntityIDMin,
        [EntityIDMax] = @EntityIDMax,
        [Comments] = @Comments,
        [Description] = @Description
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwSchemaInfos] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwSchemaInfos]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateSchemaInfo] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the SchemaInfo table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateSchemaInfo]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateSchemaInfo];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateSchemaInfo
ON [${flyway:defaultSchema}].[SchemaInfo]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[SchemaInfo]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[SchemaInfo] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO
        

/* spUpdate Permissions for Schema Info */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateSchemaInfo] TO [cdp_Developer], [cdp_Integration]



/* spDelete SQL for Schema Info */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Schema Info
-- Item: spDeleteSchemaInfo
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR SchemaInfo
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteSchemaInfo]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteSchemaInfo];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteSchemaInfo]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[SchemaInfo]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteSchemaInfo] TO [cdp_Developer], [cdp_Integration]
    

/* spDelete Permissions for Schema Info */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteSchemaInfo] TO [cdp_Developer], [cdp_Integration]
