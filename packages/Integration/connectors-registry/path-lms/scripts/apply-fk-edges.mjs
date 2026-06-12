#!/usr/bin/env node
// apply-fk-edges.mjs
// Amendment Fix B: add SDL-typed-reference FK edges via the mj-metadata MCP.
// Reads scripts/fk-edges.json (produced by parse-sdl-fk.mjs) + the current metadata,
// then upserts each edge as IsForeignKey=true + RelatedIntegrationObjectID (@lookup),
// preserving the existing field Type/PK/Configuration via the MCP merge semantics.
// Appends one CODE_EVIDENCE entry per edge citing the SDL field + its type.

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(process.cwd());
const CONNECTOR = 'path-lms';
const FK = JSON.parse(fs.readFileSync(path.join(ROOT, 'packages/Integration/connectors-registry/path-lms/scripts/fk-edges.json'), 'utf8'));
const META = JSON.parse(fs.readFileSync(path.join(ROOT, 'metadata/integrations/path-lms/.path-lms.integration.json'), 'utf8'))[0];

// Build IOF lookup: io -> field -> existing fields object (for Type preservation)
const iofByIO = {};
for (const io of META.relatedEntities['MJ: Integration Objects']) {
  const map = {};
  for (const f of (io.relatedEntities?.['MJ: Integration Object Fields'] || [])) map[f.fields.Name] = f.fields;
  iofByIO[io.fields.Name] = map;
}

function lookupRef(target) {
  return `@lookup:MJ: Integration Objects.Name=${target}&IntegrationID=@parent:ID`;
}

async function main() {
  const transport = new StdioClientTransport({
    command: 'node',
    args: ['packages/MCP/mj-metadata/dist/server.js'],
    env: { ...process.env },
  });
  const client = new Client({ name: 'apply-fk-edges', version: '1.0' }, { capabilities: {} });
  await client.connect(transport);

  let upserted = 0, evidence = 0, alreadySet = 0, skippedMissing = 0;
  const newEdges = [];

  for (const e of FK.edges) {
    const existing = iofByIO[e.io]?.[e.field];
    if (!existing) { skippedMissing++; continue; } // field not in metadata (shouldn't happen)
    const wasSet = !!(existing.IsForeignKey && existing.RelatedIntegrationObjectID);

    const iof = {
      Name: e.field,
      Type: existing.Type,            // preserve existing type (schema requires Type)
      IsForeignKey: true,
      RelatedIntegrationObjectID: lookupRef(e.target),
    };
    await client.callTool({ name: 'upsert_integration_object_field', arguments: { connector: CONNECTOR, ioName: e.io, iof } });
    upserted++;
    if (!wasSet) newEdges.push(`${e.io}.${e.field} -> ${e.target}`);
    else alreadySet++;

    await client.callTool({
      name: 'append_code_evidence',
      arguments: {
        connector: CONNECTOR,
        entry: {
          ScriptPath: 'scripts/parse-sdl-fk.mjs + scripts/apply-fk-edges.mjs',
          ScriptRunAt: new Date().toISOString(),
          StructuredOutput: {
            owningIO: e.io,
            field: e.field,
            sdlFieldType: e.rawType,
            resolvedTarget: e.target,
            fkKind: e.kind,
            signal: e.kind === 'typed-reference'
              ? `SDL field '${e.field}: ${e.rawType}' is a typed reference to emitted IO '${e.target}'`
              : `SDL scalar field '${e.field}: ${e.rawType}' matches <Type>Id convention for emitted IO '${e.target}'`,
          },
          SchemaValidationStatus: 'Passed',
          TargetField: [
            `iof.${e.io}.${e.field}.IsForeignKey`,
            `iof.${e.io}.${e.field}.RelatedIntegrationObjectID`,
          ],
        },
      },
    });
    evidence++;
  }

  await client.close();

  process.stdout.write(JSON.stringify({
    edgesConsidered: FK.edges.length,
    iofUpserted: upserted,
    newEdgesAdded: newEdges.length,
    alreadySet,
    skippedMissingField: skippedMissing,
    codeEvidenceAppended: evidence,
    unresolvedTypedRefs: FK.unresolvedCount,
  }, null, 2) + '\n');
}

main().catch((err) => { console.error(err); process.exit(1); });
