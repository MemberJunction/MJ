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


DROP VIEW IF EXISTS ${flyway:defaultSchema}.vwEntityFieldsWithCheckConstraints
GO
CREATE VIEW ${flyway:defaultSchema}.vwEntityFieldsWithCheckConstraints
AS
SELECT 
	  e.ID as EntityID,
	  e.Name as EntityName,
    ef.ID as EntityFieldID,
    ef.Name as EntityFieldName,
    ef.GeneratedValidationFunctionName,
    ef.GeneratedValidationFunctionDescription,
    ef.GeneratedValidationFunctionCode,
    ef.GeneratedValidationFunctionCheckConstraint,
    sch.name AS SchemaName,
    obj.name AS TableName,
    col.name AS ColumnName,
    cc.name AS ConstraintName,
    cc.definition AS ConstraintDefinition
FROM 
    sys.check_constraints cc
INNER JOIN 
    sys.objects obj ON cc.parent_object_id = obj.object_id
INNER JOIN 
    sys.schemas sch ON obj.schema_id = sch.schema_id
INNER JOIN 
    sys.columns col ON col.object_id = obj.object_id AND col.column_id = cc.parent_column_id
INNER JOIN
	${flyway:defaultSchema}.Entity e
	ON
	e.SchemaName = sch.Name AND
	e.BaseTable = obj.name
INNER JOIN
  ${flyway:defaultSchema}.EntityField ef
  ON
  e.ID = ef.EntityID AND
  ef.Name = col.name
GO
