/*
 * Migration: Update unique constraint on __mj.[Action] table
 * Version: 2.63.x
 * 
 * This migration:
 * 1. Drops existing unique constraints on the Name column
 * 2. Adds a new composite unique constraint on (Name, CategoryID, ParentID)
 * 3. Treats NULL values as distinct values in the constraint
 */

-- First, check for any duplicate entries that would violate the new constraint
DECLARE @DuplicateCount INT;
DECLARE @DuplicateActions TABLE (
    Name NVARCHAR(425),
    CategoryID UNIQUEIDENTIFIER,
    ParentID UNIQUEIDENTIFIER,
    ActionCount INT
);

-- Find any combinations that would be duplicates under the new constraint
INSERT INTO @DuplicateActions (Name, CategoryID, ParentID, ActionCount)
SELECT 
    Name,
    CategoryID,
    ParentID,
    COUNT(*) AS ActionCount
FROM [${flyway:defaultSchema}].[Action]
GROUP BY Name, CategoryID, ParentID
HAVING COUNT(*) > 1;

-- Get the count of duplicate combinations
SELECT @DuplicateCount = COUNT(*) FROM @DuplicateActions;

-- If duplicates exist, display them and fail the migration
IF @DuplicateCount > 0
BEGIN
    PRINT '';
    PRINT '========================================================================================================';
    PRINT 'ERROR: DUPLICATE ACTION COMBINATIONS FOUND';
    PRINT '========================================================================================================';
    PRINT '';
    PRINT 'This migration cannot proceed because duplicate combinations of (Name, CategoryID, ParentID) were found.';
    PRINT 'These must be resolved before the new composite unique constraint can be added.';
    PRINT '';
    PRINT 'DUPLICATE COMBINATIONS:';
    PRINT '-----------------------';
    
    -- Display the duplicate combinations
    SELECT 
        a.ID,
        a.Name,
        a.CategoryID,
        ac.Name AS CategoryName,
        a.ParentID,
        p.Name AS ParentName,
        a.Type,
        a.Status,
        a.__mj_CreatedAt,
        a.__mj_UpdatedAt
    FROM [${flyway:defaultSchema}].[Action] a
    LEFT JOIN [${flyway:defaultSchema}].[ActionCategory] ac ON a.CategoryID = ac.ID
    LEFT JOIN [${flyway:defaultSchema}].[Action] p ON a.ParentID = p.ID
    INNER JOIN @DuplicateActions d ON 
        a.Name = d.Name AND 
        (a.CategoryID = d.CategoryID OR (a.CategoryID IS NULL AND d.CategoryID IS NULL)) AND
        (a.ParentID = d.ParentID OR (a.ParentID IS NULL AND d.ParentID IS NULL))
    ORDER BY a.Name, a.CategoryID, a.ParentID, a.__mj_CreatedAt;
    
    PRINT '';
    PRINT 'INSTRUCTIONS TO RESOLVE:';
    PRINT '------------------------';
    PRINT '1. Review the duplicate action records shown above';
    PRINT '2. Determine which actions should be kept for each duplicate combination';
    PRINT '3. Options for resolution:';
    PRINT '   a) Rename duplicate actions to make them unique within their category/parent context';
    PRINT '   b) Move actions to different categories or assign different parents';
    PRINT '   c) Delete duplicate actions (ensure no execution logs or dependencies exist)';
    PRINT '4. After resolving all duplicates, run this migration again';
    PRINT '';
    PRINT 'Example SQL to rename an action:';
    PRINT '  UPDATE [__mj].[Action] SET Name = ''NewActionName'' WHERE ID = ''[action-id-here]'';';
    PRINT '';
    PRINT 'Example SQL to check for related data:';
    PRINT '  SELECT * FROM [__mj].[ActionExecutionLog] WHERE ActionID = ''[action-id-here]'';';
    PRINT '  SELECT * FROM [__mj].[ActionParam] WHERE ActionID = ''[action-id-here]'';';
    PRINT '';
    PRINT '========================================================================================================';
    
    -- Fail the migration
    RAISERROR('Migration failed due to duplicate action combinations. See detailed instructions above.', 16, 1);
    RETURN;
END;

-- Drop existing unique constraints on Name column
PRINT 'Checking for existing unique constraints on Action.Name...';

-- Find all unique constraints and indexes on just the Name column
DECLARE @ConstraintName NVARCHAR(128);
DECLARE @IsConstraint BIT;
DECLARE constraint_cursor CURSOR FOR
    -- Find unique constraints
    SELECT 
        kc.name AS constraint_name,
        1 AS is_constraint
    FROM sys.key_constraints kc
    INNER JOIN sys.index_columns ic ON kc.parent_object_id = ic.object_id AND kc.unique_index_id = ic.index_id
    INNER JOIN sys.columns c ON ic.object_id = c.object_id AND ic.column_id = c.column_id
    WHERE kc.parent_object_id = OBJECT_ID('[${flyway:defaultSchema}].[Action]')
    AND kc.type = 'UQ'  -- Unique constraint
    AND c.name = 'Name'
    AND ic.key_ordinal = 1  -- Name is the first column
    AND NOT EXISTS (  -- No other columns in the constraint
        SELECT 1 
        FROM sys.index_columns ic2 
        WHERE ic2.object_id = ic.object_id 
        AND ic2.index_id = ic.index_id 
        AND ic2.key_ordinal > 1
    )
    
    UNION ALL
    
    -- Find unique indexes that are not constraints
    SELECT 
        i.name AS constraint_name,
        0 AS is_constraint
    FROM sys.indexes i
    INNER JOIN sys.index_columns ic ON i.object_id = ic.object_id AND i.index_id = ic.index_id
    INNER JOIN sys.columns c ON ic.object_id = c.object_id AND ic.column_id = c.column_id
    WHERE i.object_id = OBJECT_ID('[${flyway:defaultSchema}].[Action]')
    AND i.is_unique = 1
    AND i.is_primary_key = 0
    AND i.is_unique_constraint = 0  -- Not a constraint, just an index
    AND c.name = 'Name'
    AND ic.key_ordinal = 1  -- Name is the first column
    AND NOT EXISTS (  -- No other columns in the index
        SELECT 1 
        FROM sys.index_columns ic2 
        WHERE ic2.object_id = i.object_id 
        AND ic2.index_id = i.index_id 
        AND ic2.key_ordinal > 1
    );

OPEN constraint_cursor;
FETCH NEXT FROM constraint_cursor INTO @ConstraintName, @IsConstraint;

WHILE @@FETCH_STATUS = 0
BEGIN
    DECLARE @DropSQL NVARCHAR(500);
    
    IF @IsConstraint = 1
    BEGIN
        -- Drop as a constraint
        SET @DropSQL = 'ALTER TABLE [${flyway:defaultSchema}].[Action] DROP CONSTRAINT [' + @ConstraintName + ']';
        PRINT 'Dropping constraint: ' + @ConstraintName;
    END
    ELSE
    BEGIN
        -- Drop as an index
        SET @DropSQL = 'DROP INDEX [' + @ConstraintName + '] ON [${flyway:defaultSchema}].[Action]';
        PRINT 'Dropping index: ' + @ConstraintName;
    END
    
    EXEC sp_executesql @DropSQL;
    PRINT 'Successfully dropped: ' + @ConstraintName;
    
    FETCH NEXT FROM constraint_cursor INTO @ConstraintName, @IsConstraint;
END;

CLOSE constraint_cursor;
DEALLOCATE constraint_cursor;

-- Add new composite unique constraint
-- SQL Server treats NULL values as distinct in unique constraints by default
PRINT '';
PRINT 'Adding new composite unique constraint...';

IF NOT EXISTS (
    SELECT 1 
    FROM sys.indexes 
    WHERE name = 'UQ_Action_Name_CategoryID_ParentID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[Action]')
)
BEGIN
    ALTER TABLE [${flyway:defaultSchema}].[Action]
    ADD CONSTRAINT UQ_Action_Name_CategoryID_ParentID 
    UNIQUE (Name, CategoryID, ParentID);
    
    PRINT 'Successfully added unique constraint UQ_Action_Name_CategoryID_ParentID';
    PRINT 'This constraint allows:';
    PRINT '  - Multiple actions with the same name in different categories';
    PRINT '  - Multiple actions with the same name under different parents';
    PRINT '  - NULL values are treated as distinct (SQL Server default behavior)';
END
ELSE
BEGIN
    PRINT 'Unique constraint UQ_Action_Name_CategoryID_ParentID already exists';
END;

-- Update the extended property for the Name column to reflect the new constraint
EXEC sp_addextendedproperty 
    @name = N'MS_Description', 
    @value = N'The name of the action. Must be unique within the combination of CategoryID and ParentID. Actions with the same name can exist in different categories or under different parents.', 
    @level0type = N'SCHEMA', @level0name = N'__mj',
    @level1type = N'TABLE',  @level1name = N'Action',
    @level2type = N'COLUMN', @level2name = N'Name';

PRINT '';
PRINT 'Migration completed successfully!';
PRINT 'Actions can now have duplicate names as long as they have different CategoryID or ParentID values.';