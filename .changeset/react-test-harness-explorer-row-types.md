---
"@memberjunction/react-test-harness": minor
---

RunView and RunViews rows reach the component shaped as MJ Explorer returns them: date fields are `Date` and numeric strings are numbers (the per-cell rules of `ProviderBase.NormalizeSimpleRowTypes`), and `'entity_object'` rows are objects whose fields are prototype getters, so spreading, `Object.keys` and `JSON.stringify` lose them as with a `BaseEntity`. Components that passed against ISO strings and plain objects but broke in Explorer now fail in the harness. RunQuery rows are unchanged.
