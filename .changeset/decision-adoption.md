---
"@memberjunction/core": minor
"@memberjunction/ai-core-plus": minor
"@memberjunction/ai-engine-base": minor
"@memberjunction/ai-prompts": minor
"@memberjunction/ai-agents": minor
"@memberjunction/ai-vector-dupe": minor
"@memberjunction/tag-engine": minor
"@memberjunction/ng-conversations": minor
"@memberjunction/codegen-lib": minor
"@memberjunction/rubrics": minor
"@memberjunction/core-entities-server": minor
"@memberjunction/server": minor
"@memberjunction/search-engine": minor
"@memberjunction/testing-engine": minor
---

Decision adoption: closed-set calls move onto decision models, each behind one switch.

- **`RunDecisionUse` (ai-prompts)** answers a closed-set call in one of three modes: `Prompt` (the existing path), `Shadow` (the existing path answers; the decision runs beside it and its run records the agreement) or `Decision` (the decision answers; the existing path runs when it fails, cannot be asked, or is unsure). A use defaults to `Decision` only when it needs no threshold or ships a calibration; otherwise `Shadow`, whose runs are the data for its calibration fit.
- **Conversation routing is on by default.** The routing fits are shifted to a chat's 90%-continue mix, so routing leaves the last agent only when it is at least 70% likely the person moved on. `EnableDecisionRouting` defaults to `true`; `ConversationAgentService.CheckAgentContinuityIntent` is deprecated.
- **Rubrics** ask numeric criteria, add a `DecisionThenLLM` evaluator (alias `hybrid`) that sends the LLM only what the decision cannot settle, and calibrate per criterion. `LLM` stays the default.
- **Agents:** the Memory Manager's note gate is on by default; memory dedupe, contradiction detection and the realtime turn moderator run in `Shadow`; Sage turns on decision discovery.
- **Server:** the restricted-field classifier (`Shadow`) and `ClassifyFeedback` (`Decision`) use decisions; `decisions.restrictedFieldClassifier` and `decisions.tagMatch` configure them. Search scopes get an opt-in `DecisionReRanker`.
- **Tags:** a keyword just under the match threshold asks a `tag-match` decision (`Shadow`); `Decision` mode applies the tag at a calibrated 0.8.
- **CodeGen:** Smart Field Identification gets an opt-in decision mode (`advancedGeneration.smartFieldDecisionMode`, default `Prompt`).
