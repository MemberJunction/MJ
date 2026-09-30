---
"@memberjunction/core": patch
"@memberjunction/graphql-dataprovider": patch
"@memberjunction/realtime-runtime": patch
---

Add `ConnectGraphQLClient` for embeds that need an authenticated client without the full metadata boot (#4887). `SetupGraphQLClient` now rejects when no metadata loaded; the metadata refresh-check throttle is armed only by a successful check; a cold boot no longer re-fetches the current user.
