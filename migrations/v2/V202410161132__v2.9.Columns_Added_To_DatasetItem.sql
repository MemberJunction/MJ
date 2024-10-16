-- Add a new column `Columns` to the `DatasetItem` table
ALTER TABLE ${flyway:defaultSchema}.DatasetItem
ADD Columns NVARCHAR(MAX) NULL;

-- Add an extended property for the `Columns` column with a description
EXEC sp_addextendedproperty 
    @name = N'MS_Description', 
    @value = N'Optional column to store a comma-delimited list of columns for the DatasetItem', 
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', 
    @level1type = N'TABLE',  @level1name = N'DatasetItem', 
    @level2type = N'COLUMN', @level2name = N'Columns';
 