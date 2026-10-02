---
"@memberjunction/ai-agents": minor
"@memberjunction/cli": minor
"@memberjunction/computer-use-engine": minor
"@memberjunction/core-entities": minor
"@memberjunction/core-entities-server": minor
"@memberjunction/global": minor
"@memberjunction/integration-test-suite": minor
"@memberjunction/ng-agents": minor
"@memberjunction/ng-base-forms": minor
"@memberjunction/ng-bootstrap": minor
"@memberjunction/ng-bootstrap-lite": minor
"@memberjunction/ng-core-entity-forms": minor
"@memberjunction/ng-dashboards": minor
"@memberjunction/ng-explorer-core": minor
"@memberjunction/ng-rubrics": minor
"@memberjunction/ng-testing": minor
"@memberjunction/rubrics": minor
"@memberjunction/rubrics-base": minor
"@memberjunction/scheduling-engine": minor
"@memberjunction/server": minor
"@memberjunction/server-bootstrap": minor
"@memberjunction/server-bootstrap-lite": minor
"@memberjunction/testing-cli": minor
"@memberjunction/testing-engine": minor
"@memberjunction/testing-engine-base": minor
---

Add Rubrics, a core way to score any record against a published set of weighted criteria.

What ships:

- Schema for rubrics, versions, criteria, scales, anchors, bands, evaluations, and score rows, plus layered consensus views. Published versions are frozen. Raw writes to a frozen row throw 51101–51110. A draft version delete is an `INSTEAD OF DELETE` trigger. `MJ: Test Rubrics` is deprecated in metadata.
- `RubricScoring` and `RubricVersionDiff` in `@memberjunction/rubrics-base`. The outcome ladder is Incomplete, NotApplicableFailure, GateFailed, Passed or BelowThreshold, then Scored. The publish base is the highest Published or Retired version.
- `@memberjunction/rubrics`: LLM, agent, deterministic, and human evaluators. Actions are Evaluate Record Against Rubric, Get Rubric, Get Rubric Subject, Get Rubric Consensus, Create Rubric Draft, and Submit Human Rubric. Create Rubric Draft and the architect import do not publish. The evaluation agent does not call Get Rubric Consensus.
- Presentational widgets in `@memberjunction/ng-rubrics`, Explorer forms, and a Rubrics application. The agent form has a Rubrics tab.
- Six guide-example rubrics stay Draft. Seven agent rubrics publish at 1.0.0 and bind to their agents. Marketing Agent is not bound. Shipped self-check links and the sampling job stay Disabled. A test that already has an `llm-judge` oracle keeps it.
- Testing: rubric resolution, a `rubric` oracle, judge calibration, per-criterion spread on `--flaky-check`, `mj rubric`, and `mj test promote-criteria`. `Test.RubricID` and `TestSuite.RubricID` select a rubric. `TestSuiteRun.Score` is stored.
- The deterministic integration bundle is IT98 at sequence 49.

`GeneratePluralName` keeps the head of a name verbatim and pluralizes only the tail, preserving that tail's case. A linear scan finds the tail, so `user_profile` and `userProfile` no longer produce the same view name, a leading character such as Ä stays on the head, and `Contact Person` pluralizes to `Contact People`. The base view for a criterion is `vwRubricCriteria`.
