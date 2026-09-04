---
"@memberjunction/core-entities": patch
"@memberjunction/server": patch
---

Fix Smart Filter doing nothing when a User View is first created.

`MJUserViewEntityExtended.Save()` detected a brand-new view with `!this.ID`. Since `NewRecord()` began pre-assigning a UUID primary key that check is never true, and because the first value written to a fresh field also seeds its `OldValue`, neither `SmartFilterEnabled` nor `SmartFilterPrompt` reads as Dirty on create. The net effect was that the AI Smart Filter pass never ran on create: the prompt was stored but no `WhereClause` was generated. Editing an existing view still worked.

- Newness is now detected with `IsSaved`, in both `Save()` and `UpdateWhereClause()`.
- On a new record, the empty `FilterState` seeded by `NewRecord()` no longer erases a `WhereClause` that a caller set directly (programmatic view creation without `CustomWhereClause`).
- A saved view whose `SmartFilterWhereClause` was never generated (e.g. created while this bug was live) is regenerated on its next `UpdateWhereClause()`.
- The `UpdateWhereClause` GraphQL query now awaits and forces the regeneration, uses the read-write provider for its save, and fails clearly if the view cannot be loaded.
