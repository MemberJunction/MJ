---
"@memberjunction/core": patch
"@memberjunction/graphql-dataprovider": patch
"@memberjunction/ai-agent-client": patch
"@memberjunction/conversations-runtime": patch
"@memberjunction/ng-workspace-initializer": patch
"@memberjunction/ng-conversations": patch
"@memberjunction/ng-core-entity-forms": patch
---

- Suppress auto-appended related entity sections on custom-layout forms (`MJAIAgentFormComponentExtended`, `MJAIAgentSessionFormComponentExtended`, `MJAIPromptFormComponentExtended`, `MJAIPromptRunFormComponentExtended`, `MJActionFormComponentExtended`, `MJEntityActionFormComponentExtended`, `MJQueryFormComponentExtended`, and `MJTemplateFormComponentExtended`) by overriding `OwnsEntireFormBody` to return `true`.
- Fix `NG0100: ExpressionChangedAfterItHasBeenCheckedError` on `MJAIAgentRunFormComponentExtended` (`OnPush`) by marking the view for check when `loadRunTree`, `loadAgent`, and `loadCostMetrics` mutate bound component state.
- Exclude untouched non-Active (`Deprecated`/`Disabled`) fields from `GraphQLDataProvider.Save()` on `Create` so `entity.Get` is not called on untouched deprecated fields (such as `ArtifactID`, `ArtifactVersionID`, and `SuggestedResponses` on `MJ: Conversation Details`).
- Move diagnostic browser console logs across metadata cache pre-validation, dataset status coalescing, fire-and-forget mutations, workspace bootstrap, agent client sessions, conversation agent routing, conversation streaming, and message input into `LogStatusEx({ ..., verboseOnly: true })`.
