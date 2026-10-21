---
"@memberjunction/core": patch
"@memberjunction/graphql-dataprovider": patch
"@memberjunction/ai-agent-client": patch
"@memberjunction/conversations-runtime": patch
"@memberjunction/ng-workspace-initializer": patch
"@memberjunction/ng-conversations": patch
"@memberjunction/ng-core-entity-forms": patch
"@memberjunction/ng-base-forms": patch
"@memberjunction/ng-entity-viewer": patch
---

- Suppress auto-appended related entity sections on custom-layout forms (`MJAIAgentFormComponentExtended`, `MJAIAgentSessionFormComponentExtended`, `MJAIPromptFormComponentExtended`, `MJAIPromptRunFormComponentExtended`, `MJActionFormComponentExtended`, `MJEntityActionFormComponentExtended`, `MJQueryFormComponentExtended`, and `MJTemplateFormComponentExtended`) by overriding `OwnsEntireFormBody` to return `true`.
- Fix `NG0100: ExpressionChangedAfterItHasBeenCheckedError` on `MJAIAgentRunFormComponentExtended` (`OnPush`) by marking the view for check when `loadRunTree`, `loadAgent`, and `loadCostMetrics` mutate bound component state.
- Exclude untouched non-Active (`Deprecated`/`Disabled`) fields from `GraphQLDataProvider.Save()` on `Create` so `entity.Get` is not called on untouched deprecated fields (such as `ArtifactID`, `ArtifactVersionID`, and `SuggestedResponses` on `MJ: Conversation Details`).
- Move diagnostic browser console logs across metadata cache pre-validation, dataset status coalescing, fire-and-forget mutations, workspace bootstrap, agent client sessions, conversation agent routing, conversation streaming, and message input into `LogStatusEx({ ..., verboseOnly: true })`, while keeping the startup GraphQL setup summary log always visible.
- Add polymorphic foreign key (`EntityField.EntityIDFieldName`) smart link rendering across `<mj-form-field>` (read-mode clickable entity icon + resolved record name + raw ID badge, edit-mode FK autocomplete picker scoped to the sibling `EntityID` field's target entity, and automatic coercion of generated `Type="textarea"` polymorphic `RecordID` fields to `'textbox'`) and `<mj-entity-data-grid>`, `<mj-entity-cards>`, and `<mj-entity-record-detail-panel>` (batch-resolved target record names via `GetEntityRecordNames` and clickable record navigation links, strictly gated on `EntityField.EntityIDFieldName` metadata with no heuristic fallback).
- Populate `EntityField.EntityIDFieldName` metadata across 45 polymorphic FK fields on 41 core entities (`metadata/entities/.polymorphic-fk-entity-fields.json`).
- Add cross-tab and cross-session live form auto-refresh in `MjRecordFormContainerComponent` & `GraphQLDataProvider`: generate a unique per-tab runtime `sessionId` so multi-tab edits broadcast across tabs, automatically reload open read-mode forms when a record is saved remotely, pulse-highlight changed `<mj-form-field>` elements for 2.5s, and display a non-intrusive slide-in update pill (with a manual "Reload" action if the user is actively editing).
