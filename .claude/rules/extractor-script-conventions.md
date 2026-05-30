---
description: Conventions for IO/IOF extractor scripts.
applies_to: connectors-registry/**/scripts/extract-*.ts
---

# Extractor script conventions

Applies to scripts under `packages/Integration/connectors-registry/<vendor>/scripts/`. These scripts implement the **code-first principle**: their structured output IS the agent's emission. Reasoning is meta-level (which script to write); the answers come from running the script.

The script's output is consumed by the workshop's `extract-iiof-pipeline` locked primitive, which then routes each emitted claim through `verify-claim` + `adversarial-verify` before write-back to the per-vendor metadata file.

## Runtime

- TypeScript ESM. Runnable via `npx tsx <script>` from the connector directory.
- No external state mutation beyond the `mj-metadata` MCP calls + the `CODE_EVIDENCE.json` append.

## Standard structure

```typescript
#!/usr/bin/env tsx
// scripts/extract-io-iof.ts
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { z } from 'zod';

// 1. Define Zod schemas for the vendor's catalog response shape
const VendorObjectSchema = z.object({ /* ... */ });
const VendorFieldSchema = z.object({ /* ... */ });

// 2. Fetch the catalog (OpenAPI / Postman / docs / SDK type defs)
async function fetchCatalog(): Promise<unknown> { /* ... */ }

// 3. Parse + validate
async function parseCatalog(raw: unknown): Promise<{ ios: VendorObject[]; iofsByIO: Record<string, VendorField[]> }> { /* ... */ }

// 4. Connect to mj-metadata MCP via stdio
async function connectMCP() {
    const transport = new StdioClientTransport({ command: 'mj-metadata-mcp' });
    const client = new Client({ name: 'extract-io-iof', version: '1.0' }, { capabilities: {} });
    await client.connect(transport);
    return client;
}

// 5. Upsert via MCP tools (NOT direct file writes)
async function main(): Promise<void> {
    const raw = await fetchCatalog();
    const { ios, iofsByIO } = await parseCatalog(raw);
    const client = await connectMCP();
    let stats = { IOCreated: 0, IOFCreated: 0 };
    for (const io of ios) {
        await client.callTool({ name: 'upsert_integration_object', arguments: { connector: '<name>', io } });
        stats.IOCreated++;
        for (const iof of iofsByIO[io.Name] ?? []) {
            await client.callTool({ name: 'upsert_integration_object_field', arguments: { connector: '<name>', ioName: io.Name, iof } });
            stats.IOFCreated++;
        }
    }
    process.stdout.write(JSON.stringify(stats, null, 2) + '\n');
}

main().catch(err => { console.error(err); process.exit(1); });
```

## Bounds

- Cap IO at 1000 per run. If hit, exit with non-zero + clear error. Runaway extraction = bug.
- Cap wall-clock at 10 minutes. If exceeded, vendor's catalog is too large for one-shot extraction; chunk by category.

## Idempotency

- Re-running the script upserts the same rows; never duplicates. The `mj-metadata` MCP's upsert tools handle this.
- Phase 0 `IntegrationSchemaSync` overlay precedence applies: declared (the script's output) wins for semantic fields (DisplayName, Description-when-set, Sequence, Category); discovered wins for DDL-affecting fields when the live integration is later introspected.

## Source-tier discipline

- Prefer OpenAPI spec → SDK type defs → Postman collection → HTML docs.
- Tier-1 sources produce confident emissions. Tier-3 sources should NOT touch hard-constraint fields.

## v5.39.x per-operation CRUD emission (REQUIRED when SupportsWrite=true)

For each IO with `SupportsCreate/Update/Delete=true`, emit the corresponding per-operation columns:

| Column | What to extract |
|---|---|
| `CreateAPIPath` | POST path with template vars (e.g. `/contacts`, `/parents/{ParentID}/children`) |
| `CreateMethod` | Usually `POST`; some vendors use `PUT` for create-or-upsert |
| `CreateBodyShape` | `flat` (POST `{field: value}`) or `wrapped` (POST `{<key>: {field: value}}`) |
| `CreateBodyKey` | When BodyShape=wrapped, the outer key (e.g. `record`, `data`) |
| `CreateIDLocation` | Where the new ID appears in the response: `body.id`, `body.data.id`, `header.Location`, etc. |
| `UpdateAPIPath` | PATCH/PUT path including the ID placeholder |
| `UpdateMethod` | `PATCH` or `PUT` |
| `UpdateBodyShape`, `UpdateBodyKey`, `UpdateIDLocation` | Same as Create |
| `DeleteAPIPath` | DELETE path including the ID placeholder |
| `DeleteIDLocation` | Where the deleted-record ID is acknowledged in the response (path-templated or `body.id`) |
| `IncrementalWatermarkField` | When `SupportsIncrementalSync=true`, the vendor-side cursor/timestamp field name |

Every emitted per-operation column gets a CODE_EVIDENCE entry citing the extraction script + source line.

## Soft PK boundary (D4 / Gap 10)

The script emits `IsPrimaryKey=true` ONLY when the source has an explicit primary-key marker for the field ("primary key" / "unique identifier" / "system ID" wording, or an OpenAPI `x-primary-key` extension). Otherwise leave `IsPrimaryKey` unset; the runtime `SoftPKClassifier` handles ambiguous cases when sample data is available.

For vendor-wide PK conventions (e.g. "all HubSpot CRM object PKs are 'id'"), emit `Integration.Configuration.universalPK = { fieldName: 'id' }` — do NOT mark individual IOFs.

## FK detection

Emit `RelatedIntegrationObjectID` (via `@lookup:` reference resolved at sync push time) when the source declares an explicit FK relationship. Required-ordering in API paths (`/parents/{ParentID}/children` implies `ParentID` references parents) is acceptable evidence.

The Phase 0 `IntegrationSchemaSync` will resolve a `ForeignKeyTarget` name against sibling IO names at persist time (D5). Unresolvable targets leave the field FK-less.

## Hierarchy + traversal order

Observe URL templates. When a path like `/parents/{ParentID}/children` is grouped to an `objectKey`, populate the child IO's `ParentObjectName`, `ParentObjectIDFieldName`, `HierarchyPath`. Compute `TraversalOrder` (topological sort) at end and write to `metadata.fields.TraversalOrder`. Halt + surface error if cycles are detected.

## AdditionalObservations (open block)

When the source surfaces useful information that doesn't map to a canonical field, append to `metadata.fields.AdditionalObservations` / `io.fields.AdditionalObservations` / `iof.fields.AdditionalObservations` with `{Key, Value, Provenance}`. Recurring observations become canonical fields in framework iterations — never skip a finding because no slot exists.

## DO NOT

- Don't hardcode answers. The script reads + emits; it doesn't have answers baked in.
- Don't write to the metadata file with hardcoded vendor object names — only structural patterns (loops, regexes, type maps).
- Don't skip Zod validation. Unvalidated vendor responses → unreliable emissions → `verify-claim` rejects them downstream.
- Don't dump raw vendor responses to stdout. Stdout is structured stats only.
- Don't invoke `SoftPKClassifier`. The script defers PK ambiguity to runtime D4.
