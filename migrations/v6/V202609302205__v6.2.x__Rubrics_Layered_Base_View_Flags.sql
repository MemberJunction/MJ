/*
    Rubrics, step 2 of 3 — hand CodeGen a PRIVATE name for two base views.

    RubricEvaluation and RubricEvaluationScore use MJ's LAYERED base views: CodeGen owns a
    generated inner view under GeneratedBaseViewName, and MJ owns the public BaseView as a thin
    wrapper that adds on-demand consensus columns (cohort mean, spread, human-vs-AI means). This
    file sets the flags and carries the regenerated inner views; the NEXT file creates the wrappers.

    WHY THIS IS A SEPARATE MIGRATION FROM V202609302204. The flags live on __mj.Entity rows that
    do not exist until V202609302204's own CodeGen capture inserts them. An UPDATE placed anywhere
    in that file's hand-written section runs BEFORE the capture and is a silent no-op.

    WHY THE WRAPPERS ARE NOT HERE EITHER. A view cannot be created before the view it selects FROM
    (SQL Server resolves names at CREATE VIEW time, unlike procedure bodies), and the inner views
    only exist once THIS file's capture has run. So the wrappers are the third file.

    WHY THE FLAGS SHIP AS A MIGRATION rather than only as metadata. An install runs migrations and
    nothing else. If the flags arrived only via a later metadata sync, the first CodeGen run on a
    fresh environment would see BaseViewGenerated = 1, resolve the target to the PUBLIC name, and
    DROP/CREATE vwRubricEvaluations as a plain generated view, destroying the wrapper. The same
    values are ALSO declared in metadata/entities/.layered-base-views.json so a metadata push can
    never flip them back.

    Keyed by entity NAME: both UPDATEs skip cleanly when the row is absent.

    CAPTURING THE CODEGEN SECTION BELOW (see plans/rubrics/RUBRICS_PLAN.md, "Layered base views:
    the migration sequence"). Flipping BaseViewGenerated does not count as an entity MODIFICATION
    to CodeGen, so a plain run CREATEs vwRubricEvaluationsGenerated / vwRubricEvaluationScoresGenerated
    in the database but OMITS them from its SQL output. Capture with forceRegeneration.baseViews
    enabled and entityWhereClause scoped to these two entities, then confirm BY NAME that both
    *Generated views are present in the appended section before committing.
*/

UPDATE [${flyway:defaultSchema}].[Entity]
   SET [BaseViewGenerated] = 0,
       [GeneratedBaseViewName] = 'vwRubricEvaluationsGenerated'
 WHERE [Name] = 'MJ: Rubric Evaluations'
   AND ([BaseViewGenerated] <> 0
        OR [GeneratedBaseViewName] IS NULL
        OR [GeneratedBaseViewName] <> 'vwRubricEvaluationsGenerated');
GO

UPDATE [${flyway:defaultSchema}].[Entity]
   SET [BaseViewGenerated] = 0,
       [GeneratedBaseViewName] = 'vwRubricEvaluationScoresGenerated'
 WHERE [Name] = 'MJ: Rubric Evaluation Scores'
   AND ([BaseViewGenerated] <> 0
        OR [GeneratedBaseViewName] IS NULL
        OR [GeneratedBaseViewName] <> 'vwRubricEvaluationScoresGenerated');
GO
