# Release B — retire the seeded vendor connector catalog

Vendor connectors now live in [`MemberJunction/Integrations`](https://github.com/MemberJunction/Integrations)
and seed their own metadata on install. This retires the connector catalog + code from MJ core.

**Sequencing (do not reorder):** ship **only after** release A (multi-app + connector-profile install,
PR #2928) is published **and** the `MemberJunction/Integrations` repo is live.

## Version-based retirement rule (per RECORD, classified against the `v5.41.0` tag)

A record = an Integration, IntegrationObject, or IntegrationObjectField. `scripts/generate-connector-retire.mjs`
classifies each record in `next` against the `v5.41.0` snapshot (the "before 5.42.0" boundary):

| Case | Condition | Core action | Integrations repo |
|---|---|---|---|
| **A** | present at v5.41.0, **not** already deleteRecord-tagged | **tag with a top-level deleteRecord** (removes it from existing customer DBs that seeded it pre-5.42) | moved |
| **B** | present at v5.41.0, **already** deleteRecord-tagged (Betty) | **left as-is** — not re-tagged | **not** moved |
| **C** | **added in 5.42.0** (absent at v5.41.0) | **source removed only** — never deleteRecord, never a DB delete (it was never shipped to a customer DB) | moved |

Counts this produced: **A = 22 INT / 875 IO / 13,785 IOF** · B = 1 / 6 / 36 · **C = 12 INT / 4,016 IO / 98,584 IOF**.

**Within-file mixing is handled per-record, not per-file.** 8 connectors (GrowthZone, iMIS, NetForum,
NetSuite, NimbleAMS, PropFuel, Salesforce, SharePoint) had a pre-5.42 Integration row (Case A) but their
IO/IOF were all built out in 5.42 (Case C) — so only their **Integration row** becomes a deleteRecord; their
IO/IOF are simply dropped when the source file is removed. Salesforce alone has 33,160 Case-C records that are
**not** deleted from any DB.

Regenerate with: `NEXT_METADATA_DIR=/path/to/clean/next/metadata node scripts/generate-connector-retire.mjs`

## Generated deleteRecord files (Case A only)

One entity per directory; reverse-FK order (IOF → IO → Integration) via the root `metadata/.mj-sync.json`
`directoryOrder`:

| File | Records |
|---|---|
| `integration-object-field-deletes/.connector-iof.deletes.json` | 13,785 IOF |
| `integration-object-deletes/.connector-io.deletes.json` | 875 IO |
| `integration-deletes/.connector-integration.deletes.json` | 22 Integration |

**No forward-fix migration is emitted.** The committed deleteRecord files ARE the durable mechanism — a
deploy-time `mj sync push` applies them on both fresh and existing installs. A migration was deliberately
avoided: it would delete by a coarser key and risk removing Case-C rows, which this rule forbids.

## Applying to an install (operator)

```bash
mj sync push --dir metadata \
  --include "integration-object-field-deletes,integration-object-deletes,integration-deletes" \
  --delete-db-only
```

## Connector CODE removal (build-verified, in this PR)

The connector source + tests were removed from core alongside the metadata retirement:

1. **Source metadata removed** — Case A + Case C connector files (`metadata/integrations/.{vendor}.json` and
   `<vendor>/` subdirs). Case A's removal is paired with its deleteRecord files above; Case C is simply gone.
   Kept: `.betty.json` (Case B marker), `.integrations.json`, `.mj-sync.json`, `additionalSchemaInfo.json`.
2. **Package removed** — `packages/Integration/connectors` (all connector classes **+ tests/fixtures**).
   The core `@memberjunction/integration-connectors` package is retired; in `MemberJunction/Integrations`
   each connector is now its **own** package (`@memberjunction/connector-<name>`), so installing one
   connector never pulls the others.
3. **ServerBootstrap** — dep dropped from `package.json`; the connector import block + 35 registration entries
   + package-name list removed from the generated `mj-class-registrations.ts` (the only core referencer).
   A later `mj codegen manifest` reproduces this exactly. Verified: `turbo build --filter=@memberjunction/server-bootstrap` succeeds connector-free.

`RelationalDBConnector` / `FileFeedConnector` are framework-generic primitives with no vendor catalog; they
moved with the rest (one-package decision). Relocate if core should retain them natively (open decision).
