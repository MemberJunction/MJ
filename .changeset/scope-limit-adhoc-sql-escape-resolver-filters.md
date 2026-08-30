---
"@memberjunction/server": patch
---

security: refuse ad-hoc SQL for scope-limited sessions, and escape the filters `ResolverBase` builds itself

**Ad-hoc SQL (`AdhocQueryResolver.ExecuteAdhocQuery`).** The resolver runs a raw `SELECT` on the read-only pool — it does not go through `RunView`, entity permissions, or row-level security, so the per-session confinement a magic-link principal relies on (expressed as `{{ScopeResourceID}}` / `{{ScopeResourceType}}` RLS tokens substituted on the entity-read path) does not exist on this path at all. An anonymous magic-link guest or a resource-scoped magic-link session could therefore read the whole database outside its granted scope. Those principals are now refused before a data source is acquired, via a new `IsScopeLimitedPrincipal` predicate exported from `@memberjunction/server`. Ordinary authenticated users — the intended consumers, via `GraphQLDataProvider` — are unaffected.

**`ResolverBase` filter building.** `findBy` (reachable through `UserByEmail`, `FileByName`, `UserViewsByName` and the other by-value resolvers) and the inline view-name lookup in `RunViewByNameGeneric` interpolated client-supplied values into `ExtraFilter` without escaping. `ExtraFilter` is screened by `SQLExpressionValidator`, which blocks stacked statements, `UNION`, comments and `WAITFOR`, so the residual exposure was a same-clause boolean tautology rather than arbitrary SQL — now closed with `EscapeSQLString`. `findBy`'s unquoted slot (numeric and boolean fields, where there is no quote to escape and a string value would simply *be* SQL) now rejects anything that is not a real number or boolean instead of interpolating it.
