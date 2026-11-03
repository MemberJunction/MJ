---
"@memberjunction/core": minor
"@memberjunction/actions-base": minor
"@memberjunction/ai-core-plus": minor
"@memberjunction/core-actions": minor
---

Follow-ups to host-assigned search scopes (#6234), from review:

- **Scoped Search's `ScopeID` description** (the text the model reads) now states the host rule: in a run whose host assigned search scopes, only those can be searched, the host's first is used when no ScopeID is given, and any other scope is refused.
- **A host-assigned Global scope in a tenant-scoped run** is still refused, now with a message that says the host assigned it, instead of advising a ScopeID that would be refused too.
- **`ExecuteAgentParams.SearchScopeIDs`** documents that an empty list means not assigned; to forbid search, remove Scoped Search with `actionChanges`.
- **`ActionRunScope.SearchScopeIDs`** is typed `string[]`, which is what BaseAgent produces (the key is absent when nothing was assigned).
