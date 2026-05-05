---
"@memberjunction/core": patch
"@memberjunction/generic-database-provider": patch
"@memberjunction/server": patch
---

Tolerate non-ISO `maxUpdatedAt` values in the smart cache check so a malformed timestamp degrades to a cache miss instead of throwing `Invalid time value`. Also expand the MJAPI GraphQL operation log so nested variables render as truncated JSON instead of Node's `[Object]` placeholders.
