-- Create stored procedure to recompile all stored procedures in dependency order
-- This preserves code, comments, and permissions while forcing new execution plans

IF EXISTS (SELECT * FROM sys.objects 
           WHERE object_id = OBJECT_ID(N'[${flyway:defaultSchema}].[spRecompileAllProceduresInDependencyOrder]') 
           AND type in (N'P', N'PC'))
DROP PROCEDURE [${flyway:defaultSchema}].[spRecompileAllProceduresInDependencyOrder]
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spRecompileAllProceduresInDependencyOrder]
    @ExcludedSchemaNames NVARCHAR(MAX) = 'sys,staging',
    @LogOutput BIT = 1,
    @ContinueOnError BIT = 1
AS
BEGIN
    SET NOCOUNT ON;

    -- Create table to hold all procedures with dependency count
    CREATE TABLE #Procedures (
        ObjectId INT PRIMARY KEY,
        FullObjectName NVARCHAR(260),
        SchemaName NVARCHAR(128),
        DependencyCount INT DEFAULT 0,
        IsProcessed BIT DEFAULT 0,
        ProcessOrder INT NULL
    );

    -- Create table for excluded schemas
    CREATE TABLE #ExcludedSchemas (SchemaName NVARCHAR(128));
    
    -- Parse excluded schemas using simple string manipulation
    DECLARE @Pos INT = 1;
    DECLARE @NextPos INT;
    DECLARE @Schema NVARCHAR(128);
    
    IF @ExcludedSchemaNames IS NOT NULL AND LEN(@ExcludedSchemaNames) > 0
    BEGIN
        SET @ExcludedSchemaNames = @ExcludedSchemaNames + ',';
        
        WHILE @Pos <= LEN(@ExcludedSchemaNames)
        BEGIN
            SET @NextPos = CHARINDEX(',', @ExcludedSchemaNames, @Pos);
            IF @NextPos > 0
            BEGIN
                SET @Schema = LTRIM(RTRIM(SUBSTRING(@ExcludedSchemaNames, @Pos, @NextPos - @Pos)));
                IF LEN(@Schema) > 0
                    INSERT INTO #ExcludedSchemas (SchemaName) VALUES (@Schema);
                SET @Pos = @NextPos + 1;
            END
            ELSE
                BREAK;
        END
    END

    -- Get all procedures not in excluded schemas
    INSERT INTO #Procedures (ObjectId, FullObjectName, SchemaName)
    SELECT 
        o.object_id,
        QUOTENAME(s.name) + '.' + QUOTENAME(o.name),
        s.name
    FROM sys.objects o
    INNER JOIN sys.schemas s ON o.schema_id = s.schema_id
    WHERE o.type = 'P'
        AND NOT EXISTS (SELECT 1 FROM #ExcludedSchemas es WHERE es.SchemaName = s.name);

    -- Count dependencies for each procedure
    UPDATE p
    SET DependencyCount = (
        SELECT COUNT(DISTINCT d.referenced_id)
        FROM sys.sql_expression_dependencies d
        INNER JOIN sys.objects do ON d.referenced_id = do.object_id
        WHERE d.referencing_id = p.ObjectId
            AND do.type = 'P'
            AND d.referenced_id IS NOT NULL
            AND EXISTS (SELECT 1 FROM #Procedures p2 WHERE p2.ObjectId = d.referenced_id)
    )
    FROM #Procedures p;

    -- Process procedures in order of dependency count
    DECLARE @ProcessOrder INT = 1;
    DECLARE @CurrentCount INT = 0;
    DECLARE @MaxIterations INT = 100; -- Safety limit
    DECLARE @Iteration INT = 0;

    -- First, process all procedures with no dependencies
    UPDATE #Procedures
    SET IsProcessed = 1, ProcessOrder = @ProcessOrder
    WHERE DependencyCount = 0;

    -- Then process remaining procedures
    WHILE EXISTS (SELECT 1 FROM #Procedures WHERE IsProcessed = 0) AND @Iteration < @MaxIterations
    BEGIN
        SET @Iteration = @Iteration + 1;
        SET @ProcessOrder = @ProcessOrder + 1;
        
        -- Mark procedures as ready if all their dependencies are processed
        UPDATE p
        SET IsProcessed = 1, ProcessOrder = @ProcessOrder
        FROM #Procedures p
        WHERE p.IsProcessed = 0
            AND NOT EXISTS (
                SELECT 1
                FROM sys.sql_expression_dependencies d
                INNER JOIN #Procedures dp ON dp.ObjectId = d.referenced_id
                WHERE d.referencing_id = p.ObjectId
                    AND dp.IsProcessed = 0
            );
            
        -- If nothing was processed in this iteration, process remaining (circular dependencies)
        IF @@ROWCOUNT = 0
        BEGIN
            UPDATE #Procedures
            SET IsProcessed = 1, ProcessOrder = 999
            WHERE IsProcessed = 0;
            BREAK;
        END
    END

    -- Execute recompilation in order
    DECLARE @SQL NVARCHAR(MAX);
    DECLARE @ObjectName NVARCHAR(260);
    DECLARE @Success INT = 0, @Errors INT = 0;
    DECLARE @StartTime DATETIME = GETDATE();

    DECLARE obj_cursor CURSOR FOR
    SELECT FullObjectName
    FROM #Procedures
    ORDER BY ProcessOrder, FullObjectName;

    OPEN obj_cursor;
    FETCH NEXT FROM obj_cursor INTO @ObjectName;

    WHILE @@FETCH_STATUS = 0
    BEGIN
        SET @SQL = 'EXEC sp_recompile ''' + @ObjectName + '''';
        
        BEGIN TRY
            EXEC sp_executesql @SQL;
            SET @Success = @Success + 1;
            
            IF @LogOutput = 1
                PRINT 'SUCCESS: Recompiled ' + @ObjectName;
        END TRY
        BEGIN CATCH
            SET @Errors = @Errors + 1;
            
            IF @LogOutput = 1
                PRINT 'ERROR: ' + @ObjectName + ' - ' + ERROR_MESSAGE();
            
            IF @ContinueOnError = 0
            BEGIN
                CLOSE obj_cursor;
                DEALLOCATE obj_cursor;
                THROW;
            END
        END CATCH
        
        FETCH NEXT FROM obj_cursor INTO @ObjectName;
    END

    CLOSE obj_cursor;
    DEALLOCATE obj_cursor;

    -- Summary report
    IF @LogOutput = 1
    BEGIN
        DECLARE @Duration INT = DATEDIFF(SECOND, @StartTime, GETDATE());
        DECLARE @TotalObjects INT = (SELECT COUNT(*) FROM #Procedures);
        
        PRINT '';
        PRINT '=== Recompilation Summary ===';
        PRINT 'Total Objects: ' + CAST(@TotalObjects AS VARCHAR(10));
        PRINT 'Successful Recompilations: ' + CAST(@Success AS VARCHAR(10));
        PRINT 'Errors: ' + CAST(@Errors AS VARCHAR(10));
        PRINT 'Duration: ' + CAST(@Duration AS VARCHAR(10)) + ' seconds';
        PRINT '===========================';
    END

    -- Clean up
    DROP TABLE #Procedures;
    DROP TABLE #ExcludedSchemas;
END
GO

-- Add extended property description
EXEC sp_addextendedproperty 
    @name = N'MS_Description',
    @value = N'Recompiles all stored procedures in dependency order, preserving code, comments, and permissions. This forces SQL Server to create new execution plans without dropping/recreating procedures. Excludes specified schemas and handles circular dependencies gracefully.',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'PROCEDURE', @level1name = 'spRecompileAllProceduresInDependencyOrder';