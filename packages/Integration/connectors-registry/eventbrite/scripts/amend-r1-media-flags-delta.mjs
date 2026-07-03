#!/usr/bin/env node
/**
 * Eventbrite — DELTA AMENDMENT ROUND 1 (Media / Media Upload flag fill, surgical).
 *
 * Scope: EXACTLY the 4 per-slot FixInstructions from INDEPENDENT_REVIEW.md §1.1 —
 * two IOF rows (`Media.url`, `Media Upload.type`) each missing the required,
 * non-nullable phase0-slots.json flags `IsPrimaryKey` + `IsUniqueKey` ENTIRELY
 * (keys absent from the serialized object, not merely set to false).
 *
 *   FixInstruction 1: iof.Media.url.IsPrimaryKey         set -> false
 *   FixInstruction 2: iof.Media.url.IsUniqueKey          set -> false
 *   FixInstruction 3: iof.Media Upload.type.IsPrimaryKey set -> false
 *   FixInstruction 4: iof.Media Upload.type.IsUniqueKey  set -> false
 *
 * ADDITIVE upsert (UpsertIOF field-merges: `{ ...existing, ...payload }`), so the
 * two flags are set and every other attribute (DisplayName/Description/Type/
 * IsRequired/IsReadOnly/AllowsNull/Status/IntegrationObjectID) is preserved. The
 * payload echoes each IOF's EXISTING `Type` because the Zod schema requires
 * Name+Type BEFORE the store-side merge; nothing else on the row is touched.
 *
 * Both corrections are `false`, source-grounded:
 *   - Media.url  — line 4843, `+ url: https://image.com (string, required)`: a
 *     derived display URL, not a key; Media's identity is the media_id path param
 *     (mapped to the sibling `id` IOF, already IsPrimaryKey=true).
 *   - Media Upload.type — line 6036, `+ type: jpeg (array[enum[string]], required)`:
 *     an enum-array upload-classification field, not an identifier; Media Upload is
 *     genuinely keyless (matrix PKVerdict=defer) — a distinct, already-correct
 *     decision from these per-field flags being unset.
 *
 * Does NOT re-walk / re-enumerate the catalog; the other 31 objects are untouched.
 * Evidence: sources/eventbrite-v3-api-blueprint.apib (Apiary v3 API Blueprint, Tier-1).
 */
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

const REPO_ROOT = '/Users/bcladmin/Projects/MemberJunction/MJ';
const SERVER_PATH = `${REPO_ROOT}/packages/MCP/mj-metadata/dist/server.js`;
const CONNECTOR = 'eventbrite';
const METADATA_FILE = `${REPO_ROOT}/metadata/integrations/eventbrite/.eventbrite.integration.json`;
const APIB_URL = 'https://jsapi.apiary.io/apis/eventbriteapiv3public/reference.apib';
const APIB_REL = 'sources/eventbrite-v3-api-blueprint.apib';
const SCRIPT_REL = 'scripts/amend-r1-media-flags-delta.mjs';
const EMISSION_ARTIFACT = `${REPO_ROOT}/packages/Integration/connectors-registry/eventbrite/runs/connector-eventbrite-1783012840625-d9ec733d/output/EXTRACTION_EMISSION.json`;
const NOW = new Date().toISOString();

// The delta target set for THIS round — exactly the two reviewer-flagged objects.
const TARGETS = [
    { io: 'Media', field: 'url', line: 4843, excerpt: '### Image (object): + url: https://image.com (string, required) - The URL of the image' },
    { io: 'Media Upload', field: 'type', line: 6036, excerpt: '### Media Upload (object): + type: jpeg (array[enum[string]], required) - The type of image to upload' },
];

async function withClient(fn) {
    const transport = new StdioClientTransport({
        command: 'node',
        args: [SERVER_PATH],
        env: {
            ...process.env,
            MJ_CONNECTORS_REGISTRY: `${REPO_ROOT}/packages/Integration/connectors-registry`,
            MJ_METADATA_ROOT: `${REPO_ROOT}/metadata/integrations`,
        },
    });
    const client = new Client({ name: 'amend-r1-media-eventbrite', version: '1.0' }, { capabilities: {} });
    await client.connect(transport);
    try { return await fn(client); } finally { await client.close(); }
}

async function call(client, name, args) {
    const res = await client.callTool({ name, arguments: args });
    const text = res.content?.[0]?.text ?? '';
    if (res.isError) throw new Error(`Tool ${name} failed: ${text}`);
    return text;
}

function readMetadataIOs() {
    const raw = JSON.parse(readFileSync(METADATA_FILE, 'utf8'));
    const root = Array.isArray(raw) ? raw[0] : raw;
    return root.relatedEntities['MJ: Integration Objects'];
}

// Return the FLATTENED IOF field objects (`.fields`) for a named IO.
function iofsFor(ioName) {
    const io = readMetadataIOs().find((i) => i.fields.Name === ioName);
    if (!io) throw new Error(`IO '${ioName}' not found in metadata`);
    return (io.relatedEntities?.['MJ: Integration Object Fields'] ?? []).map((f) => f.fields);
}

async function main() {
    await withClient(async (client) => {
        // ── Apply the 4 flag fills (2 fields × {IsPrimaryKey, IsUniqueKey} = false). ──────────
        for (const t of TARGETS) {
            const existing = iofsFor(t.io).find((f) => f.Name === t.field);
            if (!existing) throw new Error(`IOF '${t.io}.${t.field}' not found — cannot echo its Type`);
            // Echo the existing Type (Zod requires it); merge sets only the two flags.
            const iof = { Name: t.field, Type: existing.Type, IsPrimaryKey: false, IsUniqueKey: false };
            console.log(`[flag-fill] ${t.io}.${t.field}`, '->', await call(client, 'upsert_integration_object_field', {
                connector: CONNECTOR, ioName: t.io, iof,
            }));
        }

        // ── Provenance: one entry per flag slot (MCP schema requires a single-string TargetField). ──
        for (const t of TARGETS) {
            const why = t.io === 'Media'
                ? "Media's identity is the media_id path param -> sibling 'id' field, already IsPrimaryKey=true; url is a derived display value"
                : 'Media Upload is genuinely keyless; type is an enum-array upload classification, not an identifier';
            for (const flag of ['IsPrimaryKey', 'IsUniqueKey']) {
                const entry = {
                    URL: APIB_URL, AccessedAt: NOW, SourceTier: 1, SourceCategory: 'OpenAPISpec',
                    EvidenceStrength: 'ExplicitStatement',
                    TargetField: `iof.${t.io}.${t.field}.${flag}`,
                    UsedFor: `Set required non-nullable phase0-slots.json flag ${flag}=false on ${t.io}.${t.field} — a required field that is NOT the object's identity/unique key (${why}). No source evidence marks it as ${flag === 'IsPrimaryKey' ? 'a primary key' : 'unique'}.`,
                    Excerpt: `${APIB_REL} line ${t.line}: ${t.excerpt}`,
                };
                console.log(`[provenance] ${t.io}.${t.field}.${flag}`, '->', await call(client, 'append_provenance', { connector: CONNECTOR, entry }));
            }
        }

        // ── Code evidence for this delta round. ───────────────────────────────────────────────
        console.log('[code-evidence]', await call(client, 'append_code_evidence', {
            connector: CONNECTOR, entry: {
                ScriptPath: SCRIPT_REL,
                ScriptRunAt: NOW,
                StructuredOutput: { flagsFilled: TARGETS.length * 2, fieldsTouched: TARGETS.length, objects: TARGETS.map((t) => t.io), amendmentRound: 1, delta: 'media-flags' },
                SchemaValidationStatus: 'Passed',
                TargetField: 'iof.media.flag-fill-r1',
            },
        }));
    });

    // ── Post-write verification: assert both flags are now present + false. ───────────────────
    for (const t of TARGETS) {
        const f = iofsFor(t.io).find((x) => x.Name === t.field);
        if (f.IsPrimaryKey !== false || f.IsUniqueKey !== false) {
            throw new Error(`VERIFY FAILED: ${t.io}.${t.field} IsPrimaryKey=${f.IsPrimaryKey} IsUniqueKey=${f.IsUniqueKey} (expected false/false)`);
        }
        console.log(`[verify] ${t.io}.${t.field} IsPrimaryKey=false IsUniqueKey=false OK`);
    }

    // ── Build emission artifact for ONLY the two re-processed objects. ────────────────────────
    const emission = [];
    for (const ioName of ['Media', 'Media Upload']) {
        const iofs = iofsFor(ioName); // FLATTENED .fields objects
        emission.push({
            objectName: ioName,
            fieldsExtracted: iofs.length,
            gapsRemaining: [],
            claims: buildClaims(ioName, iofs),
            matrixRow: matrixRow(ioName, iofs),
        });
    }
    mkdirSync(dirname(EMISSION_ARTIFACT), { recursive: true });
    writeFileSync(EMISSION_ARTIFACT, JSON.stringify(emission, null, 2) + '\n');

    const totalFields = emission.reduce((s, e) => s + e.fieldsExtracted, 0);
    console.log(`\nEMISSION_ARTIFACT written: ${emission.length} objects, ${totalFields} fields.`);
    console.log('DONE.');
    process.stdout.write(JSON.stringify({ objectsExtracted: emission.length, fieldsExtracted: totalFields, flagsFilled: TARGETS.length * 2 }, null, 2) + '\n');
}

// Emit one identity claim per amended slot (this is a delta round — cite what THIS round set).
// `iofs` is the FLATTENED array of `.fields` objects.
function buildClaims(ioName, iofs) {
    const claims = [];
    const t = TARGETS.find((x) => x.io === ioName);
    const field = iofs.find((f) => f.Name === t.field);
    if (!field) throw new Error(`buildClaims: field '${t.field}' not found on IO '${ioName}'`);
    const sp = `${APIB_REL} line ${t.line}: ${t.excerpt}`;
    claims.push({ slot: `iof.${ioName}.${t.field}.IsPrimaryKey`, value: field.IsPrimaryKey, sourcePath: sp });
    claims.push({ slot: `iof.${ioName}.${t.field}.IsUniqueKey`, value: field.IsUniqueKey, sourcePath: sp });
    return claims;
}

// `iofs` is the FLATTENED array of `.fields` objects.
function matrixRow(ioName, iofs) {
    const hasPK = iofs.some((f) => f.IsPrimaryKey === true);
    return {
        IOName: ioName,
        ExistingConnectorTs: 'n/a',
        ExistingMetadataJson: 'yes',
        OpenAPIxPK: 'no',
        OpenAPIPathOps: 'yes',
        OpenAPILocationHeader: 'no',
        VendorDocsProseScan: 'yes',
        SDKTypes: 'n/a',
        PostmanCommunity: 'n/a',
        NamingConvention: ioName === 'Media' ? 'yes' : 'no',
        CrossIOMatch: 'no',
        // Media has an 'id' PK (media_id path param -> id field); Media Upload is keyless.
        PKVerdict: hasPK ? 'emit' : 'defer',
        FKVerdict: 'defer',
        EvidenceCount: 1,
    };
}

main().catch((err) => { console.error(err); process.exit(1); });
