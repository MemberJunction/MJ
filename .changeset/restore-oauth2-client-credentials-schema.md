---
"@memberjunction/core": patch
---

Restore `metadata/credential-types/schemas/oauth2-client-credentials.schema.json`, which was inadvertently deleted in #2942 alongside the connector-specific credential-type schemas. It is a **generic** OAuth2 client-credentials schema still referenced (via `@file:`) by a retained credential type in `.credential-types.json`, so its removal broke `mj sync push --dir metadata` with a "File reference not found" validation error. No other `@file:` references are dangling.
