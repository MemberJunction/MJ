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
- A cold cache plus an unreachable endpoint serves the cached metadata instead of "System Error". Only a transport failure degrades this way (`IsTransportError` in `@memberjunction/core`); a server that answered — an access denial, a validation rejection — propagates as before.
- A run the server force-failed no longer keeps spinning, and an alive (Paused / AwaitingFeedback) agent run is no longer painted as a failure.
- A dashboard no longer reports 0% for a run of successes, and global search no longer drops results silently.
- An app with more than 1000 entities shows all of them, and an unwarmed template cache no longer crashes the form that fixes it.
- Opening a record works on entities whose primary key is not called `ID`.
- List membership filters run on PostgreSQL for uuid and integer keys (`ListMembershipFilter` in `@memberjunction/core`).
- List sources resolve every match as the acting user, not the entity's UserViewMaxRows page.
