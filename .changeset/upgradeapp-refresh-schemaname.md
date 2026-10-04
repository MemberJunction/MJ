---
"@memberjunction/open-app-engine": patch
---

`mj app upgrade` now refreshes an app's `SchemaName` from its manifest, so a corrected schema name — in practice a corrected CASING — no longer has to survive as install-time debris.

`OpenApp.SchemaName` is a denormalized copy of `mj-app.json` → `schema.name`, and it was written ONLY by install. Upgrade rewrote `ManifestJSON` right next to it and left the column alone, so an app whose manifest later fixed its schema name kept the original value forever.

That stale value is not inert. CodeGen's `spUpdateSchemaInfoFromDatabase` backfills `SchemaInfo.CanonicalSchemaName` FROM this column, and `vwEntities` prefers `CanonicalSchemaName` when deriving entity `ClassName`/`CodeName` — as does the runtime GraphQL type-name path. So stale casing propagated into the GraphQL operation names a client constructs, which no longer matched the server's generated resolvers: every operation on the app's entities failed with `GRAPHQL_VALIDATION_FAILED`. Worse, the backfill only ever FILLS NULLS, so once a wrong casing was frozen onto `SchemaInfo` no later codegen pass corrected it.

- `UpgradeApp` writes `SchemaName` alongside `ManifestJSON` in its Step 9 record update, keeping the column in lockstep with the manifest that is the documented source of truth. Written only when the manifest declares a schema, so a schema-less app's column is left untouched.
- `UpgradeApp` also calls `PersistCanonicalSchemaName`, mirroring the install path (Steps 6-7), which re-asserts the canonical name on the app's `SchemaInfo` row. Its UPDATE is unconditional rather than fill-NULLs-only, so this is the one path that HEALS a row already frozen from a stale column. Best-effort by contract (warns, never fatal) and idempotent.

A casing correction is detected as a schema rename by `PruneStaleServerConfig`, which strips the old name's `entityPackageName` mapping and `excludeSchemas` entry — correct, since those config keys are case-sensitive. That detection reads the previous manifest before Step 9 overwrites it, so it is unaffected.

No behaviour change for an app whose manifest schema name has not changed: both writes resolve to the value already stored.
