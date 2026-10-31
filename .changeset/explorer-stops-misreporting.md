---
"@memberjunction/ai-core-plus": patch
"@memberjunction/ng-dashboards": patch
"@memberjunction/ng-explorer-core": patch
"@memberjunction/ng-list-detail-grid": patch
"@memberjunction/ng-workspace-initializer": patch
"@memberjunction/ng-conversations": patch
"@memberjunction/ng-entity-viewer": patch
"@memberjunction/graphql-dataprovider": patch
"@memberjunction/lists": patch
"@memberjunction/core": patch
"@memberjunction/search-engine": patch
"@memberjunction/templates-base-types": patch
---

Explorer surfaces stop reporting state the server never sent:
- A client holding a metadata snapshot keeps serving it when the metadata status check cannot reach the server (connection refused, DNS failure, offline, or a gateway/timeout status), instead of failing with "System Error". Only a transport failure degrades this way (`IsTransportError` in `@memberjunction/core`; `SafeGraphQLError.IsTransportFailure` carries the verdict past the GraphQL error sanitizer); a server that answered — an access denial, a validation rejection — propagates as before.
- A run the server force-failed no longer keeps spinning, and an agent run that ended by asking the user a question (AwaitingFeedback) or is parked on a workflow (Paused) is no longer painted as a failure.
- A dashboard no longer reports 0% for a run of successes, and global search reports incomplete results through `EntitySearchProvider.OnIncompleteResults` and the log instead of dropping them silently (no UI shows the report yet).
- An app with more than 1000 entities shows all of them, and an unwarmed template cache no longer crashes the form that fixes it.
- Opening a record works on entities whose primary key is not called `ID`.
- List membership filters run on PostgreSQL for uuid and integer keys (`ListMembershipFilter` in `@memberjunction/core`).
- List sources resolve every match as the acting user, not the entity's UserViewMaxRows page.
