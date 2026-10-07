---
"@memberjunction/server": patch
---

The `cacheInvalidation` subscription no longer tells a subscriber the key of a record they could not read. A session whose every read of an entity goes through a row-level security filter now receives the entity, the action and the time only, with no key and no row data, which the client already treats as a whole-entity invalidation; a session with an unfiltered read keeps the key, as before. The entity-level filter is unchanged (#5241).
