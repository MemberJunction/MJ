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

## Multi-source PK/FK detection (Gap 10 revised 2026-05-30)

**Deferring to runtime D4 is the FAILURE mode.** The script must aggregate evidence across every viable source before deferring. See `.claude/agents/ioiof-extractor.md` § "PK detection" / § "FK detection" for the rule; this section is the script-implementation.

### Source loaders (call all of them at the top of the script)

```typescript
const sources = {
    connectorSrc: await loadIfExists(`packages/Integration/connectors/src/${ClassName}.ts`),
    existingMetadata: await loadIfExists(`metadata/integrations/${slug}/.${slug}.integration.json`)
                   ?? await loadIfExists(`metadata/integrations/.${legacySlug}.json`),
    openapi: await loadOpenAPISpec(openapiURL),                // x-primary-key, path ops, Location headers
    vendorDocsText: await loadPDFsAndHTML(docPaths),           // grep "primary key" / "unique identifier"
    sdkTypes: await loadSDKTypeDefs(sdkPaths),                 // annotations
    postman: await loadPostmanCollections(postmanPaths),
};
```

The script **MUST** call every loader. Missing source-loads are visible to the reviewer via the source-check matrix.

### Per-IOF signal aggregator

```typescript
type Tier = 1 | 2;
type Signal = { source: string; tier: Tier; kind: 'PK' | 'FK'; locus: string; excerpt?: string };

function aggregatePKFKSignals(fieldName: string, ioName: string, allSources: SourceBundle): Signal[] {
    const out: Signal[] = [];

    // Tier-1: existing connector source carries the answer
    if (allSources.connectorSrc) {
        const pkLiteral = new RegExp(`['"]${fieldName}['"][^}]*?(IsPrimaryKey|PrimaryKey)\\s*[:=]\\s*true`, 'i');
        if (pkLiteral.test(allSources.connectorSrc)) {
            out.push({ source: 'connector-src', tier: 1, kind: 'PK', locus: `${ClassName}.ts` });
        }
    }
    // Tier-1: OpenAPI GetById path parameter == field
    if (allSources.openapi) {
        for (const [p, methods] of Object.entries(allSources.openapi.paths)) {
            const m = p.match(/\/{([A-Za-z]+)}$/);
            if (m && m[1].toLowerCase() === fieldName.toLowerCase() && methods.get) {
                out.push({ source: 'openapi-getbyid', tier: 1, kind: 'PK', locus: p });
            }
        }
    }
    // Tier-1: OpenAPI POST response Location header → /<resource>/{field}
    // Tier-1: vendor-docs prose grep "primary key|unique identifier|system ID" near field name
    // Tier-2: naming convention applied ≥ 80% of objects
    // Tier-2: field name == sibling IO's emitted PK (cross-IO match for FK)
    // ...
    return out;
}

function classifyPK(signals: Signal[]): 'emit' | 'unique-only' | 'defer' {
    const pk = signals.filter(s => s.kind === 'PK');
    if (pk.filter(s => s.tier === 1).length >= 1) return 'emit';
    if (pk.filter(s => s.tier === 2).length >= 2) return 'emit';
    if (pk.filter(s => s.tier === 2).length === 1) return 'unique-only';
    return 'defer';
}
```

### Vendor-wide universal-PK hint

When the script detects a consistent vendor-wide PK pattern (≥ 80% of objects), emit BOTH:
1. `Integration.Configuration.universalPK = { fieldName: 'id' }` (or whatever the convention is).
2. Individual IOF `IsPrimaryKey=true` on the matched fields per their multi-signal verdict.

The hint is for runtime D4 acceleration; the per-IOF flags are the actual emission floor-check cares about.

### FK detection

Tier-1 signals the script extracts:
- Parametric child path `/Parent/{ParentId}/Children` where `ParentId` matches the parent's emitted PK name.
- Existing connector source contains `RelatedIntegrationObjectID: '<TargetIO>'` literal for this field.
- Vendor docs explicitly describe relationship.

Tier-2:
- Field name == sibling IO's emitted PK AND sibling IO exists in this run.

The script emits `RelatedIntegrationObjectID` as `@lookup:` reference. **Cross-check the lookup target name matches an IO this script actually emits** — singular-vs-plural mismatches (`Member` vs `Members`) are blocking violations the reviewer will catch.

### One CODE_EVIDENCE entry per signal

The script appends one CODE_EVIDENCE entry **per signal that contributes** to the emission. Multi-signal PK emission with 3 signals → 3 CODE_EVIDENCE entries. Each entry cites its source + locus + excerpt.

### Source-check matrix output

The script appends one row per emitted IO to `output/EXTRACTION_REPORT_MATRIX.csv`:

```
IOName,ExistingConnectorTs,ExistingMetadataJson,OpenAPIxPK,OpenAPIPathOps,OpenAPILocationHeader,VendorDocsProseScan,SDKTypes,PostmanCommunity,NamingConvention,CrossIOMatch,PKVerdict,FKVerdict,EvidenceCount
```

Each column is `yes` / `no` / `n/a` (`n/a` when the source doesn't exist for this vendor). The reviewer and floor-check cross-validate this matrix against the emission and the source bundle.

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
