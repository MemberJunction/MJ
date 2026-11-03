---
"@memberjunction/ng-conversations": patch
"@memberjunction/ng-explorer-core": patch
---

Renames `ConversationChatAreaComponent.openConversationArtifactForCommand` to `OpenConversationArtifactForCommand`, as MJ's naming standard requires for public members. The method came in with #5896 and hasn't been released, so there's no deprecated alias. Its callers in `ChatConversationsResource` are updated. This clears the MJ standards check that has failed on every PR since #5896.
