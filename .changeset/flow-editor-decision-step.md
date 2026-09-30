---
"@memberjunction/ng-flow-editor": patch
"@memberjunction/ai-core-plus": patch
---

Flow Agent Editor now supports Decision steps: palette entry with scale icon and teal color, visual node subtitles and warning banners, dedicated properties panel editor for Decision key, prompt picker filtered to Decision model type, state expression, and questions list (Likelihood, Choice, Score) with full CRUD and reordering. Supports "Route on Answer" outgoing path condition builder with live Choice coverage hints. Renaming a Decision step key, a question or an option rewrites the path conditions that read it, once, on commit. The editor checks the flow with the runtime's own compiler and validator as it is edited, and flags each problem on the step or path it is about. ai-core-plus adds writers and rewriters for `decisions` conditions (`DecisionReferenceText`, `DecisionConditionLiteral`, `RewriteDecisionQuestionReferences`, `RewriteDecisionChoiceValues`) and exports the Decision key check (`FlowDecisionKeyProblem`).
