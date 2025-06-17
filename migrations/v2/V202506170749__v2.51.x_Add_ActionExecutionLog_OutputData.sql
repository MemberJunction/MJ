/**
 * Migration: Add OutputData field to ActionExecutionLog table
 * Version: 2.51.x
 * Description: Adds a new column to store the output/response data from action executions
 */

-- Add OutputData column to ActionExecutionLog table
ALTER TABLE ${flyway:defaultSchema}.ActionExecutionLog 
ADD OutputData NVARCHAR(MAX) NULL;

-- Add extended property description for the new column
EXEC sp_addextendedproperty 
    @name = N'MS_Description',
    @value = N'JSON-formatted output data or response from the action execution',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = 'ActionExecutionLog',
    @level2type = N'COLUMN', @level2name = 'OutputData';

-- Update the vwActionExecutionLogs view to include the new column
-- The view is managed by CodeGen, so we don't modify it directly here
-- The next CodeGen run will automatically pick up this new column