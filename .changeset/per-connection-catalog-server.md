---
"@memberjunction/server": patch
---

Per-connection integration catalog, server half: the overflow promoter and `enforceSchemaLimits` write the connection's own rows, and every catalog-touching mutation runs in the connection's catalog scope. A schema build and a refresh's field-map reconcile read the connection's field rows directly, so a cold field cache can no longer build empty tables or disable field maps. The post-restart introspection loads the connection's catalog and warms the fields it reads, and a post-restart promotion that fails for an entity now fails its pending work instead of completing it.

Behaviour change for API callers: `autoEnableNewObjects` and `autoEnableNewColumns` both default to `false` again. Newly discovered objects arrive Active but unselected, while still reaching key inference and the migration, and new columns on a refresh arrive with their field maps disabled. Pass `true` to adopt them automatically.
