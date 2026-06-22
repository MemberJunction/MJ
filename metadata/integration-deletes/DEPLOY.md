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

## Final destructive step — remove the connector CODE from core (separate commit, build-verified)

The metadata above is build-safe. The code removal below deletes a package and must be done with a full
`npm install` + build to verify (blast radius is small — only `@memberjunction/server-bootstrap` references
`@memberjunction/integration-connectors`):

1. Delete the moved source metadata: `metadata/integrations/.{vendor}.json` (root dotfiles, **keep**
   `.betty.json` / `.integrations.json` / `.mj-sync.json`) and `metadata/integrations/<vendor>/` subdirs.
2. `git rm -r packages/Integration/connectors` — the core `@memberjunction/integration-connectors` package
   (the new repo now owns that npm name).
3. Remove `@memberjunction/integration-connectors` from `packages/ServerBootstrap/package.json`.
4. `npm run mj:manifest:server-bootstrap` — regenerates `mj-class-registrations.ts` **without** the
   connector imports/registrations (do **not** hand-edit the generated file).
5. `npm install` then build `@memberjunction/server-bootstrap` to confirm it compiles connector-free.

`RelationalDBConnector` / `FileFeedConnector` are framework-generic primitives with no vendor catalog — if
you want them to remain in core, keep their source under a retained home before step 2 (open decision).
