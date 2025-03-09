ALTER TABLE ${flyway:defaultSchema}.EntityField
ADD 
    GeneratedValidationFunctionName NVARCHAR(255) NULL,
    GeneratedValidationFunctionDescription NVARCHAR(MAX) NULL,
    GeneratedValidationFunctionCode NVARCHAR(MAX) NULL,
    GeneratedValidationFunctionCheckConstraint NVARCHAR(MAX) NULL;

-- Add extended properties for documentation
EXEC sp_addextendedproperty 
    @name = 'MS_Description', 
    @value = 'Contains the name of the generated field validation function, if it exists, null otherwise', 
    @level0type = 'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = 'TABLE',  @level1name = 'EntityField',
    @level2type = 'COLUMN', @level2name = 'GeneratedValidationFunctionName';

EXEC sp_addextendedproperty 
    @name = 'MS_Description', 
    @value = 'Contains a description for business users of what the validation function for this field does, if it exists', 
    @level0type = 'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = 'TABLE',  @level1name = 'EntityField',
    @level2type = 'COLUMN', @level2name = 'GeneratedValidationFunctionDescription';

EXEC sp_addextendedproperty 
    @name = 'MS_Description', 
    @value = 'Contains the generated code for the field validation function, if it exists, null otherwise.', 
    @level0type = 'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = 'TABLE',  @level1name = 'EntityField',
    @level2type = 'COLUMN', @level2name = 'GeneratedValidationFunctionCode';

EXEC sp_addextendedproperty 
    @name = 'MS_Description', 
    @value = 'If a generated validation function was generated previously, this stores the text from the source CHECK constraint in the database. This is stored so that regeneration of the validation function will only occur when the source CHECK constraint changes.', 
    @level0type = 'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = 'TABLE',  @level1name = 'EntityField',
    @level2type = 'COLUMN', @level2name = 'GeneratedValidationFunctionCheckConstraint';

GO


DROP VIEW IF EXISTS [${flyway:defaultSchema}].vwEntityFields
GO
CREATE VIEW [${flyway:defaultSchema}].vwEntityFields
AS
SELECT
	ef.*,
  ${flyway:defaultSchema}.GetProgrammaticName(REPLACE(ef.Name,' ','')) AS FieldCodeName,
	e.Name Entity,
	e.SchemaName,
	e.BaseTable,
	e.BaseView,
	e.CodeName EntityCodeName,
	e.ClassName EntityClassName,
	re.Name RelatedEntity,
	re.SchemaName RelatedEntitySchemaName,
	re.BaseTable RelatedEntityBaseTable,
	re.BaseView RelatedEntityBaseView,
	re.CodeName RelatedEntityCodeName,
	re.ClassName RelatedEntityClassName
FROM
	[${flyway:defaultSchema}].EntityField ef
INNER JOIN
	[${flyway:defaultSchema}].vwEntities e ON ef.EntityID = e.ID
LEFT OUTER JOIN
	[${flyway:defaultSchema}].vwEntities re ON ef.RelatedEntityID = re.ID
GO
