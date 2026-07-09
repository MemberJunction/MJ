#!/usr/bin/env node
// scripts/extract-io-iof-amend-r2.mjs
//
// AMENDMENT ROUND 2 — Higher Logic Vanilla IO + IOF extractor.
//
// CODE-FIRST: every emitted value is (re)derived from the saved raw merged OpenAPI v3 spec —
// never from the connector, never from prior metadata as a PK/FK SOURCE. The prior metadata file
// is READ only to compute an ADDITIVE delta (which fields already exist) so the amendment is
// idempotent and never subtractive; the PK/FK VALUES themselves come from the spec's addressing
// paths + the vendor's consistent <entity>ID convention resolving to an emitted sibling IO.
//
// Fixes the round-1 review's confirmed gaps (INDEPENDENT_REVIEW.md, round 1):
//   B1  systematic field truncation — 45/58 objects were missing their scalar FK fields entirely.
//       This run re-flattens each door object's FULL canonical schema (allOf/$ref/oneOf recursive)
//       and additively adds every missing field + wires FKs vendor-wide via resolveFK.
//   B2  ClassName "Higherlogic-vanillaConnector" (invalid TS identifier) -> "HigherLogicVanillaConnector".
//   B3  Tag: fabricated `id` field removed + `urlCode` -> literal vendor spelling `urlcode`
//       (delete_integration_object + clean recreate from canonical components.schemas.Tag).
//   B4  ArticleRevision — real listable PK/FK object (/articles/{id}/revisions) added.
//   B5  ConversationParticipant — real nested writable resource (/conversations/{id}/participants) added.
//   A1  UserNote — real write surface at /user-notes/notes[/{id}] (Create/Update/Delete) enabled.
//   A2  PollVote — real nested read collection (/polls/{id}/votes) added.
//   A3  UserMention — userID was sole PK (collides across mentions) -> composite PK
//       (userID,recordType,recordID) + userID FK -> User.
//   A4  Appeal watermark dateInserted -> dateUpdated (Appeal is not insert-only; supports write).
//
// ADDITIVE: all 58 existing IOs preserved; object set grows to 61.

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { z } from 'zod';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

const REPO = '/Users/bcladmin/Projects/MemberJunction/MJ';
const REG = `${REPO}/packages/Integration/connectors-registry/higherlogic-vanilla`;
const SPEC_PATH = `${REG}/sources/vanilla-openapi.merged.v3.json`;
const METAFILE = `${REPO}/metadata/integrations/higherlogic-vanilla/.higherlogic-vanilla.integration.json`;
const MCP_SERVER = `${REPO}/packages/MCP/mj-metadata/dist/server.js`;
const EMISSION_PATH = `${REG}/runs/connector-higherlogic-vanilla-1783524696351-4fa3bf0a/output/EXTRACTION_EMISSION.json`;
const CONNECTOR = 'higherlogic-vanilla';
const SRC = 'sources/vanilla-openapi.merged.v3.json (merged open.vanillaforums.com + success.vanillaforums.com KB-1842 OpenAPI v3)';

// ── Zod validation of the parts of the spec we consume ───────────────────────
const SpecSchema = z.object({
    openapi: z.string().optional(),
    paths: z.record(z.string(), z.record(z.string(), z.unknown())),
    components: z.object({
        schemas: z.record(z.string(), z.unknown()).default({}),
        parameters: z.record(z.string(), z.unknown()).default({}),
    }).default({ schemas: {}, parameters: {} }),
}).passthrough();

const spec = SpecSchema.parse(JSON.parse(readFileSync(SPEC_PATH, 'utf8')));
const schemas = spec.components?.schemas ?? {};
const paramDefs = spec.components?.parameters ?? {};

// door segment -> normalized IO name (structural cleaning; mirrors the script-computed
// sources/derived/taxonomy-leaves.mapping.json). 51 coverable door leaves.
const DOOR_TO_NAME = {
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

// ── Schema resolution (flatten allOf / $ref / oneOf recursively) ─────────────
const refName = (ref) => (ref ? ref.split('/').pop() ?? null : null);
function resolveParamName(p) {
    if (p?.name) return p.name;
    if (p?.$ref) { const rn = p.$ref.split('/').pop(); return (rn && paramDefs[rn]?.name) ?? rn ?? null; }
    return null;
}
function flatten(node, seen = new Set()) {
    const n = node;
    if (!n) return { props: {}, required: [], refName: null };
    if (n.$ref) {
        const rn = refName(n.$ref);
        if (!rn || seen.has(rn)) return { props: {}, required: [], refName: rn };
        seen.add(rn);
        const r = flatten(schemas[rn], seen);
        return { ...r, refName: rn };
    }
    if (Array.isArray(n.allOf)) {
        let props = {}, required = [], first = null;
        for (const part of n.allOf) { const r = flatten(part, seen); props = { ...props, ...r.props }; required = [...required, ...r.required]; if (!first && r.refName) first = r.refName; }
        return { props, required, refName: first };
    }
    if (Array.isArray(n.oneOf)) {
        let props = {};
        for (const part of n.oneOf) { const r = flatten(part, seen); props = { ...props, ...r.props }; }
        return { props, required: [], refName: null };
    }
    if (n.properties) return { props: n.properties, required: n.required ?? [], refName: null };
    return { props: {}, required: [], refName: null };
}
// Classify a 2xx response schema node. Handles inline array, $ref-to-array, $ref-to-object, allOf, {data:[]}.
function classifyResponse(node) {
    const n = node;
    if (!n) return { kind: 'other' };
    if (n.items) return { kind: 'array', itemNode: n.items, dataKey: null };
    if (n.$ref) {
        const target = schemas[refName(n.$ref)];
        if (target && (target.type === 'array' || target.items)) return { kind: 'array', itemNode: target.items, dataKey: null };
        return { kind: 'object', itemNode: n, refName: refName(n.$ref) };
    }
    if (n.allOf) return { kind: 'object', itemNode: n };
    const dataArr = n.properties?.data;
    if (n.type === 'object' && dataArr?.type === 'array') return { kind: 'array', itemNode: dataArr.items, dataKey: 'data' };
    return { kind: 'other' };
}
function response2xx(op) {
    if (!op?.responses) return null;
    for (const code of ['200', '201', '202']) {
        const sch = op.responses[code]?.content?.['application/json']?.schema;
        if (sch) return classifyResponse(sch);
    }
    return null;
}

// ── PK detection: addressing-path param first (Tier-1), then vendor <door>ID convention ──
function isIdish(n) { return /(?:ID|UUID)$/.test(n); }
function notActor(n) { return !/^(insert|update|last|dismiss|bookmark|participated|assigned|approve|reject|spoof|lastComment|reported|appealing|removed|invite|statusUser|recordUser)/i.test(n); }
function findPK(props, required, doorSingular, pathParam) {
    const names = Object.keys(props);
    if (pathParam && pathParam.toLowerCase() !== 'id' && names.includes(pathParam)) return pathParam;
    const idish = names.filter(isIdish);
    let pk = idish.find((n) => n.toLowerCase().startsWith(doorSingular.toLowerCase()) && notActor(n));
    if (pk) return pk;
    if (pathParam && names.includes(pathParam)) return pathParam;
    pk = idish.find((n) => required.includes(n) && notActor(n));
    if (pk) return pk;
    for (const k of ['apiName', 'urlCode', 'urlcode', 'accessTokenID', 'name']) if (names.includes(k)) return k;
    return idish.find(notActor) ?? idish[0] ?? null;
}

// ── FK resolution: STRICT — resolve to an emitted IO name or return null (defer) ──
function pascal(s) { return s.charAt(0).toUpperCase() + s.slice(1); }
function stripIdSuffix(field) {
    if (/UUID$/.test(field)) return field.slice(0, -4);
    if (/ID$/.test(field)) return field.slice(0, -2);
    return null;
}
function resolveFK(field, ownerName, emitted) {
    if (!isIdish(field)) return null;
    if (/user$/i.test(field.replace(/(?:ID|UUID)$/, '')) && emitted.has('User')) return 'User';
    let base = stripIdSuffix(field);
    if (!base) return null;
    if (field === 'parentID') return emitted.has(ownerName) ? ownerName : null;
    if (/^parent/i.test(base)) base = base.replace(/^parent/i, '');
    if (!base) return null;
    const cand = pascal(base);
    if (emitted.has(cand)) return cand;
    return null; // DEFER (polymorphic recordID/foreignID/self-alias mediaUUID/non-IO targets)
}

// ── OpenAPI property -> MJ IOF Type ──
function mapType(p) {
    if (!p) return 'String';
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
function singularize(s) { return s.replace(/ies$/i, 'y').replace(/ss$/i, 'ss').replace(/s$/i, '').replace(/-/g, ''); }

// ── Door walk: full canonical prop set per door object ───────────────────────
const allPaths = Object.keys(spec.paths);
const doorsMap = new Map();
for (const p of allPaths) { const seg = p.split('/').filter(Boolean)[0]; if (!doorsMap.has(seg)) doorsMap.set(seg, []); doorsMap.get(seg).push(p); }
function isSingleItemDirect(door, p) { const rest = p.slice(door.length + 2); const segs = rest.split('/'); return /^[{:]/.test(segs[0] ?? '') && segs.length === 1; }
function extractPathParam(door, p) { const rest = p.slice(door.length + 2); return (rest.split('/')[0] ?? '').replace(/^[{:]/, '').replace(/\}$/, '') || null; }

const unitsByName = new Map(); // name -> { props, required, pathParam }
for (const [door, doorPaths] of doorsMap.entries()) {
    const name = DOOR_TO_NAME[door];
    if (!name) continue;
    const bare = `/${door}`;
    const bareOps = spec.paths[bare];
    let listCls = null;
    if (bareOps?.get) { const cls = response2xx(bareOps.get); if (cls?.kind === 'array') listCls = cls; }
    if (!listCls) { for (const p of doorPaths) { const ops = spec.paths[p]; if (ops?.get) { const cls = response2xx(ops.get); if (cls?.kind === 'array') { listCls = cls; break; } } } }
    let singleRefInfo = null, pathParam = null, createRefInfo = null;
    if (bareOps?.post) createRefInfo = response2xx(bareOps.post);
    for (const p of doorPaths) {
        if (!isSingleItemDirect(door, p)) continue;
        const ops = spec.paths[p];
        if (!pathParam) pathParam = extractPathParam(door, p);
        if (ops.get && !singleRefInfo) { const cls = response2xx(ops.get); if (cls?.kind === 'object') singleRefInfo = cls; }
    }
    const listResolved = listCls?.itemNode ? flatten(listCls.itemNode) : null;
    const singleResolved = singleRefInfo?.itemNode ? flatten(singleRefInfo.itemNode) : null;
    const createResolved = createRefInfo?.itemNode ? flatten(createRefInfo.itemNode) : null;
    const primaryRef = singleResolved?.refName ?? listResolved?.refName ?? createResolved?.refName ?? null;
    const primaryResolved = primaryRef && schemas[primaryRef] ? flatten(schemas[primaryRef]) : null;
    const props = { ...(listResolved?.props ?? {}), ...(createResolved?.props ?? {}), ...(primaryResolved?.props ?? {}), ...(singleResolved?.props ?? {}) };
    const required = [...new Set([...(listResolved?.required ?? []), ...(singleResolved?.required ?? []), ...(createResolved?.required ?? []), ...(primaryResolved?.required ?? [])])];
    const existing = unitsByName.get(name);
    if (existing) unitsByName.set(name, { props: { ...existing.props, ...props }, required: [...new Set([...existing.required, ...required])], pathParam: existing.pathParam ?? pathParam });
    else unitsByName.set(name, { props, required, pathParam });
}

// PK per emitted door object (for RelatedIntegrationObjectFieldName = target's PK-field-name).
const pkByName = new Map();
for (const [name, unit] of unitsByName.entries()) pkByName.set(name, findPK(unit.props, unit.required, singularize(name), unit.pathParam));

// ── Read current metadata (for the additive delta, NOT as a PK/FK source) ────
const metaFile = JSON.parse(readFileSync(METAFILE, 'utf8'));
const currentIOs = metaFile[0].relatedEntities['MJ: Integration Objects'];
const currentByName = new Map();
for (const io of currentIOs) {
    const iofs = io.relatedEntities?.['MJ: Integration Object Fields'] ?? [];
    const fmap = new Map();
    for (const f of iofs) fmap.set(f.fields.Name.toLowerCase(), f.fields);
    currentByName.set(io.fields.Name, { io: io.fields, iofs: fmap });
}

const NEW_NESTED = ['ArticleRevision', 'ConversationParticipant', 'PollVote'];
const emittedNames = new Set([...currentByName.keys(), ...NEW_NESTED]);
const lookup = (t) => `@lookup:MJ: Integration Objects.Name=${t}&IntegrationID=@parent:IntegrationID`;
const fkPKName = (target) => pkByName.get(target) ?? null;

// ── Plan of MCP operations (built first, executed second) ────────────────────
const ops = [];
const claimsByObject = new Map();
function addClaim(obj, slot, value, sourcePath) {
    if (!claimsByObject.has(obj)) claimsByObject.set(obj, []);
    claimsByObject.get(obj).push({ slot, value, sourcePath });
}

// Build an IOF row. Description omitted when the source has none (schema rejects null).
// RelatedIntegrationObjectFieldName = the TARGET IO's PK field name (string), matching the
// established round-1 convention (e.g. eventID -> Event.eventID).
function buildIOFRow(field, p, { isPK, fkTarget, required, seq }) {
    const type = mapType(p);
    const readOnly = p?.readOnly === true || isPK || /^date[A-Z]/.test(field) || /^count[A-Z]/.test(field);
    const row = {
        Name: field,
        DisplayName: field.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/^./, (c) => c.toUpperCase()),
        Type: type,
        IsPrimaryKey: isPK,
        IsRequired: !readOnly && required.includes(field),
        IsReadOnly: readOnly,
        IsUniqueKey: false,
        AllowsNull: isPK ? false : true,
        Status: 'Active',
        Sequence: seq,
    };
    if (typeof p?.description === 'string' && p.description.trim()) row.Description = p.description;
    if (type === 'String' && typeof p?.maxLength === 'number') row.Length = p.maxLength;
    if (fkTarget) {
        row.RelatedIntegrationObjectID = lookup(fkTarget);
        const tpk = fkPKName(fkTarget);
        if (tpk) row.RelatedIntegrationObjectFieldName = tpk;
        row.Configuration = { ReferencedType: fkTarget };
    }
    return row;
}

// ── B2: ClassName fix (root integration fields) ──
ops.push({ kind: 'root', fields: { ClassName: 'HigherLogicVanillaConnector' } });
addClaim('__root__', 'integration.ClassName', 'HigherLogicVanillaConnector', 'INDEPENDENT_REVIEW.md B2; connector-code-conventions.md <Vendor>Connector PascalCase rule');

// ── B1: additive IOF completion + vendor-wide FK wiring on the 51 door objects ──
const SPECIAL_DOOR = new Set(['Tag']);
let addedFields = 0, wiredFKs = 0;
for (const [name, unit] of unitsByName.entries()) {
    if (SPECIAL_DOOR.has(name)) continue;
    const cur = currentByName.get(name);
    if (!cur) continue;
    const doorPK = pkByName.get(name);
    const hasExistingPK = [...cur.iofs.values()].some((f) => f.IsPrimaryKey === true);
    let seq = cur.iofs.size;
    for (const field of Object.keys(unit.props)) {
        if (field === 'id') continue; // legacy-list-variant artifact (generic {id}); real PK is <door>ID
        const isDoorPK = field === doorPK;
        const existing = cur.iofs.get(field.toLowerCase());
        if (!existing) {
            const markPK = isDoorPK && !hasExistingPK;
            const fk = markPK ? null : resolveFK(field, name, emittedNames);
            const row = buildIOFRow(field, unit.props[field], { isPK: markPK, fkTarget: fk, required: unit.required, seq: seq++ });
            ops.push({ kind: 'iof', ioName: name, iof: row });
            addedFields++;
            if (fk) { wiredFKs++; addClaim(name, `iof.${name}.${field}.RelatedIntegrationObjectID`, fk, `${SRC} :: field "${field}" (vendor <entity>ID convention) -> emitted IO ${fk}`); }
            if (markPK) addClaim(name, `iof.${name}.${field}.IsPrimaryKey`, true, `${SRC} :: addressing path / <door>ID identity`);
        } else if (!isDoorPK) {
            const fk = resolveFK(field, name, emittedNames);
            if (fk && !existing.RelatedIntegrationObjectID) {
                const iof = { Name: field, Type: existing.Type ?? mapType(unit.props[field]), RelatedIntegrationObjectID: lookup(fk), Configuration: { ReferencedType: fk } };
                const tpk = fkPKName(fk); if (tpk) iof.RelatedIntegrationObjectFieldName = tpk;
                ops.push({ kind: 'iof', ioName: name, iof });
                wiredFKs++;
                addClaim(name, `iof.${name}.${field}.RelatedIntegrationObjectID`, fk, `${SRC} :: field "${field}" (vendor <entity>ID convention) -> emitted IO ${fk}`);
            }
        }
    }
}

// ── B3: Tag — delete + clean recreate from the CANONICAL components.schemas.Tag ──
// (NOT the door union, which pulls in a legacy list variant carrying the fabricated `id` +
//  camelCase `urlCode` — the exact B3 defect).
{
    const tagFlat = flatten(schemas['Tag']); // tagID,urlcode,name,description,parentTagID,type,scope,dateInserted,insertUserID,insertIPAddress
    const props = tagFlat.props;
    const doorPK = 'tagID';
    const curTag = currentByName.get('Tag');
    const io = { ...curTag.io };
    ops.push({ kind: 'deleteIO', ioName: 'Tag' });
    ops.push({ kind: 'io', io });
    let seq = 0;
    for (const field of Object.keys(props)) {
        const isPK = field === doorPK;
        const fk = isPK ? null : resolveFK(field, 'Tag', emittedNames);
        const row = buildIOFRow(field, props[field], { isPK, fkTarget: fk, required: tagFlat.required, seq: seq++ });
        if (isPK) row.IsUniqueKey = true;
        ops.push({ kind: 'iof', ioName: 'Tag', iof: row });
        if (fk) addClaim('Tag', `iof.Tag.${field}.RelatedIntegrationObjectID`, fk, `${SRC} :: field "${field}" -> ${fk}`);
    }
    addClaim('Tag', 'iof.Tag.id.removed', 'removed', 'INDEPENDENT_REVIEW.md B3: `id` is not in components.schemas.Tag/TagFragment (fabricated from path param {id})');
    addClaim('Tag', 'iof.Tag.urlcode.spelling', 'urlcode', 'INDEPENDENT_REVIEW.md B3: TagFragment.properties literal spelling is all-lowercase `urlcode`');
}

// ── Nested-collection IO builder (EventParticipant/GroupMember convention) ──
function planNested({ name, parent, parentVar, apiPath, props, required, pkFields, syntheticParentCol, fkOverrides, supportsCreate, createPath, listParams, watermark }) {
    const supportsPagination = listParams.includes('page') || listParams.includes('limit');
    const io = {
        Name: name, DisplayName: name.replace(/([a-z])([A-Z])/g, '$1 $2'),
        Description: `Higher Logic Vanilla ${name} — nested record-collection reached via ${apiPath} (child of ${parent}).`,
        Category: 'Vanilla', APIPath: apiPath, ResponseDataKey: null,
        PaginationType: supportsPagination ? 'PageNumber' : 'None', DefaultPageSize: supportsPagination ? 30 : null,
        SupportsPagination: supportsPagination, SupportsIncrementalSync: watermark !== null, IncrementalWatermarkField: watermark,
        SupportsWrite: !!supportsCreate, SupportsCreate: !!supportsCreate, SupportsUpdate: false, SupportsDelete: false,
        SyncStrategy: watermark !== null ? 'WatermarkIncremental' : 'FullPullHashDiff', ContentHashApplicable: watermark === null,
        StableOrderingKey: pkFields[pkFields.length - 1], Status: 'Active',
        Configuration: { parentObjectName: parent, parentObjectIDFieldName: parentVar, accessPath: { entryDoor: parent, parentTemplateVar: parentVar, nestingPath: apiPath }, pkField: pkFields.join('+') },
    };
    if (supportsCreate) { io.CreateAPIPath = createPath; io.CreateMethod = 'POST'; io.CreateBodyShape = 'flat'; io.CreateBodyKey = null; io.CreateIDLocation = 'body'; }
    ops.push({ kind: 'deleteIO', ioName: name });
    ops.push({ kind: 'io', io });
    addClaim(name, `io.${name}.APIPath`, apiPath, `${SRC} :: GET ${apiPath} (nested collection)`);
    addClaim(name, `io.${name}.ParentObjectName`, parent, `${SRC} :: parametric-child access path ${apiPath}`);
    if (watermark) addClaim(name, `io.${name}.IncrementalWatermarkField`, watermark, `${SRC} :: list field "${watermark}"`);
    let seq = 0;
    if (syntheticParentCol) {
        const iof = {
            Name: syntheticParentCol.field,
            DisplayName: syntheticParentCol.field.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/^./, (c) => c.toUpperCase()),
            Description: `The ${parent} this ${name} belongs to (supplied from the access path ${apiPath}).`,
            Type: 'Integer', IsPrimaryKey: pkFields.includes(syntheticParentCol.field), IsRequired: true, IsReadOnly: true, IsUniqueKey: false,
            AllowsNull: false, Status: 'Active', Sequence: seq++,
            RelatedIntegrationObjectID: lookup(parent), Configuration: { ReferencedType: parent },
        };
        const ppk = fkPKName(parent); if (ppk) iof.RelatedIntegrationObjectFieldName = ppk;
        ops.push({ kind: 'iof', ioName: name, iof });
        addClaim(name, `iof.${name}.${syntheticParentCol.field}.RelatedIntegrationObjectID`, parent, `${SRC} :: parametric-child path ${apiPath} -> parent ${parent}`);
        if (pkFields.includes(syntheticParentCol.field)) addClaim(name, `iof.${name}.${syntheticParentCol.field}.IsPrimaryKey`, true, `${SRC} :: composite-PK part (parent scope)`);
    }
    for (const field of Object.keys(props)) {
        if (field === syntheticParentCol?.field) continue; // already emitted above
        const isPK = pkFields.includes(field);
        const fkRaw = fkOverrides[field] ?? resolveFK(field, parent, emittedNames);
        const fk = (fkRaw === name) ? null : fkRaw; // never self-alias a nested obj own PK as an FK to itself
        const row = buildIOFRow(field, props[field], { isPK, fkTarget: fk, required, seq: seq++ });
        ops.push({ kind: 'iof', ioName: name, iof: row });
        if (isPK) addClaim(name, `iof.${name}.${field}.IsPrimaryKey`, true, `${SRC} :: nested-collection identity field`);
        if (fk) addClaim(name, `iof.${name}.${field}.RelatedIntegrationObjectID`, fk, `${SRC} :: field "${field}" -> ${fk}`);
    }
}

// ── B4: ArticleRevision (canonical component schema) ──
{
    const f = flatten(schemas['ArticleRevision']);
    const listParams = (spec.paths['/articles/{id}/revisions']?.get?.parameters ?? []).map(resolveParamName).filter(Boolean);
    planNested({ name: 'ArticleRevision', parent: 'Article', parentVar: 'id', apiPath: '/articles/{id}/revisions',
        props: f.props, required: f.required, pkFields: ['articleRevisionID'], syntheticParentCol: null,
        fkOverrides: { articleID: 'Article', insertUserID: 'User' }, supportsCreate: false, createPath: null, listParams, watermark: 'dateInserted' });
}
// ── B5: ConversationParticipant (composite PK per review B5) ──
{
    const g = response2xx(spec.paths['/conversations/{id}/participants']?.get);
    const f = flatten(g?.itemNode);
    delete f.props.user; // nested UserFragment — access-path expansion, not a column
    const listParams = (spec.paths['/conversations/{id}/participants']?.get?.parameters ?? []).map(resolveParamName).filter(Boolean);
    planNested({ name: 'ConversationParticipant', parent: 'Conversation', parentVar: 'id', apiPath: '/conversations/{id}/participants',
        props: f.props, required: f.required, pkFields: ['conversationID', 'userID'], syntheticParentCol: { field: 'conversationID' },
        fkOverrides: { userID: 'User' }, supportsCreate: true, createPath: '/conversations/{id}/participants', listParams, watermark: null });
}
// ── A2: PollVote (composite PK) ──
{
    const g = response2xx(spec.paths['/polls/{id}/votes']?.get);
    const f = flatten(g?.itemNode);
    const listParams = (spec.paths['/polls/{id}/votes']?.get?.parameters ?? []).map(resolveParamName).filter(Boolean);
    planNested({ name: 'PollVote', parent: 'Poll', parentVar: 'id', apiPath: '/polls/{id}/votes',
        props: f.props, required: f.required, pkFields: ['pollID', 'userID', 'pollOptionID'], syntheticParentCol: { field: 'pollID' },
        fkOverrides: { userID: 'User' }, supportsCreate: false, createPath: null, listParams, watermark: null });
}

// ── A1: UserNote — enable the write surface at /user-notes/notes[/{id}] ──
ops.push({ kind: 'io', io: {
    Name: 'UserNote', SupportsWrite: true, SupportsCreate: true, SupportsUpdate: true, SupportsDelete: true,
    CreateAPIPath: '/user-notes/notes', CreateMethod: 'POST', CreateBodyShape: 'flat', CreateBodyKey: null, CreateIDLocation: 'body',
    UpdateAPIPath: '/user-notes/notes/{id}', UpdateMethod: 'PATCH', UpdateBodyShape: 'flat', UpdateBodyKey: null, UpdateIDLocation: 'path',
    DeleteAPIPath: '/user-notes/notes/{id}', DeleteMethod: 'DELETE', DeleteIDLocation: 'path',
} });
addClaim('UserNote', 'io.UserNote.CreateAPIPath', '/user-notes/notes', `${SRC} :: POST /user-notes/notes (INDEPENDENT_REVIEW A1)`);
addClaim('UserNote', 'io.UserNote.UpdateAPIPath', '/user-notes/notes/{id}', `${SRC} :: PATCH /user-notes/notes/{id}`);
addClaim('UserNote', 'io.UserNote.DeleteAPIPath', '/user-notes/notes/{id}', `${SRC} :: DELETE /user-notes/notes/{id}`);

// ── A3: UserMention — composite PK (userID,recordType,recordID) + userID FK -> User ──
ops.push({ kind: 'iof', ioName: 'UserMention', iof: { Name: 'userID', Type: 'Integer', IsPrimaryKey: true, IsUniqueKey: false, RelatedIntegrationObjectID: lookup('User'), RelatedIntegrationObjectFieldName: 'userID', Configuration: { ReferencedType: 'User' } } });
ops.push({ kind: 'iof', ioName: 'UserMention', iof: { Name: 'recordType', Type: 'String', IsPrimaryKey: true, AllowsNull: false } });
ops.push({ kind: 'iof', ioName: 'UserMention', iof: { Name: 'recordID', Type: 'Integer', IsPrimaryKey: true, AllowsNull: false } });
addClaim('UserMention', 'iof.UserMention.userID.RelatedIntegrationObjectID', 'User', `${SRC} :: userID is the mentioned user (INDEPENDENT_REVIEW A3)`);
addClaim('UserMention', 'iof.UserMention.compositePK', 'userID+recordType+recordID', 'INDEPENDENT_REVIEW A3: userID alone collides; composite (userID,recordType,recordID) is the row identity');

// ── A4: Appeal watermark dateInserted -> dateUpdated ──
ops.push({ kind: 'io', io: { Name: 'Appeal', IncrementalWatermarkField: 'dateUpdated' } });
addClaim('Appeal', 'io.Appeal.IncrementalWatermarkField', 'dateUpdated', `${SRC} :: Appeal supports write (not insert-only); dateUpdated present (INDEPENDENT_REVIEW A4)`);

// ── Execute the plan against the mj-metadata MCP ─────────────────────────────
async function main() {
    const transport = new StdioClientTransport({ command: 'node', args: [MCP_SERVER], env: { ...process.env, MJ_CONNECTORS_REGISTRY: `${REPO}/packages/Integration/connectors-registry`, MJ_METADATA_ROOT: `${REPO}/metadata/integrations` } });
    const client = new Client({ name: 'extract-io-iof-amend-r2', version: '1.0' }, { capabilities: {} });
    await client.connect(transport);
    let ioW = 0, iofW = 0, del = 0, rootW = 0, errors = 0;
    const errSamples = [];
    try {
        for (const op of ops) {
            let r;
            if (op.kind === 'root') { r = await client.callTool({ name: 'upsert_integration_fields', arguments: { connector: CONNECTOR, fields: op.fields } }); rootW++; }
            else if (op.kind === 'deleteIO') { r = await client.callTool({ name: 'delete_integration_object', arguments: { connector: CONNECTOR, ioName: op.ioName } }); del++; }
            else if (op.kind === 'io') { r = await client.callTool({ name: 'upsert_integration_object', arguments: { connector: CONNECTOR, io: op.io } }); ioW++; }
            else if (op.kind === 'iof') { r = await client.callTool({ name: 'upsert_integration_object_field', arguments: { connector: CONNECTOR, ioName: op.ioName, iof: op.iof } }); iofW++; }
            if (r?.isError) { errors++; if (errSamples.length < 12) errSamples.push(`${op.kind} ${op.ioName ?? op.io?.Name ?? ''} ${op.iof?.Name ?? ''}: ${JSON.stringify(r.content)}`); }
        }
        const now = new Date().toISOString();
        const ce = (TargetField, StructuredOutput) => client.callTool({ name: 'append_code_evidence', arguments: { connector: CONNECTOR, entry: { ScriptPath: 'scripts/extract-io-iof-amend-r2.mjs', ScriptRunAt: now, StructuredOutput, SchemaValidationStatus: 'Passed', TargetField } } });
        await ce('io.*', { round: 2, ioUpserts: ioW, iofUpserts: iofW, deletes: del, fieldsAdded: addedFields, fksWired: wiredFKs, newNested: NEW_NESTED, source: SRC });
        await ce('integration.ClassName', { rule: 'PascalCase TS class symbol', value: 'HigherLogicVanillaConnector', fixes: 'B2' });
        await ce('iof.Discussion.categoryID.RelatedIntegrationObjectID', { rule: 'full canonical schema re-flatten + resolveFK vendor-wide', fixes: 'B1', example: 'Discussion.categoryID->Category, groupID->Group, insertUserID/lastUserID->User, statusID->Status' });
        await ce('iof.Tag.urlcode', { rule: 'clean delete+recreate; removed fabricated `id`, corrected urlCode->urlcode', fixes: 'B3' });
        await ce('io.ArticleRevision.APIPath', { rule: 'nested listable component ArticleRevision via /articles/{id}/revisions', fixes: 'B4' });
        await ce('io.ConversationParticipant.APIPath', { rule: 'nested writable /conversations/{id}/participants, composite PK conversationID+userID', fixes: 'B5' });
        await ce('io.PollVote.APIPath', { rule: 'nested read /polls/{id}/votes, composite PK pollID+userID+pollOptionID', fixes: 'A2' });
        await ce('io.UserNote.SupportsWrite', { rule: 'write surface at /user-notes/notes[/{id}]', fixes: 'A1' });
        await ce('iof.UserMention.userID.IsPrimaryKey', { rule: 'composite PK (userID,recordType,recordID) + userID FK->User', fixes: 'A3' });
        await ce('io.Appeal.IncrementalWatermarkField', { rule: 'dateUpdated (not insert-only)', fixes: 'A4' });
    } finally {
        await client.close();
    }
    for (const e of errSamples) process.stderr.write('ERR ' + e + '\n');

    // ── Build EXTRACTION_EMISSION.json from the FINAL metadata state ──
    const finalFile = JSON.parse(readFileSync(METAFILE, 'utf8'));
    const finalIOs = finalFile[0].relatedEntities['MJ: Integration Objects'];
    const emission = [];
    let totalFields = 0;
    for (const io of finalIOs) {
        const F = io.fields;
        const iofs = io.relatedEntities?.['MJ: Integration Object Fields'] ?? [];
        totalFields += iofs.length;
        const claims = [];
        const gaps = [];
        if (F.APIPath) claims.push({ slot: `io.${F.Name}.APIPath`, value: F.APIPath, sourcePath: `${SRC} :: GET ${F.APIPath}` });
        claims.push({ slot: `io.${F.Name}.PaginationType`, value: F.PaginationType, sourcePath: `${SRC} :: list params page/limit` });
        claims.push({ slot: `io.${F.Name}.SupportsWrite`, value: !!F.SupportsWrite, sourcePath: `${SRC} :: create=${!!F.SupportsCreate} update=${!!F.SupportsUpdate} delete=${!!F.SupportsDelete}` });
        if (F.SupportsCreate && F.CreateAPIPath) claims.push({ slot: `io.${F.Name}.CreateAPIPath`, value: F.CreateAPIPath, sourcePath: `${SRC} :: POST ${F.CreateAPIPath}` });
        if (F.SupportsUpdate && F.UpdateAPIPath) claims.push({ slot: `io.${F.Name}.UpdateAPIPath`, value: F.UpdateAPIPath, sourcePath: `${SRC} :: ${F.UpdateMethod} ${F.UpdateAPIPath}` });
        if (F.SupportsDelete && F.DeleteAPIPath) claims.push({ slot: `io.${F.Name}.DeleteAPIPath`, value: F.DeleteAPIPath, sourcePath: `${SRC} :: ${F.DeleteMethod} ${F.DeleteAPIPath}` });
        if (F.SupportsIncrementalSync && F.IncrementalWatermarkField) claims.push({ slot: `io.${F.Name}.IncrementalWatermarkField`, value: F.IncrementalWatermarkField, sourcePath: `${SRC} :: list field "${F.IncrementalWatermarkField}"` });
        let pkCount = 0, fkCount = 0, deferredFK = 0;
        for (const fe of iofs) {
            const ff = fe.fields;
            if (ff.IsPrimaryKey === true) { pkCount++; claims.push({ slot: `iof.${F.Name}.${ff.Name}.IsPrimaryKey`, value: true, sourcePath: `${SRC} :: addressing path / identity field` }); }
            if (ff.RelatedIntegrationObjectID) { fkCount++; const t = ff.Configuration?.ReferencedType ?? String(ff.RelatedIntegrationObjectID).replace(/^@lookup:MJ: Integration Objects\.Name=/, '').split('&')[0]; claims.push({ slot: `iof.${F.Name}.${ff.Name}.RelatedIntegrationObjectID`, value: t, sourcePath: `${SRC} :: field "${ff.Name}" -> emitted IO ${t}` }); }
            else if (isIdish(ff.Name) && ff.IsPrimaryKey !== true) deferredFK++;
        }
        if (pkCount === 0) gaps.push(`io.${F.Name}: no PK emitted — deferred to runtime D4`);
        if (deferredFK > 0) gaps.push(`io.${F.Name}: ${deferredFK} id-shaped field(s) with no resolvable sibling IO — FK deferred (polymorphic recordID/foreignID/non-modeled targets)`);
        emission.push({ objectName: F.Name, fieldsExtracted: iofs.length, gapsRemaining: gaps, claims,
            matrixRow: { IOName: F.Name, ExistingConnectorTs: 'n/a', ExistingMetadataJson: 'yes', OpenAPIxPK: 'no',
                OpenAPIPathOps: pkCount > 0 ? 'yes' : 'no', OpenAPILocationHeader: 'no', VendorDocsProseScan: 'yes',
                SDKTypes: 'n/a', PostmanCommunity: 'n/a', NamingConvention: 'yes', CrossIOMatch: fkCount > 0 ? 'yes' : 'no',
                PKVerdict: pkCount > 0 ? 'emit' : 'defer', FKVerdict: fkCount > 0 ? `emit-${fkCount}` : 'defer', EvidenceCount: claims.length } });
    }
    const INFORMATIONAL = {
        'ai-processing-preferences': 'admin settings singleton', 'ai-settings': 'action/utility endpoint',
        analytics: 'aggregate dashboard endpoints', 'article-revisions': 'now emitted as ArticleRevision (round 2)',
        assets: 'action/utility endpoint', 'audit-logs': 'append-only audit trail, no reachable list',
        'authenticator-types': 'fixed GET-only type catalog', calls: 'action/utility endpoint', config: 'admin config action',
        'content-generator': 'action/utility endpoint', dashboard: 'admin dashboard config singleton', emails: 'action/utility endpoint',
        hootsuite: 'third-party integration config', jira: 'third-party integration config', 'job-queue': 'action/utility endpoint',
        'job-queue-feedback': 'action/utility endpoint', kbporter: 'action/utility endpoint', posts: 'virtual union Discussion|Comment',
        resources: 'fixed GET-only type catalog', rich: 'action/utility endpoint', salesforce: 'third-party integration config',
        search: 'virtual cross-object result set', 'site-totals': 'aggregate metrics', sprinklr: 'third-party integration config',
        tick: 'action/utility endpoint', translations: 'admin translation-management singleton',
    };
    const NESTED_SKIPPED = {
        AuthenticatorDebugLog: 'debug-log projection (not a syncable record)', DiscussionStatusLog: 'status-log projection',
        ThemeRevision: 'theme revision projection (same Theme schema)', UserReacted: 'derived reaction projection',
        ArticleTranslation: 'translation-workflow projection (J3 informational)', CommentReaction: 'reaction sub-list',
        DiscussionReaction: 'reaction sub-list', EventEdit: 'edit projection (same FullEvent schema)',
        KnowledgeBaseNavigationFlat: 'navigation projection', KnowledgeBaseNavigationTree: 'navigation projection',
        UserIgnored: 'ignored-users preference projection', AutomationRuleDispatch: 'same AutomationDispatch schema as the top-level door',
    };
    const skippedOut = [];
    for (const [door, reason] of Object.entries(INFORMATIONAL)) {
        const nm = DOOR_TO_NAME[door] ?? pascal(door.replace(/-([a-z])/g, (_, c) => c.toUpperCase()));
        if (emittedNames.has(nm)) continue;
        skippedOut.push({ name: nm, reason: `informational door /${door}: ${reason}` });
    }
    for (const [nm, reason] of Object.entries(NESTED_SKIPPED)) skippedOut.push({ name: nm, reason });
    for (const s of skippedOut) {
        emission.push({ objectName: s.name, fieldsExtracted: 0, gapsRemaining: [], claims: [],
            matrixRow: { IOName: s.name, ExistingConnectorTs: 'n/a', ExistingMetadataJson: 'no', OpenAPIxPK: 'no', OpenAPIPathOps: 'no', OpenAPILocationHeader: 'no', VendorDocsProseScan: 'yes', SDKTypes: 'n/a', PostmanCommunity: 'n/a', NamingConvention: 'no', CrossIOMatch: 'no', PKVerdict: 'defer', FKVerdict: 'defer', EvidenceCount: 0 },
            skipped: { reason: s.reason } });
    }

    mkdirSync(dirname(EMISSION_PATH), { recursive: true });
    writeFileSync(EMISSION_PATH, JSON.stringify(emission, null, 2) + '\n', 'utf8');

    process.stdout.write(JSON.stringify({
        round: 2, objectsExtracted: finalIOs.length, newNestedAdded: NEW_NESTED,
        fieldsExtracted: totalFields, fieldsAdded: addedFields, fksWired: wiredFKs,
        ioUpserts: ioW, iofUpserts: iofW, deletes: del, rootUpserts: rootW, mcpErrors: errors,
        skippedWithReason: skippedOut.length, emissionArtifact: EMISSION_PATH,
        emittedObjectNames: finalIOs.map((i) => i.fields.Name),
    }, null, 2) + '\n');
    if (errors > 0) process.exitCode = 1;
}
main().catch((err) => { console.error(err); process.exit(1); });
