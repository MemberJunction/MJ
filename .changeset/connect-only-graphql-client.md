---
"@memberjunction/core": patch
"@memberjunction/graphql-dataprovider": patch
"@memberjunction/realtime-runtime": patch
"@memberjunction/ng-bootstrap": patch
"@memberjunction/ng-workspace-initializer": patch
---

Add `ConnectGraphQLClient` for embeds that need an authenticated client without the full metadata boot (#4887). `SetupGraphQLClient` now rejects when no metadata loaded, carrying the metadata download's failure as the cause (a user with no roles still gets the no-roles screen in Explorer and Bootstrap apps); the metadata refresh-check throttle is armed only by a successful check, and a failed metadata download no longer locks out an immediate retry; a cold boot no longer re-fetches the current user. Switching credentials on the provider (for example an anonymous connection upgraded to a login) rebuilds its GraphQL client so requests carry the new identity.
