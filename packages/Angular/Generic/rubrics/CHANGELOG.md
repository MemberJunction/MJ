# @memberjunction/ng-rubrics

## 6.2.0-edge.2

### Minor Changes

- 4d647e6: Add Rubrics, a core way to score any record against a published set of weighted criteria.

  What ships:
  - Schema for rubrics, versions, criteria, scales, anchors, bands, evaluations, and score rows, plus layered consensus views. Published versions are frozen. Raw writes to a frozen row throw 51101–51110. A draft version delete is an `INSTEAD OF DELETE` trigger. `MJ: Test Rubrics` is deprecated in metadata.
  - `RubricScoring` and `RubricVersionDiff` in `@memberjunction/rubrics-base`. The outcome ladder is Incomplete, NotApplicableFailure, GateFailed, Passed or BelowThreshold, then Scored. The publish base is the highest Published or Retired version.
  - `@memberjunction/rubrics`: LLM, agent, deterministic, and human evaluators. Actions are Evaluate Record Against Rubric, Get Rubric, Get Rubric Subject, Get Rubric Consensus, Create Rubric Draft, and Submit Human Rubric. Create Rubric Draft and the architect import do not publish. The evaluation agent does not call Get Rubric Consensus.
  - Presentational widgets in `@memberjunction/ng-rubrics`, Explorer forms, and a Rubrics application. The agent form has a Rubrics tab.
  - Six guide-example rubrics stay Draft. Seven agent rubrics publish at 1.0.0 and bind to their agents. Marketing Agent is not bound. Shipped self-check links and the sampling job stay Disabled. A test that already has an `llm-judge` oracle keeps it.
  - Testing: rubric resolution, a `rubric` oracle, judge calibration, per-criterion spread on `--flaky-check`, `mj rubric`, and `mj test promote-criteria`. `Test.RubricID` and `TestSuite.RubricID` select a rubric. `TestSuiteRun.Score` is stored.
  - The deterministic integration bundle is IT98 at sequence 49.

  `GeneratePluralName` keeps the head of a name verbatim and pluralizes only the tail, preserving that tail's case. A linear scan finds the tail, so `user_profile` and `userProfile` no longer produce the same view name, a leading character such as Ä stays on the head, and `Contact Person` pluralizes to `Contact People`. The base view for a criterion is `vwRubricCriteria`.

### Patch Changes

- 7bcba8c: Docs: the Rubrics Guide becomes a task-first guide with diagrams (authoring and publishing, shipping rubrics as metadata, scoring from code, human scoring, consensus, tests, agents, adopting rubrics in an application), and the package READMEs point to it. The ng-rubrics README documents every widget's inputs and outputs.
- c35f7e5: Ship the Rubric Categories/Criteria hierarchy CodeGen output and regenerate stale generated types (fixes Integration Tier on next).

  The hierarchy SQL is appended to `V202609302342__v6.2.x__Rubrics.sql` (unreleased) as a second CodeGen section, not shipped as a new migration.

  What changed in generated output:
  - MJ: Rubric Categories & MJ: Rubric Criteria: hierarchy functions (fnRubricCategoryParentID_GetHierarchyMeta / \_GetDescendants / \_GetAncestors / \_GetRootID, fnRubricCriterionParentID_GetHierarchyMeta / \_GetDescendants / \_GetAncestors / \_GetRootID), rebuilt views (vwRubricCategories, vwRubricCriteria) with hier_ParentID joins, and 10 EntityField records (RootParentID, ParentIDDepth, ParentIDPath, ParentIDIsLeaf, ParentIDChildCount)
  - MJ: Rubric Evaluation Scores & MJ: Rubric Criterion Levels: 22 missing CD3 fields in \_\_mj.ts (ScaleLevel, CriterionKey, CriterionNodeType, CriterionParentID, EvaluationStatus, EvaluatorType, EvaluatorUserID, SubjectEntityID, SubjectRecordID, ContextEntityID, ContextRecordID, RubricID, RubricMajorVersion, CriterionCohortCount, CriterionCohortMeanScore, CriterionCohortMinScore, CriterionCohortMaxScore, CriterionCohortScoreStdDev, CriterionCohortHumanMeanScore, etc.)
  - MJRecordChange.ChangeContext: field moved, now a typed ChangeContextObject accessor, and new IRecordChangeContext / IRecordChangeCloneContext interfaces (#4585, record cloning)
  - MJRecordCloneLog.PlanJSON: now a typed IClonePlan field (#4585)
  - MJEntityFieldEntity_IEntityFieldCloneConfiguration and IJsonRemapSpec interfaces (#4585)
  - MJAIAgentStep.StepType and Configuration descriptions (Decision step, #4874)
  - MJTestSuiteRun.Score: decimal(5,4) changed to decimal(9,6)
  - MJRubricEvaluation.Band, the cascade-delete transaction Delete() override on MJRubricEvaluation, and the vwRubricCriterions → vwRubricCriteria base-view fix
  - The MJ: Test Rubrics "DEPRECATED" description in the GraphQL schema

- Updated dependencies [e97d95c]
- Updated dependencies [2552b1e]
- Updated dependencies [21f9e15]
- Updated dependencies [4248fb3]
- Updated dependencies [0adaf76]
- Updated dependencies [ef43cf3]
- Updated dependencies [b44c7cf]
- Updated dependencies [705ab4e]
- Updated dependencies [7e57b48]
- Updated dependencies [7e57b48]
- Updated dependencies [5986939]
- Updated dependencies [4d647e6]
- Updated dependencies [7bcba8c]
- Updated dependencies [c35f7e5]
- Updated dependencies [369e229]
- Updated dependencies [d13cf6b]
- Updated dependencies [2854a2e]
  - @memberjunction/core@6.2.0-edge.2
  - @memberjunction/core-entities@6.2.0-edge.2
  - @memberjunction/global@6.2.0-edge.2
  - @memberjunction/rubrics-base@6.2.0-edge.2
  - @memberjunction/ng-ui-components@6.2.0-edge.2
