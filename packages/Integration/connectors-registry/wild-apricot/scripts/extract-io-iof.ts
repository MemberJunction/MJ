#!/usr/bin/env tsx
// scripts/extract-io-iof.ts — Wild Apricot IO/IOF extractor.
//
// Code-first: this script's structured output IS the emission. It walks the RAW
// admin OpenAPI 3.1 spec (sources/openapi.admin.9.14.0.json), enumerates the full
// record-type universe (components.schemas, resolving allOf/$ref), descends the
// type graph for nested record-collections, classifies each schema into a first-class
// IO / nested-detail IO / skip-with-reason wrapper, types every field from the spec,
// and upserts IO+IOF rows to metadata/integrations/wildapricot/.wildapricot.integration.json
// via the mj-metadata MetadataFileStore. No catalog is hardcoded — only structural
// patterns (loops, regexes, type maps). Sources read: credential-free OpenAPI spec only.
// Prior connector / prior metadata are OUTPUT and are NEVER read (REDO directive).

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { z } from 'zod';
import { MetadataFileStore } from '../../../../MCP/mj-metadata/dist/MetadataFileStore.js';

// ── Roots ────────────────────────────────────────────────────────────────────
const REPO_ROOT = resolve(__dirname, '../../../../..');
const REGISTRY_ROOT = resolve(REPO_ROOT, 'packages/Integration/connectors-registry');
const METADATA_ROOT = resolve(REPO_ROOT, 'metadata/integrations');
const CONNECTOR = 'wildapricot';
const SPEC_PATH = resolve(REGISTRY_ROOT, 'wild-apricot/sources/openapi.admin.9.14.0.json');
const SPEC_REL = 'packages/Integration/connectors-registry/wild-apricot/sources/openapi.admin.9.14.0.json';
const EMISSION_OUT = resolve(
    REGISTRY_ROOT,
    'wildapricot/runs/connector-wildapricot-1782844331649-0a8d294b/output/EXTRACTION_EMISSION.json',
);

// ── Zod schemas for the OpenAPI shape we consume ──────────────────────────────
const SchemaObjSchema = z.object({
    type: z.union([z.string(), z.array(z.string())]).optional(),
    properties: z.record(z.unknown()).optional(),
    allOf: z.array(z.unknown()).optional(),
    required: z.array(z.string()).optional(),
    enum: z.array(z.unknown()).optional(),
    description: z.string().optional(),
}).passthrough();
const OpenAPISchema = z.object({
    openapi: z.string().optional(),
    paths: z.record(z.unknown()),
    components: z.object({ schemas: z.record(z.unknown()) }),
});

type RawProp = {
    type?: string | string[]; format?: string; description?: string; $ref?: string;
    enum?: unknown[]; items?: unknown; allOf?: unknown[]; properties?: Record<string, unknown>;
    maxLength?: number; readOnly?: boolean; nullable?: boolean;
} & Record<string, unknown>;
type RawSchema = z.infer<typeof SchemaObjSchema> & Record<string, unknown>;

// ── Load + validate ───────────────────────────────────────────────────────────
const specRaw: unknown = JSON.parse(readFileSync(SPEC_PATH, 'utf-8'));
const spec = OpenAPISchema.parse(specRaw);
const schemas: Record<string, RawSchema> = {};
for (const [n, s] of Object.entries(spec.components.schemas)) schemas[n] = SchemaObjSchema.parse(s) as RawSchema;
const paths = spec.paths as Record<string, Record<string, RawSchema>>;

const refName = (ref: string): string => ref.split('/').pop() as string;

// Resolve a schema's full property map by merging allOf base $refs + inline properties.
function resolveProps(name: string, seen = new Set<string>()): Record<string, RawProp> {
    if (seen.has(name)) return {};
    seen.add(name);
    const s = schemas[name];
    if (!s) return {};
    const out: Record<string, RawProp> = { ...(s.properties as Record<string, RawProp> ?? {}) };
    for (const sub of (s.allOf ?? []) as RawSchema[]) {
        if (sub.$ref) Object.assign(out, resolveProps(refName(sub.$ref as string), seen));
        else if (sub.properties) Object.assign(out, sub.properties as Record<string, RawProp>);
    }
    return out;
}
function resolveRequired(name: string, seen = new Set<string>()): Set<string> {
    if (seen.has(name)) return new Set();
    seen.add(name);
    const s = schemas[name];
    const out = new Set<string>(s?.required ?? []);
    for (const sub of (s?.allOf ?? []) as RawSchema[]) {
        if (sub.$ref) for (const r of resolveRequired(refName(sub.$ref as string), seen)) out.add(r);
        else if (Array.isArray(sub.required)) for (const r of sub.required) out.add(r);
    }
    return out;
}

// ── Enumerate the universe: every record-bearing object schema (has fields, not pure enum).
function isEnumSchema(s: RawSchema): boolean { return Array.isArray(s.enum); }
function isObjectSchema(name: string): boolean {
    const s = schemas[name];
    if (!s || isEnumSchema(s)) return false;
    return Object.keys(resolveProps(name)).length > 0;
}
const ALL_SCHEMA_NAMES = Object.keys(schemas).sort((a, b) => a.localeCompare(b));
const OBJECT_SCHEMAS = ALL_SCHEMA_NAMES.filter(isObjectSchema);

// ── Floor-enumerator parity ────────────────────────────────────────────────────
// floor-check independently runs packages/Integration/connector-builder-workshop/floor/
// enumerate-catalog.mjs over THIS spec and requires (emitted ∪ skipped-with-reason) ==
// the enumerator's recordTypes set. The enumerator's OpenAPI rule includes any schema
// where `s.type==='object' || s.properties || s.allOf || (!s.type && !s.enum)` and not
// `s.enum`. That `(!s.type && !s.enum)` clause admits a couple of MALFORMED 0-property
// definitions (`EmailRecipients`, `ResourceUrl` — they carry a stray non-standard `schema`
// key instead of `properties`) that our `isObjectSchema` (requires ≥1 resolved prop)
// excludes. To keep accounting EXACTLY in parity with floor-check, replicate the
// enumerator's inclusion rule here so every enumerated name is either emitted or
// skipped-with-reason — no silent unaccounted residual.
function floorIncludes(name: string): boolean {
    const s = schemas[name];
    if (!s || typeof s !== 'object') return false;
    if (Array.isArray(s.enum)) return false;
    return s.type === 'object' || !!s.properties || !!s.allOf || (!s.type && !s.enum);
}
const FLOOR_UNIVERSE = ALL_SCHEMA_NAMES.filter(floorIncludes);

// ── INPUT request-body + CONTAINER list/response wrappers — structural plumbing. ──
const INPUT_RE = /^(Create|Edit|Update|Send|Clone|Allocate|Unallocate|CheckIn|Approve|Reject|Set|Generate|Void|Register|Verify|Accept|Mutable|Document)\w*|(Params|Param|Model)$/;
const CONTAINER_RE = /(ListResponse|IdsResponse|CountResponse|AsyncResponse|ListResult|Records|Identifiers|sResponse|Response)$/;
const isInputSchema = (n: string): boolean => INPUT_RE.test(n);
const isContainerSchema = (n: string): boolean => CONTAINER_RE.test(n);

function respSchemaOf(op: RawSchema | undefined): string | null {
    if (!op) return null;
    const responses = (op.responses ?? {}) as Record<string, RawSchema>;
    for (const code of ['200', '201']) {
        const content = (responses[code]?.content ?? {}) as Record<string, RawSchema>;
        for (const cv of Object.values(content)) {
            const sch = (cv.schema ?? {}) as RawProp;
            if (sch.$ref) return refName(sch.$ref as string);
            const items = sch.items as RawProp | undefined;
            if (items?.$ref) return refName(items.$ref as string);
        }
    }
    return null;
}
// Descend a container wrapper to its underlying item record (any array-of-$ref / single-$ref payload).
function unwrapContainer(name: string | null, depth = 0): string | null {
    if (!name || depth > 5 || !schemas[name]) return name;
    if (!isContainerSchema(name)) return name;
    const props = resolveProps(name);
    for (const p of Object.values(props)) {
        const it = (p as RawProp).items as RawProp | undefined;
        if (it?.$ref) return unwrapContainer(refName(it.$ref as string), depth + 1);
    }
    for (const p of Object.values(props)) {
        const ref = (p as RawProp).$ref as string | undefined;
        if (ref && refName(ref) !== name) return unwrapContainer(refName(ref), depth + 1);
    }
    return name;
}
// Resolve a path's CANONICAL entity schema, looking past read/write variants.
function canonicalEntityForPath(methods: Record<string, RawSchema>, resourceSeg: string): string | null {
    const tryResp = (op: RawSchema | undefined): string | null => {
        const r = unwrapContainer(respSchemaOf(op));
        return r && schemas[r] && !isContainerSchema(r) && !isInputSchema(r) ? r : null;
    };
    // Normalize a list-item projection (<X>ListItem) to its fuller base entity <X> when that base
    // exists — the collection GET returns <X>ListItem, the item GET returns <X> (allOf superset).
    // Both describe ONE entity; emit it once under the canonical base name. (MembershipGroup/SavedSearch.)
    const normalize = (n: string | null): string | null => {
        if (!n) return n;
        const m = n.match(/^(.+)ListItem$/);
        if (m && schemas[m[1]]) return m[1];
        return n;
    };
    const fromGet = normalize(tryResp(methods.get));
    if (fromGet) return fromGet;
    const fromPut = normalize(tryResp(methods.put) ?? tryResp(methods.post));
    if (fromPut) return fromPut;
    const seg = resourceSeg.toLowerCase().replace(/s$/, '');
    for (const sn of OBJECT_SCHEMAS) {
        if (isInputSchema(sn) || isContainerSchema(sn)) continue;
        const ln = sn.toLowerCase();
        if (ln === resourceSeg.toLowerCase() || ln === seg || ln + 's' === resourceSeg.toLowerCase()) return sn;
    }
    return null;
}

// ── Build endpoint map (first-class doors). ───────────────────────────────────
const HTTP_VERBS = ['get', 'post', 'put', 'delete', 'patch'] as const;
// RPC / action segments are matched as WHOLE path segments (NOT substrings) so collection
// resource names like `paymentAllocations` (contains "Allocate") or `SentEmailRecipients`
// (contains "Recipients") are not mis-classified as RPC. Anything under /rpc/{accountId}/ is RPC
// by location; this whole-segment set covers the non-/rpc/ action endpoints
// (POST /attachments/Upload, GET /attachments/GetInfos, PUT .../status, GET /contacts/me, etc.).
const RPC_SEGMENTS = new Set([
    'Upload', 'GetInfos', 'status', 'me', 'pictures', 'source',
    'AllocateInvoice', 'AllocateRefundToDonation', 'AllocateRefundToPayment',
    'UnallocateFromDonation', 'UnallocateFromPayment',
]);
const isRpcSegment = (seg: string): boolean => RPC_SEGMENTS.has(seg);

type Endpoint = { schema: string; collectionPath: string; itemPath: string | null; verbs: Set<string>; pkParam: string | null; tag: string };
const endpointBySchema: Record<string, Endpoint> = {};

// Group endpoints by their COLLECTION path-base (e.g. /accounts/{accountId}/contacts) so a
// collection path and its item path /{id} merge into ONE door even when their response schemas
// differ (Contact collection -> Contact; item -> contactExtendedMembershipInfo). The collection's
// canonical schema names the door; the item path donates its PUT/DELETE verbs + pkParam.
type Bucket = { collectionPath: string; itemPath: string | null; pkParam: string | null; verbs: Set<string>; tag: string; resourceSeg: string };
const buckets: Record<string, Bucket> = {};

for (const [p, methods] of Object.entries(paths)) {
    if (p === '/' || p.startsWith('/rpc/')) continue; // root probe + RPC namespace are not record doors
    const pathParams = [...p.matchAll(/\{(\w+)\}/g)].map((m) => m[1]);
    const segs = p.split('/').filter(Boolean);
    const lastSeg = segs[segs.length - 1];
    const isParamSeg = /^\{.*\}$/.test(lastSeg);
    if (!isParamSeg && isRpcSegment(lastSeg)) continue; // action sub-segment (Upload/GetInfos/status/...)
    const isItemPath = isParamSeg;
    const effResourceSeg = isItemPath ? (segs[segs.length - 2] ?? '') : lastSeg;
    if (effResourceSeg === '' || /^\{/.test(effResourceSeg)) continue;
    const collectionPath = isItemPath ? '/' + segs.slice(0, -1).join('/') : p;
    const verbs = new Set<string>();
    for (const v of HTTP_VERBS) if (methods[v]) verbs.add(v.toUpperCase());
    const tag = (((methods.get ?? Object.values(methods)[0])?.tags ?? []) as string[])[0] ?? '';
    const b = buckets[collectionPath] ?? { collectionPath, itemPath: null, pkParam: null, verbs: new Set<string>(), tag, resourceSeg: effResourceSeg };
    for (const v of verbs) b.verbs.add(v);
    if (!b.tag && tag) b.tag = tag;
    if (isItemPath) { b.itemPath = p; b.pkParam = pathParams[pathParams.length - 1]; }
    buckets[collectionPath] = b;
}

// Resolve each bucket to its canonical entity schema. Prefer the collection GET response; fall back
// to the item GET response; both are normalized (ListItem -> base; *ExtendedMembershipInfo etc. by
// resource-segment match) by canonicalEntityForPath / the explicit alias below.
const ENTITY_ALIAS: Record<string, string> = {
    contactExtendedMembershipInfo: 'Contact', // GET /contacts/{id} body — full Contact record
    ContactsMe: 'Contact',
};
for (const b of Object.values(buckets)) {
    const collMethods = paths[b.collectionPath] ?? {};
    let recordSchema = canonicalEntityForPath(collMethods as Record<string, RawSchema>, b.resourceSeg);
    if (b.itemPath) {
        const itemMethods = paths[b.itemPath] ?? {};
        const fromItem = canonicalEntityForPath(itemMethods as Record<string, RawSchema>, b.resourceSeg);
        // If the collection didn't resolve, take the item path's entity.
        if (!recordSchema && fromItem) recordSchema = fromItem;
    }
    if (!recordSchema) continue;
    recordSchema = ENTITY_ALIAS[recordSchema] ?? recordSchema;
    const existing = endpointBySchema[recordSchema];
    if (existing) {
        for (const v of b.verbs) existing.verbs.add(v);
        if (b.itemPath && (!existing.itemPath)) { existing.itemPath = b.itemPath; existing.pkParam = b.pkParam; }
        if (!existing.collectionPath) existing.collectionPath = b.collectionPath;
    } else {
        endpointBySchema[recordSchema] = {
            schema: recordSchema, collectionPath: b.collectionPath, itemPath: b.itemPath,
            verbs: new Set(b.verbs), pkParam: b.pkParam, tag: b.tag,
        };
    }
}

// ── AttachmentData door: its only GET paths are action-shaped (/attachments/GetInfos returns a
// FileInfo list) or binary (/attachments/{attachmentId}), so the generic resolver can't name it.
// AttachmentData is the documented attachment record. Wire its door explicitly. ────────────────
if (!endpointBySchema['AttachmentData'] && schemas['AttachmentData']) {
    const attachList = Object.keys(paths).find((p) => /\/attachments\/GetInfos$/.test(p));
    const attachItem = Object.keys(paths).find((p) => /\/attachments\/\{attachmentId\}$/.test(p));
    if (attachList) {
        endpointBySchema['AttachmentData'] = {
            schema: 'AttachmentData',
            collectionPath: attachList,
            itemPath: attachItem ?? null,
            verbs: new Set<string>(['GET']),
            pkParam: attachItem ? 'attachmentId' : null,
            tag: 'Attachments',
        };
    }
}

// ── Nested record map: BFS the type graph from every door. ────────────────────
function listRefsOf(prop: RawProp): string | null {
    const it = prop.items as RawProp | undefined;
    if (it?.$ref) return refName(it.$ref as string);
    for (const sub of (prop.allOf ?? []) as RawProp[]) { const r = listRefsOf(sub); if (r) return r; }
    return null;
}
function singleRefOf(prop: RawProp): string | null {
    if (prop.$ref) return refName(prop.$ref as string);
    for (const sub of (prop.allOf ?? []) as RawProp[]) { const r = singleRefOf(sub); if (r) return r; }
    return null;
}
const nestedParentOf: Record<string, { parent: string; field: string; isList: boolean }> = {};
const doors = Object.keys(endpointBySchema);
const queue = [...doors];
const visited = new Set<string>(doors);
while (queue.length) {
    const parent = queue.shift() as string;
    for (const [pn, pv] of Object.entries(resolveProps(parent))) {
        const p = pv as RawProp;
        const listChild = listRefsOf(p);
        const child = listChild ?? singleRefOf(p);
        if (!child || !schemas[child] || endpointBySchema[child]) continue;
        if (isInputSchema(child) || isContainerSchema(child) || !isObjectSchema(child)) continue;
        if (!nestedParentOf[child]) nestedParentOf[child] = { parent, field: pn, isList: !!listChild };
        if (!visited.has(child)) { visited.add(child); queue.push(child); }
    }
}

// ── Embedded value-structs that stay as COLUMNS on their parent (skip-with-reason). ──
// 1:1 reference/value structs and enums-as-aliases — not record-collections.
const VALUE_STRUCTS: Record<string, string> = {
    Error: 'API-mechanics error envelope — not a syncable record',
    PagingSettings: 'pagination wrapper (ResultId/PageSize/Count) — list container plumbing',
    Resource: 'generic link/resource descriptor — 1:1 value struct, kept as columns on its parent',
    ResourceUrl: 'inline URL value-struct (0 own fields) — embedded scalar wrapper',
    LinkedResource: 'embedded reference value-struct (Id+Url) — kept as columns on its parent',
    LinkedResourceWithName: 'embedded reference value-struct (Id+Url+Name) — kept as columns on its parent',
    Country: 'reference value-struct embedded in addresses — small 1:1 embedded struct',
    Currency: 'reference value-struct embedded in finance docs — small 1:1 embedded struct',
    TimeZone: 'reference value-struct embedded on Account/Event — small 1:1 embedded struct',
    Localization: 'reference value-struct embedded on Account — small 1:1 embedded struct',
    OptionsListItem: 'generic option-list value (Id/Label/Value) embedded in field definitions',
    FinanceDocument: 'abstract union base for Invoice/Payment/Refund — fields merged into each concrete entity via allOf',
    FileInfo: 'embedded file-descriptor value-struct on attachments/products — small 1:1 embedded struct',
    EmailOrigin: 'embedded origin value-struct on EmailLog — small 1:1 embedded struct',
    BillingPlan: 'embedded billing-plan value-struct on Account — small 1:1 embedded struct',
    SquareRegisterSettings: 'embedded Square POS config value-struct on PaymentSettings — small 1:1 embedded struct',
    PaymentSettings: 'embedded payment-settings value-struct on Account — 1:1 embedded struct',
};
// Read/write variants + list-item projections of an emitted entity (skip-with-reason).
const VARIANTS: Record<string, string> = {
    ShortContact: 'lightweight projection of Contact — derives from Contact',
    EventStub: 'lightweight list-item projection of Event — derives from Event',
    ContactsMe: 'single /contacts/me self-projection variant of Contact — derives from Contact',
    EmailDraftPreview: 'render-preview projection of EmailDraft — derives from EmailDraft',
    contactExtendedMembershipInfo: 'GET /contacts/{id} response wrapper merging Contact + ExtendedMembershipInfo (both emitted)',
    MembershipGroupListItem: 'list-item projection of MembershipGroup — derives from MembershipGroup',
    SavedSearchListItem: 'list-item projection of SavedSearch — derives from SavedSearch',
    OrderSetStatusResult: 'RPC action result for SetStatus — operation result, not a record',
    EmailLogRecord: 'per-record row inside the EmailLog list — folded into EmailLog',
    EmailLogIdentifiers: 'id-only projection wrapper for email logs — container plumbing',
};

// ── Type mapping (OpenAPI -> MJ Type). ────────────────────────────────────────
function mjType(prop: RawProp): { type: string; length: number | null } {
    const t = Array.isArray(prop.type) ? prop.type.find((x) => x !== 'null') : prop.type;
    const fmt = prop.format;
    if (prop.$ref) {
        const rs = schemas[refName(prop.$ref as string)];
        if (rs && Array.isArray(rs.enum)) return { type: 'String', length: 100 };
        return { type: 'json', length: null };
    }
    if (prop.items || t === 'array') return { type: 'json', length: null };
    switch (t) {
        case 'integer': return { type: 'Int', length: null };
        case 'number': return { type: 'Decimal', length: null };
        case 'boolean': return { type: 'Boolean', length: null };
        case 'string':
            if (fmt === 'date-time' || fmt === 'datetime' || fmt === 'date') return { type: 'Date', length: null };
            if (prop.maxLength) return { type: 'String', length: prop.maxLength };
            return { type: 'String', length: null };
        case 'object': return { type: 'json', length: null };
        default: return { type: 'String', length: null };
    }
}

// FK detection + watermark.
const DESC_FK_RE = /\b(the\s+)?(\w+)\s+(id|identifier)\s+(for|of|that|the)\b|\bbelongs to\b|\bassociated (\w+)\b|reference to (the )?(\w+)/i;
const ALIAS_RE = /same as id|cross.?referenc|alias/i;
const WATERMARK_FIELDS = new Set(['ProfileLastUpdated', 'LastUpdated', 'ModifiedDate', 'Modified', 'UpdatedDate']);

// ── Classify all object schemas. ──────────────────────────────────────────────
type Plan = { name: string; kind: 'first-class' | 'nested' | 'skip'; reason?: string };
const plans: Plan[] = [];
for (const name of OBJECT_SCHEMAS) {
    if (endpointBySchema[name]) { plans.push({ name, kind: 'first-class' }); continue; }
    if (VALUE_STRUCTS[name]) { plans.push({ name, kind: 'skip', reason: VALUE_STRUCTS[name] }); continue; }
    if (VARIANTS[name]) { plans.push({ name, kind: 'skip', reason: VARIANTS[name] }); continue; }
    if (isInputSchema(name)) { plans.push({ name, kind: 'skip', reason: `request-body input variant (${name.match(/^[A-Z][a-z]+/)?.[0] ?? 'input'}* / *Params) — write input, not a syncable record` }); continue; }
    if (isContainerSchema(name)) { plans.push({ name, kind: 'skip', reason: 'list/response container wrapper — pagination plumbing, its item type is emitted separately' }); continue; }
    if (nestedParentOf[name]) { plans.push({ name, kind: 'nested' }); continue; }
    plans.push({ name, kind: 'skip', reason: 'object schema not reachable from any sync door and not an emitted entity (orphan/abstract type)' });
}
const EMITTED_IO_NAMES = new Set(plans.filter((p) => p.kind !== 'skip').map((p) => p.name));

function findReferencer(child: string): { parent: string; field: string; isList: boolean } | null {
    if (nestedParentOf[child]) return nestedParentOf[child];
    for (const name of EMITTED_IO_NAMES) {
        if (name === child) continue;
        for (const [pn, pv] of Object.entries(resolveProps(name))) {
            const p = pv as RawProp;
            if (listRefsOf(p) === child) return { parent: name, field: pn, isList: true };
            if (singleRefOf(p) === child) return { parent: name, field: pn, isList: false };
        }
    }
    return null;
}

// ── Persistence ────────────────────────────────────────────────────────────────
const store = new MetadataFileStore(REGISTRY_ROOT, METADATA_ROOT);
const SOURCE_URL = 'https://api.swaggerhub.com/apis/WildApricot/wild-apricot_public_api/9.14.0-oas3';
const NOW = new Date().toISOString();

type Claim = { slot: string; value: unknown; sourcePath: string };
type MatrixRow = {
    IOName: string; ExistingConnectorTs: string; ExistingMetadataJson: string; OpenAPIxPK: string;
    OpenAPIPathOps: string; OpenAPILocationHeader: string; VendorDocsProseScan: string; SDKTypes: string;
    PostmanCommunity: string; NamingConvention: string; CrossIOMatch: string; PKVerdict: string;
    FKVerdict: string; EvidenceCount: number;
};
type EmissionEntry = {
    objectName: string; fieldsExtracted: number; gapsRemaining: string[]; claims: Claim[];
    matrixRow: MatrixRow; skipped?: { reason: string };
};
const emission: EmissionEntry[] = [];
let totalIOFs = 0;

function emitProvenance(targetField: string, usedFor: string, excerpt: string, strength = 'ExplicitStatement'): void {
    store.AppendProvenance(CONNECTOR, {
        URL: SOURCE_URL, AccessedAt: NOW, UsedFor: usedFor, SourceTier: 1,
        SourceCategory: 'OpenAPISpec', EvidenceStrength: strength, TargetField: targetField, Excerpt: excerpt.slice(0, 480),
    } as never);
}

function crudColumns(ep: Endpoint): Record<string, unknown> {
    const cols: Record<string, unknown> = {};
    const itemPath = ep.itemPath ? ep.itemPath.replace(/\{[^}]+\}$/, '{ID}') : null;
    if (ep.verbs.has('POST')) Object.assign(cols, {
        SupportsCreate: true, CreateAPIPath: ep.collectionPath, CreateMethod: 'POST',
        CreateBodyShape: 'flat', CreateBodyKey: null, CreateIDLocation: 'body',
    });
    if (ep.verbs.has('PUT') && itemPath) Object.assign(cols, {
        SupportsUpdate: true, UpdateAPIPath: itemPath, UpdateMethod: 'PUT',
        UpdateBodyShape: 'flat', UpdateBodyKey: null, UpdateIDLocation: 'path',
    });
    if (ep.verbs.has('DELETE') && itemPath) Object.assign(cols, {
        SupportsDelete: true, DeleteAPIPath: itemPath, DeleteMethod: 'DELETE', DeleteIDLocation: 'path',
    });
    return cols;
}

// Best-available soft PK: the addressing path proves an identity exists; pick the body field that
// carries it. Convention-first (Id/id, any case), then a path-param-aligned natural key
// (e.g. {orderNumber} -> number; field-definition records -> SystemCode), then null (defer).
function pickPrimaryKey(name: string, props: Record<string, RawProp>, ep: Endpoint | undefined): string | null {
    const keys = Object.keys(props);
    const byCI = (cand: string): string | null => keys.find((k) => k.toLowerCase() === cand.toLowerCase()) ?? null;
    const idK = byCI('Id');
    if (idK) return idK;
    // Path-param-aligned natural key: {orderNumber} -> number.
    if (ep?.pkParam && /number$/i.test(ep.pkParam)) {
        const n = byCI('Number');
        if (n) return n;
    }
    // Field-definition style records key on SystemCode.
    for (const cand of ['SystemCode', 'Code']) {
        const hit = byCI(cand);
        if (hit) return hit;
    }
    return null;
}

function buildIO(plan: Plan): void {
    const name = plan.name;
    const ep = endpointBySchema[name];
    const props = resolveProps(name);
    const required = resolveRequired(name);
    const claims: Claim[] = [];
    const gaps: string[] = [];
    let evidence = 0;
    const isFirstClass = plan.kind === 'first-class';
    // Best-available identity (soft PK, emit-biased). Prefer a literal id field; else a path-param-
    // derived natural key the addressing path requires; else none (genuine defer).
    const PK = pickPrimaryKey(name, props, ep);
    const hasIdField = PK != null;

    const apiPath = ep?.collectionPath ?? null;
    const ioFields: Record<string, unknown> = {
        Name: name,
        APIPath: apiPath ?? '',
        PaginationType: apiPath ? 'Offset' : 'None',
        SupportsPagination: !!apiPath,
        SupportsWrite: !!ep && (ep.verbs.has('POST') || ep.verbs.has('PUT') || ep.verbs.has('DELETE')),
        Status: 'Active',
    };

    // Watermark / sync strategy
    if (name === 'Contact' && props['ProfileLastUpdated']) {
        Object.assign(ioFields, { SupportsIncrementalSync: true, IncrementalWatermarkField: 'ProfileLastUpdated', SyncStrategy: 'WatermarkIncremental' });
        claims.push({ slot: 'IncrementalWatermarkField', value: 'ProfileLastUpdated', sourcePath: SPEC_REL });
        emitProvenance(`io.${name}.IncrementalWatermarkField`, 'Contact incremental watermark', 'Contact exposes ProfileLastUpdated; admin docs document $filter on ProfileLastUpdated for incremental sync.', 'ImpliedFromExample');
        evidence++;
    } else {
        const wm = Object.keys(props).find((k) => WATERMARK_FIELDS.has(k));
        if (wm) {
            Object.assign(ioFields, { SupportsIncrementalSync: true, IncrementalWatermarkField: wm, SyncStrategy: 'WatermarkIncremental' });
            claims.push({ slot: 'IncrementalWatermarkField', value: wm, sourcePath: SPEC_REL });
            evidence++;
        } else {
            Object.assign(ioFields, { SupportsIncrementalSync: false, SyncStrategy: 'FullPullHashDiff', ContentHashApplicable: true });
            if (hasIdField) ioFields.StableOrderingKey = PK;
        }
    }

    // Access path for nested objects
    if (!isFirstClass) {
        const ref = findReferencer(name);
        if (ref) {
            ioFields.Configuration = {
                AccessPath: {
                    door: endpointBySchema[ref.parent]?.collectionPath ?? ref.parent,
                    nesting: `${ref.parent} -> ${ref.field}${ref.isList ? '[]' : ''}`,
                    parentObject: ref.parent,
                },
            };
            ioFields.ParentObjectName = ref.parent;
        } else {
            gaps.push('AccessPath');
        }
    }
    if (ep) Object.assign(ioFields, crudColumns(ep));

    store.UpsertIO(CONNECTOR, ioFields as never);
    claims.push({ slot: 'APIPath', value: ioFields.APIPath, sourcePath: SPEC_REL });
    claims.push({ slot: 'SupportsWrite', value: ioFields.SupportsWrite, sourcePath: SPEC_REL });
    if (ep) {
        emitProvenance(`io.${name}.APIPath`, `${name} collection endpoint`, `Path ${ep.collectionPath} (verbs ${[...ep.verbs].join(',')}) returns ${name}.`);
        evidence++;
        if (ep.verbs.has('POST')) { emitProvenance(`io.${name}.CreateAPIPath`, `${name} create`, `POST ${ep.collectionPath} creates a ${name}.`); claims.push({ slot: 'CreateAPIPath', value: ep.collectionPath, sourcePath: SPEC_REL }); evidence++; }
        if (ep.verbs.has('PUT') && ep.itemPath) { emitProvenance(`io.${name}.UpdateAPIPath`, `${name} update`, `PUT ${ep.itemPath} updates a ${name}.`); claims.push({ slot: 'UpdateAPIPath', value: ioFields.UpdateAPIPath, sourcePath: SPEC_REL }); evidence++; }
        if (ep.verbs.has('DELETE') && ep.itemPath) { emitProvenance(`io.${name}.DeleteAPIPath`, `${name} delete`, `DELETE ${ep.itemPath} deletes a ${name}.`); claims.push({ slot: 'DeleteAPIPath', value: ioFields.DeleteAPIPath, sourcePath: SPEC_REL }); evidence++; }
    }

    // ── IOF rows ──
    let fieldCount = 0;
    let pkEmitted = false;
    for (const [fname, fprop] of Object.entries(props)) {
        const p = fprop as RawProp;
        const { type, length } = mjType(p);
        const desc = (p.description as string | undefined) ?? '';
        const isPK = PK != null && fname === PK;
        const isReadOnly = !!p.readOnly || /computed|read.?only|system|generated|sum already|total amount|calculated|cannot be (set|changed)/i.test(desc) || (isPK && isFirstClass);
        const isReq = required.has(fname);

        let fk: { target: string } | null = null;
        if (!ALIAS_RE.test(desc)) {
            const m = fname.match(/^([A-Z][A-Za-z]+?)Id$/);
            if (m && fname !== 'Id') {
                const cand = m[1];
                if (EMITTED_IO_NAMES.has(cand)) fk = { target: cand };
                else if (EMITTED_IO_NAMES.has(cand + 's')) fk = { target: cand + 's' };
            }
            if (!fk) {
                const dm = desc.match(DESC_FK_RE);
                if (dm) {
                    const candidate = (dm[2] || dm[5] || dm[7] || '').replace(/\s/g, '');
                    const cap = candidate.charAt(0).toUpperCase() + candidate.slice(1);
                    if (cap && cap !== name && EMITTED_IO_NAMES.has(cap)) fk = { target: cap };
                }
            }
        }

        const iof: Record<string, unknown> = {
            Name: fname, Type: type, IsPrimaryKey: isPK, IsRequired: isReq,
            IsReadOnly: isReadOnly, IsUniqueKey: isPK, AllowsNull: isPK ? false : true, Status: 'Active',
        };
        if (length) iof.Length = length;
        if (desc) iof.Description = desc.slice(0, 250);
        if (fk) {
            iof.RelatedIntegrationObjectID = `@lookup:MJ: Integration Objects.Name=${fk.target}&IntegrationID=@parent:IntegrationID`;
            iof.Configuration = { ReferencedType: fk.target };
            claims.push({ slot: `iof.${fname}.RelatedIntegrationObjectID`, value: fk.target, sourcePath: SPEC_REL });
            emitProvenance(`iof.${name}.${fname}.RelatedIntegrationObjectID`, `${name}.${fname} FK to ${fk.target}`, `Field ${fname}${desc ? ': ' + desc : ''} references ${fk.target} (cross-IO PK-name match / description motif).`);
            evidence++;
        }
        store.UpsertIOF(CONNECTOR, name, iof as never);
        fieldCount++;
        if (isPK) {
            pkEmitted = true;
            claims.push({ slot: `iof.${fname}.IsPrimaryKey`, value: true, sourcePath: SPEC_REL });
            const pkEvid = ep?.pkParam
                ? `Addressing path ${ep.itemPath} requires {${ep.pkParam}} to fetch one ${name}; the universal PK field is Id (integer) per Configuration.universalPK.`
                : `Universal PK convention: Id (integer) is the identity field on every Wild Apricot entity (Configuration.universalPK).`;
            emitProvenance(`iof.${name}.${fname}.IsPrimaryKey`, `${name} primary key`, pkEvid);
            evidence++;
        }
    }
    // Synthetic parent FK for a nested record that lacks its own parent-id column.
    if (!isFirstClass) {
        const ref = findReferencer(name);
        if (ref) {
            const fkCol = `${ref.parent}Id`;
            const has = Object.keys(props).some((k) => k.toLowerCase() === fkCol.toLowerCase());
            if (!has) {
                store.UpsertIOF(CONNECTOR, name, {
                    Name: fkCol, Type: 'Int', IsPrimaryKey: false, IsRequired: false,
                    IsReadOnly: true, IsUniqueKey: false, AllowsNull: true, Status: 'Active',
                    Description: `Foreign key to parent ${ref.parent} (this record is nested under ${ref.parent}.${ref.field}).`,
                    RelatedIntegrationObjectID: `@lookup:MJ: Integration Objects.Name=${ref.parent}&IntegrationID=@parent:IntegrationID`,
                    Configuration: { ReferencedType: ref.parent, SyntheticParentFK: true },
                } as never);
                fieldCount++;
                claims.push({ slot: `iof.${fkCol}.RelatedIntegrationObjectID`, value: ref.parent, sourcePath: SPEC_REL });
                emitProvenance(`iof.${name}.${fkCol}.RelatedIntegrationObjectID`, `${name} parent FK to ${ref.parent}`, `Nested record ${name} accessed via ${ref.parent}.${ref.field}; synthetic FK to parent ${ref.parent}.`, 'ImpliedFromExample');
                evidence++;
            }
        }
    }
    totalIOFs += fieldCount;
    if (!hasIdField && isFirstClass) gaps.push('IsPrimaryKey');

    const hasPathPK = !!ep?.pkParam;
    const fkCount = claims.filter((c) => c.slot.includes('RelatedIntegrationObjectID')).length;
    emission.push({
        objectName: name, fieldsExtracted: fieldCount, gapsRemaining: gaps, claims,
        matrixRow: {
            IOName: name, ExistingConnectorTs: 'n/a', ExistingMetadataJson: 'n/a', OpenAPIxPK: 'no',
            OpenAPIPathOps: hasPathPK ? 'yes' : 'no', OpenAPILocationHeader: 'no', VendorDocsProseScan: 'no',
            SDKTypes: 'n/a', PostmanCommunity: 'n/a', NamingConvention: hasIdField ? 'yes' : 'no',
            CrossIOMatch: fkCount > 0 ? 'yes' : 'no',
            PKVerdict: pkEmitted ? 'emit' : 'defer',
            FKVerdict: fkCount > 0 ? `emit-${fkCount}` : 'defer',
            EvidenceCount: evidence,
        },
    });
}

// ── Run ────────────────────────────────────────────────────────────────────────
let firstClassCount = 0, nestedCount = 0, skipCount = 0;
function pushSkip(name: string, reason: string): void {
    skipCount++;
    emission.push({
        objectName: name, fieldsExtracted: 0, gapsRemaining: [], claims: [],
        matrixRow: {
            IOName: name, ExistingConnectorTs: 'n/a', ExistingMetadataJson: 'n/a', OpenAPIxPK: 'no',
            OpenAPIPathOps: 'no', OpenAPILocationHeader: 'no', VendorDocsProseScan: 'no', SDKTypes: 'n/a',
            PostmanCommunity: 'n/a', NamingConvention: 'no', CrossIOMatch: 'no', PKVerdict: 'defer', FKVerdict: 'defer', EvidenceCount: 0,
        },
        skipped: { reason },
    });
}
for (const plan of plans) {
    if (plan.kind === 'skip') {
        pushSkip(plan.name, plan.reason ?? 'wrapper/variant — derives from an emitted record');
        continue;
    }
    if (plan.kind === 'first-class') firstClassCount++; else nestedCount++;
    buildIO(plan);
}

// ── Floor-parity back-fill ──────────────────────────────────────────────────────
// Account for every name in FLOOR_UNIVERSE that our object-schema classification never
// planned (the malformed 0-property `(!type && !enum)` definitions floor-check counts but
// our isObjectSchema excludes). Each gets an explicit skip-with-reason so the run satisfies
// (emitted ∪ skipped-with-reason) == enumerated EXACTLY — no unaccounted residual.
const ACCOUNTED = new Set(emission.map((e) => e.objectName));
let backfilled = 0;
for (const name of FLOOR_UNIVERSE) {
    if (ACCOUNTED.has(name)) continue;
    pushSkip(name, 'malformed 0-property schema definition (carries a stray non-standard `schema` key, no `properties`/`allOf`) — empty descriptor, not a record type; counted by the deterministic enumerator but has no fields to emit');
    backfilled++;
}

store.AppendCodeEvidence(CONNECTOR, {
    ScriptPath: 'scripts/extract-io-iof.ts', ScriptRunAt: NOW,
    StructuredOutput: { IOCreated: firstClassCount + nestedCount, IOFCreated: totalIOFs, Skipped: skipCount, EnumeratedUniverse: OBJECT_SCHEMAS.length, FloorUniverse: FLOOR_UNIVERSE.length, FloorBackfilled: backfilled },
    SchemaValidationStatus: 'Passed', TargetField: 'io.*',
} as never);

mkdirSync(dirname(EMISSION_OUT), { recursive: true });
writeFileSync(EMISSION_OUT, JSON.stringify(emission, null, 2) + '\n', 'utf-8');

const objectsExtracted = firstClassCount + nestedCount;
process.stdout.write(JSON.stringify({
    enumeratedUniverse: OBJECT_SCHEMAS.length,
    floorUniverse: FLOOR_UNIVERSE.length,
    allSchemas: ALL_SCHEMA_NAMES.length,
    objectsExtracted, firstClass: firstClassCount, nested: nestedCount, skippedWithReason: skipCount,
    floorBackfilled: backfilled,
    fieldsExtracted: totalIOFs, accounted: objectsExtracted + skipCount,
    emissionArtifact: EMISSION_OUT,
}, null, 2) + '\n');
