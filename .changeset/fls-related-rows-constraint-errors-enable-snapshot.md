---
"@memberjunction/core": patch
"@memberjunction/generic-database-provider": patch
"@memberjunction/core-entities-server": patch
---

Field-level security follow-ups. Related rows loaded with a record (`EntityRelationshipsToLoad`) now get the user's allowed-column list and Read row filter, and a relationship to an entity the user cannot read is skipped (#5982). A save that fails on a database constraint no longer returns the column values the database quoted to a caller who is denied any field of the entity; the server log keeps the full message (#5981). Turning `EnableFieldLevelSecurity` on reads the entity's existing field-permission rows from the database instead of cached metadata, so rules deleted out of band are recreated rather than leaving every field denied (#5988). The read ignores the entity's row cap, so re-enabling an entity with more rules than `UserViewMaxRows` works.
