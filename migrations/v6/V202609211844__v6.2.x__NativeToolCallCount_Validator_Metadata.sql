-- MJ#4647 — ship the CodeGen validator for AIAgentRunStep.NativeToolCallCount as DATA.
--
-- WHY THIS EXISTS
--
-- `V202609122036__v6.1.x__Native_Tool_Calling.sql` added the column and its CHECK constraint
-- (`CK_AIAgentRunStep_NativeToolCallCount`) but did NOT ship the GeneratedCode row that CodeGen
-- reads to emit the field's `Validate...` method. CodeGen only skips the LLM when a stored
-- GeneratedCode row's `Source` matches the live constraint definition EXACTLY
-- (`manage-metadata.ts`, generateValidatorFunctionFromCheckConstraint).
--
-- Consequence: `CodeGen drift gate` builds a fresh database and runs with MJ_CODEGEN_NO_AI=1, so
-- with no stored row and no LLM it emits no validator — while the committed core-entities
-- artifact under `packages/MJCoreEntities/src/generated/entities/` contains one, because it was
-- generated on a database where the LLM HAD run. A permanent 19-line drift no rerun can clear.
-- It has been red on `next` since #4604 (539cd72ce, 2026-09-18) committed the validator.
--
-- This is the same pattern every other field-level validator already follows — see
-- `V202608080201__v6.1.x__AIAgentRun_ContinuationDepth_and_ScheduledJob_MissedRunPolicy.sql`,
-- which ships `ValidateContinuationDepthGreaterThanOrEqualToZero` exactly this way. Nothing new is
-- being invented here; #4176 simply omitted the row.
--
-- FIELD-LEVEL, so LinkedEntityID is `MJ: Entity Fields` (DF238F34-...) and LinkedRecordPrimaryKey
-- is the EntityField row. Table-level constraints link to `MJ: Entities` (E0238F34-...) instead.
--
-- `Source` is SQL Server's NORMALISED constraint text as `sys.check_constraints.definition`
-- renders it — spaces preserved around IS NULL / OR, none around the comparison operator, literal
-- parenthesised. Verified against the shipped corpus, e.g.
-- '([CacheTTLSeconds] IS NULL OR [CacheTTLSeconds]>(0))'. The match is exact-string, so this
-- formatting is load-bearing.
--
-- Guarded because a developer database may already hold an LLM-generated row for this constraint;
-- inserting a second would leave two rows for one field.

IF NOT EXISTS (
    SELECT 1 FROM [${flyway:defaultSchema}].[GeneratedCode]
    WHERE [LinkedRecordPrimaryKey] = '6c2142c1-e36c-4c94-ad23-78237fd6397a'
      AND [Name] = 'ValidateNativeToolCallCountGreaterThanOrEqualToZero'
)
BEGIN
    INSERT INTO [${flyway:defaultSchema}].[GeneratedCode]
        ([CategoryID], [GeneratedByModelID], [GeneratedAt], [Language], [Status], [Source], [Code], [Description], [Name], [LinkedEntityID], [LinkedRecordPrimaryKey])
    VALUES (
        (SELECT [ID] FROM [${flyway:defaultSchema}].[vwGeneratedCodeCategories] WHERE [Name]='CodeGen: Validators'),
        'C43229F6-4CC8-4838-9D04-03419A2DA191',
        GETUTCDATE(),
        'TypeScript',
        'Approved',
        '([NativeToolCallCount] IS NULL OR [NativeToolCallCount]>=(0))',
        'public ValidateNativeToolCallCountGreaterThanOrEqualToZero(result: ValidationResult) {
	if (this.NativeToolCallCount != null && this.NativeToolCallCount < 0) {
		result.Errors.push(new ValidationErrorInfo(
			"NativeToolCallCount",
			"The native tool call count must be 0 or greater.",
			this.NativeToolCallCount,
			ValidationErrorType.Failure
		));
	}
}',
        'The native tool call count must be greater than or equal to zero, if it is specified.',
        'ValidateNativeToolCallCountGreaterThanOrEqualToZero',
        'DF238F34-2837-EF11-86D4-6045BDEE16E6',
        '6c2142c1-e36c-4c94-ad23-78237fd6397a'
    );
END
GO
