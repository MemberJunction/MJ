---
"@memberjunction/core": patch
---

Remove leftover integration metadata folders that survived the connector-metadata removal (#2942). Connectors are now managed in the `MemberJunction/Integrations` repo, so MJ carries none of this:

- `metadata/integration-object-deletes/` — stale one-time `deleteRecord` marker files (`.old-<vendor>-seed.deletes.json` for growthzone/imis/netforum/nimble/propfuel/salesforce/sharepoint) from an earlier connector rebuild; already applied, pure cruft.
- `metadata/integrations/` — the remaining orphaned files: `.betty.json`, `.mjtomj.json`, `.integrations.json` (File Feed), `.mj-sync.json`, and `additionalSchemaInfo.json`.

File-level cleanup only — no schema change. Note: the `File Feed` and `Betty AI` Integration **rows** that #2942's migration intentionally retained are not deleted here; their DB removal (and Betty/MJtoMJ repo seeding) is handled by their respective connector PRs.
