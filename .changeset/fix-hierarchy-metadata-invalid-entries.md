---
"@memberjunction/core-entities": minor
---

fix(metadata): remove invalid entries from the hierarchy configuration seed

`metadata/entities/.entity-field-hierarchy-configurations.json` (added in #3939) declared
`Hierarchy.IsHierarchy` for four entities that cannot resolve. `mj sync push` runs in a single
transaction, so any one bad `@lookup` rolls the whole push back — meaning **no** `Configuration`
value was seeded for **any** entity, not just the four. With `IsHierarchy` then false everywhere,
the next `mj codegen` regenerated every base view without its hierarchy projections and dropped
the `Root*ID` columns the migrations had correctly created, leaving `EntityField` rows demanding
columns that no longer existed (`Invalid column name 'RootParentID'`). On a from-scratch database
this made `mj sync push` and `mj codegen` both unrunnable.

- `MJ: Prompt Categories` → `MJ: AI Prompt Categories`. No entity by the former name exists; the
  latter has the `ParentID` self-referencing FK the entry intends, and `vwAIPromptCategories`
  already carries `RootParentID`.
- Removed `MJ: Resource Types`, `MJ: Roles` and `MJ: Tests`. Each declared a `ParentID` hierarchy,
  but none has a `ParentID` field, a self-referencing FK, or any parent column on its underlying
  table (`ResourceType`, `Role`, `Test`) — so the lookups could never resolve.

Verified on a database built from migrations alone: `mj sync push` now completes (13,777 records,
0 errors) and seeds all 14 remaining declarations.

Not addressed here — 18 `RootParentID` fields on genuine tree entities remain undeclared, and the
seed file's `Name=ParentID` shape cannot express non-`ParentID` hierarchy fields such as
`ParentArchitectureID` or `ParentChunkID`. Both need a decision on the opt-in surface rather than
another entry.
