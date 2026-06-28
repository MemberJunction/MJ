-- Record Set Processing: make RecordProcess.WorkType a MANAGED (extensible-enum) value list.
--
-- WHY THIS MIGRATION EXISTS
-- -------------------------
-- PS2-1 (V202606280215__v5.44.x__RecordProcess_WorkType_Pluggable.sql) DROPPED the closed
-- CK_RecordProcess_WorkType CHECK so that registered extension work types (e.g. Predictive Studio's
-- 'ML Model' scorer, contributed via RecordProcessorRegistry) can be SAVED — validity is enforced at
-- execution time by the registry, not by a hard DB constraint.
--
-- LATENT ISSUE FROM PS2-1: the generated TypeScript union for WorkType
-- (z.union(['Action','Agent','FieldRules','Infer']) + the UI dropdown) is driven by the WorkType
-- EntityField's value list (ValueListType + EntityFieldValue rows). Before PS2-1 those rows were
-- CHECK-DERIVED: CodeGen's manageEntityFieldValuesAndValidatorFunctions() reads
-- vwEntityFieldsWithCheckConstraints, parses the IN(...) list, and syncs EntityFieldValue rows +
-- sets ValueListType='List'. With the CHECK now gone, WorkType simply DROPS OUT of that result set,
-- so the CHECK pass no longer manages (and importantly, no longer re-asserts) its value list.
--
-- ORPHANING-RISK VERDICT: the existing EntityFieldValue rows are NOT deleted by the next CodeGen run.
-- The only DELETE of EntityFieldValue rows lives in syncEntityFieldValues(), which is invoked solely
-- (a) from the CHECK pass for fields that STILL have a parseable CHECK, and (b) from the soft
-- value-list pass for fields declared in additionalSchemaInfo.json. WorkType qualifies for NEITHER,
-- so its rows survive. spDeleteUnneededEntityFields only removes EntityField rows for dropped COLUMNS
-- (WorkType still exists). So the rows are safe — BUT they are now UNMANAGED: nothing re-creates them
-- if a fresh DB is built from a baseline that lacks the CHECK, and nothing adds 'ML Model' to the
-- union. The field also still reports ValueListType='List' (set by the old CHECK pass), which would
-- mean "closed dropdown, no user entry" — wrong for a pluggable column.
--
-- THE FIX (codegen-safe, extensible-enum pattern)
-- -----------------------------------------------
-- Convert WorkType into a MANUALLY managed value list that CodeGen preserves:
--   1. Set the WorkType EntityField's ValueListType = 'ListOrUserEntry'. CodeGen's
--      entity_subclasses_codegen.ts emits, for ListOrUserEntry, a union of the known values PLUS the
--      base SQL type (`... .or(z.string())` in Zod, `... | string` in the TS type) — i.e. the 5 known
--      values are SUGGESTIONS in the dropdown, while pluggable values can still be saved. (A 'List'
--      type would be a closed dropdown; we explicitly do NOT want that here, and we do NOT re-add the
--      blocking CHECK.)
--   2. Idempotently SEED the 5 EntityFieldValue rows: the original built-in 4 (Action, Agent,
--      FieldRules, Infer) MUST survive + the new 'ML Model' value. Sequences are alphabetical to match
--      CodeGen's deterministic sort, so the generated union order is stable across runs.
--
-- After the NEXT `mj codegen`, the regenerated WorkType type is:
--   Zod:  z.union([z.literal('Action'), z.literal('Agent'), z.literal('FieldRules'),
--                  z.literal('Infer'), z.literal('ML Model')]).or(z.string())
--   TS:   'Action' | 'Agent' | 'FieldRules' | 'Infer' | 'ML Model' | string
-- CodeGen LEAVES the value list intact on subsequent runs because WorkType has no CHECK (so the CHECK
-- pass never touches it) and isn't in additionalSchemaInfo.json (so the soft pass never touches it);
-- it only READS EntityField/EntityFieldValue to emit the union.
--
-- Idempotent: ValueListType UPDATE is unconditional-but-stable; each EntityFieldValue INSERT is guarded
-- by IF NOT EXISTS (matched on EntityFieldID + Value), so re-running is safe and never duplicates rows.
-- Hardcoded UUIDs per migrations/CLAUDE.md. No CHECK constraint is (re)introduced.

DECLARE @WorkTypeFieldID UNIQUEIDENTIFIER;

SELECT @WorkTypeFieldID = ef.ID
FROM ${flyway:defaultSchema}.EntityField ef
INNER JOIN ${flyway:defaultSchema}.Entity e ON ef.EntityID = e.ID
WHERE e.Name = 'MJ: Record Processes'
  AND ef.Name = 'WorkType';

IF @WorkTypeFieldID IS NULL
BEGIN
    -- Field not yet generated (CodeGen hasn't created the EntityField row for WorkType).
    -- Nothing to manage yet; the value list will be applied once the field exists and this
    -- migration is re-run, or via the metadata layer. Fail loud so the situation is visible.
    RAISERROR('RecordProcess.WorkType EntityField not found (Entity "MJ: Record Processes"). Run CodeGen to generate the field metadata, then re-run this migration.', 16, 1);
END
ELSE
BEGIN
    -- 1) Make it an extensible enum: known values are suggestions, pluggable values still saveable.
    UPDATE ${flyway:defaultSchema}.EntityField
    SET ValueListType = 'ListOrUserEntry'
    WHERE ID = @WorkTypeFieldID;

    -- 2) Seed the 5 known values (idempotent on EntityFieldID + Value). Alphabetical sequence.
    IF NOT EXISTS (SELECT 1 FROM ${flyway:defaultSchema}.EntityFieldValue WHERE EntityFieldID = @WorkTypeFieldID AND Value = 'Action')
        INSERT INTO ${flyway:defaultSchema}.EntityFieldValue (ID, EntityFieldID, Sequence, Value, Code)
        VALUES ('17166065-A077-4813-BF96-0F69DE9AC9EB', @WorkTypeFieldID, 1, 'Action', 'Action');

    IF NOT EXISTS (SELECT 1 FROM ${flyway:defaultSchema}.EntityFieldValue WHERE EntityFieldID = @WorkTypeFieldID AND Value = 'Agent')
        INSERT INTO ${flyway:defaultSchema}.EntityFieldValue (ID, EntityFieldID, Sequence, Value, Code)
        VALUES ('F57842D8-59FE-473C-A512-D9B14EF4E122', @WorkTypeFieldID, 2, 'Agent', 'Agent');

    IF NOT EXISTS (SELECT 1 FROM ${flyway:defaultSchema}.EntityFieldValue WHERE EntityFieldID = @WorkTypeFieldID AND Value = 'FieldRules')
        INSERT INTO ${flyway:defaultSchema}.EntityFieldValue (ID, EntityFieldID, Sequence, Value, Code)
        VALUES ('8797E918-E16D-4EC2-9F61-D62E4832095B', @WorkTypeFieldID, 3, 'FieldRules', 'FieldRules');

    IF NOT EXISTS (SELECT 1 FROM ${flyway:defaultSchema}.EntityFieldValue WHERE EntityFieldID = @WorkTypeFieldID AND Value = 'Infer')
        INSERT INTO ${flyway:defaultSchema}.EntityFieldValue (ID, EntityFieldID, Sequence, Value, Code)
        VALUES ('552DCDFC-1AEE-4C5D-A4DE-33057FBA6316', @WorkTypeFieldID, 4, 'Infer', 'Infer');

    IF NOT EXISTS (SELECT 1 FROM ${flyway:defaultSchema}.EntityFieldValue WHERE EntityFieldID = @WorkTypeFieldID AND Value = 'ML Model')
        INSERT INTO ${flyway:defaultSchema}.EntityFieldValue (ID, EntityFieldID, Sequence, Value, Code)
        VALUES ('3C4A1DB0-7B99-4B89-9222-9072E7A6B309', @WorkTypeFieldID, 5, 'ML Model', 'ML Model');
END
