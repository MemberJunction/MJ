---
"@memberjunction/core-entities": minor
"@memberjunction/server": minor
"@memberjunction/ng-core-entity-forms": minor
"@memberjunction/ng-rubrics": patch
---

Ship the Rubric Categories/Criteria hierarchy CodeGen output and regenerate stale generated types (fixes Integration Tier on next).

The hierarchy SQL is appended to `V202609302342__v6.2.x__Rubrics.sql` (unreleased) as a second CodeGen section, not shipped as a new migration.

What changed in generated output:
- MJ: Rubric Categories & MJ: Rubric Criteria: hierarchy functions (fnRubricCategoryParentID_GetHierarchyMeta / _GetDescendants / _GetAncestors / _GetRootID, fnRubricCriterionParentID_GetHierarchyMeta / _GetDescendants / _GetAncestors / _GetRootID), rebuilt views (vwRubricCategories, vwRubricCriteria) with hier_ParentID joins, and 10 EntityField records (RootParentID, ParentIDDepth, ParentIDPath, ParentIDIsLeaf, ParentIDChildCount)
- MJ: Rubric Evaluation Scores & MJ: Rubric Criterion Levels: 22 missing CD3 fields in __mj.ts (ScaleLevel, CriterionKey, CriterionNodeType, CriterionParentID, EvaluationStatus, EvaluatorType, EvaluatorUserID, SubjectEntityID, SubjectRecordID, ContextEntityID, ContextRecordID, RubricID, RubricMajorVersion, CriterionCohortCount, CriterionCohortMeanScore, CriterionCohortMinScore, CriterionCohortMaxScore, CriterionCohortScoreStdDev, CriterionCohortHumanMeanScore, etc.)
- MJRecordChange.ChangeContext: field moved, now a typed ChangeContextObject accessor, and new IRecordChangeContext / IRecordChangeCloneContext interfaces (#4585, record cloning)
- MJRecordCloneLog.PlanJSON: now a typed IClonePlan field (#4585)
- MJEntityFieldEntity_IEntityFieldCloneConfiguration and IJsonRemapSpec interfaces (#4585)
- MJAIAgentStep.StepType and Configuration descriptions (Decision step, #4874)
- MJTestSuiteRun.Score: decimal(5,4) changed to decimal(9,6)
- MJRubricEvaluation.Band, the cascade-delete transaction Delete() override on MJRubricEvaluation, and the vwRubricCriterions → vwRubricCriteria base-view fix
- The MJ: Test Rubrics "DEPRECATED" description in the GraphQL schema
