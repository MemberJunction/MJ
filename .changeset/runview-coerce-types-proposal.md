---
"@memberjunction/core": minor
---

PROPOSAL — optional `RunViewParams.CoerceTypes`. Opt-in, default off: when set, `'simple'` rows get their `Date` and numeric columns converted to real `Date`s and `number`s, so the values match a generated entity type. Off by default because the inverse is equally silent — code reading these as strings is correct today and would start receiving `Date`s with no compiler involvement. The field list is computed once per view from `EntityInfo` rather than per cell, and rows are COPIED rather than mutated, because on a cache hit the rows handed back can be the cache's own objects and writing Dates into them would poison the entry for the next non-coercing reader. Ignored when `ResultType` is `'entity_object'`, which already converts on `Get`/`Set`. Note this makes values less wrong, not the type honest: a closed-union column still receives whatever string the database held.
