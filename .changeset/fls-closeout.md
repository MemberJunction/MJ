---
"@memberjunction/core": patch
"@memberjunction/core-entities-server": patch
"@memberjunction/generic-database-provider": patch
"@memberjunction/graphql-dataprovider": patch
"@memberjunction/server": patch
"@memberjunction/record-cloning": patch
"@memberjunction/ng-base-forms": patch
---

Field-level security close-out.

**IS-A children inherit their ancestors' field rules (#5367).** A child carries each parent field as a mirror field of its own, read from the same row, and every enforcement point asked only the child's own `EnableFieldLevelSecurity` flag, which is off on nearly every child. A role denied `Phone` on a parent could read it through the child's RunView (`simple` results), its single-record load and `GetAll()`.

- **`EntityInfo.FieldLevelSecurityApplies`** (new): true when the entity's own flag is on or any IS-A ancestor's is. Every runtime gate now checks it instead of the raw flag: RunView field lists and search, single-record loads, row projection, the predicate gate, record names, Record Changes payloads, entity-value projection, the GraphQL client and resolvers, record cloning and the form field component.
- **Denied sets inherit.** `GetDeniedReadFields`, `GetDeniedUpdateFields` and `GetDeniedCreateFields` on a child add every field its parent denies (the parent's set already holds its own parent's denials, so any depth is covered). The child's own rules, when its flag is on, still apply to its own fields; a parent denial cannot be re-opened by a child rule.
- **Only mirrored fields inherit.** A child field inherits a denial only when it mirrors a parent field of the same `Name`; a child's own field whose name merely equals a denied parent field's `CodeName` (for example `Base_Salary` against a parent's `Base Salary`) stays readable.
- `EntityInfo.ParentChain` caches only a complete chain, so a chain read before the parent entity resolved can no longer pin "no ancestors" and switch inherited rules off.
- Configuration code (reconciliation, CodeGen, the system-user sweeps, permission-change hooks) still reads the raw flag: the rules live on the entity that owns the field.

**Denied-set memo.** The per-(entity, user) memo is keyed on the entity's field-security generation plus each IS-A ancestor's, the field array and the user's role IDs, instead of field and rule counts. A metadata refresh builds new `EntityInfo` objects (a new generation); `EntityInfo.InvalidateFieldSecurityCache()` (new) is for code that edits rules in place, and invalidates descendants too. An in-place `Allow` → `Deny` edit, invisible to a count, now takes effect.

**`IsRestrictingFieldRule`** reads `Deny` case- and whitespace-insensitively, as the aggregation does. `IsRestrictingFieldRuleAnyCase` in core-entities-server now delegates to it.

**IS-A subtype selection.**
- `BaseEntity.IsFieldReadableByActiveUser(name)` (new): the readability question `Get()` asks, answered without throwing.
- A `SubtypeSelector` path that reaches a field the acting user may not read gives "no subtype" instead of throwing a `FieldSecurityError` out of `ResolveSubtypeEntityName`. A record found in an engine cache (loaded as the system user, every column present) is read with the acting user's rules.
- The selector's FK-target lookup memo is keyed by user as well as provider, so one user's loaded record is never handed to another; a lookup with no user is not memoized.

**BaseEngine.** On a server, an engine that loads an entity with field-level security logs once per engine and entity that its data is loaded as the system user and must be projected for the acting user before it reaches a person. No behaviour change.
