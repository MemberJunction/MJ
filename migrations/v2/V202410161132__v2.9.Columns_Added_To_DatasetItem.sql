-- Add a new column `Columns` to the `DatasetItem` table
ALTER TABLE ${flyway:defaultSchema}.DatasetItem
ADD [Columns] NVARCHAR(MAX) NULL;

-- Add an extended property for the `Columns` column with a description
EXEC sp_addextendedproperty 
    @name = N'MS_Description', 
    @value = N'Optional column to store a comma-delimited list of columns for the DatasetItem', 
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', 
    @level1type = N'TABLE',  @level1name = N'DatasetItem', 
    @level2type = N'COLUMN', @level2name = N'Columns';


/* SQL text to insert new entity field */

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
    '27c482c1-9ad9-42ba-8aac-5584a66974d3',
    '11248F34-2837-EF11-86D4-6045BDEE16E6',
    11,
    'Columns',
    'Columns',
    'Optional column to store a comma-delimited list of columns for the DatasetItem',
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

/* SQL text to update entity field value sequence */
UPDATE [${flyway:defaultSchema}].EntityFieldValue SET Sequence=1 WHERE ID='C051302D-7236-EF11-86D4-6045BDEE16E6'

/* SQL text to update entity field value sequence */
UPDATE [${flyway:defaultSchema}].EntityFieldValue SET Sequence=3 WHERE ID='BE51302D-7236-EF11-86D4-6045BDEE16E6'

/* SQL text to delete entity field value ID B5E76A3E-E68A-EF11-8473-6045BDF077EE */
DELETE FROM [${flyway:defaultSchema}].EntityFieldValue WHERE ID='B5E76A3E-E68A-EF11-8473-6045BDF077EE'

/* SQL text to update entity field value sequence */
UPDATE [${flyway:defaultSchema}].EntityFieldValue SET Sequence=1 WHERE ID='B9E76A3E-E68A-EF11-8473-6045BDF077EE'

/* SQL text to delete unneeded entity fields */
EXEC [${flyway:defaultSchema}].spDeleteUnneededEntityFields @ExcludedSchemaNames='sys,staging'

/* SQL text to update existingg entity fields from schema */
EXEC [${flyway:defaultSchema}].spUpdateExistingEntityFieldsFromSchema @ExcludedSchemaNames='sys,staging'

/* SQL text to set default column width where needed */
EXEC ${flyway:defaultSchema}.spSetDefaultColumnWidthWhereNeeded @ExcludedSchemaNames='sys,staging'

