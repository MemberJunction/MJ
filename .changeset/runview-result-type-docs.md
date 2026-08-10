---
"@memberjunction/core": patch
---

Document what `RunView`'s `ResultType` actually returns. `'simple'` hands back the raw transport shape — no `BaseEntity` is constructed, so a `DATETIME` column arrives as an ISO string rather than a `Date` — while `'entity_object'` runs every row through `BaseEntity`, whose `Get`/`SetLocal` convert to a real `Date`. `RunView<T>` takes a caller-supplied `T` with no relationship to `ResultType`, so passing a generated entity type to a `'simple'` read compiles perfectly and is wrong at runtime. The failure mode is silent: a date compared with `<` against a string, or sorted with `localeCompare`, produces an order rather than an error, so downstream totals still balance on the wrong sequence. Docs only — no behaviour change.
