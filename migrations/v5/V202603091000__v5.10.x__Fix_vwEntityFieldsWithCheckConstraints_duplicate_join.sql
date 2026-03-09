-- Fix duplicate GeneratedCode records caused by overly restrictive JOIN in vwEntityFieldsWithCheckConstraints.
-- The view previously required cc.definition = gc.Source in the LEFT OUTER JOIN, which meant any whitespace
-- or formatting difference between the current CHECK constraint text and the stored Source caused the JOIN
-- to fail, returning GeneratedCodeID as NULL. This made CodeGen INSERT a new GeneratedCode record instead
-- of UPDATing the existing one, producing duplicates on every run.
--
-- The Source comparison is already handled downstream in manage-metadata.ts where
-- generateValidatorFunctionFromCheckConstraint() compares generatedValidationFunctionCheckConstraint === constraintDefinition
-- to decide whether to regenerate. The view does not need to enforce it at the JOIN level.

-- First, drop the existing view
DROP VIEW IF EXISTS [${flyway:defaultSchema}].[vwEntityFieldsWithCheckConstraints]
GO

-- Recreate the view without the cc.definition = gc.Source condition
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
    ON -- EITHER JOIN ON EntityField or Entity depending on which type of constraint we have here
    (   (ef.ID IS NOT NULL AND gc.LinkedEntity='MJ: Entity Fields' AND gc.LinkedRecordPrimaryKey=ef.ID)
        OR
        (ef.ID IS NULL AND gc.LinkedEntity='MJ: Entities' AND gc.LinkedRecordPrimaryKey=e.ID)
    )
GO
