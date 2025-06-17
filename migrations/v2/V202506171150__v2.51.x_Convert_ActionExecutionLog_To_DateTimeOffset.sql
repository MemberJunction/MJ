-- Convert ActionExecutionLog datetime columns to datetimeoffset to handle timezone issues
-- This prevents timezone mismatches between StartedAt and EndedAt columns

-- Drop existing default constraints on StartedAt column if they exist
DECLARE @StartedAtDefaultName NVARCHAR(128)
SELECT @StartedAtDefaultName = dc.name
FROM sys.default_constraints dc
INNER JOIN sys.columns c ON dc.parent_object_id = c.object_id AND dc.parent_column_id = c.column_id
WHERE dc.parent_object_id = OBJECT_ID('${flyway:defaultSchema}.ActionExecutionLog')
AND c.name = 'StartedAt'

IF @StartedAtDefaultName IS NOT NULL
BEGIN
    EXEC('ALTER TABLE ${flyway:defaultSchema}.ActionExecutionLog DROP CONSTRAINT ' + @StartedAtDefaultName)
END

-- Drop existing default constraints on EndedAt column if they exist
DECLARE @EndedAtDefaultName NVARCHAR(128)
SELECT @EndedAtDefaultName = dc.name
FROM sys.default_constraints dc
INNER JOIN sys.columns c ON dc.parent_object_id = c.object_id AND dc.parent_column_id = c.column_id
WHERE dc.parent_object_id = OBJECT_ID('${flyway:defaultSchema}.ActionExecutionLog')
AND c.name = 'EndedAt'

IF @EndedAtDefaultName IS NOT NULL
BEGIN
    EXEC('ALTER TABLE ${flyway:defaultSchema}.ActionExecutionLog DROP CONSTRAINT ' + @EndedAtDefaultName)
END

-- Convert StartedAt column
ALTER TABLE ${flyway:defaultSchema}.ActionExecutionLog
ALTER COLUMN StartedAt datetimeoffset NOT NULL;

-- Convert EndedAt column
ALTER TABLE ${flyway:defaultSchema}.ActionExecutionLog
ALTER COLUMN EndedAt datetimeoffset NULL;

-- Add default constraint for StartedAt
ALTER TABLE ${flyway:defaultSchema}.ActionExecutionLog
ADD CONSTRAINT DF_ActionExecutionLog_StartedAt DEFAULT SYSDATETIMEOFFSET() FOR StartedAt;

-- Update the view to handle the new column types
-- The view should automatically handle the conversion, but we'll regenerate it to be safe
-- Note: The CodeGen system will regenerate the view with proper handling for datetimeoffset

-- Drop existing extended properties if they exist before adding new ones
IF EXISTS (
    SELECT 1 
    FROM sys.extended_properties 
    WHERE major_id = OBJECT_ID('${flyway:defaultSchema}.ActionExecutionLog') 
    AND minor_id = COLUMNPROPERTY(OBJECT_ID('${flyway:defaultSchema}.ActionExecutionLog'), 'StartedAt', 'ColumnId')
    AND name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty 
        @name = N'MS_Description',
        @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
        @level1type = N'TABLE',  @level1name = 'ActionExecutionLog',
        @level2type = N'COLUMN', @level2name = 'StartedAt';
END

IF EXISTS (
    SELECT 1 
    FROM sys.extended_properties 
    WHERE major_id = OBJECT_ID('${flyway:defaultSchema}.ActionExecutionLog') 
    AND minor_id = COLUMNPROPERTY(OBJECT_ID('${flyway:defaultSchema}.ActionExecutionLog'), 'EndedAt', 'ColumnId')
    AND name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty 
        @name = N'MS_Description',
        @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
        @level1type = N'TABLE',  @level1name = 'ActionExecutionLog',
        @level2type = N'COLUMN', @level2name = 'EndedAt';
END

-- Add extended property to indicate these are timezone-aware columns
EXEC sp_addextendedproperty 
    @name = N'MS_Description',
    @value = N'Timestamp when the action execution started (timezone-aware)',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = 'ActionExecutionLog',
    @level2type = N'COLUMN', @level2name = 'StartedAt';

EXEC sp_addextendedproperty 
    @name = N'MS_Description',
    @value = N'Timestamp when the action execution ended (timezone-aware)',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = 'ActionExecutionLog',
    @level2type = N'COLUMN', @level2name = 'EndedAt';