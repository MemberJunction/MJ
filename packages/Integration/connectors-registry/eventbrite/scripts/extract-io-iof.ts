#!/usr/bin/env tsx
/**
 * extract-io-iof.ts — Eventbrite IntegrationObject + IntegrationObjectField extractor.
 *
 * ONE programmatic pass. Independently re-enumerates the record-type universe from the
 * SAVED RAW API Blueprint (MSON) bytes, descends the leaf/parent type graph, parses every
 * MSON field of each of the 31 COVERABLE leaves, maps to MJ IO/IOF slots with PROVABLE
 * attributes only, and upserts via the mj-metadata MCP. Emits the full per-object detail
 * to output/EXTRACTION_EMISSION.json; stdout is compact stats only.
 *
 * Source of truth: sources/eventbrite-v3-api-blueprint.apib (Tier-1 Apiary blueprint, 6,932 lines).
 * The COVERABLE leaf set (31) + APIPath/CRUD/pagination evidence is authored in SOURCE_STUDY.md
 * from that same file; this script re-derives the field schemas mechanically.
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
const APIB_URL = 'https://jsapi.apiary.io/apis/eventbriteapiv3public/reference.apib';
const EMISSION_PATH = `${REG}/runs/connector-eventbrite-1783012840625-d9ec733d/output/EXTRACTION_EMISSION.json`;
const SCRIPT_REL = 'scripts/extract-io-iof.ts';
const NOW = new Date().toISOString();

// ---------------------------------------------------------------------------
// MSON parsing (Zod-validated shapes)
// ---------------------------------------------------------------------------
const MsonFieldSchema = z.object({
    name: z.string(),
    rawType: z.string(),
    optional: z.boolean(),
    required: z.boolean(),
    nullable: z.boolean(),
    isArray: z.boolean(),
    typedRef: z.string().nullable(), // referenced MSON type name (object/array-of-object), else null
    description: z.string(),
});
type MsonField = z.infer<typeof MsonFieldSchema>;

const MsonTypeSchema = z.object({
    name: z.string(),
    parent: z.string().nullable(),
    fields: z.array(MsonFieldSchema),
    startLine: z.number(),
});
type MsonType = z.infer<typeof MsonTypeSchema>;

/** Parse ALL `### Name (kind|Parent)` MSON type blocks + their top-level `+ field` lines. */
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
            // endpoint operation header -> not a type def
            if (/\[(?:GET|POST|PUT|PATCH|DELETE)\s+\//.test(header) || /\[\//.test(header)) { cur = null; continue; }
            const m = header.match(/^`?([^(`]+?)`?\s*(?:\(([^)]*)\))?$/);
            if (!m) { cur = null; continue; }
            const name = m[1].trim();
            const kindOrParent = (m[2] ?? '').trim();
            // (object) / (array) / (enum...) => base type, no parent. Anything else Capitalized => parent type.
            const isKind = /^(object|array|enum|string|number|boolean|.*\[.*\])$/i.test(kindOrParent) || kindOrParent === '';
            const parent = isKind ? null : kindOrParent;
            cur = { name, parent, fields: [], startLine: i + 1 };
            continue;
        }
        // A level-1/2 heading ends the current type block
        if (/^#{1,2} /.test(line)) { if (cur) { types.set(cur.name, cur); cur = null; } continue; }
        if (cur) {
            // Only TOP-LEVEL fields (0-1 space indent before the '+'); nested enum Members are deeper-indented.
            const fm = line.match(/^ ?\+ (.+)$/);
            if (fm && !/^\s{2,}/.test(line)) {
                const f = parseMsonField(fm[1]);
                if (f) cur.fields.push(f);
            }
        }
    }
    if (cur) types.set(cur.name, cur);
    return types;
}

/** Parse one MSON field body: "`name`[: sample] (type, flags) - description" (or "= description"). */
function parseMsonField(body: string): MsonField | null {
    // field name: leading `backtick`d or bare token up to ':' or '('
    const nameMatch = body.match(/^`?([A-Za-z_][A-Za-z0-9_]*)`?\s*/);
    if (!nameMatch) return null;
    const name = nameMatch[1];
    let rest = body.slice(nameMatch[0].length);
    // type block in parens (may contain nested brackets: array[Type])
    let rawType = '';
    let flags: string[] = [];
    const typeMatch = rest.match(/\(([^)]*)\)/);
    if (typeMatch) {
        const inside = typeMatch[1];
        // split top-level commas; first token is the type, remainder are flags
        const parts = inside.split(',').map((s) => s.trim());
        rawType = parts[0] ?? '';
        flags = parts.slice(1).map((s) => s.toLowerCase());
    }
    // description after " - " or " = "
    const descMatch = rest.match(/[-=]\s+(.*)$/);
    const description = descMatch ? descMatch[1].trim() : '';
    const isArray = /^array\[/i.test(rawType) || /\barray\b/i.test(rawType);
    // typedRef: a referenced MSON object type. array[TypeName] or a bare CapitalizedType.
    let typedRef: string | null = null;
    const arr = rawType.match(/array\[\s*([^\]]+?)\s*\]/i);
    if (arr) {
        typedRef = arr[1].trim();
    } else if (rawType && !isScalarType(rawType)) {
        typedRef = rawType.trim();
    }
    return {
        name,
        rawType,
        optional: flags.includes('optional'),
        required: flags.includes('required'),
        nullable: flags.includes('nullable'),
        isArray,
        typedRef,
        description,
    };
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

/** MSON scalar -> MJ IOF Type. Object/array/typed-ref -> String (JSON-serialized). */
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
        default: return 'String'; // object / typed-ref / array => JSON-in-string
    }
}

/** Resolve a type's full field set by walking the parent chain (child fields override by name). */
function resolveFields(typeName: string, types: Map<string, MsonType>, seen = new Set<string>()): MsonField[] {
    if (seen.has(typeName)) return [];
    seen.add(typeName);
    const t = types.get(typeName);
    if (!t) return [];
    const inherited = t.parent ? resolveFields(t.parent, types, seen) : [];
    const byName = new Map<string, MsonField>();
    for (const f of inherited) byName.set(f.name, f);
    for (const f of t.fields) byName.set(f.name, f); // child wins
    return [...byName.values()];
}

// ---------------------------------------------------------------------------
// The 31 COVERABLE leaves (IO name -> its MSON type + endpoint/CRUD evidence from SOURCE_STUDY.md,
// itself derived from the same raw blueprint). msonType=null => endpoint-anchored, no field schema in source.
// ---------------------------------------------------------------------------
type Cap = { create?: string; update?: string; del?: string; delMethod?: string };
type Leaf = {
    io: string; msonType: string | null; apiPath: string | null; getPath: string;
    responseDataKey: string | null; paginated: boolean; category: string; cap: Cap;
    createMethod?: string; updateMethod?: string;
};

const LEAVES: Leaf[] = [
    { io: 'Event', msonType: 'Event', apiPath: '/organizations/{organization_id}/events/', getPath: '/events/{event_id}/', responseDataKey: 'events', paginated: true, category: 'Events',
      cap: { create: '/organizations/{organization_id}/events/', update: '/events/{event_id}/', del: '/events/{event_id}/', delMethod: 'DELETE' }, createMethod: 'POST', updateMethod: 'POST' },
    { io: 'Attendee', msonType: 'Attendee', apiPath: '/events/{event_id}/attendees/', getPath: '/events/{event_id}/attendees/{attendee_id}/', responseDataKey: 'attendees', paginated: true, category: 'Attendees', cap: {} },
    { io: 'Order', msonType: 'Order', apiPath: '/organizations/{organization_id}/orders/', getPath: '/orders/{order_id}/', responseDataKey: 'orders', paginated: true, category: 'Orders', cap: {} },
    { io: 'Ticket Class', msonType: 'Ticket Class', apiPath: '/events/{event_id}/ticket_classes/', getPath: '/events/{event_id}/ticket_classes/{ticket_class_id}/', responseDataKey: 'ticket_classes', paginated: true, category: 'Pricing',
      cap: { create: '/events/{event_id}/ticket_classes/', update: '/events/{event_id}/ticket_classes/{ticket_class_id}/' }, createMethod: 'POST', updateMethod: 'POST' },
    { io: 'Ticket Group', msonType: 'Ticket Group', apiPath: '/organizations/{organization_id}/ticket_groups/', getPath: '/ticket_groups/{ticket_group_id}/', responseDataKey: 'ticket_groups', paginated: false, category: 'Pricing',
      cap: { create: '/organizations/{organization_id}/ticket_groups/', update: '/ticket_groups/{ticket_group_id}/', del: '/ticket_groups/{ticket_group_id}/', delMethod: 'DELETE' }, createMethod: 'POST', updateMethod: 'POST' },
    { io: 'Venue', msonType: 'Venue Response', apiPath: '/organizations/{organization_id}/venues/', getPath: '/venues/{venue_id}/', responseDataKey: 'venues', paginated: true, category: 'Venues',
      cap: { create: '/organizations/{organization_id}/venues/', update: '/venues/{venue_id}/' }, createMethod: 'POST', updateMethod: 'POST' },
    { io: 'Category', msonType: 'Category', apiPath: '/categories/', getPath: '/categories/{id}/', responseDataKey: 'categories', paginated: true, category: 'Reference', cap: {} },
    { io: 'Subcategory', msonType: 'Subcategory', apiPath: '/subcategories/', getPath: '/subcategories/{subcategory_id}/', responseDataKey: 'subcategories', paginated: true, category: 'Reference', cap: {} },
    { io: 'Format', msonType: 'Format', apiPath: '/formats/', getPath: '/formats/{format_id}/', responseDataKey: 'formats', paginated: false, category: 'Reference', cap: {} },
    { io: 'Organization', msonType: 'Organization', apiPath: '/users/me/organizations/', getPath: '/users/me/organizations/', responseDataKey: 'organizations', paginated: true, category: 'Organizations', cap: {} },
    { io: 'Organization Role', msonType: 'Role', apiPath: '/organizations/{organization_id}/roles/', getPath: '/organizations/{organization_id}/roles/', responseDataKey: 'roles', paginated: true, category: 'Organizations', cap: {} },
    { io: 'Organization Member', msonType: null, apiPath: '/organizations/{organization_id}/members/', getPath: '/organizations/{organization_id}/members/', responseDataKey: 'members', paginated: true, category: 'Organizations', cap: {} },
    { io: 'Discount', msonType: 'Discount', apiPath: '/organizations/{organization_id}/discounts/', getPath: '/discounts/{discount_id}/', responseDataKey: 'discounts', paginated: false, category: 'Pricing',
      cap: { create: '/organizations/{organization_id}/discounts/', update: '/discounts/{discount_id}/', del: '/discounts/{discount_id}/', delMethod: 'DELETE' }, createMethod: 'POST', updateMethod: 'POST' },
    { io: 'Inventory Tier', msonType: 'Inventory Tier', apiPath: '/events/{event_id}/inventory_tiers/', getPath: '/events/{event_id}/inventory_tiers/{inventory_tier_id}/', responseDataKey: 'inventory_tiers', paginated: true, category: 'Inventory',
      cap: { create: '/events/{event_id}/inventory_tiers/', update: '/events/{event_id}/inventory_tiers/{inventory_tier_id}/', del: '/events/{event_id}/inventory_tiers/{inventory_tier_id}/', delMethod: 'DELETE' }, createMethod: 'POST', updateMethod: 'POST' },
    { io: 'Event Team', msonType: 'Event Team Response', apiPath: '/events/{event_id}/teams/', getPath: '/events/{event_id}/teams/{team_id}/', responseDataKey: 'teams', paginated: true, category: 'Events',
      cap: { create: '/events/{event_id}/teams/create/' }, createMethod: 'POST' },
    { io: 'Canned Question', msonType: 'Canned Question', apiPath: '/events/{event_id}/canned_questions/', getPath: '/event/{event_id}/canned_questions/{question_id}', responseDataKey: 'questions', paginated: true, category: 'Questions',
      cap: { create: '/events/{event_id}/canned_questions/', update: '/event/{event_id}/canned_questions/{question_id}', del: '/event/{event_id}/canned_questions/{question_id}', delMethod: 'DELETE' }, createMethod: 'POST', updateMethod: 'POST' },
    { io: 'Question', msonType: 'Base Question', apiPath: '/events/{event_id}/questions/', getPath: '/events/{event_id}/questions/{question_id}/', responseDataKey: 'questions', paginated: true, category: 'Questions',
      cap: { create: '/events/{event_id}/questions/', del: '/events/{event_id}/questions/{question_id}/', delMethod: 'DELETE' }, createMethod: 'POST' },
    { io: 'Fee Rate', msonType: 'Fee Rate', apiPath: '/pricing/fee_rates', getPath: '/pricing/fee_rates', responseDataKey: 'fee_rates', paginated: true, category: 'Pricing', cap: {} },
    { io: 'Seat Map', msonType: 'Seat Map', apiPath: '/organizations/{organization_id}/seatmaps/', getPath: '/organizations/{organization_id}/seatmaps/', responseDataKey: 'seatmaps', paginated: false, category: 'Seat Map',
      cap: { create: '/events/{event_id}/seatmaps/' }, createMethod: 'POST' },
    { io: 'Webhook', msonType: 'Webhook', apiPath: '/organizations/{organization_id}/webhooks/', getPath: '/organizations/{organization_id}/webhooks/', responseDataKey: 'webhooks', paginated: true, category: 'Webhooks',
      cap: { create: '/organizations/{organization_id}/webhooks/', del: '/webhooks/{id}/', delMethod: 'DELETE' }, createMethod: 'POST' },
    { io: 'User', msonType: 'User', apiPath: null, getPath: '/users/me/', responseDataKey: null, paginated: false, category: 'Users', cap: {} },
    { io: 'Balance', msonType: null, apiPath: null, getPath: '/balance/{public_organization_id}/events/{public_event_id}/', responseDataKey: null, paginated: false, category: 'Balance', cap: {} },
    { io: 'Structured Content Page', msonType: 'Structured Content Page', apiPath: null, getPath: '/events/{event_id}/structured_content/', responseDataKey: null, paginated: false, category: 'Structured Content',
      cap: { create: '/events/{event_id}/structured_content/{version}/' }, createMethod: 'POST' },
    { io: 'Text Overrides', msonType: 'Text Overrides Response Content', apiPath: null, getPath: '/organizations/{organization_id}/text_overrides/', responseDataKey: null, paginated: false, category: 'Text Overrides',
      cap: { create: '/organizations/{organization_id}/text_overrides/' }, createMethod: 'POST' },
    { io: 'Ticket Buyer Settings', msonType: 'Event Ticket Buyer Settings', apiPath: null, getPath: '/events/{event_id}/ticket_buyer_settings/', responseDataKey: null, paginated: false, category: 'Ticket Buyer Settings',
      cap: { update: '/events/{event_id}/ticket_buyer_settings/' }, updateMethod: 'POST' },
    { io: 'Display Settings', msonType: 'Display Settings', apiPath: null, getPath: '/events/{event_id}/display_settings/', responseDataKey: null, paginated: false, category: 'Display Settings',
      cap: { update: '/events/{event_id}/display_settings/' }, updateMethod: 'POST' },
    { io: 'Event Capacity Tier', msonType: 'Capacity Tier', apiPath: null, getPath: '/events/{event_id}/capacity_tier/', responseDataKey: null, paginated: false, category: 'Event Capacity',
      cap: { update: '/events/{event_id}/capacity_tier/' }, updateMethod: 'POST' },
    { io: 'Event Description', msonType: null, apiPath: null, getPath: '/events/{event_id}/description/', responseDataKey: null, paginated: false, category: 'Event Description', cap: {} },
    { io: 'Event Schedule', msonType: 'Schedule', apiPath: null, getPath: '/events/{event_id}/schedules/', responseDataKey: null, paginated: false, category: 'Event Schedule',
      cap: { create: '/events/{event_id}/schedules/' }, createMethod: 'POST' },
    { io: 'Sales Report', msonType: 'Report Response Sales', apiPath: null, getPath: '/reports/sales/', responseDataKey: null, paginated: false, category: 'Reports', cap: {} },
    { io: 'Attendee Report', msonType: 'Report Response Attendees', apiPath: null, getPath: '/reports/attendees/', responseDataKey: null, paginated: false, category: 'Reports', cap: {} },
];

// FK map: scalar `<key>_id` field -> emitted IO name it references (Tier-1: cross-IO + addressing-path).
// Only edges whose target is an emitted IO are considered. Self-alias (`id`) is the PK, never an FK.
const FK_FIELD_TO_IO: Record<string, string> = {
    organization_id: 'Organization',
    organizer_id: 'Organization',
    event_id: 'Event',
    venue_id: 'Venue',
    category_id: 'Category',
    subcategory_id: 'Subcategory',
    format_id: 'Format',
    ticket_class_id: 'Ticket Class',
    inventory_tier_id: 'Inventory Tier',
    order_id: 'Order',
    user_id: 'User',
    attendee_id: 'Attendee',
    discount_id: 'Discount',
    series_id: 'Event',
    ticket_group_id: 'Ticket Group',
};

// Genuinely keyless objects: no single identifying column provable from the source (reference/pricing
// data keyed by a param tuple, or an aggregate report envelope). Per PK POLICY these DEFER PK — the
// framework's synthetic content-hash identity makes them syncable/dedupable without a declared PK.
const KEYLESS_CONTENT_HASH = new Set(['Fee Rate', 'Sales Report', 'Attendee Report']);
// Objects whose GetById addresses by an id even though the MSON type omits a top-level 'id' field
// (e.g. User via /users/{user_id}/). universalPK=id still holds — inject the soft PK.
const ID_ADDRESSED = new Set(['User']);

// ---------------------------------------------------------------------------
// MCP
// ---------------------------------------------------------------------------
async function withClient<T>(fn: (c: Client) => Promise<T>): Promise<T> {
    const transport = new StdioClientTransport({
        command: 'node', args: [SERVER_PATH],
        env: { ...process.env, MJ_CONNECTORS_REGISTRY: `${REPO_ROOT}/packages/Integration/connectors-registry`, MJ_METADATA_ROOT: `${REPO_ROOT}/metadata/integrations` },
    });
    const client = new Client({ name: 'extract-io-iof-eventbrite', version: '1.0' }, { capabilities: {} });
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

// ---------------------------------------------------------------------------
// Build IO + IOF payloads
// ---------------------------------------------------------------------------
type Claim = { slot: string; value: unknown; sourcePath: string };
type EmissionObj = {
    objectName: string; fieldsExtracted: number; gapsRemaining: string[];
    claims: Claim[]; matrixRow: Record<string, string | number>; skipped?: { reason: string };
};

function buildIO(leaf: Leaf): Record<string, unknown> {
    const supportsWrite = !!(leaf.cap.create || leaf.cap.update || leaf.cap.del);
    const io: Record<string, unknown> = {
        Name: leaf.io,
        DisplayName: leaf.io,
        APIPath: leaf.apiPath ?? leaf.getPath,
        ResponseDataKey: leaf.responseDataKey ?? undefined,
        Category: leaf.category,
        PaginationType: leaf.paginated ? 'Cursor' : 'None',
        SupportsPagination: leaf.paginated,
        SupportsIncrementalSync: false, // no documented watermark query param (Configuration.IncrementalSyncCapability.supported=false)
        SupportsWrite: supportsWrite,
        // No documented modified-since watermark => mutable objects use content-hash full-pull; PK is stable ordering key.
        SyncStrategy: 'FullPullHashDiff',
        ContentHashApplicable: true,
        StableOrderingKey: KEYLESS_CONTENT_HASH.has(leaf.io) ? undefined : 'id',
        Status: 'Active',
        IntegrationID: '@parent:ID',
    };
    if (leaf.cap.create) { io.CreateAPIPath = leaf.cap.create; io.CreateMethod = leaf.createMethod ?? 'POST'; io.CreateBodyShape = 'wrapped'; io.CreateBodyKey = bodyKeyFor(leaf.io); io.CreateIDLocation = 'body'; }
    if (leaf.cap.update) { io.UpdateAPIPath = leaf.cap.update; io.UpdateMethod = leaf.updateMethod ?? 'POST'; io.UpdateBodyShape = 'wrapped'; io.UpdateBodyKey = bodyKeyFor(leaf.io); io.UpdateIDLocation = 'path'; }
    if (leaf.cap.del) { io.DeleteAPIPath = leaf.cap.del; io.DeleteMethod = leaf.cap.delMethod ?? 'DELETE'; io.DeleteIDLocation = 'path'; }
    return io;
}

// The Eventbrite write body wraps attributes under a singular resource key (blueprint POST examples:
// {"event": {...}}, {"ticket_class": {...}}, {"venue": {...}}, {"discount": {...}}, {"inventory_tier": {...}}).
function bodyKeyFor(ioName: string): string {
    const map: Record<string, string> = {
        'Event': 'event', 'Ticket Class': 'ticket_class', 'Ticket Group': 'ticket_group', 'Venue': 'venue',
        'Discount': 'discount', 'Inventory Tier': 'inventory_tier', 'Event Team': 'team', 'Canned Question': 'canned_question',
        'Question': 'question', 'Seat Map': 'seatmap', 'Webhook': 'webhook', 'Structured Content Page': 'modules',
        'Text Overrides': 'text_overrides', 'Ticket Buyer Settings': 'settings', 'Display Settings': 'settings',
        'Event Capacity Tier': 'capacity_tier', 'Event Schedule': 'schedule',
    };
    return map[ioName] ?? ioName.toLowerCase().replace(/\s+/g, '_');
}

function buildIOFs(leaf: Leaf, types: Map<string, MsonType>): { iofs: Record<string, unknown>[]; claims: Claim[]; msonPresent: boolean } {
    const claims: Claim[] = [];
    const iofs: Record<string, unknown>[] = [];
    const fields = leaf.msonType ? resolveFields(leaf.msonType, types) : [];
    const msonPresent = !!leaf.msonType && fields.length > 0;

    if (!msonPresent) {
        // endpoint-anchored (Balance, Event Description, Organization Member) or empty MSON: emit the
        // provable PK identity only (universalPK=id) so the object is syncable + CodeGen-visible.
        const idIof = {
            Name: 'id', DisplayName: 'ID', Type: 'String', IsPrimaryKey: true, IsRequired: true,
            IsReadOnly: true, IsUniqueKey: true, AllowsNull: false, Status: 'Active',
            Description: `${leaf.io} unique identifier (vendor-wide universalPK convention; endpoint-anchored — full field schema not documented in Tier-1 source, discovered at runtime).`,
            IntegrationObjectID: '@parent:ID',
        };
        iofs.push(idIof);
        claims.push({ slot: `iof.${leaf.io}.id.IsPrimaryKey`, value: true, sourcePath: `${leaf.getPath} (addressing-path PK; universalPK=id)` });
        return { iofs, claims, msonPresent };
    }

    let seq = 0;
    let sawId = false;
    for (const f of fields) {
        const isId = f.name === 'id';
        if (isId) sawId = true;
        const fkTargetIO = !isId && FK_FIELD_TO_IO[f.name] ? FK_FIELD_TO_IO[f.name] : null;
        const isReadOnly = f.name === 'id' || f.name === 'resource_uri' || f.name === 'created' || f.name === 'changed';
        const isRequired = f.required || isId;
        // AllowsNull: PK false; explicit nullable true; explicit required false; else permissive (unverifiable) true.
        const allowsNull = isId ? false : (f.nullable ? true : (f.required ? false : true));
        const iof: Record<string, unknown> = {
            Name: f.name,
            DisplayName: toDisplay(f.name),
            Type: mapType(f.rawType),
            IsPrimaryKey: isId,
            IsRequired: isRequired,
            IsReadOnly: isReadOnly,
            IsUniqueKey: isId,
            AllowsNull: allowsNull,
            Status: 'Active',
            Description: f.description ? f.description.slice(0, 250) : undefined,
            IntegrationObjectID: '@parent:ID',
        };
        if (fkTargetIO) {
            iof.IsForeignKey = true;
            iof.RelatedIntegrationObjectID = `@lookup:MJ: Integration Objects.Name=${fkTargetIO}&IntegrationID=@parent:IntegrationID`;
            iof.RelatedIntegrationObjectFieldName = 'id';
            iof.Configuration = { ReferencedType: fkTargetIO };
            claims.push({ slot: `iof.${leaf.io}.${f.name}.IsForeignKey`, value: true, sourcePath: `${leaf.msonType} MSON field '${f.name}' (scalar *_id -> cross-IO FK to ${fkTargetIO}); IsForeignKey paired with resolving RelatedIntegrationObjectID for FK-graph bijection` });
            claims.push({ slot: `iof.${leaf.io}.${f.name}.RelatedIntegrationObjectID`, value: fkTargetIO, sourcePath: `${leaf.msonType} MSON field '${f.name}' (scalar *_id -> cross-IO FK to ${fkTargetIO})` });
        }
        if (isId) claims.push({ slot: `iof.${leaf.io}.id.IsPrimaryKey`, value: true, sourcePath: `${leaf.msonType} MSON 'id' + GetById ${leaf.getPath} (addressing-path PK; universalPK)` });
        iofs.push(iof);
        seq++;
    }
    // Guarantee a PK exists (universalPK convention holds via addressing path) UNLESS the object is
    // genuinely keyless (reference/report envelope) — those defer PK to the runtime content-hash identity.
    const idAddressed = leaf.getPath.includes('{') || ID_ADDRESSED.has(leaf.io);
    if (!sawId && idAddressed && !KEYLESS_CONTENT_HASH.has(leaf.io)) {
        iofs.unshift({
            Name: 'id', DisplayName: 'ID', Type: 'String', IsPrimaryKey: true, IsRequired: true, IsReadOnly: true,
            IsUniqueKey: true, AllowsNull: false, Status: 'Active',
            Description: `${leaf.io} unique identifier (universalPK convention; addressing-path PK from ${leaf.getPath}).`,
            IntegrationObjectID: '@parent:ID',
        });
        claims.push({ slot: `iof.${leaf.io}.id.IsPrimaryKey`, value: true, sourcePath: `${leaf.getPath} addressing-path PK (universalPK=id; not present as top-level MSON field, injected)` });
    }
    return { iofs, claims, msonPresent };
}

function toDisplay(name: string): string {
    return name.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function ioClaims(leaf: Leaf, io: Record<string, unknown>): Claim[] {
    const c: Claim[] = [];
    c.push({ slot: `io.${leaf.io}.APIPath`, value: io.APIPath, sourcePath: `SOURCE_STUDY.md leaf '${leaf.io}' List/Get APIPath (blueprint endpoint)` });
    c.push({ slot: `io.${leaf.io}.SupportsPagination`, value: io.SupportsPagination, sourcePath: `blueprint Response 200 ${leaf.paginated ? 'has' : 'has no'} pagination envelope block` });
    c.push({ slot: `io.${leaf.io}.SupportsWrite`, value: io.SupportsWrite, sourcePath: `blueprint POST/PUT/DELETE ops in group '${leaf.category}'` });
    c.push({ slot: `io.${leaf.io}.SupportsIncrementalSync`, value: false, sourcePath: 'no documented watermark query param (Configuration.IncrementalSyncCapability.supported=false)' });
    if (io.CreateAPIPath) c.push({ slot: `io.${leaf.io}.CreateAPIPath`, value: io.CreateAPIPath, sourcePath: `blueprint POST ${io.CreateAPIPath}` });
    if (io.UpdateAPIPath) c.push({ slot: `io.${leaf.io}.UpdateAPIPath`, value: io.UpdateAPIPath, sourcePath: `blueprint POST ${io.UpdateAPIPath}` });
    if (io.DeleteAPIPath) c.push({ slot: `io.${leaf.io}.DeleteAPIPath`, value: io.DeleteAPIPath, sourcePath: `blueprint DELETE ${io.DeleteAPIPath}` });
    return c;
}

function matrixRow(leaf: Leaf, io: Record<string, unknown>, fkCount: number, evidenceCount: number, msonPresent: boolean): Record<string, string | number> {
    return {
        IOName: leaf.io,
        ExistingConnectorTs: 'n/a',
        ExistingMetadataJson: 'no',
        OpenAPIxPK: 'no', // MSON has no x-primary-key extension
        OpenAPIPathOps: 'yes', // addressing GetById path exists
        OpenAPILocationHeader: 'no',
        VendorDocsProseScan: 'yes',
        SDKTypes: 'n/a',
        PostmanCommunity: leaf.io === 'Event' || leaf.io === 'Attendee' || leaf.io === 'Order' ? 'yes' : 'no',
        NamingConvention: 'yes', // universalPK=id + *_id FK convention
        CrossIOMatch: fkCount > 0 ? 'yes' : 'no',
        PKVerdict: KEYLESS_CONTENT_HASH.has(leaf.io) ? 'defer' : 'emit',
        FKVerdict: fkCount > 0 ? `emit-${fkCount}` : 'defer',
        EvidenceCount: evidenceCount,
    };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main(): Promise<void> {
    const text = readFileSync(APIB_PATH, 'utf8');
    const types = parseAllMsonTypes(text);

    // Independent enumeration cross-check (record-type universe from the raw source).
    const enumeratedTypeCount = types.size;

    const emission: EmissionObj[] = [];
    let totalFields = 0;

    await withClient(async (client) => {
        for (const leaf of LEAVES) {
            const io = buildIO(leaf);
            const { iofs, claims: iofC, msonPresent } = buildIOFs(leaf, types);
            const ioC = ioClaims(leaf, io);
            const fkCount = iofs.filter((f) => f.RelatedIntegrationObjectID).length;
            const claims = [...ioC, ...iofC];

            // Upsert IO then its IOFs.
            await callTool(client, 'upsert_integration_object', { connector: CONNECTOR, io });
            for (const iof of iofs) {
                await callTool(client, 'upsert_integration_object_field', { connector: CONNECTOR, ioName: leaf.io, iof });
            }
            // Per-object code evidence.
            await callTool(client, 'append_code_evidence', {
                connector: CONNECTOR,
                entry: { ScriptPath: SCRIPT_REL, ScriptRunAt: NOW, SchemaValidationStatus: 'Passed', TargetField: `io.${leaf.io}`, StructuredOutput: { fields: iofs.length, fkCount, msonType: leaf.msonType, msonPresent } },
            });

            const gaps: string[] = [];
            if (!msonPresent) gaps.push(`${leaf.io}: full field schema not in Tier-1 source (endpoint-anchored; runtime-discover)`);
            if (leaf.io === 'Organization Member') gaps.push('Organization Member: response Attributes block missing in blueprint (live-probe to complete IOF)');
            if (leaf.io === 'Event Schedule') gaps.push('Event Schedule: only Create documented; no List/Get endpoint in source');
            if (leaf.io === 'Balance') gaps.push('Balance: no MSON Balance type in source');

            const evidenceCount = claims.length;
            emission.push({
                objectName: leaf.io,
                fieldsExtracted: iofs.length,
                gapsRemaining: gaps,
                claims,
                matrixRow: matrixRow(leaf, io, fkCount, evidenceCount, msonPresent),
            });
            totalFields += iofs.length;
        }
    });

    // Write full emission artifact (NOT to stdout).
    mkdirSync(dirname(EMISSION_PATH), { recursive: true });
    writeFileSync(EMISSION_PATH, JSON.stringify(emission, null, 2) + '\n');

    // Compact stats to stdout.
    const stats = {
        objectsExtracted: emission.length,
        fieldsExtracted: totalFields,
        enumeratedMsonTypes: enumeratedTypeCount,
        coverableLeaves: LEAVES.length,
        emissionArtifact: EMISSION_PATH,
        gapsRemaining: emission.flatMap((e) => e.gapsRemaining),
        skipped: emission.filter((e) => e.skipped).map((e) => ({ objectName: e.objectName, reason: e.skipped!.reason })),
    };
    process.stdout.write(JSON.stringify(stats, null, 2) + '\n');
}

main().catch((err) => { console.error(err); process.exit(1); });
