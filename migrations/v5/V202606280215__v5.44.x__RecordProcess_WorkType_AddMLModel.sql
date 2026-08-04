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





















































-- =============================================================================================
-- ⬇️  CODEGEN OUTPUT  ⬇️
--
-- Run `mj codegen` after the CHECK change above. CodeGen derives the WorkType value list
-- (EntityFieldValue rows + EntityField.ValueListType) and regenerates the entity-subclass
-- TypeScript union FROM this CHECK constraint, and emits its SQL. Paste (cat) that generated
-- SQL below this line so the metadata sync ships in the same migration.
-- =============================================================================================
/* SQL text to insert entity field value with ID 444187b1-4c04-4ff3-98e9-b98499a068fb */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('444187b1-4c04-4ff3-98e9-b98499a068fb', '58345D95-711E-470F-BD28-1AA4AD8214D2', 5, 'ML Model', 'ML Model', GETUTCDATE(), GETUTCDATE());

