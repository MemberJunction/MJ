

DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spUpdateExistingEntitiesFromSchema];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].spUpdateExistingEntitiesFromSchema
    @ExcludedSchemaNames NVARCHAR(MAX)
AS
BEGIN
    SET NOCOUNT ON;

    -- Declare a table variable to store the filtered rows
    DECLARE @FilteredRows TABLE (
        ID UNIQUEIDENTIFIER,
        Name NVARCHAR(500),
        CurrentDescription NVARCHAR(MAX),
        NewDescription NVARCHAR(MAX),
        EntityDescription NVARCHAR(MAX),
        SchemaName NVARCHAR(MAX)
    );

    INSERT INTO @FilteredRows
        SELECT 
            e.ID,
            e.Name,
            e.Description AS CurrentDescription,
            IIF(e.AutoUpdateDescription = 1, CONVERT(NVARCHAR(MAX), fromSQL.EntityDescription), e.Description) AS NewDescription,
            CONVERT(NVARCHAR(MAX),fromSQL.EntityDescription),
            CONVERT(NVARCHAR(MAX),fromSQL.SchemaName)
        FROM
            [${flyway:defaultSchema}].[Entity] e
        INNER JOIN
            [${flyway:defaultSchema}].[vwSQLTablesAndEntities] fromSQL
        ON
            e.ID = fromSQL.EntityID
        LEFT JOIN
            STRING_SPLIT(@ExcludedSchemaNames, ',') AS excludedSchemas
        ON
            fromSQL.SchemaName = excludedSchemas.value
        WHERE
            e.VirtualEntity = 0 
            AND excludedSchemas.value IS NULL -- Exclude rows with matching SchemaName
            AND ISNULL(IIF(e.AutoUpdateDescription = 1, CONVERT(NVARCHAR(MAX), fromSQL.EntityDescription), e.Description),'') <> ISNULL(e.Description,'') -- Only rows with changes

    -- Perform the update
    UPDATE e
    SET
        Description = fr.NewDescription
    FROM
        [${flyway:defaultSchema}].[Entity] e
    INNER JOIN
        @FilteredRows fr
    ON
        e.ID = fr.ID;

    -- Return the modified rows
    SELECT * FROM @FilteredRows;
END;
GO