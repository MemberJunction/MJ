/**
 * Derive a connector catalog from a vendor's OWN machine-readable contract (an OpenAPI spec).
 *
 * Why this exists (the circular-fixture problem it breaks):
 *   The credential-free mock today is synthesized from the connector's OWN metadata, so "the catalog" under
 *   test is whatever the build emitted — green proves only self-consistency, never that the emission matches
 *   the vendor's real surface. This module reads the catalog out of the vendor's PUBLISHED contract (the
 *   OpenAPI `components.schemas`), independent of anything the connector authored. Diffing the
 *   contract-derived catalog against the connector's emitted catalog is what turns "self-consistent" into
 *   "agrees with the vendor's documented contract".
 *
 * `provenance` is stamped at the top level so a contract-derived catalog (`'openapi'`) is distinguishable
 * from one that has no contract behind it (`'none'`) — a reconstructed/LLM-guessed catalog must NEVER be
 * mistaken for one grounded in a real spec.
 *
 * Pure: a parsed OpenAPI spec object in → `{provenance, objects:[{name, fields:[{name, type, required}]}]}`
 * out. No I/O. The CLI at the bottom is the standalone gate.
 */

/**
 * Map a JSON-schema `type` to the simple string vocabulary the catalog uses. Recognized scalar/structural
 * types pass through; anything unrecognized (incl. missing, `$ref`-only, or composed schemas with no
 * declared `type`) defaults to 'string' — the conservative, always-storable choice.
 *
 * @param {unknown} jsonSchemaType
 * @returns {string}
 */
function mapType(jsonSchemaType) {
    switch (jsonSchemaType) {
        case 'string':
        case 'integer':
        case 'number':
        case 'boolean':
        case 'object':
        case 'array':
            return jsonSchemaType;
        default:
            return 'string';
    }
}

/**
 * Is this schema an "object" we should emit as a catalog object? True when it declares `type:'object'` OR
 * carries a `properties` map (some specs omit `type` but still list properties).
 *
 * @param {unknown} schema
 * @returns {boolean}
 */
function isObjectSchema(schema) {
    if (!schema || typeof schema !== 'object') return false;
    if (schema.type === 'object') return true;
    return !!(schema.properties && typeof schema.properties === 'object');
}

/**
 * Build the field list for one object schema. Each entry of `properties` becomes a field; its JSON-schema
 * `type` is mapped to the simple vocabulary; a property named in the schema's `required[]` is `required:true`.
 *
 * @param {{ properties?: Record<string, { type?: unknown }>, required?: unknown }} schema
 * @returns {Array<{ name: string, type: string, required: boolean }>}
 */
function fieldsOf(schema) {
    const props = schema.properties && typeof schema.properties === 'object' ? schema.properties : {};
    const required = Array.isArray(schema.required) ? schema.required : [];
    const requiredSet = new Set(required.map((r) => String(r)));
    return Object.keys(props).map((name) => {
        const prop = props[name] && typeof props[name] === 'object' ? props[name] : {};
        return {
            name,
            type: mapType(prop.type),
            required: requiredSet.has(name),
        };
    });
}

/**
 * Derive a catalog from an OpenAPI spec's `components.schemas`. Every schema that `isObjectSchema` becomes a
 * catalog object (keyed by its schema name) with its properties mapped to fields. Provenance is `'openapi'`.
 *
 * If the spec is missing/empty or has no component schemas, returns `{provenance:'none', objects:[]}` so a
 * contract-grounded catalog is never confused with a contract-less one.
 *
 * @param {{ components?: { schemas?: Record<string, unknown> } }} spec
 * @returns {{ provenance: 'openapi'|'none', objects: Array<{ name: string, fields: Array<{ name: string, type: string, required: boolean }> }> }}
 */
export function catalogFromOpenAPI(spec) {
    const schemas = spec && spec.components && spec.components.schemas;
    if (!schemas || typeof schemas !== 'object' || Object.keys(schemas).length === 0) {
        return { provenance: 'none', objects: [] };
    }

    const objects = [];
    for (const name of Object.keys(schemas)) {
        const schema = schemas[name];
        if (!isObjectSchema(schema)) continue;
        objects.push({ name, fields: fieldsOf(schema) });
    }

    if (objects.length === 0) {
        // Schemas existed but none were object-shaped (all scalars/enums) — no derivable catalog.
        return { provenance: 'none', objects: [] };
    }

    return { provenance: 'openapi', objects };
}

// ── CLI ───────────────────────────────────────────────────────────────────────────────────────────
// Run only when invoked directly (not when imported by the test).
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

const isMain = (() => {
    try {
        return process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
    } catch {
        return false;
    }
})();

if (isMain) {
    const args = process.argv.slice(2);
    const json = args.includes('--json');
    const positional = args.filter((a) => !a.startsWith('--'));

    if (positional.length < 1) {
        process.stderr.write('usage: node contract-catalog.mjs <openapi-spec.json> [--json]\n');
        process.exit(2);
    }

    let spec;
    try {
        spec = JSON.parse(readFileSync(resolve(positional[0]), 'utf8'));
    } catch (e) {
        process.stderr.write(`cannot read spec file: ${String(e && e.message ? e.message : e)}\n`);
        process.exit(2);
    }

    const catalog = catalogFromOpenAPI(spec);

    if (json) {
        // Machine output for the floor-check consumer. Always exit 0 — the caller decides pass/fail.
        process.stdout.write(JSON.stringify(catalog));
        process.exit(0);
    }

    const objectCount = catalog.objects.length;
    const fieldCount = catalog.objects.reduce((sum, o) => sum + o.fields.length, 0);
    process.stdout.write(`✓ contract-catalog: provenance=${catalog.provenance}, ${objectCount} object(s), ${fieldCount} field(s)\n`);
    for (const o of catalog.objects) {
        process.stdout.write(`    - ${o.name} (${o.fields.length} field(s))\n`);
    }
    process.exit(0);
}
