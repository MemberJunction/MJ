# Per-Connector Integration Metadata

Each connector gets its own subdirectory under `metadata/integrations/<vendor>/`. The
subdirectory holds the **declared** truth about the connector's integration row
plus its catalog of `IntegrationObject` and `IntegrationObjectField` rows. At
runtime, `IntegrationConnectorCreationPipeline` overlays discovered metadata on
top: declared wins for semantic attributes, discovered wins for technical attributes.

## Folder layout

```
metadata/integrations/
  .mj-sync.json                  # entity context for "MJ: Integrations" + nested IO/IOF
  README.md                      # this file
  additionalSchemaInfo.json      # legacy PK/FK hints consumed by Schema Builder (DO NOT touch)
  <vendor>/                      # one folder per integration; folder name informational only
    .<vendor>.integration.json   # the Integration row + nested IntegrationObject + IntegrationObjectField rows
```

The filePattern in `.mj-sync.json` is `**/.*.integration.json`, so vendor folders
are automatically discovered. Files outside that pattern (READMEs, raw schema
dumps, transient pulls) are ignored by `mj sync push`.

## Authoring a new connector's metadata

1. Pick a vendor slug (lowercase-kebab): `hubspot`, `your-membership`, etc.
2. Create `metadata/integrations/<slug>/` (empty).
3. From the repo root, run a targeted pull to materialize the current DB state:
   ```bash
   npx mj sync pull --dir=metadata --include="integrations"
   ```
   This emits `.<slug>.integration.json` files with the Integration record + all
   `MJ: Integration Objects` (and their nested `MJ: Integration Object Fields`)
   already in the database.
4. Hand-curate semantic fields: `Description`, `DisplayName`, `Category`,
   `Sequence`, and the per-operation CRUD columns added in v5.39.x:
   `CreateAPIPath`, `CreateAPIMethod`, `CreateAPIBodyShape`, `CreateAPIBodyKey`,
   `CreateAPIIDLocation`, `Update*`, `DeleteAPIPath`, `DeleteIDLocation`,
   `IncrementalWatermarkField`.
5. Push:
   ```bash
   npx mj sync push --dir=metadata --include="integrations"
   ```

## Overlay precedence (D0)

`IntegrationConnectorCreationPipeline` (in `@memberjunction/integration-engine`) drives
the merge between declared (this folder) and discovered (live `IntrospectSchema`):

| Attribute               | Winner on overlay                                |
|-------------------------|--------------------------------------------------|
| `Type`, `Length`        | Discovered (DDL truth)                           |
| `AllowsNull`            | Discovered                                       |
| `IsRequired`            | Discovered                                       |
| `IsPrimaryKey`          | Discovered                                       |
| `IsUniqueKey`           | Discovered                                       |
| `IsReadOnly`            | Discovered                                       |
| `Description`           | Declared if non-empty (curated outranks generic) |
| `DisplayName`           | Declared (UI label)                              |
| `Sequence`              | Declared                                         |
| `Category`              | Declared                                         |
| `RelatedIntegrationObjectID` (FK) | Declared if already set; otherwise discovered (D5 FK-graph traversal resolves a `ForeignKeyTarget` name to a sibling ObjectID via name match) |

Every persisted row gets a `MetadataSource` value: `Declared` (came from this
folder), `Discovered` (added by the live integration the first time it was
described), or `Custom` (added by the customer's runtime extension). Per-row
merge winners are streamed via `IntegrationProgressEmitter` (`discovery.*`
events) so the audit trail and admin UI can show who decided what.

## Soft PK classifier (D4)

When `IntrospectSchema` produces an object with no `IsPrimaryKey` field set,
`SoftPKClassifier` runs a non-fabricating cascade:

1. **Universal convention** — vendor-wide hint (e.g. HubSpot CRM is always `id`)
2. **Naming heuristic** — `<ObjectName>Id`, `id`, `uuid`, …
3. **Statistical** — sample rows: exactly one column unique-and-non-null
4. **One-shot LLM** — single inference with the field list; honest `none` if nothing fits

If none is confident enough, the IO row persists **without** a PK. The
runtime D7 rule then prevents `__mj.Entity` from being generated for it — no
fabrication.

## Migrating an existing connector (Phase 0+ followup)

Existing connectors carry hand-rolled `CreateRecord`/`UpdateRecord`/etc.
overrides. The generic implementations in `BaseRESTIntegrationConnector` now
read the per-operation CRUD columns. To migrate a connector:

1. Move the per-object endpoint mapping into `.<vendor>.integration.json` (set
   `CreateAPIPath`, `CreateAPIMethod`, `CreateAPIBodyKey`, `IDLocation`, etc.
   on each `MJ: Integration Objects` row).
2. Push the metadata.
3. Delete the hand-rolled override from the connector class.
4. Re-run regression tests.

Connectors with genuinely vendor-specific CRUD shapes (multipart uploads,
GraphQL mutations, SOAP envelopes) keep their overrides and document why with
a comment.
