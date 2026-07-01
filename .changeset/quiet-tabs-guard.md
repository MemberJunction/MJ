---
"@memberjunction/ng-explorer-core": patch
"@memberjunction/ng-shared": patch
---

Fix a single-resource-mode tab reuse leak that allowed stale resource query params to appear on reused tabs. Resource-owned URL state now writes through a tab-scoped, resource-identity-guarded query-param path, so cached components cannot push stale params like `conversationId` or `minRelevance` onto a tab that has since been reused for `/record/...`. This prevents the record URL flash/navigation trap while preserving legitimate query-param state owned by the current resource.
