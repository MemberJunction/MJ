-- Fix vwEntityFieldsWithCheckConstraints to correctly match CHECK constraints to their GeneratedCode records.
--
-- The original view used cc.definition = gc.Source in the LEFT JOIN, which correctly mapped each constraint
-- to its specific GeneratedCode record. However, for table-level constraints this was the ONLY way to
-- distinguish between multiple GeneratedCode records for the same entity, since they all share the same
-- LinkedRecordPrimaryKey (the Entity ID).
--
-- The cc.definition = gc.Source comparison is required for table-level constraints to avoid a cross-join
-- (each constraint being paired with ALL GeneratedCode records for that entity). Without it, CodeGen sees
-- mismatched Source values and generates new validators on every run.
--
-- For column-level constraints, the JOIN already produces one-to-one matches via gc.LinkedRecordPrimaryKey=ef.ID,
-- so the Source comparison is only needed in the table-level branch.

-- First, drop the existing view
DROP VIEW IF EXISTS [${flyway:defaultSchema}].[vwEntityFieldsWithCheckConstraints]
GO

-- Recreate the view with cc.definition = gc.Source for table-level constraints
CREATE VIEW [${flyway:defaultSchema}].[vwEntityFieldsWithCheckConstraints]
AS
SELECT
    e.ID as EntityID,
    e.Name as EntityName,
    ef.ID as EntityFieldID,
    ef.Name as EntityFieldName,
    gc.ID as GeneratedCodeID,
    gc.Name as GeneratedValidationFunctionName,
    gc.Description as GeneratedValidationFunctionDescription,
    gc.Code as GeneratedValidationFunctionCode,
    gc.Source as GeneratedValidationFunctionCheckConstraint,
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
    ${flyway:defaultSchema}.Entity e
    ON
    e.SchemaName = sch.Name AND
    e.BaseTable = obj.name
LEFT OUTER JOIN -- left join since can have table level constraints
    sys.columns col ON col.object_id = obj.object_id AND col.column_id = cc.parent_column_id
LEFT OUTER JOIN -- left join since can have table level constraints
    ${flyway:defaultSchema}.EntityField ef
    ON
    e.ID = ef.EntityID AND
    ef.Name = col.name
LEFT OUTER JOIN
    ${flyway:defaultSchema}.vwGeneratedCodes gc
    ON
    (   (ef.ID IS NOT NULL AND gc.LinkedEntity='MJ: Entity Fields' AND gc.LinkedRecordPrimaryKey=ef.ID)
        OR
        (ef.ID IS NULL AND gc.LinkedEntity='MJ: Entities' AND gc.LinkedRecordPrimaryKey=e.ID AND cc.definition = gc.Source)
    )
GO

-- Cleanup duplicate GeneratedCode validator records.
-- Two passes are needed:
--   1. Dedup by Source + LinkedRecordPrimaryKey: removes records where the same constraint definition
--      was generated multiple times with different function names (the LLM generates different names each run).
--   2. Dedup by Name + LinkedRecordPrimaryKey: removes records where the same function name was
--      generated multiple times (exact duplicates from repeated CodeGen runs).

-- Pass 1: Keep one record per unique (Source, LinkedRecordPrimaryKey)
;WITH Ranked AS (
    SELECT
        ID,
        ROW_NUMBER() OVER (
            PARTITION BY Source, LinkedRecordPrimaryKey
            ORDER BY __mj_CreatedAt ASC
        ) AS RowNum
    FROM [${flyway:defaultSchema}].GeneratedCode
    WHERE CategoryID = (SELECT ID FROM [${flyway:defaultSchema}].GeneratedCodeCategory WHERE Name = 'CodeGen: Validators')
)
DELETE FROM [${flyway:defaultSchema}].GeneratedCode
WHERE ID IN (
    SELECT ID FROM Ranked WHERE RowNum > 1
);

-- Pass 2: Keep one record per unique (Name, LinkedRecordPrimaryKey)
;WITH Ranked AS (
    SELECT
        ID,
        ROW_NUMBER() OVER (
            PARTITION BY Name, LinkedRecordPrimaryKey
            ORDER BY __mj_CreatedAt ASC
        ) AS RowNum
    FROM [${flyway:defaultSchema}].GeneratedCode
    WHERE CategoryID = (SELECT ID FROM [${flyway:defaultSchema}].GeneratedCodeCategory WHERE Name = 'CodeGen: Validators')
)
DELETE FROM [${flyway:defaultSchema}].GeneratedCode
WHERE ID IN (
    SELECT ID FROM Ranked WHERE RowNum > 1
);


/* Generated Validation Functions for MJ: AI Agent Run Steps */
-- CHECK constraint for MJ: AI Agent Run Steps: Field: FinalPayloadValidationResult was newly set or modified since the last generation of the validation function, the code was regenerated and updating the GeneratedCode table with the new generated validation function
UPDATE [${flyway:defaultSchema}].[GeneratedCode] SET
                        Source='([FinalPayloadValidationResult] IS NULL OR [FinalPayloadValidationResult]=''Warn'' OR [FinalPayloadValidationResult]=''Fail'' OR [FinalPayloadValidationResult]=''Retry'' OR [FinalPayloadValidationResult]=''Pass'')',
                        Code='public ValidateFinalPayloadValidationResultStatus(result: ValidationResult) {
	if (this.FinalPayloadValidationResult != null) {
		const allowedValues = ["Warn", "Fail", "Retry", "Pass"];
		if (allowedValues.indexOf(this.FinalPayloadValidationResult) === -1) {
			result.Errors.push(new ValidationErrorInfo(
				"FinalPayloadValidationResult",
				"The validation result must be one of the following values: " + allowedValues.join(", ") + ".",
				this.FinalPayloadValidationResult,
				ValidationErrorType.Failure
			));
		}
	}
}',
                        Description='The final payload validation result must be one of the approved statuses: Warn, Fail, Retry, or Pass, to ensure consistent reporting of validation outcomes.',
                        Name='ValidateFinalPayloadValidationResultStatus',
                        GeneratedAt=GETUTCDATE(),
                        GeneratedByModelID='7B31F48E-EDA3-47B4-9602-D98B7EB1AF45'
                     WHERE
                        ID='1DC5433E-F36B-1410-867F-007B559E242F';


