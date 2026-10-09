---
"@memberjunction/computer-use": minor
"@memberjunction/computer-use-engine": minor
---

A published rubric can drive the computer use judge. `RunComputerUseParams.RubricCriteria` carries criteria with keys and level labels; the judge echoes each key and chooses a level (`CriterionVerdict.key`, `.level`), and `Done` is still every criterion met. The Computer Use test driver renders the resolved rubric's leaves into the loop (`judgeWithRubric`, default true; not for checkpoint tours or a rubric oracle that names its own evaluator) and its `rubric` oracle uses the new `ComputerUse` evaluator, which stores the final verdict as the evaluation with the judge's prompt run linked and no second model call.
