---
"@memberjunction/ng-base-forms": minor
"@memberjunction/core": minor
"@memberjunction/core-entities": minor
"@memberjunction/server": minor
---

feat(ng-base-forms): foreign-key lookups get a class-factory seam, the platform search API, metadata scoping, prefix ranking and recent picks.

The stock FK field ran one `LIKE '%q%'` on the name column, twenty rows, no ordering, and nothing an app could override — so on a large related entity a user typing three letters got twenty arbitrary records containing them, and `%` or `_` typed into the field acted as live wildcards.

Rows now come from an `FKLookupStrategy` resolved through the class factory by `<HostEntity>.<Field>`, then `<RelatedEntity>`, then MJ's own default. The default searches the column the user chose with an escaped `LIKE`, prefix matches first (or ranks through `SearchEntity` and hydrates by ID when a field opts into `SearchMode: 'hybrid'`), orders the browse list by the name field, applies the new `EntityField.RelatedEntityFilter` / `RelatedEntityOrderBy` metadata plus `[FKExtraFilter]` / `[FKOrderBy]` inputs — on the engine-cached path too — and leads with the user's last picks for that field, scoped the same way. A strategy can group its rows, give each a second line and chips, veto a pick with the full row it returned, and prefill the create form.

`@memberjunction/server` is listed because its generated GraphQL schema gains the two columns; the shared `fixed` group would bump it regardless, but the release notes should name it.

Minor rather than patch: this ships a migration adding two `EntityField` columns.
