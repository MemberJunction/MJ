---
"@memberjunction/core-entities": patch
"@memberjunction/server": patch
---

Fix Smart Filter and Traditional Filter doing nothing when a User View is first created.

`MJUserViewEntityExtended.Save()` detected a brand-new view with `!this.ID`. Since `NewRecord()` began pre-assigning a UUID primary key, that check is never true, and because the first value written to a fresh field also seeds its `OldValue`, none of `FilterState` / `SmartFilterEnabled` / `SmartFilterPrompt` read as Dirty on create either. The net effect was that `UpdateWhereClause()` never ran on create: the AI Smart Filter prompt was stored but no `WhereClause` was generated, and a Traditional Filter's `FilterState` was stored without being compiled to SQL. Editing an existing view still worked, which is why the symptom looked environment-specific.

- Newness is now detected with `IsSaved`, in both `Save()` and `UpdateWhereClause()`.
- A saved view whose `SmartFilterWhereClause` was never generated (e.g. created while this bug was live) is regenerated on its next `UpdateWhereClause()`.
- The `UpdateWhereClause` GraphQL query now awaits the regeneration and forces it, instead of racing an un-awaited call against `Save()`.
