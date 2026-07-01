---
"@memberjunction/ng-explorer-core": patch
"@memberjunction/ng-shared": patch
---

Fix a single-resource-mode tab reuse leak that caused a URL flash / stuck loading overlay. The conversation component wrote `conversationId` via "active tab" query params, but after opening a record the same tab id can now represent `/record/...`. A cached conversation component could still push `conversationId` onto that reused record tab, causing the flash/stuck behavior. Guard Explorer tab query-param writes against reused tabs so a cached conversation component can no longer write conversation params onto a tab that has been reused for a record.
