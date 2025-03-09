-- Fix incorrect sequence in metadata for Conversation Details - fix bug in 2.27.x build

UPDATE ${flyway:defaultSchema}.EntityField SET Sequence=15 WHERE ID='6D4317F0-6F36-EF11-86D4-6045BDEE16E6' -- update Conversation virtual field to be correct sequence in the Conversation Detail entity


-- Remove duplicate constraint for Entity Field table
ALTER TABLE ${flyway:defaultSchema}.EntityField
  DROP CONSTRAINT CK_ValueListType 

ALTER TABLE ${flyway:defaultSchema}.EntityField
  DROP CONSTRAINT CK_EntityField_ValueListType

ALTER TABLE ${flyway:defaultSchema}.EntityField
  ADD CONSTRAINT CK_EntityField_ValueListType_New CHECK (ValueListType IN ('None','List','ListOrUserEntry'))


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




-- CHECK constraint for AI Models.SpeedRank was newly set or modified since the last generation of the validation function, the code was regenerated and updating the EntityField table with the new generated validation function
UPDATE [${flyway:defaultSchema}].[EntityField] SET 
  GeneratedValidationFunctionCheckConstraint='([SpeedRank]>=(0))', 
  GeneratedValidationFunctionCode='public ValidateSpeedRank(result: ValidationResult) {
	if (this.SpeedRank < 0) {
		result.Errors.push(new ValidationErrorInfo(''SpeedRank'', ''Speed rank must be zero or a positive number.'', this.SpeedRank, ValidationErrorType.Failure));
	}
}',
  GeneratedValidationFunctionDescription='This rule ensures that the speed rank must be zero or a positive number.',
  GeneratedValidationFunctionName='ValidateSpeedRank'
WHERE 
  ID='5B8E8CA9-7728-455A-A528-0F13782242C0';
-- CHECK constraint for AI Models.PowerRank was newly set or modified since the last generation of the validation function, the code was regenerated and updating the EntityField table with the new generated validation function
UPDATE [${flyway:defaultSchema}].[EntityField] SET 
  GeneratedValidationFunctionCheckConstraint='([PowerRank]>=(0))', 
  GeneratedValidationFunctionCode='public ValidatePowerRank(result: ValidationResult) {
	if (this.PowerRank < 0) {
		result.Errors.push(new ValidationErrorInfo(''PowerRank'', ''The power rank must be greater than or equal to zero.'', this.PowerRank, ValidationErrorType.Failure));
	}
}',
  GeneratedValidationFunctionDescription='This rule ensures that the power rank must be greater than or equal to zero, meaning that it cannot be negative.',
  GeneratedValidationFunctionName='ValidatePowerRank'
WHERE 
  ID='284F17F0-6F36-EF11-86D4-6045BDEE16E6';
-- CHECK constraint for AI Models.CostRank was newly set or modified since the last generation of the validation function, the code was regenerated and updating the EntityField table with the new generated validation function
UPDATE [${flyway:defaultSchema}].[EntityField] SET 
  GeneratedValidationFunctionCheckConstraint='([CostRank]>=(0))', 
  GeneratedValidationFunctionCode='public ValidateCostRank(result: ValidationResult) {\n\tif (this.CostRank < 0) {\n\t\tresult.Errors.push(new ValidationErrorInfo(''CostRank'', ''The cost rank must be zero or higher.'', this.CostRank, ValidationErrorType.Failure));\n\t} \n}',
  GeneratedValidationFunctionDescription='This rule ensures that the cost rank of an item must be zero or higher. This means that the cost rank cannot be negative.',
  GeneratedValidationFunctionName='ValidateCostRank'
WHERE 
  ID='2ED7BE95-4E39-439B-8152-D0A6516C1398';


-- CHECK constraint for Conversation Details.UserRating was newly set or modified since the last generation of the validation function, the code was regenerated and updating the EntityField table with the new generated validation function
UPDATE [${flyway:defaultSchema}].[EntityField] SET 
  GeneratedValidationFunctionCheckConstraint='([UserRating]>=(1) AND [UserRating]<=(10))', 
  GeneratedValidationFunctionCode='public ValidateUserRating(result: ValidationResult) {
	if (this.UserRating < 1 || this.UserRating > 10) {
		result.Errors.push(new ValidationErrorInfo(''UserRating'', ''The user rating must be between 1 and 10, inclusive.'', this.UserRating, ValidationErrorType.Failure));
	}
}',
  GeneratedValidationFunctionDescription='This rule ensures that the user rating is between 1 and 10, inclusive. Ratings below 1 or above 10 are not allowed.',
  GeneratedValidationFunctionName='ValidateUserRating'
WHERE 
  ID='ACAB0610-A4EA-433B-A39A-C2D6EFB46F59';


-- CHECK constraint for Explorer Navigation Items.Sequence was newly set or modified since the last generation of the validation function, the code was regenerated and updating the EntityField table with the new generated validation function
UPDATE [${flyway:defaultSchema}].[EntityField] SET 
  GeneratedValidationFunctionCheckConstraint='([Sequence]>(0))', 
  GeneratedValidationFunctionCode='public ValidateSequence(result: ValidationResult) {
	if (this.Sequence <= 0) {
		result.Errors.push(new ValidationErrorInfo(''Sequence'', ''The sequence must be greater than zero.'', this.Sequence, ValidationErrorType.Failure));
	}
}',
  GeneratedValidationFunctionDescription='This rule ensures that the sequence must be greater than zero.',
  GeneratedValidationFunctionName='ValidateSequence'
WHERE 
  ID='485BC393-E83F-EF11-86D4-0022481D1B23';


-- CHECK constraint for Recommendation Items.MatchProbability was newly set or modified since the last generation of the validation function, the code was regenerated and updating the EntityField table with the new generated validation function
UPDATE [${flyway:defaultSchema}].[EntityField] SET 
  GeneratedValidationFunctionCheckConstraint='([MatchProbability]>=(0) AND [MatchProbability]<=(1))', 
  GeneratedValidationFunctionCode='public ValidateMatchProbability(result: ValidationResult) {
	if (this.MatchProbability < 0 || this.MatchProbability > 1) {
		result.Errors.push(new ValidationErrorInfo(''MatchProbability'', ''The match probability must be between 0 and 1, inclusive.'', this.MatchProbability, ValidationErrorType.Failure));
	}
}',
  GeneratedValidationFunctionDescription='This rule ensures that the match probability value is between 0 and 1, inclusive.',
  GeneratedValidationFunctionName='ValidateMatchProbability'
WHERE 
  ID='AC5717F0-6F36-EF11-86D4-6045BDEE16E6';


/* SQL text to update entity field value sequence */
UPDATE [${flyway:defaultSchema}].EntityFieldValue SET Sequence=1 WHERE ID='C3E4423E-F36B-1410-8D9A-00021F8B792E'

/* SQL text to update entity field value sequence */
UPDATE [${flyway:defaultSchema}].EntityFieldValue SET Sequence=3 WHERE ID='B7E4423E-F36B-1410-8D9A-00021F8B792E'


/***** GET RID OF flyway schema history entity ****/
/***** CODEGEN NOW EXCLUDES THAT TABLE *****/
DECLARE @FlywayEntityID UNIQUEIDENTIFIER;
SELECT @FlywayEntityID=ID FROM ${flyway:defaultSchema}.Entity WHERE SchemaName='${flyway:defaultSchema}' AND BaseTable='flyway_schema_history';
IF (@FlywayEntityID IS NOT NULL)
BEGIN
  PRINT 'DELETING flyway_schema_history Entity Metadata'
  DELETE FROM ${flyway:defaultSchema}.ApplicationEntity WHERE EntityID=@FlywayEntityID;
  DELETE FROM ${flyway:defaultSchema}.EntityRelationship WHERE RelatedEntityID = @FlywayEntityID OR EntityID = @FlywayEntityID;
  DELETE FROM ${flyway:defaultSchema}.EntityFieldValue WHERE EntityFieldID IN ( SELECT ID FROM ${flyway:defaultSchema}.EntityField WHERE EntityID=@FlywayEntityID);
  DELETE FROM ${flyway:defaultSchema}.EntityPermission WHERE EntityID = @FlywayEntityID;
  DELETE FROM ${flyway:defaultSchema}.EntityField WHERE EntityID = @FlywayEntityID;
  DELETE FROM ${flyway:defaultSchema}.Entity WHERE ID = @FlywayEntityID;
END
ELSE
BEGIN
  PRINT 'No flyway_schema_history entity in place, doing nothing'
END