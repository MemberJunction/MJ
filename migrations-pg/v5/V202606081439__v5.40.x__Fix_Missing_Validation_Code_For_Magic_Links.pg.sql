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

-- NOTE: Earlier converter versions made INTEGER to BOOLEAN cast implicit by
-- modifying the system catalog so SS-style INSERT INTO bool_col VALUES (1)
-- would work. That modification required pg_catalog write privileges, which
-- managed PG (RDS, Aurora, Cloud SQL, Azure) does not grant. As of v5.30 all
-- bulk INSERTs are emitted with native TRUE/FALSE values directly, so the
-- cast modification is no longer needed. Removed to support managed-PG
-- installs out of the box.


-- ===================== Data (INSERT/UPDATE/DELETE) =====================

INSERT INTO __mj."GeneratedCode" ("CategoryID", "GeneratedByModelID", "GeneratedAt", "Language", "Status", "Source", "Code", "Description", "Name", "LinkedEntityID", "LinkedRecordPrimaryKey")
                      VALUES ((SELECT "ID" FROM __mj."vwGeneratedCodeCategories" WHERE "Name"='CodeGen: Validators'), 'C43229F6-4CC8-4838-9D04-03419A2DA191', NOW(), 'TypeScript', 'Approved', '([IdentityMode]<>''email'' OR [Email] IS NOT NULL)', 'public ValidateEmailRequiredForEmailIdentityMode(result: ValidationResult) {
	if (this."IdentityMode" && this."IdentityMode".toLowerCase() === ''email'' && (this."Email" == null || this."Email".trim() === '''')) {
		result."Errors".push(new ValidationErrorInfo(
			"Email",
			"An email address is required when the identity mode is set to ''email''.",
			this."Email",
			ValidationErrorType."Failure"
		));
	}
}', 'An email address must be provided if the identity mode is set to ''email''.', 'ValidateEmailRequiredForEmailIdentityMode', 'E0238F34-2837-EF11-86D4-6045BDEE16E6', 'E41A5DEE-C259-4B6E-A3C5-BB022BD5F10A');

            -- CHECK constraint for MJ: Magic Link Invites @ Table Level was newly set or modified since the last generation of the validation function, the code was regenerated and updating the GeneratedCode table with the new generated validation function;

INSERT INTO __mj."GeneratedCode" ("CategoryID", "GeneratedByModelID", "GeneratedAt", "Language", "Status", "Source", "Code", "Description", "Name", "LinkedEntityID", "LinkedRecordPrimaryKey")
                      VALUES ((SELECT "ID" FROM __mj."vwGeneratedCodeCategories" WHERE "Name"='CodeGen: Validators'), 'C43229F6-4CC8-4838-9D04-03419A2DA191', NOW(), 'TypeScript', 'Approved', '([UseCount]>=(0) AND [UseCount]<=[MaxUses])', 'public ValidateUseCountWithinMaxUsesLimit(result: ValidationResult) {
	if (this."UseCount" != null && this."MaxUses" != null) {
		if (this."UseCount" < 0 || this."UseCount" > this."MaxUses") {
			result."Errors".push(new ValidationErrorInfo(
				"UseCount",
				"The use count must be between 0 and the maximum allowed uses of " + this."MaxUses" + ".",
				this."UseCount",
				ValidationErrorType."Failure"
			));
		}
	}
}', 'The number of times a token has been used must be greater than or equal to 0 and cannot exceed the maximum allowed uses.', 'ValidateUseCountWithinMaxUsesLimit', 'E0238F34-2837-EF11-86D4-6045BDEE16E6', 'E41A5DEE-C259-4B6E-A3C5-BB022BD5F10A');


-- ===================== Other =====================

/* Generated Validation Functions for MJ: Magic Link Invites */
-- CHECK constraint for MJ: Magic Link Invites @ Table Level was newly set or modified since the last generation of the validation function, the code was regenerated and updating the GeneratedCode table with the new generated validation function
