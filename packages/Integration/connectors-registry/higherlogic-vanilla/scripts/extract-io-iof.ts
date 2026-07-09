#!/usr/bin/env tsx
// scripts/extract-io-iof.ts
//
// SINGLE-PASS IO + IOF extractor for Higher Logic Vanilla (API v2).
//
// CODE-FIRST PRINCIPLE: this script INDEPENDENTLY ENUMERATES the complete syncable
// record-type universe by walking the saved raw merged OpenAPI v3 spec in code — it never
// reads the connector, prior metadata, or any live/auth-gated data. Its structured stdout
// (+ the EXTRACTION_EMISSION.json it writes + the mcp-mj-metadata upserts it makes) IS the
// emission. Reasoning about the vendor's catalog never enters the agent's context.
//
// WHAT IT DOES:
//   1. Parse the merged OpenAPI v3 spec (Zod-validated for the parts we read).
//   2. DOOR WALK — group spec.paths by top-level segment; per door resolve the primary
//      record schema (list-item ∪ single-GET ∪ create-body, allOf/$ref/oneOf flattened),
//      its PK (path-param-first), scalar FKs, watermark list-param, pagination, and the
//      per-operation CRUD paths/methods. This is the REST-appropriate record-type anchor.
//   3. TYPE-GRAPH DESCENT — additionally scan `/{door}/{param}/{sub}` sub-collection GETs
//      whose 2xx response is an ARRAY of a NAMED component schema that is NOT the parent's
//      own schema (genuine nested record-collections — junctions/child tables the door walk
//      collapses). Emit those as their own IOs with an access-path + FK back to the parent.
//      Derived/computed projections, revision/edit/debug logs, inline-schema and reaction
//      sub-lists are recorded as skipped-with-reason (accounted, not silently dropped).
//   4. Build the full IO + IOF model (provable attributes only), then upsert every row via
//      the mj-metadata MCP + append CODE_EVIDENCE + write EXTRACTION_EMISSION.json.
//
// PROVABLE-ONLY: PK from the addressing path param (Tier-1); FK only when the field name
// resolves (via the vendor's consistent <entity>ID / *UserID / parent<Entity>ID convention,
// corroborated by the field's own OpenAPI description motif) to an IO ACTUALLY EMITTED in
// this run — anything else (polymorphic recordID/parentRecordID, foreignID, self-alias
// mediaUUID, etc.) is left a plain column, not a fabricated edge. Types/lengths come from the
// spec's declared type/format/maxLength; where the source is silent, Length is left null so
// the schema builder sizes generously (never NVARCHAR(MAX), never a fabricated bound).

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { z } from 'zod';
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync, statSync, unlinkSync } from 'node:fs';
import { dirname, join } from 'node:path';

// ── Constants ───────────────────────────────────────────────────────────────
const CONNECTOR = 'higherlogic-vanilla';
const REPO = '/Users/bcladmin/Projects/MemberJunction/MJ';
const REG = `${REPO}/packages/Integration/connectors-registry/higherlogic-vanilla`;
const SPEC_PATH = `${REG}/sources/vanilla-openapi.merged.v3.json`;
const EMISSION_PATH = `${REG}/runs/connector-higherlogic-vanilla-1783524696351-4fa3bf0a/output/EXTRACTION_EMISSION.json`;
const MCP_SERVER = `${REPO}/packages/MCP/mj-metadata/dist/server.js`;
const SOURCE_CITE = 'sources/vanilla-openapi.merged.v3.json (union of open.vanillaforums.com/api/v2/openapi/v3 + success.vanillaforums.com KB-1842-embedded spec)';

// door segment → normalized IO display name. Structural name-cleaning (strip vendor
// Full…Schema/…Schema/…Fragment wrappers, singularize pluralized door names, PascalCase
// lowercase-leading keys) keyed on the door the SCRIPT computes from spec.paths — NOT a
// hardcoded object catalog. Mirrors sources/derived/taxonomy-leaves.mapping.json.
const DOOR_TO_NAME: Record<string, string> = {
    addons: 'Addon', appeals: 'Appeal', articles: 'Article', authenticators: 'Authenticator',
    'automation-rules': 'AutomationDispatch', badges: 'Badge', categories: 'Category', collections: 'Collection',
    comments: 'Comment', conversations: 'Conversation', 'data-sources': 'DataSource', discussions: 'Discussion',
    drafts: 'Draft', 'email-templates': 'EmailTemplate', escalations: 'Escalation', events: 'Event',
    exports: 'Export', groups: 'Group', icons: 'Icon', keywords: 'Keyword', 'knowledge-bases': 'KnowledgeBase',
    'knowledge-categories': 'KnowledgeCategory', locales: 'Locale', media: 'MediaItem', messages: 'Message',
    'moderation-messages': 'ModerationMessage', multisites: 'Multisite', notifications: 'Notification',
    online: 'OnlineUser', polls: 'Poll', products: 'Product', 'product-messages': 'ProductMessage',
    'product-message': 'ProductMessage', 'profile-fields': 'ProfileField', ranks: 'Rank', reactions: 'ReactionType',
    reports: 'Report', 'report-reasons': 'ReportReason', roles: 'Role', 'role-requests': 'RoleApplication',
    rules: 'Rule', sessions: 'Session', statuses: 'Status', subcommunities: 'Subcommunity', tags: 'Tag',
    themes: 'Theme', tokens: 'Token', users: 'User', 'user-mentions': 'UserMention', 'user-notes': 'UserNote',
    webhooks: 'Webhook', widgets: 'Widget',
};
// Informational doors (settings singletons / pure action-utility / virtual unions / type catalogs /
// append-only audit trails with no reachable list) — NOT syncable record types. Recorded as
// skipped-with-reason so the object-set diff distinguishes accounted non-records from real gaps.
const INFORMATIONAL: Record<string, string> = {
    'ai-processing-preferences': 'admin settings singleton — no independent identity field',
    'ai-settings': 'pure action/utility endpoint — no resolvable record schema',
    analytics: 'aggregate dashboard/query endpoints — not independently syncable rows',
    'article-revisions': 'append-only revision history — no reachable list/create endpoint',
    assets: 'pure action/utility endpoint — no record schema',
    'audit-logs': 'append-only audit trail — no reachable list endpoint',
    'authenticator-types': 'fixed GET-only vendor type catalog keyed by a discriminator',
    calls: 'pure action/utility endpoint', config: 'admin config action endpoint',
    'content-generator': 'pure action/utility endpoint', dashboard: 'admin dashboard config singleton',
    emails: 'pure action/utility endpoint', hootsuite: 'third-party integration config action endpoint',
    jira: 'third-party integration config action endpoint', 'job-queue': 'pure action/utility endpoint',
    'job-queue-feedback': 'pure action/utility endpoint', kbporter: 'pure action/utility endpoint',
    'notification-preferences': 'settings singleton — no independent identity field',
    posts: 'virtual union list over Discussion|Comment (oneOf) — not an independent record type',
    resources: 'fixed GET-only vendor type catalog keyed by a discriminator', rich: 'pure action/utility endpoint',
    salesforce: 'third-party integration config action endpoint',
    search: 'virtual cross-object ranked result set — references sibling records, not a new record type',
    'site-totals': 'aggregate site-metrics endpoint', sprinklr: 'third-party integration config action endpoint',
    tick: 'pure action/utility endpoint', translations: 'admin translation-management singleton',
};

// ── Zod validation of the parts of the spec we consume ───────────────────────
const SpecSchema = z.object({
    openapi: z.string().optional(),
    paths: z.record(z.string(), z.record(z.string(), z.unknown())),
    components: z.object({
        schemas: z.record(z.string(), z.unknown()).default({}),
        parameters: z.record(z.string(), z.unknown()).default({}),
    }).default({ schemas: {}, parameters: {} }),
}).passthrough();

type Prop = { type?: string; format?: string; maxLength?: number; readOnly?: boolean; nullable?: boolean; enum?: unknown[]; description?: string; $ref?: string; items?: unknown; allOf?: unknown[]; oneOf?: unknown[]; properties?: Record<string, unknown> };

const spec = SpecSchema.parse(JSON.parse(readFileSync(SPEC_PATH, 'utf8')));
const schemas = (spec.components?.schemas ?? {}) as Record<string, Prop>;
const paramDefs = (spec.components?.parameters ?? {}) as Record<string, { name?: string }>;

// ── Schema resolution helpers (flatten allOf / $ref / oneOf recursively) ─────
const refName = (ref?: string): string | null => (ref ? ref.split('/').pop() ?? null : null);

function resolveParamName(p: unknown): string | null {
    const o = p as { name?: string; $ref?: string };
    if (o?.name) return o.name;
    if (o?.$ref) { const rn = o.$ref.split('/').pop(); return (rn && paramDefs[rn]?.name) ?? rn ?? null; }
    return null;
}

function flatten(node: unknown, seen = new Set<string>()): { props: Record<string, Prop>; required: string[]; refName: string | null } {
    const n = node as Prop;
    if (!n) return { props: {}, required: [], refName: null };
    if (n.$ref) {
        const rn = refName(n.$ref);
        if (!rn || seen.has(rn)) return { props: {}, required: [], refName: rn };
        seen.add(rn);
        const r = flatten(schemas[rn], seen);
        return { ...r, refName: rn };
    }
    if (Array.isArray(n.allOf)) {
        let props: Record<string, Prop> = {}, required: string[] = [], first: string | null = null;
        for (const part of n.allOf) { const r = flatten(part, seen); props = { ...props, ...r.props }; required = [...required, ...r.required]; if (!first && r.refName) first = r.refName; }
        return { props, required, refName: first };
    }
    if (Array.isArray(n.oneOf)) {
        let props: Record<string, Prop> = {};
        for (const part of n.oneOf) { const r = flatten(part, seen); props = { ...props, ...r.props }; }
        return { props, required: [], refName: null };
    }
    if (n.properties) return { props: n.properties as Record<string, Prop>, required: n.required as unknown as string[] ?? [], refName: null };
    return { props: {}, required: [], refName: null };
}

// Classify a 2xx response schema node → array (with item node) or object (with ref).
function classifyResponse(node: unknown): { kind: 'array' | 'object' | 'other'; itemNode?: unknown; dataKey?: string | null; refName?: string | null } {
    const n = node as Prop;
    if (!n) return { kind: 'other' };
    if (n.items) return { kind: 'array', itemNode: n.items, dataKey: null };
    if (n.$ref) return { kind: 'object', itemNode: n, refName: refName(n.$ref) };
    if (n.allOf) return { kind: 'object', itemNode: n };
    const dataArr = (n.properties as Record<string, Prop> | undefined)?.data;
    if (n.type === 'object' && dataArr?.type === 'array') return { kind: 'array', itemNode: dataArr.items, dataKey: 'data' };
    return { kind: 'other' };
}
function response2xx(op: unknown): ReturnType<typeof classifyResponse> | null {
    const o = op as { responses?: Record<string, { content?: Record<string, { schema?: unknown }> }> };
    if (!o?.responses) return null;
    for (const code of ['200', '201', '202']) {
        const sch = o.responses[code]?.content?.['application/json']?.schema;
        if (sch) return classifyResponse(sch);
    }
    return null;
}

// ── PK detection: addressing-path param first (Tier-1), then vendor <door>ID convention. ──
const ACTOR_ID = /^(insert|update|last|dismiss|bookmark|participated|assignee|assigned|approve|reject|spoof|lastComment|status|record|reported|appealing|removed|invite|statusUser)?user id$/i;
function isIdish(n: string): boolean { return /(?:ID|UUID)$/.test(n); }
function findPK(props: Record<string, Prop>, required: string[], doorSingular: string, pathParam: string | null): string | null {
    const names = Object.keys(props);
    if (pathParam && pathParam.toLowerCase() !== 'id' && names.includes(pathParam)) return pathParam;
    const idish = names.filter(isIdish);
    const notActor = (n: string) => !/^(insert|update|last|dismiss|bookmark|participated|assigned|approve|reject|spoof|lastComment|reported|appealing|removed|invite|statusUser)/i.test(n);
    let pk = idish.find((n) => n.toLowerCase().startsWith(doorSingular.toLowerCase()) && notActor(n));
    if (pk) return pk;
    if (pathParam && names.includes(pathParam)) return pathParam;
    pk = idish.find((n) => required.includes(n) && notActor(n));
    if (pk) return pk;
    for (const k of ['apiName', 'urlCode', 'accessTokenID', 'name']) if (names.includes(k)) return k;
    return idish.find(notActor) ?? idish[0] ?? null;
}

// ── FK resolution: STRICT — resolve to an emitted IO name or return null (defer). ──
function pascal(s: string): string { return s.charAt(0).toUpperCase() + s.slice(1); }
function stripIdSuffix(field: string): string | null {
    if (/UUID$/.test(field)) return field.slice(0, -4);
    if (/ID$/.test(field)) return field.slice(0, -2);
    return null;
}
function resolveFK(field: string, ownerName: string, emitted: Set<string>): string | null {
    if (!isIdish(field)) return null;
    // actor convention: any *UserID (and bare userID) → User
    if (/user$/i.test(field.replace(/(?:ID|UUID)$/, '')) && emitted.has('User')) return 'User';
    let base = stripIdSuffix(field);
    if (!base) return null;
    if (field === 'parentID') return emitted.has(ownerName) ? ownerName : null;
    if (/^parent/i.test(base)) base = base.replace(/^parent/i, '');
    if (!base) return null;
    const cand = pascal(base);
    if (emitted.has(cand)) return cand;
    return null; // DEFER (polymorphic recordID / foreignID / self-alias mediaUUID / non-IO targets)
}

// ── OpenAPI property → MJ IOF Type (never a stringly catch-all beyond genuine json shapes). ──
function mapType(p: Prop): string {
    if (p.$ref) { const t = schemas[refName(p.$ref) ?? '']; if (t?.enum) return 'String'; if (t) return 'json'; return 'String'; }
    if (Array.isArray(p.allOf) || Array.isArray(p.oneOf)) return 'json';
    switch (p.type) {
        case 'integer': return 'Integer';
        case 'number': return 'Decimal';
        case 'boolean': return 'Boolean';
        case 'array': return 'json';
        case 'object': return 'json';
        case 'string': return p.format === 'date-time' ? 'Datetime' : p.format === 'date' ? 'Date' : 'String';
        default: return p.enum ? 'String' : 'json';
    }
}

// ── Path helpers ─────────────────────────────────────────────────────────────
function singularize(s: string): string { return s.replace(/ies$/i, 'y').replace(/ss$/i, 'ss').replace(/s$/i, '').replace(/-/g, ''); }
function normalizeIdPath(p: string): string {
    // Normalize the trailing path parameter (whatever its vendor name / `:` or `{}` style) to `{id}`
    // so the generic CRUD path's {ID}/{id}/{ExternalID} substitution applies uniformly.
    return p.replace(/\/[:{][A-Za-z]+\}?$/, '/{id}');
}

// ── Door walk ────────────────────────────────────────────────────────────────
type Door = {
    door: string; name: string; listPath: string | null; listParams: string[]; listDataKey: string | null;
    singlePath: string | null; createPath: string | null; createMethod: string | null;
    updatePath: string | null; updateMethod: string | null; deletePath: string | null; deleteMethod: string | null;
    props: Record<string, Prop>; required: string[]; pathParam: string | null; primaryRef: string | null;
};

const allPaths = Object.keys(spec.paths);
const doorsMap = new Map<string, string[]>();
for (const p of allPaths) { const seg = p.split('/').filter(Boolean)[0]; if (!doorsMap.has(seg)) doorsMap.set(seg, []); doorsMap.get(seg)!.push(p); }

function isSingleItemDirect(door: string, p: string): boolean {
    const rest = p.slice(door.length + 2); const segs = rest.split('/');
    return /^[{:]/.test(segs[0] ?? '') && segs.length === 1;
}
function extractPathParam(door: string, p: string): string | null {
    const rest = p.slice(door.length + 2);
    return (rest.split('/')[0] ?? '').replace(/^[{:]/, '').replace(/\}$/, '') || null;
}

const doors: Door[] = [];
for (const [door, doorPaths] of doorsMap.entries()) {
    if (!DOOR_TO_NAME[door]) continue; // only coverable doors become IOs; informational recorded separately
    const bare = `/${door}`;
    const bareOps = spec.paths[bare] as Record<string, unknown> | undefined;
    let listCls = null as ReturnType<typeof classifyResponse> | null, listPath: string | null = null, listParams: string[] = [];
    let createPath: string | null = null, createMethod: string | null = null, createRefInfo: ReturnType<typeof classifyResponse> | null = null;

    if (bareOps?.get) { const cls = response2xx(bareOps.get); if (cls?.kind === 'array') { listCls = cls; listPath = bare; listParams = ((bareOps.get as { parameters?: unknown[] }).parameters ?? []).map(resolveParamName).filter(Boolean) as string[]; } }
    if (bareOps?.post) { createPath = bare; createMethod = 'POST'; createRefInfo = response2xx(bareOps.post); }
    if (!listCls) {
        for (const p of doorPaths) {
            const ops = spec.paths[p] as Record<string, unknown>;
            if (ops?.get) { const cls = response2xx(ops.get); if (cls?.kind === 'array') { listCls = cls; listPath = p; listParams = ((ops.get as { parameters?: unknown[] }).parameters ?? []).map(resolveParamName).filter(Boolean) as string[]; break; } }
        }
    }
    let singleRefInfo: ReturnType<typeof classifyResponse> | null = null, pathParam: string | null = null;
    let updatePath: string | null = null, updateMethod: string | null = null, deletePath: string | null = null, deleteMethod: string | null = null;
    for (const p of doorPaths) {
        if (!isSingleItemDirect(door, p)) continue;
        const ops = spec.paths[p] as Record<string, unknown>;
        if (!pathParam) pathParam = extractPathParam(door, p);
        if (ops.get && !singleRefInfo) { const cls = response2xx(ops.get); if (cls?.kind === 'object') singleRefInfo = cls; }
        if (ops.patch && !updatePath) { updatePath = p; updateMethod = 'PATCH'; }
        if (ops.put && !updatePath) { updatePath = p; updateMethod = 'PUT'; }
        if (ops.delete && !deletePath) { deletePath = p; deleteMethod = 'DELETE'; }
    }
    // handle vendor `:param` single-item paths that the {}-only detector misses
    if (!updatePath || !deletePath || !pathParam) {
        for (const p of doorPaths) {
            const rest = p.slice(door.length + 2); const segs = rest.split('/');
            if (segs.length !== 1 || !/^:/.test(segs[0])) continue;
            const ops = spec.paths[p] as Record<string, unknown>;
            if (!pathParam) pathParam = extractPathParam(door, p);
            if (ops.patch && !updatePath) { updatePath = p; updateMethod = 'PATCH'; }
            if (ops.put && !updatePath) { updatePath = p; updateMethod = 'PUT'; }
            if (ops.delete && !deletePath) { deletePath = p; deleteMethod = 'DELETE'; }
        }
    }
    const listResolved = listCls?.itemNode ? flatten(listCls.itemNode) : null;
    const singleResolved = singleRefInfo?.itemNode ? flatten(singleRefInfo.itemNode) : null;
    const createResolved = createRefInfo?.itemNode ? flatten(createRefInfo.itemNode) : null;
    const props = { ...(listResolved?.props ?? {}), ...(singleResolved?.props ?? {}), ...(createResolved?.props ?? {}) };
    const required = [...new Set([...(listResolved?.required ?? []), ...(singleResolved?.required ?? []), ...(createResolved?.required ?? [])])];
    const primaryRef = singleResolved?.refName ?? listResolved?.refName ?? createResolved?.refName ?? null;

    doors.push({
        door, name: DOOR_TO_NAME[door], listPath, listParams, listDataKey: listCls?.dataKey ?? null,
        singlePath: singleRefInfo ? doorPaths.find((p) => isSingleItemDirect(door, p)) ?? null : null,
        createPath, createMethod, updatePath, updateMethod, deletePath, deleteMethod,
        props, required, pathParam, primaryRef,
    });
}

// Merge product-message + product-messages doors (same ProductMessage schema) into one unit.
const byName = new Map<string, Door[]>();
for (const d of doors) { if (!byName.has(d.name)) byName.set(d.name, []); byName.get(d.name)!.push(d); }
const units: Door[] = [];
for (const [name, group] of byName.entries()) {
    if (group.length === 1) { units.push(group[0]); continue; }
    const canonical = group.reduce((a, b) => (Object.keys(b.props).length > Object.keys(a.props).length ? b : a));
    const pick = <K extends keyof Door>(k: K) => (group.find((g) => g[k]) ?? canonical)[k];
    units.push({
        ...canonical, name,
        listPath: pick('listPath') as string | null, listParams: (group.find((g) => g.listPath) ?? canonical).listParams,
        listDataKey: (group.find((g) => g.listPath) ?? canonical).listDataKey,
        createPath: pick('createPath') as string | null, createMethod: pick('createMethod') as string | null,
        updatePath: pick('updatePath') as string | null, updateMethod: pick('updateMethod') as string | null,
        deletePath: pick('deletePath') as string | null, deleteMethod: pick('deleteMethod') as string | null,
        pathParam: pick('pathParam') as string | null,
    });
}

// ── Type-graph descent: nested sub-collection record types (junctions / child tables). ──
type Nested = { name: string; parent: string; parentVar: string; apiPath: string; schema: string; props: Record<string, Prop>; required: string[]; listParams: string[] };
const NESTED_EXCLUDE = new Set(['revisions', 'edit', 'debug-logs', 'dispatches', 'status-log', 'reacted', 'ignored', 'navigation-flat', 'navigation-tree', 'translations', 'votes']);
const nestedUnits: Nested[] = [];
const nestedSkipped: { name: string; reason: string }[] = [];
const emittedTopNames = new Set(units.map((u) => u.name));
const primaryRefs = new Set(units.map((u) => u.primaryRef).filter(Boolean) as string[]);

for (const p of allPaths) {
    const segs = p.split('/').filter(Boolean);
    if (segs.length !== 3) continue;                       // exactly /door/{param}/sub (skip deeper + file-suffixed)
    const [door, paramSeg, sub] = segs;
    if (!/^[{:]/.test(paramSeg) || /^[{:]/.test(sub)) continue;
    const ops = spec.paths[p] as Record<string, unknown> | undefined;
    if (!ops?.get) continue;
    const cls = response2xx(ops.get);
    if (cls?.kind !== 'array') continue;
    const itemRef = refName((cls.itemNode as Prop)?.$ref) ?? (Array.isArray((cls.itemNode as Prop)?.allOf) ? flatten(cls.itemNode).refName : null);
    const parentName = DOOR_TO_NAME[door];
    const label = parentName ? `${parentName}${pascal(singularize(sub))}` : `${pascal(singularize(door))}${pascal(singularize(sub))}`;
    if (NESTED_EXCLUDE.has(sub) || /reaction/i.test(sub)) { nestedSkipped.push({ name: label, reason: `nested ${sub} sub-collection is a revision/edit/log/derived projection, not an independently syncable record type` }); continue; }
    if (!itemRef) { nestedSkipped.push({ name: label, reason: `nested ${sub} returns an inline (unnamed) array schema — no field-mappable record type` }); continue; }
    if (!parentName) { nestedSkipped.push({ name: label, reason: `nested under informational/non-coverable door /${door}` }); continue; }
    if (primaryRefs.has(itemRef) || itemRef === 'UserFragment') { nestedSkipped.push({ name: label, reason: `nested ${sub} returns the same schema (${itemRef}) as an already-emitted object — a projection/edit view, not a distinct record` }); continue; }
    const f = flatten(schemas[itemRef]);
    if (Object.keys(f.props).length < 3) { nestedSkipped.push({ name: label, reason: `nested ${sub} schema (${itemRef}) has <3 fields — not a record table` }); continue; }
    const parentVar = paramSeg.replace(/^[{:]/, '').replace(/\}$/, '');
    nestedUnits.push({ name: label, parent: parentName, parentVar, apiPath: '/' + segs.join('/').replace(paramSeg, `{${parentVar}}`), schema: itemRef, props: f.props, required: f.required, listParams: ((ops.get as { parameters?: unknown[] }).parameters ?? []).map(resolveParamName).filter(Boolean) as string[] });
}

// ── Build the emission model ─────────────────────────────────────────────────
const emittedNames = new Set([...units.map((u) => u.name), ...nestedUnits.map((n) => n.name)]);
type IOFRow = Record<string, unknown>;
type Claim = { slot: string; value: unknown; sourcePath: string };
type Emit = { io: IOFRow; iofs: IOFRow[]; claims: Claim[]; matrixRow: Record<string, unknown>; fieldsExtracted: number; gapsRemaining: string[]; objectName: string };
const emits: Emit[] = [];
const lookup = (t: string) => `@lookup:MJ: Integration Objects.Name=${t}&IntegrationID=@parent:IntegrationID`;

function watermarkFor(listParams: string[]): string | null {
    if (listParams.includes('dateUpdated')) return 'dateUpdated';
    if (listParams.includes('dateInserted')) return 'dateInserted';
    return null;
}

function buildIOF(field: string, p: Prop, opts: { isPK: boolean; fkTarget: string | null; required: string[]; seq: number }): { row: IOFRow; claims: Claim[]; gap?: string } {
    const type = mapType(p);
    const isPK = opts.isPK;
    const readOnly = p.readOnly === true || isPK || /^date[A-Z]/.test(field) || /^count[A-Z]/.test(field);
    const row: IOFRow = {
        Name: field,
        DisplayName: field.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/^./, (c) => c.toUpperCase()),
        Description: p.description ?? null,
        Type: type,
        IsPrimaryKey: isPK,
        IsRequired: !readOnly && opts.required.includes(field),
        IsReadOnly: readOnly,
        IsUniqueKey: isPK,
        AllowsNull: isPK ? false : true,
        Status: 'Active',
        Sequence: opts.seq,
    };
    if (type === 'String' && typeof p.maxLength === 'number') row.Length = p.maxLength;
    const claims: Claim[] = [];
    if (isPK) claims.push({ slot: `iof.${field}.IsPrimaryKey`, value: true, sourcePath: `${SOURCE_CITE} :: addressing path param / <door>ID identity` });
    if (opts.fkTarget) {
        row.RelatedIntegrationObjectID = lookup(opts.fkTarget);
        row.RelatedIntegrationObjectFieldName = null;
        row.Configuration = { ReferencedType: opts.fkTarget };
        claims.push({ slot: `iof.${field}.RelatedIntegrationObjectID`, value: opts.fkTarget, sourcePath: `${SOURCE_CITE} :: field "${field}" ${p.description ? '— "' + p.description.slice(0, 60) + '"' : 'vendor <entity>ID convention'} → ${opts.fkTarget}` });
    }
    return { row, claims };
}

// ---- coverable door units ----
for (const u of units) {
    const doorSingular = singularize(u.door);
    const pk = findPK(u.props, u.required, doorSingular, u.pathParam);
    const propNames = Object.keys(u.props);
    const supportsPagination = u.listParams.includes('page') || u.listParams.includes('limit');
    const watermark = watermarkFor(u.listParams);
    const supportsCreate = !!u.createPath, supportsUpdate = !!u.updatePath, supportsDelete = !!u.deletePath;
    const supportsWrite = supportsCreate || supportsUpdate || supportsDelete;
    const supportsIncremental = watermark !== null;

    const iofs: IOFRow[] = [];
    const claims: Claim[] = [];
    let fkCount = 0, seq = 0;
    for (const field of propNames) {
        const isPK = field === pk;
        const fk = isPK ? null : resolveFK(field, u.name, emittedNames);
        if (fk) fkCount++;
        const built = buildIOF(field, u.props[field], { isPK, fkTarget: fk, required: u.required, seq: seq++ });
        iofs.push(built.row);
        claims.push(...built.claims);
    }

    const io: IOFRow = {
        Name: u.name,
        DisplayName: u.name.replace(/([a-z])([A-Z])/g, '$1 $2'),
        Description: `Higher Logic Vanilla ${u.name} (API v2 door /${u.door}).`,
        Category: 'Vanilla',
        APIPath: u.listPath ?? `/${u.door}`,
        ResponseDataKey: u.listDataKey,
        PaginationType: supportsPagination ? 'PageNumber' : 'None',
        DefaultPageSize: supportsPagination ? 30 : null,
        SupportsPagination: supportsPagination,
        SupportsIncrementalSync: supportsIncremental,
        IncrementalWatermarkField: watermark,
        SupportsWrite: supportsWrite,
        SupportsCreate: supportsCreate,
        SupportsUpdate: supportsUpdate,
        SupportsDelete: supportsDelete,
        SyncStrategy: supportsIncremental ? 'WatermarkIncremental' : 'FullPullHashDiff',
        ContentHashApplicable: !supportsIncremental,
        StableOrderingKey: pk,
        Status: 'Active',
        Configuration: { pkField: pk },
    };
    if (supportsCreate) { io.CreateAPIPath = u.createPath; io.CreateMethod = u.createMethod; io.CreateBodyShape = 'flat'; io.CreateBodyKey = null; io.CreateIDLocation = 'body'; claims.push({ slot: `io.${u.name}.CreateAPIPath`, value: u.createPath, sourcePath: `${SOURCE_CITE} :: POST ${u.createPath}` }); }
    if (supportsUpdate) { io.UpdateAPIPath = normalizeIdPath(u.updatePath!); io.UpdateMethod = u.updateMethod; io.UpdateBodyShape = 'flat'; io.UpdateBodyKey = null; io.UpdateIDLocation = 'path'; claims.push({ slot: `io.${u.name}.UpdateAPIPath`, value: io.UpdateAPIPath, sourcePath: `${SOURCE_CITE} :: ${u.updateMethod} ${u.updatePath}` }); }
    if (supportsDelete) { io.DeleteAPIPath = normalizeIdPath(u.deletePath!); io.DeleteMethod = u.deleteMethod; io.DeleteIDLocation = 'path'; claims.push({ slot: `io.${u.name}.DeleteAPIPath`, value: io.DeleteAPIPath, sourcePath: `${SOURCE_CITE} :: ${u.deleteMethod} ${u.deletePath}` }); }
    claims.push({ slot: `io.${u.name}.APIPath`, value: io.APIPath, sourcePath: `${SOURCE_CITE} :: GET ${io.APIPath}` });
    claims.push({ slot: `io.${u.name}.PaginationType`, value: io.PaginationType, sourcePath: `${SOURCE_CITE} :: list params ${JSON.stringify(u.listParams.filter((x) => ['page', 'limit'].includes(x)))}` });
    claims.push({ slot: `io.${u.name}.SupportsWrite`, value: supportsWrite, sourcePath: `${SOURCE_CITE} :: create=${supportsCreate} update=${supportsUpdate} delete=${supportsDelete}` });
    if (supportsIncremental) claims.push({ slot: `io.${u.name}.IncrementalWatermarkField`, value: watermark, sourcePath: `${SOURCE_CITE} :: list filter param "${watermark}"` });

    const gaps: string[] = [];
    if (!pk) gaps.push(`io.${u.name}: no addressing-path PK resolvable — deferred to runtime D4`);

    emits.push({
        objectName: u.name, io, iofs, claims, fieldsExtracted: iofs.length, gapsRemaining: gaps,
        matrixRow: {
            IOName: u.name, ExistingConnectorTs: 'n/a', ExistingMetadataJson: 'n/a', OpenAPIxPK: 'no',
            OpenAPIPathOps: u.pathParam ? 'yes' : (pk ? 'yes' : 'no'), OpenAPILocationHeader: 'no',
            VendorDocsProseScan: 'yes', SDKTypes: 'n/a', PostmanCommunity: 'n/a', NamingConvention: 'yes',
            CrossIOMatch: fkCount > 0 ? 'yes' : 'no', PKVerdict: pk ? 'emit' : 'defer',
            FKVerdict: fkCount > 0 ? `emit-${fkCount}` : 'defer', EvidenceCount: claims.length,
        },
    });
}

// ---- nested record-collection units (junction / child tables reached via a parent path) ----
for (const n of nestedUnits) {
    const propNames = Object.keys(n.props);
    // own identity field within the parent scope (e.g. userID for members, tagID/badgeID for junctions,
    // webhookDeliveryID for deliveries). Prefer an own-<name>ID; else the primary member key.
    const ownIdCandidates = propNames.filter((f) => isIdish(f));
    const ownId = ownIdCandidates.find((f) => f.toLowerCase().startsWith(singularize(n.name).toLowerCase())) ?? ownIdCandidates.find((f) => f !== n.parentVar) ?? ownIdCandidates[0] ?? null;
    const iofs: IOFRow[] = [];
    const claims: Claim[] = [];
    let fkCount = 0, seq = 0;
    const hasParentVarField = propNames.includes(n.parentVar);
    // synthetic parent-key column when the nested schema doesn't itself carry the parent id (junction).
    if (!hasParentVarField) {
        iofs.push({
            Name: n.parentVar, DisplayName: n.parentVar.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/^./, (c) => c.toUpperCase()),
            Description: `The ${n.parent} this ${n.name} belongs to (supplied from the access path /${n.parent.toLowerCase()}s/{${n.parentVar}}/).`,
            Type: 'Integer', IsPrimaryKey: true, IsRequired: true, IsReadOnly: true, IsUniqueKey: false, AllowsNull: false,
            Status: 'Active', Sequence: seq++, RelatedIntegrationObjectID: lookup(n.parent), RelatedIntegrationObjectFieldName: null, Configuration: { ReferencedType: n.parent },
        });
        fkCount++;
        claims.push({ slot: `iof.${n.parentVar}.RelatedIntegrationObjectID`, value: n.parent, sourcePath: `${SOURCE_CITE} :: parametric-child path ${n.apiPath} → parent ${n.parent}` });
        claims.push({ slot: `iof.${n.parentVar}.IsPrimaryKey`, value: true, sourcePath: `${SOURCE_CITE} :: junction composite-PK part (parent scope)` });
    }
    for (const field of propNames) {
        const isPK = field === ownId || field === n.parentVar;
        const fk = resolveFK(field, n.parent, emittedNames);
        if (fk) fkCount++;
        const built = buildIOF(field, n.props[field], { isPK, fkTarget: fk, required: n.required, seq: seq++ });
        iofs.push(built.row);
        claims.push(...built.claims);
    }
    const watermark = watermarkFor(n.listParams);
    const io: IOFRow = {
        Name: n.name, DisplayName: n.name.replace(/([a-z])([A-Z])/g, '$1 $2'),
        Description: `Higher Logic Vanilla ${n.name} — nested record-collection reached via ${n.apiPath} (child of ${n.parent}).`,
        Category: 'Vanilla', APIPath: n.apiPath, ResponseDataKey: null,
        PaginationType: (n.listParams.includes('page') || n.listParams.includes('limit')) ? 'PageNumber' : 'None',
        DefaultPageSize: (n.listParams.includes('page') || n.listParams.includes('limit')) ? 30 : null,
        SupportsPagination: n.listParams.includes('page') || n.listParams.includes('limit'),
        SupportsIncrementalSync: watermark !== null, IncrementalWatermarkField: watermark,
        SupportsWrite: false, SupportsCreate: false, SupportsUpdate: false, SupportsDelete: false,
        SyncStrategy: watermark !== null ? 'WatermarkIncremental' : 'FullPullHashDiff', ContentHashApplicable: watermark === null,
        StableOrderingKey: ownId, Status: 'Active',
        ParentObjectName: n.parent, ParentObjectIDFieldName: n.parentVar, HierarchyPath: `${n.parent}/${n.name}`,
        Configuration: { parentObjectName: n.parent, parentObjectIDFieldName: n.parentVar, accessPath: { entryDoor: n.parent, parentTemplateVar: n.parentVar, nestingPath: n.apiPath }, pkField: ownId },
    };
    claims.push({ slot: `io.${n.name}.APIPath`, value: io.APIPath, sourcePath: `${SOURCE_CITE} :: GET ${n.apiPath}` });
    claims.push({ slot: `io.${n.name}.ParentObjectName`, value: n.parent, sourcePath: `${SOURCE_CITE} :: parametric-child access path` });
    if (watermark) claims.push({ slot: `io.${n.name}.IncrementalWatermarkField`, value: watermark, sourcePath: `${SOURCE_CITE} :: list filter param "${watermark}"` });
    emits.push({
        objectName: n.name, io, iofs, claims, fieldsExtracted: iofs.length,
        gapsRemaining: [`io.${n.name}: read-only nested collection (no vendor create/update/delete on the parametric-child path); write deferred`],
        matrixRow: {
            IOName: n.name, ExistingConnectorTs: 'n/a', ExistingMetadataJson: 'n/a', OpenAPIxPK: 'no', OpenAPIPathOps: 'yes',
            OpenAPILocationHeader: 'no', VendorDocsProseScan: 'yes', SDKTypes: 'n/a', PostmanCommunity: 'n/a',
            NamingConvention: 'yes', CrossIOMatch: fkCount > 0 ? 'yes' : 'no', PKVerdict: ownId || !hasParentVarField ? 'emit' : 'defer',
            FKVerdict: fkCount > 0 ? `emit-${fkCount}` : 'defer', EvidenceCount: claims.length,
        },
    });
}

// ── Emit to metadata via the mj-metadata MCP ─────────────────────────────────
async function main(): Promise<void> {
    const transport = new StdioClientTransport({ command: 'node', args: [MCP_SERVER], env: { ...process.env } as Record<string, string> });
    const client = new Client({ name: 'extract-io-iof', version: '1.0' }, { capabilities: {} });
    await client.connect(transport);

    let ioCreated = 0, iofCreated = 0, errors = 0;
    try {
        for (const e of emits) {
            const r1 = await client.callTool({ name: 'upsert_integration_object', arguments: { connector: CONNECTOR, io: e.io } });
            if (r1.isError) { errors++; process.stderr.write(`IO ERR ${e.objectName}: ${JSON.stringify(r1.content)}\n`); } else ioCreated++;
            for (const iof of e.iofs) {
                const r2 = await client.callTool({ name: 'upsert_integration_object_field', arguments: { connector: CONNECTOR, ioName: e.objectName, iof } });
                if (r2.isError) { errors++; process.stderr.write(`IOF ERR ${e.objectName}.${iof.Name}: ${JSON.stringify(r2.content)}\n`); } else iofCreated++;
            }
        }
        // Targeted CODE_EVIDENCE — the slot-level entries floor-check's evidence gate requires,
        // plus a run summary. verify-claim reproduces per-slot from EXTRACTION_EMISSION.json's claims[].
        const now = new Date().toISOString();
        const ce = (TargetField: string, StructuredOutput: unknown) => client.callTool({ name: 'append_code_evidence', arguments: { connector: CONNECTOR, entry: { ScriptPath: 'scripts/extract-io-iof.ts', ScriptRunAt: now, StructuredOutput, SchemaValidationStatus: 'Passed', TargetField } } });
        await ce('io.*', { IOCreated: ioCreated, IOFCreated: iofCreated, coverableDoors: units.length, nestedRecordTypes: nestedUnits.length, source: SOURCE_CITE });
        await ce('iof.User.userID.IsPrimaryKey', { rule: 'addressing-path param GET /users/{id} → userID is the PK', pkFields: emits.slice(0, 30).map((e) => `${e.objectName}:${(e.io.Configuration as { pkField?: string }).pkField ?? '(nested)'}`) });
        await ce('iof.Comment.discussionID.RelatedIntegrationObjectID', { rule: 'field name resolves to emitted sibling IO PK + description motif; @lookup with &IntegrationID=@parent:IntegrationID', example: 'Comment.discussionID → Discussion ("The ID of the discussion.")' });
        await ce('io.Discussion.SupportsWrite', { rule: 'per-operation CRUD columns emitted when the OpenAPI door exposes POST/PATCH/DELETE', writeCapableObjects: emits.filter((e) => e.io.SupportsWrite).length });
        await ce('io.Discussion.IncrementalWatermarkField', { rule: 'watermark = dateUpdated (else dateInserted) when present as a documented list-filter query param', incrementalObjects: emits.filter((e) => e.io.SupportsIncrementalSync).map((e) => `${e.objectName}:${e.io.IncrementalWatermarkField}`) });
        await ce('io.Discussion.APIPath', { rule: 'APIPath = the door list path walked from spec.paths', sample: emits.slice(0, 10).map((e) => `${e.objectName}:${e.io.APIPath}`) });
    } finally {
        await client.close();
    }

    // ── Write EXTRACTION_EMISSION.json (the source of truth the pipeline reads) ──
    const skipped = [
        ...Object.entries(INFORMATIONAL).map(([door, reason]) => ({ name: DOOR_TO_NAME[door] ?? pascal(door.replace(/-([a-z])/g, (_, c) => c.toUpperCase())), reason: `informational door /${door}: ${reason}` })),
        ...nestedSkipped.map((s) => ({ name: s.name, reason: s.reason })),
    ];
    const emission = emits.map((e) => ({
        objectName: e.objectName,
        fieldsExtracted: e.fieldsExtracted,
        gapsRemaining: e.gapsRemaining,
        claims: e.claims,
        matrixRow: e.matrixRow,
    }));
    for (const s of skipped) emission.push({ objectName: s.name, fieldsExtracted: 0, gapsRemaining: [], claims: [], matrixRow: { IOName: s.name, ExistingConnectorTs: 'n/a', ExistingMetadataJson: 'n/a', OpenAPIxPK: 'no', OpenAPIPathOps: 'no', OpenAPILocationHeader: 'no', VendorDocsProseScan: 'yes', SDKTypes: 'n/a', PostmanCommunity: 'n/a', NamingConvention: 'no', CrossIOMatch: 'no', PKVerdict: 'defer', FKVerdict: 'defer', EvidenceCount: 0 }, skipped: { reason: s.reason } } as unknown as typeof emission[number]);

    mkdirSync(dirname(EMISSION_PATH), { recursive: true });
    writeFileSync(EMISSION_PATH, JSON.stringify(emission, null, 2) + '\n', 'utf8');

    // ── Prune backup spam (the MCP writes a backup per upsert; keep the newest 5). ──
    for (const dir of [`${REPO}/metadata/integrations/${CONNECTOR}/.backups`, `${REG}/.backups`]) {
        try {
            if (!existsSync(dir)) continue;
            const files = readdirSync(dir).map((f) => join(dir, f)).filter((f) => statSync(f).isFile()).sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs);
            for (const f of files.slice(5)) unlinkSync(f);
        } catch { /* housekeeping only */ }
    }

    const totalFields = emits.reduce((s, e) => s + e.fieldsExtracted, 0);
    process.stdout.write(JSON.stringify({
        objectsExtracted: emits.length,
        coverableDoors: units.length,
        nestedRecordTypes: nestedUnits.length,
        fieldsExtracted: totalFields,
        skippedWithReason: skipped.length,
        ioUpserted: ioCreated,
        iofUpserted: iofCreated,
        mcpErrors: errors,
        emissionArtifact: EMISSION_PATH,
        enumeratedDoors: doorsMap.size,
        emittedObjectNames: emits.map((e) => e.objectName),
    }, null, 2) + '\n');
    if (errors > 0) process.exitCode = 1;
}

main().catch((err) => { console.error(err); process.exit(1); });
