---
"@memberjunction/core": patch
---

Document what `RunView`'s `ResultType` actually returns, reflecting the always-on simple-row normalization: `'simple'` rows are plain objects whose `Date` and numeric columns are normalized to real `Date`s and `number`s on every tier — server or browser, fresh query or cache hit — matching the generated entity types. The docs also state what a plain row still cannot honor when a generated entity type is passed as `T` (no entity methods, closed-union columns hold whatever string the database held, `Fields`-narrowed properties are absent) and the one normalization gap (view-only runs with neither `EntityName` nor a loaded `ViewEntity`). Rule of thumb: want entity behavior, ask for entity objects; `'simple'` is for cheap read-only rows whose dates and numbers are already the declared types. Docs only — the behavior itself ships in the always-on normalization change.
