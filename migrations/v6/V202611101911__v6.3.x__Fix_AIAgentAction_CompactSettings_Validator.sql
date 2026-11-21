-- MJ#6421: the CodeGen validator for CK_AIAgentAction_CompactSettingsOnlyWhenCompact enforced the
-- opposite of the constraint, so no MJ: AI Agent Actions row could be saved with
-- ResultExpirationMode = 'Compact'.
--
-- WHY THIS EXISTS
--
-- The constraint is
--   ([ResultExpirationMode]='Compact' OR [CompactMode] IS NULL AND [CompactLength] IS NULL AND [CompactPromptID] IS NULL)
-- i.e. the compact settings may only be filled in when the mode IS 'Compact'. The LLM-generated
-- validator stored for it (`ValidateResultExpirationModeRequiresCompactFieldsEmpty`, seeded by
-- V202510200726__v2.109.x__Add_AIAgentDataSource.sql) required them to be EMPTY when the mode is
-- 'Compact'. Together with `ValidateCompactModeWhenResultExpirationModeIsCompact`
-- (CK_AIAgentAction_CompactModeRequired: Compact requires CompactMode), every Compact row failed
-- one validator or the other, from the UI, `mj sync` and code alike. A metadata push carrying such
-- a row rolled back the whole push.
--
-- This corrects the stored row in place. `Source` is left exactly as it is: CodeGen reuses a stored
-- validator only when `Source` matches the live constraint definition EXACTLY
-- (manage-metadata.ts, generateValidatorFunctionFromCheckConstraint), so changing Name,
-- Description and Code here is what CodeGen emits from now on, with no LLM call.
--
-- Keyed on the entity link and Source rather than ID: the v2.109 seed inserted this row without an
-- explicit ID, so upgraded databases hold different IDs. The function is renamed because the old
-- name described the inverted rule; nothing outside the generated entity class calls it.

UPDATE [${flyway:defaultSchema}].[GeneratedCode]
SET [Name] = 'ValidateCompactSettingsOnlyWhenResultExpirationModeIsCompact',
    [Description] = 'This rule ensures that CompactMode, CompactLength, and CompactPromptID are only filled in when the result expiration mode is ''Compact''. For any other result expiration mode, all three must be empty.',
    [Code] = 'public ValidateCompactSettingsOnlyWhenResultExpirationModeIsCompact(result: ValidationResult) {
	if (this.ResultExpirationMode !== "Compact" && (this.CompactMode != null || this.CompactLength != null || this.CompactPromptID != null)) {
		result.Errors.push(new ValidationErrorInfo("ResultExpirationMode", "CompactMode, CompactLength, and CompactPromptID must be empty unless ResultExpirationMode is ''Compact''.", this.ResultExpirationMode, ValidationErrorType.Failure));
	}
}',
    [GeneratedAt] = GETUTCDATE()
WHERE [CategoryID] = (SELECT [ID] FROM [${flyway:defaultSchema}].[vwGeneratedCodeCategories] WHERE [Name] = 'CodeGen: Validators')
  AND [LinkedEntityID] = 'E0238F34-2837-EF11-86D4-6045BDEE16E6'
  AND [LinkedRecordPrimaryKey] = '196B0316-6078-47A4-94B9-44A2FC5E8A55'
  AND [Source] = '([ResultExpirationMode]=''Compact'' OR [CompactMode] IS NULL AND [CompactLength] IS NULL AND [CompactPromptID] IS NULL)';
