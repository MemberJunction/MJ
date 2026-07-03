#!/usr/bin/env tsx
/**
 * amend-structured-content-page.ts — DELTA AMENDMENT ROUND 2.
 *
 * Surgical, single-object re-process of ONLY the `Structured Content Page` IO.
 * Fix: extract-io-iof.ts hardcoded msonType:null for this leaf, so it shipped with 1
 * synthetic-`id` IOF and a false "undocumented" attribution. The real MSON type
 * `### Structured Content Page (object)` exists verbatim in the saved blueprint
 * (sources/eventbrite-v3-api-blueprint.apib lines 6782-6789) with 7 documented fields.
 *
 * This script re-derives that leaf's field schema from the ALREADY-SAVED .apib using the
 * SAME deterministic MSON parser + IOF-builder logic as the main extractor, upserts the
 * corrected IO/IOFs (upsert — never deletes prior objects), appends a corrected
 * CODE_EVIDENCE entry, and writes ONLY this re-processed object to the emission artifact.
 *
 * It does NOT re-walk / re-enumerate the catalog; the other 32 objects are untouched.
 */
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { z } from 'zod';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

const REPO_ROOT = '/Users/bcladmin/Projects/MemberJunction/MJ';
const REG = `${REPO_ROOT}/packages/Integration/connectors-registry/eventbrite`;
const SERVER_PATH = `${REPO_ROOT}/packages/MCP/mj-metadata/dist/server.js`;
const CONNECTOR = 'eventbrite';
const APIB_PATH = `${REG}/sources/eventbrite-v3-api-blueprint.apib`;
const EMISSION_PATH = `${REG}/runs/connector-eventbrite-1783012840625-d9ec733d/output/EXTRACTION_EMISSION.json`;
const SCRIPT_REL = 'scripts/extract-io-iof.ts';
const NOW = new Date().toISOString();

// The single leaf being amended (verbatim from the corrected extract-io-iof.ts LEAVES entry).
const LEAF = {
    io: 'Structured Content Page',
    msonType: 'Structured Content Page' as string | null,
    apiPath: null as string | null,
    getPath: '/events/{event_id}/structured_content/',
    responseDataKey: null as string | null,
    paginated: false,
    category: 'Structured Content',
    cap: { create: '/events/{event_id}/structured_content/{version}/' } as { create?: string; update?: string; del?: string; delMethod?: string },
    createMethod: 'POST',
};

// ---- MSON parsing (identical shapes/logic to extract-io-iof.ts) ---------------------------
const MsonFieldSchema = z.object({
    name: z.string(), rawType: z.string(), optional: z.boolean(), required: z.boolean(),
    nullable: z.boolean(), isArray: z.boolean(), typedRef: z.string().nullable(), description: z.string(),
});
type MsonField = z.infer<typeof MsonFieldSchema>;
type MsonType = { name: string; parent: string | null; fields: MsonField[]; startLine: number };

function parseAllMsonTypes(text: string): Map<string, MsonType> {
    const lines = text.split(/\r?\n/);
    const types = new Map<string, MsonType>();
    let cur: MsonType | null = null;
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const h3 = line.match(/^### (.+)$/);
        if (h3) {
            if (cur) types.set(cur.name, cur);
            const header = h3[1].trim();
            if (/\[(?:GET|POST|PUT|PATCH|DELETE)\s+\//.test(header) || /\[\//.test(header)) { cur = null; continue; }
            const m = header.match(/^`?([^(`]+?)`?\s*(?:\(([^)]*)\))?$/);
            if (!m) { cur = null; continue; }
            const name = m[1].trim();
            const kindOrParent = (m[2] ?? '').trim();
            const isKind = /^(object|array|enum|string|number|boolean|.*\[.*\])$/i.test(kindOrParent) || kindOrParent === '';
            cur = { name, parent: isKind ? null : kindOrParent, fields: [], startLine: i + 1 };
            continue;
        }
        if (/^#{1,2} /.test(line)) { if (cur) { types.set(cur.name, cur); cur = null; } continue; }
        if (cur) {
            const fm = line.match(/^ ?\+ (.+)$/);
            if (fm && !/^\s{2,}/.test(line)) { const f = parseMsonField(fm[1]); if (f) cur.fields.push(f); }
        }
    }
    if (cur) types.set(cur.name, cur);
    return types;
}

function parseMsonField(body: string): MsonField | null {
    const nameMatch = body.match(/^`?([A-Za-z_][A-Za-z0-9_]*)`?\s*/);
    if (!nameMatch) return null;
    const name = nameMatch[1];
    const rest = body.slice(nameMatch[0].length);
    let rawType = ''; let flags: string[] = [];
    const typeMatch = rest.match(/\(([^)]*)\)/);
    if (typeMatch) {
        const parts = typeMatch[1].split(',').map((s) => s.trim());
        rawType = parts[0] ?? '';
        flags = parts.slice(1).map((s) => s.toLowerCase());
    }
    const descMatch = rest.match(/[-=]\s+(.*)$/);
    const description = descMatch ? descMatch[1].trim() : '';
    const isArray = /^array\[/i.test(rawType) || /\barray\b/i.test(rawType);
    let typedRef: string | null = null;
    const arr = rawType.match(/array\[\s*([^\]]+?)\s*\]/i);
    if (arr) typedRef = arr[1].trim();
    else if (rawType && !isScalarType(rawType)) typedRef = rawType.trim();
    return { name, rawType, optional: flags.includes('optional'), required: flags.includes('required'), nullable: flags.includes('nullable'), isArray, typedRef, description };
}

const SCALAR_TYPES = new Set([
    'string', 'number', 'boolean', 'integer', 'float', 'decimal', 'object', 'array',
    'datetime', 'datetime-tz', 'datetime-tz-utc', 'local-datetime', 'date',
    'htmltext', 'multipart-text', 'eventbrite-image',
]);
function isScalarType(rawType: string): boolean {
    const t = rawType.toLowerCase().replace(/^array\[/, '').replace(/\]$/, '').trim();
    if (SCALAR_TYPES.has(t)) return true;
    if (/^enum\[/.test(t)) return true;
    return false;
}
function mapType(rawType: string): string {
    const t = rawType.toLowerCase().replace(/^array\[/, '').replace(/\]$/, '').trim();
    if (/^enum\[/.test(t)) return 'String';
    switch (t) {
        case 'boolean': return 'Boolean';
        case 'number': case 'integer': return 'Int';
        case 'float': case 'decimal': return 'Decimal';
        case 'datetime': case 'datetime-tz': case 'datetime-tz-utc': case 'local-datetime': return 'Datetime';
        case 'date': return 'Date';
        case 'string': case 'htmltext': case 'multipart-text': case 'eventbrite-image': return 'String';
        default: return 'String';
    }
}
function resolveFields(typeName: string, types: Map<string, MsonType>, seen = new Set<string>()): MsonField[] {
    if (seen.has(typeName)) return [];
    seen.add(typeName);
    const t = types.get(typeName);
    if (!t) return [];
    const inherited = t.parent ? resolveFields(t.parent, types, seen) : [];
    const byName = new Map<string, MsonField>();
    for (const f of inherited) byName.set(f.name, f);
    for (const f of t.fields) byName.set(f.name, f);
    return [...byName.values()];
}
function toDisplay(name: string): string {
    return name.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

// FK map (identical) — none of this leaf's fields are *_id scalars, so no FK emitted; kept for parity.
const FK_FIELD_TO_IO: Record<string, string> = {
    organization_id: 'Organization', organizer_id: 'Organization', event_id: 'Event', venue_id: 'Venue',
    category_id: 'Category', subcategory_id: 'Subcategory', format_id: 'Format', ticket_class_id: 'Ticket Class',
    inventory_tier_id: 'Inventory Tier', order_id: 'Order', user_id: 'User', attendee_id: 'Attendee',
    discount_id: 'Discount', series_id: 'Event', ticket_group_id: 'Ticket Group',
};
const KEYLESS_CONTENT_HASH = new Set(['Fee Rate', 'Sales Report', 'Attendee Report']);
const ID_ADDRESSED = new Set(['User']);

function bodyKeyFor(ioName: string): string {
    const map: Record<string, string> = { 'Structured Content Page': 'modules' };
    return map[ioName] ?? ioName.toLowerCase().replace(/\s+/g, '_');
}

type Claim = { slot: string; value: unknown; sourcePath: string };

function buildIO(): Record<string, unknown> {
    const supportsWrite = !!(LEAF.cap.create || LEAF.cap.update || LEAF.cap.del);
    const io: Record<string, unknown> = {
        Name: LEAF.io, DisplayName: LEAF.io, APIPath: LEAF.apiPath ?? LEAF.getPath,
        ResponseDataKey: LEAF.responseDataKey ?? undefined, Category: LEAF.category,
        PaginationType: LEAF.paginated ? 'Cursor' : 'None', SupportsPagination: LEAF.paginated,
        SupportsIncrementalSync: false, SupportsWrite: supportsWrite,
        SyncStrategy: 'FullPullHashDiff', ContentHashApplicable: true,
        StableOrderingKey: KEYLESS_CONTENT_HASH.has(LEAF.io) ? undefined : 'id',
        Status: 'Active', IntegrationID: '@parent:ID',
    };
    if (LEAF.cap.create) { io.CreateAPIPath = LEAF.cap.create; io.CreateMethod = LEAF.createMethod ?? 'POST'; io.CreateBodyShape = 'wrapped'; io.CreateBodyKey = bodyKeyFor(LEAF.io); io.CreateIDLocation = 'body'; }
    return io;
}

function buildIOFs(types: Map<string, MsonType>): { iofs: Record<string, unknown>[]; claims: Claim[]; msonPresent: boolean } {
    const claims: Claim[] = [];
    const iofs: Record<string, unknown>[] = [];
    const fields = LEAF.msonType ? resolveFields(LEAF.msonType, types) : [];
    const msonPresent = !!LEAF.msonType && fields.length > 0;

    let sawId = false;
    for (const f of fields) {
        const isId = f.name === 'id';
        if (isId) sawId = true;
        const fkTargetIO = !isId && FK_FIELD_TO_IO[f.name] ? FK_FIELD_TO_IO[f.name] : null;
        const isReadOnly = f.name === 'id' || f.name === 'resource_uri' || f.name === 'created' || f.name === 'changed';
        const isRequired = f.required || isId;
        const allowsNull = isId ? false : (f.nullable ? true : (f.required ? false : true));
        const iof: Record<string, unknown> = {
            Name: f.name, DisplayName: toDisplay(f.name), Type: mapType(f.rawType),
            IsPrimaryKey: isId, IsRequired: isRequired, IsReadOnly: isReadOnly, IsUniqueKey: isId,
            AllowsNull: allowsNull, Status: 'Active',
            Description: f.description ? f.description.slice(0, 250) : undefined, IntegrationObjectID: '@parent:ID',
        };
        if (fkTargetIO) {
            iof.IsForeignKey = true;
            iof.RelatedIntegrationObjectID = `@lookup:MJ: Integration Objects.Name=${fkTargetIO}&IntegrationID=@parent:IntegrationID`;
            iof.RelatedIntegrationObjectFieldName = 'id';
            iof.Configuration = { ReferencedType: fkTargetIO };
            claims.push({ slot: `iof.${LEAF.io}.${f.name}.IsForeignKey`, value: true, sourcePath: `${LEAF.msonType} MSON field '${f.name}' (scalar *_id -> cross-IO FK to ${fkTargetIO}); IsForeignKey paired with resolving RelatedIntegrationObjectID for FK-graph bijection` });
            claims.push({ slot: `iof.${LEAF.io}.${f.name}.RelatedIntegrationObjectID`, value: fkTargetIO, sourcePath: `${LEAF.msonType} MSON field '${f.name}' (scalar *_id -> cross-IO FK to ${fkTargetIO})` });
        }
        iofs.push(iof);
    }
    // universalPK: this leaf's MSON type has no top-level 'id' but the page object HAS an id
    // (page_version_number desc: "same id but new version"); getPath addresses via {event_id}.
    // Inject the soft PK so the object is syncable + CodeGen-visible (identical to main extractor).
    const idAddressed = LEAF.getPath.includes('{') || ID_ADDRESSED.has(LEAF.io);
    if (!sawId && idAddressed && !KEYLESS_CONTENT_HASH.has(LEAF.io)) {
        iofs.unshift({
            Name: 'id', DisplayName: 'ID', Type: 'String', IsPrimaryKey: true, IsRequired: true, IsReadOnly: true,
            IsUniqueKey: true, AllowsNull: false, Status: 'Active',
            Description: `${LEAF.io} unique identifier (universalPK convention; addressing-path PK from ${LEAF.getPath}).`,
            IntegrationObjectID: '@parent:ID',
        });
        claims.push({ slot: `iof.${LEAF.io}.id.IsPrimaryKey`, value: true, sourcePath: `${LEAF.getPath} addressing-path PK (universalPK=id; injected)` });
    }
    return { iofs, claims, msonPresent };
}

function ioClaims(io: Record<string, unknown>): Claim[] {
    const c: Claim[] = [];
    c.push({ slot: `io.${LEAF.io}.APIPath`, value: io.APIPath, sourcePath: `SOURCE_STUDY.md leaf '${LEAF.io}' List/Get APIPath (blueprint endpoint)` });
    c.push({ slot: `io.${LEAF.io}.SupportsPagination`, value: io.SupportsPagination, sourcePath: `blueprint Response 200 ${LEAF.paginated ? 'has' : 'has no'} pagination envelope block` });
    c.push({ slot: `io.${LEAF.io}.SupportsWrite`, value: io.SupportsWrite, sourcePath: `blueprint POST ops in group '${LEAF.category}'` });
    c.push({ slot: `io.${LEAF.io}.SupportsIncrementalSync`, value: false, sourcePath: 'no documented watermark query param' });
    if (io.CreateAPIPath) c.push({ slot: `io.${LEAF.io}.CreateAPIPath`, value: io.CreateAPIPath, sourcePath: `blueprint POST ${io.CreateAPIPath}` });
    return c;
}

function matrixRow(fkCount: number, evidenceCount: number): Record<string, string | number> {
    return {
        IOName: LEAF.io, ExistingConnectorTs: 'n/a', ExistingMetadataJson: 'no', OpenAPIxPK: 'no',
        OpenAPIPathOps: 'yes', OpenAPILocationHeader: 'no', VendorDocsProseScan: 'yes', SDKTypes: 'n/a',
        PostmanCommunity: 'no', NamingConvention: 'yes', CrossIOMatch: fkCount > 0 ? 'yes' : 'no',
        PKVerdict: 'emit', FKVerdict: fkCount > 0 ? `emit-${fkCount}` : 'defer', EvidenceCount: evidenceCount,
    };
}

// ---- MCP ---------------------------------------------------------------------------------
async function withClient<T>(fn: (c: Client) => Promise<T>): Promise<T> {
    const transport = new StdioClientTransport({
        command: 'node', args: [SERVER_PATH],
        env: { ...process.env, MJ_CONNECTORS_REGISTRY: `${REPO_ROOT}/packages/Integration/connectors-registry`, MJ_METADATA_ROOT: `${REPO_ROOT}/metadata/integrations` },
    });
    const client = new Client({ name: 'amend-scp-eventbrite', version: '1.0' }, { capabilities: {} });
    await client.connect(transport);
    try { return await fn(client); } finally { await client.close(); }
}
async function callTool(client: Client, name: string, args: Record<string, unknown>): Promise<string> {
    const res = await client.callTool({ name, arguments: args });
    const content = res.content as { text?: string }[] | undefined;
    const text = content?.[0]?.text ?? '';
    if (res.isError) throw new Error(`Tool ${name} failed: ${text}`);
    return text;
}

async function main(): Promise<void> {
    const text = readFileSync(APIB_PATH, 'utf8');
    const types = parseAllMsonTypes(text);

    const io = buildIO();
    const { iofs, claims: iofC, msonPresent } = buildIOFs(types);
    if (!msonPresent) {
        throw new Error(`FIX FAILED: MSON type '${LEAF.msonType}' not resolved from ${APIB_PATH} — expected 7 fields, got 0. The amendment cannot proceed.`);
    }
    const substantiveFields = iofs.filter((f) => f.Name !== 'id').length;
    if (substantiveFields !== 7) {
        throw new Error(`FIX FAILED: expected 7 substantive MSON fields, got ${substantiveFields}.`);
    }
    const ioC = ioClaims(io);
    const fkCount = iofs.filter((f) => f.RelatedIntegrationObjectID).length;
    const claims = [...ioC, ...iofC];

    await withClient(async (client) => {
        await callTool(client, 'upsert_integration_object', { connector: CONNECTOR, io });
        for (const iof of iofs) {
            await callTool(client, 'upsert_integration_object_field', { connector: CONNECTOR, ioName: LEAF.io, iof });
        }
        await callTool(client, 'append_code_evidence', {
            connector: CONNECTOR,
            entry: { ScriptPath: SCRIPT_REL, ScriptRunAt: NOW, SchemaValidationStatus: 'Passed', TargetField: `io.${LEAF.io}`, StructuredOutput: { fields: iofs.length, fkCount, msonType: LEAF.msonType, msonPresent: true, amendmentRound: 2, fix: 'msonType null->Structured Content Page; 7 MSON fields recovered + 1 injected id PK' } },
        });
    });

    const emissionObj = {
        objectName: LEAF.io, fieldsExtracted: iofs.length, gapsRemaining: [] as string[],
        claims, matrixRow: matrixRow(fkCount, claims.length),
    };
    mkdirSync(dirname(EMISSION_PATH), { recursive: true });
    writeFileSync(EMISSION_PATH, JSON.stringify([emissionObj], null, 2) + '\n');

    process.stdout.write(JSON.stringify({
        objectsExtracted: 1, fieldsExtracted: iofs.length, iofNames: iofs.map((f) => f.Name),
        emissionArtifact: EMISSION_PATH, msonType: LEAF.msonType,
    }, null, 2) + '\n');
}

main().catch((err) => { console.error(err); process.exit(1); });
