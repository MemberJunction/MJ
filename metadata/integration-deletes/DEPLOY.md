# Release B — retire the seeded vendor connector catalog

Vendor connectors now live in [`MemberJunction/Integrations`](https://github.com/MemberJunction/Integrations)
and seed their own metadata on install. This directory (plus `integration-object-field-deletes/` and
`integration-object-deletes/`) and the v5.43 retire migration remove the connector catalog that core used
to seed for every install.

**Sequencing (do not reorder):** ship this **only after** the additive release A
(multi-app + connector-profile install, PR #2928) is published **and** the `MemberJunction/Integrations`
repo is live — otherwise an install left with `Integration.ImportPath` rows but no connector package would
fail to resolve connectors at boot.

## What's generated (by `scripts/generate-connector-retire.mjs`)

| Artifact | Purpose |
|---|---|
| `integration-object-field-deletes/.connector-iof.deletes.json` | top-level `deleteRecord` for every seeded IntegrationObjectField (13,785) |
| `integration-object-deletes/.connector-io.deletes.json` | … every seeded IntegrationObject (875) |
| `integration-deletes/.connector-integration.deletes.json` | … every seeded Integration with a primaryKey (22) |
| `migrations/v5/V202606221600__v5.43.x__Retire_Connector_Integration_Seed.sql` | forward-fix that nets the same rows out of a **fresh** install, keyed on `Integration.ClassName` (covers all 34, incl. the newer connectors whose metadata had no primaryKey), **guarded** so it never deletes a row an existing install is using (`NOT EXISTS … CompanyIntegration`) |

Regenerate any time with: `node scripts/generate-connector-retire.mjs`

## Applying to an existing install (operator)

The deletes are processed in reverse-FK order (IOF → IO → Integration) per the root
`metadata/.mj-sync.json` `directoryOrder`. Use `--delete-db-only` so DB-only FK referencers are swept:

```bash
mj sync push --dir metadata \
  --include "integration-object-field-deletes,integration-object-deletes,integration-deletes" \
  --delete-db-only
```

## Connector CODE removal — DONE in this PR

The connector source + tests have been removed from core (they now live in
`MemberJunction/Integrations`), alongside the metadata retirement above:

1. **Source metadata removed** — `metadata/integrations/.{vendor}.json` (root dotfiles) and
   `metadata/integrations/<vendor>/` subdirs. Kept: `.betty.json` (already-deleted marker),
   `.integrations.json`, `.mj-sync.json`, `additionalSchemaInfo.json`.
2. **Package removed** — `packages/Integration/connectors` (all 35 connector classes **+ tests/fixtures**).
   The `@memberjunction/integration-connectors` npm name is now owned by `MemberJunction/Integrations`.
3. **ServerBootstrap dep removed** — dropped from `packages/ServerBootstrap/package.json`.
4. **Bootstrap manifest** — the connector import block + 35 registration entries removed from
   `mj-class-registrations.ts` (the only core file that referenced them). A subsequent
   `npm run mj:manifest:server-bootstrap` reproduces this exactly (the package is gone).

Note: `RelationalDBConnector` / `FileFeedConnector` are framework-generic primitives with no vendor
catalog. They moved with the rest into the shared package (the "one package" decision); if core should
retain them natively, relocate their source to a kept home — open decision, see the MJ PR.
