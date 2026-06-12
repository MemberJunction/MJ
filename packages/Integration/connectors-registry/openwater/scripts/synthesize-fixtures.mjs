#!/usr/bin/env node
// Deterministic fixture synthesizer for OpenWater (extractor-script convention:
// the fixture is THIS SCRIPT'S OUTPUT over the pinned OpenAPI spec — no hand-authored
// records). The OpenWater OpenAPI v2 spec carries ZERO response examples, so replay
// fixtures are derived from the response SCHEMAS: every value is a type-driven
// placeholder, every shape comes from the spec. Provenance: sources/openwater-openapi-v2.json.
//
// Usage: node scripts/synthesize-fixtures.mjs   (cwd = the openwater registry dir)
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const REG = resolve(HERE, '..');
const spec = JSON.parse(readFileSync(resolve(REG, 'sources/openwater-openapi-v2.json'), 'utf-8'));

// ALL IOs from the connector's metadata file (deterministic — the door list is the
// metadata's APIPath column, never a hand list). Paths absent from the spec are
// skipped WITH a logged warning (never silently).
const integ = JSON.parse(readFileSync(resolve(REG, '../../../../metadata/integrations/openwater/.openwater.integration.json'), 'utf-8'));
const integTop = Array.isArray(integ) ? integ[0] : integ;
const DOORS = (integTop.relatedEntities?.['MJ: Integration Objects'] ?? [])
  .map((io) => ({ object: io.fields.Name, path: io.fields.APIPath }))
  .filter((d) => typeof d.path === 'string' && d.path.startsWith('/'));

/** Resolve a local $ref like "#/definitions/Program" or "#/components/schemas/Program". */
function deref(node, depth = 0) {
  if (depth > 12 || node == null) return node;
  if (node.$ref) {
    const parts = node.$ref.replace(/^#\//, '').split('/');
    let t = spec;
    for (const p of parts) t = t?.[p];
    return deref(t, depth + 1);
  }
  return node;
}

/** Type-driven deterministic sample for a schema node. Index seeds list identity. */
function sample(schema, name, idx, depth = 0) {
  schema = deref(schema, depth);
  if (!schema || depth > 10) return null;
  if (schema.example !== undefined) return schema.example;
  if (Array.isArray(schema.enum) && schema.enum.length) return schema.enum[0];
  const t = schema.type ?? (schema.properties ? 'object' : undefined);
  switch (t) {
    case 'object': {
      const out = {};
      for (const [k, v] of Object.entries(schema.properties ?? {})) {
        out[k] = sample(v, k, idx, depth + 1);
      }
      return out;
    }
    case 'array': {
      const item = sample(schema.items ?? {}, name, idx, depth + 1);
      return item == null ? [] : [item];
    }
    case 'integer':
    case 'number':
      return /id$/i.test(name) ? 1000 + idx : 1;
    case 'boolean':
      return false;
    case 'string':
      if (schema.format === 'date-time') return '2026-01-01T00:00:00Z';
      if (schema.format === 'date') return '2026-01-01';
      return /id$/i.test(name) ? `${name}-${1000 + idx}` : `sample-${name}`;
    default:
      return null;
  }
}

/** Find the 200-response schema of a GET path (Swagger 2 or OAS3 shapes). */
function responseSchema(path) {
  const op = spec.paths?.[path]?.get;
  if (!op) return null;
  const r200 = op.responses?.['200'] ?? op.responses?.default;
  if (!r200) return null;
  return deref(r200.schema ?? r200.content?.['application/json']?.schema ?? null);
}

const routes = [];
const objects = [];
for (const d of DOORS) {
  const schema = responseSchema(d.path);
  if (!schema) {
    console.error(`WARN: no 200 schema for ${d.path} — door skipped`);
    continue;
  }
  // Collection responses are either an array or an envelope with an items-like array.
  let body;
  if (schema.type === 'array' || schema.items) {
    body = [0, 1, 2].map((i) => sample(schema.items ?? {}, d.object, i));
  } else {
    body = sample(schema, d.object, 0);
    // Make any top-level array property carry 3 distinct records (re-sample the
    // DEREFED items schema per index so ids differ).
    for (const [k, propSchema] of Object.entries(schema.properties ?? {})) {
      const ps = deref(propSchema);
      if (ps?.type === 'array' || ps?.items) {
        body[k] = [0, 1, 2].map((i) => sample(ps.items ?? {}, k, i));
      }
    }
  }
  // Templated paths ({roundId} etc.): truncate at the brace — the tier mock matches by
  // prefix, so '/v2/Rounds/' serves '/v2/Rounds/1000/ApplicationReports'.
  const routePath = d.path.includes('{') ? d.path.slice(0, d.path.indexOf('{')) : d.path;
  routes.push({ Path: routePath, Method: 'GET', Status: 200, Body: body });
  objects.push({ Name: d.object });
}

const fixtures = {
  Transport: 'http',
  ConfigUrlKey: 'BaseURL',
  Configuration: { ClientKey: 'mock-client-key', ApiKey: 'mock-api-key' },
  Objects: objects,
  Routes: routes,
};
mkdirSync(resolve(REG, 'fixtures'), { recursive: true });
writeFileSync(resolve(REG, 'fixtures/fixtures.json'), JSON.stringify(fixtures, null, 2) + '\n');
console.log(JSON.stringify({ doors: DOORS.length, routes: routes.length, objects: objects.length }, null, 2));
