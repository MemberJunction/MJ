-- ============================================================================
-- MemberJunction PostgreSQL Migration
-- Converted from SQL Server using TypeScript conversion pipeline
-- ============================================================================

-- Extensions
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Schema
CREATE SCHEMA IF NOT EXISTS __mj;
SET search_path TO __mj, public;

-- Ensure backslashes in string literals are treated literally (not as escape sequences)
SET standard_conforming_strings = on;

-- Implicit INTEGER -> BOOLEAN cast (SQL Server BIT columns accept 0/1 in INSERTs)
-- PostgreSQL has a built-in explicit-only INTEGER->bool cast. We upgrade it to implicit
-- so INSERT VALUES with 0/1 for BOOLEAN columns work like SQL Server BIT.
UPDATE pg_cast SET castcontext = 'i'
WHERE castsource = 'integer'::regtype AND casttarget = 'boolean'::regtype;


-- ===================== Views =====================

CREATE OR REPLACE VIEW __mj."vwEntityFieldsWithCheckConstraints" AS
SELECT
    e."ID"                                     AS "EntityID",
    e."Name"                                   AS "EntityName",
    ef."ID"                                    AS "EntityFieldID",
    ef."Name"                                  AS "EntityFieldName",
    gc."ID"                                    AS "GeneratedCodeID",
    gc."Name"                                  AS "GeneratedValidationFunctionName",
    gc."Description"                           AS "GeneratedValidationFunctionDescription",
    gc."Code"                                  AS "GeneratedValidationFunctionCode",
    gc."Source"                                AS "GeneratedValidationFunctionCheckConstraint",
    n.nspname                                  AS "SchemaName",
    c.relname                                  AS "TableName",
    a.attname                                  AS "ColumnName",
    con.conname                                AS "ConstraintName",
    pg_get_constraintdef(con.oid)              AS "ConstraintDefinition"
FROM
    pg_catalog.pg_constraint con
INNER JOIN
    pg_catalog.pg_class c ON con.conrelid = c.oid
INNER JOIN
    pg_catalog.pg_namespace n ON c.relnamespace = n.oid
INNER JOIN
    __mj."Entity" e
        ON e."SchemaName" = n.nspname
        AND e."BaseTable" = c.relname
LEFT OUTER JOIN
    pg_catalog.pg_attribute a
        ON a.attrelid = c.oid
        AND array_length(con.conkey, 1) = 1
        AND a.attnum = con.conkey[1]
LEFT OUTER JOIN
    __mj."EntityField" ef
        ON e."ID" = ef."EntityID"
        AND ef."Name" = a.attname
LEFT OUTER JOIN
    __mj."vwGeneratedCodes" gc
        ON (
            (ef."ID" IS NOT NULL AND gc."LinkedEntity" = 'MJ: Entity Fields' AND gc."LinkedRecordPrimaryKey" = CAST(ef."ID" AS TEXT))
            OR
            (ef."ID" IS NULL AND gc."LinkedEntity" = 'MJ: Entities' AND gc."LinkedRecordPrimaryKey" = CAST(e."ID" AS TEXT))
        )
        AND pg_get_constraintdef(con.oid) = gc."Source"
WHERE
    con.contype = 'c';


-- ===================== Data (INSERT/UPDATE/DELETE) =====================

DELETE FROM "__mj"."GeneratedCode"
WHERE "ID" IN (
    SELECT "ID" FROM "Ranked" WHERE "RowNum" > 1
);

-- Pass 2: Keep one record per unique (Name, LinkedRecordPrimaryKey)
;WITH "Ranked" AS (
    SELECT
        "ID",
        ROW_NUMBER() OVER (
            PARTITION BY "Name", "LinkedRecordPrimaryKey"
            ORDER BY "__mj_CreatedAt" ASC
        ) AS "RowNum"
    FROM "__mj"."GeneratedCode"
    WHERE "CategoryID" = (SELECT "ID" FROM "__mj"."GeneratedCodeCategory" WHERE "Name" = 'CodeGen: Validators')
);

DELETE FROM "__mj"."GeneratedCode"
WHERE "ID" IN (
    SELECT "ID" FROM "Ranked" WHERE "RowNum" > 1
);


/* Generated Validation Functions for MJ: AI Agent Run Steps */
-- CHECK constraint for MJ: AI Agent Run Steps: Field: FinalPayloadValidationResult was newly set or modified since the last generation of the validation function, the code was regenerated and updating the GeneratedCode table with the new generated validation function

UPDATE __mj."GeneratedCode" SET
                        "Source"='([FinalPayloadValidationResult] IS NULL OR [FinalPayloadValidationResult]=''Warn'' OR [FinalPayloadValidationResult]=''Fail'' OR [FinalPayloadValidationResult]=''Retry'' OR [FinalPayloadValidationResult]=''Pass'')',
                        "Code"='public ValidateFinalPayloadValidationResultStatus(result: ValidationResult) {
	if (this."FinalPayloadValidationResult" != null) {
		const allowedValues = ["Warn", "Fail", "Retry", "Pass"];
		if (allowedValues.indexOf(this."FinalPayloadValidationResult") === -1) {
			result."Errors".push(new ValidationErrorInfo(
				"FinalPayloadValidationResult",
				"The validation result must be one of the following values: " + allowedValues.join(", ") + ".",
				this."FinalPayloadValidationResult",
				ValidationErrorType."Failure"
			));
		}
	}
}',
                        "Description"='The final payload validation result must be one of the approved statuses: Warn, Fail, Retry, or Pass, to ensure consistent reporting of validation outcomes.',
                        "Name"='ValidateFinalPayloadValidationResultStatus',
                        "GeneratedAt"=NOW(),
                        "GeneratedByModelID"='7B31F48E-EDA3-47B4-9602-D98B7EB1AF45'
                     WHERE
                        "ID"='1DC5433E-F36B-1410-867F-007B559E242F';


-- ===================== Other =====================

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
    FROM "__mj"."GeneratedCode"
    WHERE CategoryID = (SELECT ID FROM "__mj"."GeneratedCodeCategory" WHERE Name = 'CodeGen: Validators')
)
