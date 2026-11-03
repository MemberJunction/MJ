---
"@memberjunction/core": minor
"@memberjunction/core-entities": minor
"@memberjunction/core-entities-server": minor
"@memberjunction/ng-base-forms": minor
"@memberjunction/ng-conversations": minor
"@memberjunction/ng-core-entity-forms": minor
"@memberjunction/ng-auth-services": minor
"@memberjunction/ng-explorer-app": minor
"@memberjunction/server": minor
"@memberjunction/integration-test-suite": minor
---

Add Anchored Conversations and Record Commenting across the database schema (`AnchorType`, `AnchorKey`, `AnchorMetadata` with `IConversationAnchorMetadata`, `IsResolved`, `ResolvedByUserID`, `ResolvedAt`), `ConversationEngine`, server-side RLS + FLS read enforcement (`AnchoredConversationPostRunViewHook` on `MJ: Conversations` and `MJ: Conversation Details`), two-stage write-time FLS restricted-field classification via `AIPromptRunner` (`Anchored Comment Restricted Field Classifier`) without value-matching refusal oracles or restricted `quotedValue` snapshots, FLS/RLS-aware `@mention` notifications, entity-level commenting configuration (`MJ: Entities.Configuration.Comments.Enabled` and `RequiredPermission` — enabled by default and configurable per entity via `Configuration.Comments.Enabled: false`), record-bound "Ask AI" overlay conversations (`LinkedEntityID` + `LinkedRecordID`), and `@memberjunction/ng-base-forms` (`<mj-record-comments>` with `MJ_CommentsPanel_Width` user preference persistence, field/section/group comment badges, `FormSectionIndicators` rollup, and click-to-navigate anchor scrolling).
