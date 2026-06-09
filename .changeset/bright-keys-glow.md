---
"@memberjunction/core": minor
"@memberjunction/api-keys": patch
"@memberjunction/core-entities": patch
"@memberjunction/server": patch
"@memberjunction/ng-core-entity-forms": patch
---

Add KeyPrefix column to APIKey table for visual key identification. Stores the configured prefix plus 4 characters of the random body (e.g., "mj_sk_a1b2") at creation time so administrators can differentiate API keys without exposing the full key.
