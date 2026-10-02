-- Typed-decision plan (MemberJunction/MJ#4660), Phase 0 Task 0.1 — one speech-to-text model type, not two.
--
-- WHY THIS EXISTS
--
-- `MJ: AI Model Types` holds two rows for the same concept:
--   - STT             5E527CEF-46EC-421F-9AAC-C69E22426402  seeded by the v5 baseline migrations
--   - Speech to Text  583D65B5-F2EB-458E-8F5B-7F53FEBB12A4  metadata/ai-model-types/.ai-model-types.json
--
-- Every shipped speech-to-text model (`metadata/ai-models`) references `Speech to Text`; on a
-- clean database `STT` has zero models and zero prompts. The duplicate is harmless while
-- `AIPrompt.AIModelTypeID` is advisory. It becomes a live bug when the runner hierarchy the plan
-- introduces makes a model type a hard floor (`RequiredModelType`): the floor matches one row and
-- silently filters out every model registered against the other.
--
-- `Speech to Text` survives. It is the row the shipped models already use, it carries the curated
-- description and modalities, and keeping it means no shipped metadata changes.
--
-- WHAT THIS MIGRATION DOES — AND DOES NOT DO
--
-- The DELETE of the `STT` row is declarative metadata: a `deleteRecord` entry in
-- `metadata/ai-model-types/.ai-model-types.json`, applied by `mj sync push` (the release-time
-- consolidated metadata sync, which runs after versioned migrations). Metadata changes ship as
-- JSON, never as hand-written migration DML.
--
-- What JSON cannot express is repointing rows a customer created against `STT`, and those rows
-- would make the delete fail on FK_AIModel_AIModelType / FK_AIPrompt_AIModelTypeID. So this
-- migration does only that: it repoints any `AIModel` or `AIPrompt` still referencing `STT` to
-- `Speech to Text`. It is guarded on BOTH rows existing, so it is a no-op on a database that never
-- had the duplicate (or has already been cleaned up), and it is re-runnable.

IF EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[AIModelType] WHERE [ID] = '5E527CEF-46EC-421F-9AAC-C69E22426402')
   AND EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[AIModelType] WHERE [ID] = '583D65B5-F2EB-458E-8F5B-7F53FEBB12A4')
BEGIN
    UPDATE [${flyway:defaultSchema}].[AIModel]
       SET [AIModelTypeID] = '583D65B5-F2EB-458E-8F5B-7F53FEBB12A4'
     WHERE [AIModelTypeID] = '5E527CEF-46EC-421F-9AAC-C69E22426402';

    UPDATE [${flyway:defaultSchema}].[AIPrompt]
       SET [AIModelTypeID] = '583D65B5-F2EB-458E-8F5B-7F53FEBB12A4'
     WHERE [AIModelTypeID] = '5E527CEF-46EC-421F-9AAC-C69E22426402';
END
