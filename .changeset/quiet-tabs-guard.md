---
"@memberjunction/ng-explorer-core": patch
"@memberjunction/ng-shared": patch
---

Fix a single-resource-mode tab reuse leak that caused conversation query params to appear on entity record URLs. Conversation resources now write URL state through a tab-scoped, resource-identity-guarded query-param path, so cached conversation components cannot push `conversationId` onto a tab that has since been reused for `/record/...`. This prevents the record URL flash/navigation trap while preserving legitimate query-param state owned by the current resource.
