-- Record Set Processing: add the 'ML Model' work type to RecordProcess.WorkType.
--
-- The CHECK constraint is the SOURCE OF TRUTH for this field's value list and its generated
-- TypeScript union: CodeGen reads `CK_RecordProcess_WorkType`, syncs the `EntityFieldValue` rows,
-- sets `EntityField.ValueListType`, and emits the `WorkType` union — all automatically. So to add
-- a work type you drop the old constraint and add a new one that includes it (this migration),
-- then run `mj codegen`. NEVER edit EntityField / EntityFieldValue metadata directly.
--
-- This adds 'ML Model' — the Record Set Processing work type contributed by Predictive Studio's
-- MLModelInferenceProcessor (registered into the pluggable RecordProcessorRegistry at server
-- startup) — to the set of saveable WorkType values, alongside the substrate's built-ins. The
-- registry resolves the processor at EXECUTION time; this CHECK validates the stored value at SAVE
-- time (a typo'd work type is rejected up front rather than failing later). To add further work
-- types, extend this constraint the same way (drop + re-add including the new value) + re-run codegen.

ALTER TABLE ${flyway:defaultSchema}.RecordProcess DROP CONSTRAINT IF EXISTS CK_RecordProcess_WorkType;
ALTER TABLE ${flyway:defaultSchema}.RecordProcess ADD CONSTRAINT CK_RecordProcess_WorkType
    CHECK ([WorkType] IN ('Action', 'Agent', 'Infer', 'FieldRules', 'ML Model'));
