-- ============================================================================
-- MemberJunction PostgreSQL Migration — V202609211844__v6.2.x__NativeToolCallCount_Validator_Metadata.sql
-- Split-and-regenerate with INLINE NATIVE CodeGen baking: hand-written DDL transpiled
-- (AST dialect), metadata DML inline, and CodeGen objects (views/sprocs/triggers/grants)
-- baked natively from `mj codegen`. Applies standalone via `mj migrate` — no deploy codegen.
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE SCHEMA IF NOT EXISTS __mj;
SET search_path TO __mj, public;
SET standard_conforming_strings = on;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."GeneratedCode" WHERE "LinkedRecordPrimaryKey" = '6c2142c1-e36c-4c94-ad23-78237fd6397a' AND "Name" = 'ValidateNativeToolCallCountGreaterThanOrEqualToZero') THEN
    INSERT INTO __mj."GeneratedCode" ("CategoryID", "GeneratedByModelID", "GeneratedAt", "Language", "Status", "Source", "Code", "Description", "Name", "LinkedEntityID", "LinkedRecordPrimaryKey") VALUES ((SELECT "ID" FROM __mj."vwGeneratedCodeCategories" WHERE "Name" = 'CodeGen: Validators'), 'C43229F6-4CC8-4838-9D04-03419A2DA191', NOW(), 'TypeScript', 'Approved', '([NativeToolCallCount] IS NULL OR [NativeToolCallCount]>=(0))', 'public ValidateNativeToolCallCountGreaterThanOrEqualToZero(result: ValidationResult) {
	if (this.NativeToolCallCount != null && this.NativeToolCallCount < 0) {
		result.Errors.push(new ValidationErrorInfo(
			"NativeToolCallCount",
			"The native tool call count must be 0 or greater.",
			this.NativeToolCallCount,
			ValidationErrorType.Failure
		));
	}
}', 'The native tool call count must be greater than or equal to zero, if it is specified.', 'ValidateNativeToolCallCountGreaterThanOrEqualToZero', 'DF238F34-2837-EF11-86D4-6045BDEE16E6', '6c2142c1-e36c-4c94-ad23-78237fd6397a');
  END IF;
END $$;
