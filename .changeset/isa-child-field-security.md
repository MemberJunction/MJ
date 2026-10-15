---
"@memberjunction/core": patch
"@memberjunction/generic-database-provider": patch
"@memberjunction/graphql-dataprovider": patch
"@memberjunction/server": patch
"@memberjunction/ng-base-forms": patch
---

Field-level security now applies to IS-A child entities (#5367). A child carries each parent field as a mirror field of its own, read from the same row, and every enforcement point asked only the child's own `EnableFieldLevelSecurity` flag, which is off on nearly every child. A role denied `Phone` on a parent could read it through the child's RunView (`simple` results), its single-record load and `GetAll()`.

- **`EntityInfo.FieldLevelSecurityApplies`** (new): true when the entity's own flag is on or any IS-A ancestor's is. Every runtime gate now checks it instead of the raw flag: RunView field lists and search, single-record loads, row projection, the predicate gate, record names, Record Changes payloads, the GraphQL client and resolvers and the form field component.
- **Denied sets inherit.** `GetDeniedReadFields`, `GetDeniedUpdateFields` and `GetDeniedCreateFields` on a child add every field its parent denies (the parent's set already holds its own parent's denials, so any depth is covered). The child's own rules, when its flag is on, still apply to its own fields; a parent denial cannot be re-opened by a child rule.
- Configuration code (reconciliation, CodeGen, the system-user sweeps, permission-change hooks) still reads the raw flag: the rules live on the entity that owns the field.
