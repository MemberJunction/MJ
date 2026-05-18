---
description: Conventions for IO/IOF extractor scripts.
applies_to: connectors-registry/**/scripts/extract-*.ts
---

# Extractor script conventions

Applies to scripts under `packages/Integration/connectors-registry/<name>/scripts/`. These scripts implement the **code-first principle**: their structured output IS the agent's emission. Reasoning is meta-level (which script to write); the answers come from running the script.

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

## Source-tier discipline

- Prefer OpenAPI spec → SDK type defs → Postman collection → HTML docs.
- Tier-1 sources produce confident emissions. Tier-3 sources should NOT touch hard-constraint fields (IsPrimaryKey, IsRequired, FK refs).

## Universal PK detection gates

Apply gates DP1-DP8 from `INTEGRATION-FRAMEWORK-REQUIREMENTS.md` §5.1 in order; first match wins. Self-report the matched gate per IO as `PrimaryKeyDetectionMethod`. Provable matches → write `IsPrimaryKey=true` with CODE_EVIDENCE; Likely → write + flag; Unknown → don't write, surface as gap for post-sync `LightweightConstraintDiscovery`.

## Universal FK detection gates

Apply gates DF1-DF7 from §5.2.1. Multiple matches strengthen confidence. Self-report matched gate(s) per IOF as `FKDetectionMethod`. Definite → write `IsForeignKey=true` + `RelatedIntegrationObjectID` with CODE_EVIDENCE; Strong/Moderate → write + flag; Weak → don't write FK, surface as gap.

## Hierarchy + traversal order

Observe URL templates. When a path like `/parents/{ParentID}/children` is grouped to an `objectKey`, populate the child IO's `ParentObjectName`, `ParentObjectIDFieldName`, `HierarchyPath` (per §5.3). Compute `TraversalOrder` (topological sort) at end and write to `metadata.fields.TraversalOrder`. Halt + surface error if cycles are detected.

## AdditionalObservations (open block per §4.4)

When the source surfaces useful information that doesn't map to a canonical field, append to `metadata.fields.AdditionalObservations` / `io.fields.AdditionalObservations` / `iof.fields.AdditionalObservations` with `{Key, Value, Provenance}`. Recurring observations become canonical fields in framework iterations — never skip a finding because no slot exists.

## DO NOT

- Don't hardcode answers. The script reads + emits; it doesn't have answers baked in.
- Don't write to the metadata file with hardcoded vendor object names — only structural patterns (loops, regexes, type maps).
- Don't skip Zod validation. Unvalidated vendor responses → unreliable emissions → Invariant 1 failures downstream.
- Don't dump raw vendor responses to stdout. Stdout is structured stats only.
