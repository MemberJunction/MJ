---
"@memberjunction/testing-engine": minor
"@memberjunction/computer-use-engine": minor
---

The rubric oracle now runs in every test driver. Rubric resolution (run flag, rubric oracle config, `Test.RubricID`, the suite chain, the agent default) and the Published-version pin moved from `AgentEvalDriver` into `BaseTestDriver.ResolveRubricForRun` and `BaseTestDriver.SetupSuite`, and `BaseTestDriver.BuildOracleInput` gives every oracle the driver's provider, which the Prompt Eval, Decision Eval and Computer Use drivers did not pass before (their rubric oracle always failed with "No rubric engine is configured."). A driver can set `OracleInput.subjectContent` to shape what the judge reads; the Computer Use driver sends a compact step transcript instead of its raw output, which carried a base64 screenshot. A rubric with no Published version adds no oracle and logs a warning instead of failing the test.
