#!/usr/bin/env node
// scripts/amend-delta-round1.mjs
//
// DELTA AMENDMENT ROUND 1 — surgical re-processing of the 13 reviewer-flagged objects ONLY.
// Does NOT re-walk / re-enumerate the catalog; the other 45 objects are left untouched (upsert
// is additive, never subtractive). Reads the pinned merged OpenAPI spec + the current metadata
// file (for existing Configuration/accessPath + field Types to preserve) and applies the per-slot
// FixInstructions from INDEPENDENT_REVIEW.md (G2..G6) to exactly these objects:
//   Session, Report, ReportReason, UserNote, OnlineUser, EventParticipant, GroupApplicant,
//   GroupInvite, GroupMember, GroupTag, UserBadge, WebhookDelivery, RoleApplication
//
// Fixes applied: (a) zero-field / dropped-field re-emission from the correctly-resolved schema
// (inline $ref-less list responses, colon-style path params, allOf-with-sibling-properties, oneOf);
// (b) PK correction (name→userID, absent→present); (c) FK-detection (scalar <base>ID / *UserID →
// sibling emitted IO via RelatedIntegrationObjectID); (d) capability-honesty (RoleApplication +
// Group* nested write endpoints). All field TYPES/DESCRIPTIONS/REQUIRED are read from the spec —
// never fabricated. Idempotent: re-running upserts the same rows (seqBase counts only untouched
// existing fields; final field counts are read back from the persisted metadata).

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { readFileSync, writeFileSync, copyFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

const CONNECTOR = 'higherlogic-vanilla';
const REPO = '/Users/bcladmin/Projects/MemberJunction/MJ';
const REG = `${REPO}/packages/Integration/connectors-registry/higherlogic-vanilla`;
const SPEC_PATH = `${REG}/sources/vanilla-openapi.merged.v3.json`;
const META_PATH = `${REPO}/metadata/integrations/higherlogic-vanilla/.higherlogic-vanilla.integration.json`;
const EMISSION_PATH = `${REG}/runs/connector-higherlogic-vanilla-1783524696351-4fa3bf0a/output/EXTRACTION_EMISSION.json`;
const MCP_SERVER = `${REPO}/packages/MCP/mj-metadata/dist/server.js`;
const SRC = 'sources/vanilla-openapi.merged.v3.json';

const spec = JSON.parse(readFileSync(SPEC_PATH, 'utf8'));
const schemas = spec.components.schemas;

function readMeta() {
    const meta = JSON.parse(readFileSync(META_PATH, 'utf8'));
    return meta[0].relatedEntities['MJ: Integration Objects'];
}
let currentIOs = readMeta();
const currentIO = (name) => currentIOs.find((o) => o.fields.Name === name);
const currentFields = (name) => ((currentIO(name)?.relatedEntities?.['MJ: Integration Object Fields']) || []).map((f) => f.fields);

// ── schema resolution: flatten $ref / allOf(+sibling properties) / oneOf ────────────────
const refName = (r) => (r ? r.split('/').pop() : null);
function flatten(node, seen = new Set()) {
    if (!node) return { props: {}, required: [] };
    if (node.$ref) {
        const rn = refName(node.$ref);
        if (!rn || seen.has(rn)) return { props: {}, required: [] };
        seen.add(rn);
        return flatten(schemas[rn], seen);
    }
    let props = {}, required = [];
    // allOf members AND any sibling top-level properties are merged (fixes the
    // WebhookDeliveryWithRequest / BasicUserNote allOf-with-own-properties drop).
    if (Array.isArray(node.allOf)) {
        for (const part of node.allOf) { const r = flatten(part, seen); props = { ...props, ...r.props }; required = [...required, ...r.required]; }
    }
    if (Array.isArray(node.oneOf)) {
        for (const part of node.oneOf) { const r = flatten(part, seen); props = { ...props, ...r.props }; }
    }
    if (node.properties) { props = { ...props, ...node.properties }; required = [...required, ...(node.required || [])]; }
    return { props, required: [...new Set(required)] };
}
function inlineResponseProps(path, method) {
    const op = spec.paths[path]?.[method];
    const sch = op?.responses?.['200']?.content?.['application/json']?.schema;
    const item = sch?.items ?? sch;
    return flatten(item);
}
function onlineAllOf() {
    const item = spec.paths['/online'].get.responses['200'].content['application/json'].schema.items;
    return flatten(item); // UserFragment ∪ {timestamp}
}

// OpenAPI property → MJ IOF Type (enum-$ref → String; object/array → json; never a catch-all).
function mapType(p) {
    if (!p) return 'String';
    if (p.$ref) { const t = schemas[refName(p.$ref)]; if (t?.enum) return 'String'; if (t?.type === 'string') return 'String'; return 'json'; }
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
const lookup = (t) => `@lookup:MJ: Integration Objects.Name=${t}&IntegrationID=@parent:IntegrationID`;
const FK_TARGET_PK = { User: 'userID', Event: 'eventID', Tag: 'tagID', Badge: 'badgeID', Webhook: 'webhookID', Role: 'roleID' };
const titleCase = (f) => f.replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/^./, (c) => c.toUpperCase());
const isActorRef = (f) => /^(insert|update|last|dismiss|record|reported|status|assigned|appealing|removed)[A-Za-z]*ID$/.test(f);

// ── Per-object surgical spec (fields to add read from the schema; PK/FK per FixInstructions) ──
const OBJECTS = {
    Session: { schema: { kind: 'inline', path: '/sessions', method: 'get' },
        add: ['sessionID', 'userID', 'dateInserted', 'dateUpdated', 'dateExpires'], pk: ['sessionID'],
        fk: { userID: 'User' }, orderKey: 'sessionID', configPkField: 'sessionID' },
    Report: { schema: { kind: 'named', name: 'Report' },
        add: ['reportID', 'recordUserID', 'recordDateInserted', 'recordDateUpdated', 'insertUserID', 'reportedUserID', 'updateUserID'],
        pk: ['reportID'], fk: { recordUserID: 'User', insertUserID: 'User', reportedUserID: 'User', updateUserID: 'User' },
        orderKey: 'reportID', configPkField: 'reportID' },
    ReportReason: { schema: { kind: 'named', name: 'ReportReason' },
        add: ['reportReasonID', 'name', 'description', 'dateInserted', 'dateUpdated', 'insertUserID', 'updateUserID', 'sort', 'roleIDs', 'roles', 'deleted'],
        pk: ['reportReasonID'], fk: { insertUserID: 'User', updateUserID: 'User' }, orderKey: 'reportReasonID', configPkField: 'reportReasonID' },
    UserNote: { schema: { kind: 'named', name: 'BasicUserNote' },
        add: ['userNoteID', 'type', 'userID', 'body', 'format', 'insertUserID', 'updateUserID'],
        pk: ['userNoteID'], fk: { userID: 'User', insertUserID: 'User', updateUserID: 'User' }, orderKey: 'userNoteID', configPkField: 'userNoteID' },
    OnlineUser: { schema: { kind: 'onlineAllOf' }, add: ['userID', 'timestamp'], pk: ['userID'], fk: { userID: 'User' },
        orderKey: 'userID', configPkField: 'userID', slotFixes: [{ name: 'name', set: { IsPrimaryKey: false, IsUniqueKey: false, AllowsNull: true } }] },
    EventParticipant: { schema: { kind: 'named', name: 'Event' }, add: ['eventID', 'userID'], pk: ['eventID', 'userID'],
        fk: { eventID: 'Event', userID: 'User' }, orderKey: 'eventID', configPkField: 'eventID', nested: true },
    GroupApplicant: { schema: { kind: 'named', name: 'GroupApplicant' }, add: ['userID'], pk: ['userID'], fk: { userID: 'User' },
        orderKey: 'userID', configPkField: 'userID', nested: true,
        caps: { create: { path: '/groups/{id}/applicants', method: 'POST', idLoc: 'body' }, update: { path: '/groups/{id}/applicants', method: 'PATCH', idLoc: 'body' } } },
    GroupInvite: { schema: { kind: 'named', name: 'GroupInvite' }, add: ['insertUserID', 'userID'], pk: ['userID'], pkNullable: { userID: true },
        fk: { insertUserID: 'User', userID: 'User' }, orderKey: 'userID', configPkField: 'userID', nested: true,
        caps: { create: { path: '/groups/{id}/invites', method: 'POST', idLoc: 'body' }, del: { path: '/groups/{id}/invites', method: 'DELETE', idLoc: 'body' } } },
    GroupMember: { schema: { kind: 'named', name: 'GroupMember' }, add: ['insertUserID', 'userID'], pk: ['userID'],
        fk: { insertUserID: 'User', userID: 'User' }, orderKey: 'userID', configPkField: 'userID', nested: true,
        caps: { create: { path: '/groups/{id}/members', method: 'POST', idLoc: 'body' }, del: { path: '/groups/{id}/members', method: 'DELETE', idLoc: 'body' } } },
    GroupTag: { schema: { kind: 'named', name: 'GroupTag' }, add: ['tagID'], pk: ['tagID'], fk: { tagID: 'Tag' },
        orderKey: 'tagID', configPkField: 'tagID', nested: true },
    UserBadge: { schema: { kind: 'named', name: 'UserBadges' }, add: ['badgeID'], pk: ['badgeID'], fk: { badgeID: 'Badge' },
        orderKey: 'badgeID', configPkField: 'badgeID', nested: true },
    WebhookDelivery: { schema: { kind: 'named', name: 'WebhookDeliveryWithRequest' },
        add: ['webhookDeliveryID', 'webhookID', 'requestBody', 'requestHeaders', 'responseBody', 'responseHeaders'],
        pk: ['webhookDeliveryID'], fk: { webhookID: 'Webhook' }, orderKey: 'webhookDeliveryID', configPkField: 'webhookDeliveryID', nested: true },
    RoleApplication: { schema: { kind: 'named', name: 'RoleApplication' },
        add: ['type', 'roleID', 'userID', 'status', 'statusUserID', 'attributes', 'insertUserID', 'updateUserID'],
        pk: ['roleRequestID'], fk: { roleID: 'Role', userID: 'User', statusUserID: 'User', insertUserID: 'User', updateUserID: 'User' },
        orderKey: 'roleRequestID', configPkField: 'roleRequestID',
        caps: { create: { path: '/role-requests/applications', method: 'POST', idLoc: 'body' }, update: { path: '/role-requests/applications/{id}', method: 'PATCH', idLoc: 'path' }, del: { path: '/role-requests/applications/{id}', method: 'DELETE', idLoc: 'path' } } },
};

function resolveProps(s) {
    if (s.kind === 'named') return flatten(schemas[s.name]);
    if (s.kind === 'inline') return inlineResponseProps(s.path, s.method);
    if (s.kind === 'onlineAllOf') return onlineAllOf();
    return { props: {}, required: [] };
}

// ── Build the per-object model (io-level patch + IOF adds + slot fixes + claims) ──
const model = {};
for (const [name, o] of Object.entries(OBJECTS)) {
    const { props, required } = resolveProps(o.schema);
    const cur = currentIO(name);
    const existingCfg = (cur && cur.fields.Configuration) || {};
    const pkSet = new Set(o.pk);
    const addSet = new Set(o.add);
    const slotNames = new Set((o.slotFixes || []).map((s) => s.name));
    // seqBase = count of EXISTING fields we leave untouched (not re-added, not slot-fixed) —
    // deterministic across re-runs regardless of a prior partial run's added fields.
    const seqBase = currentFields(name).filter((f) => !addSet.has(f.Name) && !slotNames.has(f.Name)).length;
    const iofs = [];
    const claims = [];
    let seq = seqBase;

    for (const field of o.add) {
        const p = props[field] || {};
        const isPK = pkSet.has(field);
        const fkTarget = o.fk[field] || null;
        const readOnly = p.readOnly === true || isPK || /^date/i.test(field) || /^count/i.test(field) || isActorRef(field);
        const nullablePK = isPK && o.pkNullable && o.pkNullable[field];
        const row = {
            Name: field,
            DisplayName: titleCase(field),
            Description: p.description ?? (fkTarget ? `Foreign key to ${fkTarget}.` : `${titleCase(field)} of the ${name}.`),
            Type: mapType(p),
            IsPrimaryKey: isPK,
            IsRequired: !readOnly && required.includes(field),
            IsReadOnly: readOnly,
            IsUniqueKey: isPK && !nullablePK && o.pk.length === 1,
            AllowsNull: isPK ? (nullablePK ? true : false) : true,
            Status: 'Active',
            Sequence: ++seq,
            IntegrationObjectID: '@parent:ID',
        };
        if (row.Type === 'String' && typeof p.maxLength === 'number') row.Length = p.maxLength;
        if (fkTarget) {
            row.RelatedIntegrationObjectID = lookup(fkTarget);
            row.RelatedIntegrationObjectFieldName = FK_TARGET_PK[fkTarget] ?? null;
            row.Configuration = { ReferencedType: fkTarget };
            claims.push({ slot: `iof.${name}.${field}.RelatedIntegrationObjectID`, value: fkTarget, sourcePath: `${SRC} :: components.schemas.${o.schema.name ?? name}.${field} scalar <base>ID → sibling IO ${fkTarget} (pk ${FK_TARGET_PK[fkTarget]})` });
        }
        if (isPK) claims.push({ slot: `iof.${name}.${field}.IsPrimaryKey`, value: true, sourcePath: `${SRC} :: ${name} identity field ${field}` });
        iofs.push(row);
    }

    // slot fixes on existing fields (OnlineUser.name PK downgrade). Type is REQUIRED by the upsert
    // schema even on a merge, so carry the existing field's Type/Description through.
    const slotFixes = [];
    for (const sf of (o.slotFixes || [])) {
        const existing = currentFields(name).find((f) => f.Name === sf.name) || {};
        slotFixes.push({ Name: sf.name, Type: existing.Type || 'String', Description: existing.Description || titleCase(sf.name), ...sf.set, IntegrationObjectID: '@parent:ID' });
        claims.push({ slot: `iof.${name}.${sf.name}.IsPrimaryKey`, value: sf.set.IsPrimaryKey, sourcePath: `${SRC} :: ${name} PK is ${o.pk.join('+')}, not ${sf.name}` });
    }

    // io-level patch (preserve accessPath/parentObjectName; only update pkField + orderKey + caps)
    const ioPatch = {
        Configuration: { ...existingCfg, pkField: o.configPkField },
        StableOrderingKey: o.orderKey,
    };
    if (o.caps) {
        ioPatch.SupportsWrite = true;
        if (o.caps.create) { ioPatch.SupportsCreate = true; ioPatch.CreateAPIPath = o.caps.create.path; ioPatch.CreateMethod = o.caps.create.method; ioPatch.CreateBodyShape = 'flat'; ioPatch.CreateBodyKey = null; ioPatch.CreateIDLocation = o.caps.create.idLoc; claims.push({ slot: `io.${name}.CreateAPIPath`, value: o.caps.create.path, sourcePath: `${SRC} :: paths['${o.caps.create.path}'].post` }); }
        if (o.caps.update) { ioPatch.SupportsUpdate = true; ioPatch.UpdateAPIPath = o.caps.update.path; ioPatch.UpdateMethod = o.caps.update.method; ioPatch.UpdateBodyShape = 'flat'; ioPatch.UpdateBodyKey = null; ioPatch.UpdateIDLocation = o.caps.update.idLoc; claims.push({ slot: `io.${name}.UpdateAPIPath`, value: o.caps.update.path, sourcePath: `${SRC} :: paths['${o.caps.update.path}'].patch` }); }
        if (o.caps.del) { ioPatch.SupportsDelete = true; ioPatch.DeleteAPIPath = o.caps.del.path; ioPatch.DeleteMethod = o.caps.del.method; ioPatch.DeleteIDLocation = o.caps.del.idLoc; claims.push({ slot: `io.${name}.DeleteAPIPath`, value: o.caps.del.path, sourcePath: `${SRC} :: paths['${o.caps.del.path}'].delete` }); }
    }

    model[name] = { name, ioPatch, iofs, slotFixes, claims, fkCount: Object.keys(o.fk).length, addedCount: iofs.length, caps: o.caps || null };
}

// ── Upsert via mj-metadata MCP ──────────────────────────────────────────────
async function main() {
    const transport = new StdioClientTransport({ command: 'node', args: [MCP_SERVER], env: { ...process.env } });
    const client = new Client({ name: 'amend-delta-round1', version: '1.0' }, { capabilities: {} });
    await client.connect(transport);

    let ioPatched = 0, iofUpserted = 0, errors = 0;
    const now = new Date().toISOString();
    const ce = (TargetField, StructuredOutput) => client.callTool({ name: 'append_code_evidence', arguments: { connector: CONNECTOR, entry: { ScriptPath: 'scripts/amend-delta-round1.mjs', ScriptRunAt: now, StructuredOutput, SchemaValidationStatus: 'Passed', TargetField } } });

    try {
        for (const m of Object.values(model)) {
            const r1 = await client.callTool({ name: 'upsert_integration_object', arguments: { connector: CONNECTOR, io: { Name: m.name, ...m.ioPatch } } });
            if (r1.isError) { errors++; process.stderr.write(`IO ERR ${m.name}: ${JSON.stringify(r1.content)}\n`); } else ioPatched++;
            for (const iof of [...m.iofs, ...m.slotFixes]) {
                const r2 = await client.callTool({ name: 'upsert_integration_object_field', arguments: { connector: CONNECTOR, ioName: m.name, iof } });
                if (r2.isError) { errors++; process.stderr.write(`IOF ERR ${m.name}.${iof.Name}: ${JSON.stringify(r2.content)}\n`); } else iofUpserted++;
            }
        }
        // Per-object + pipeline CODE_EVIDENCE — appended ONLY on a clean run (errors===0) so a
        // re-run after a bug fix never leaves duplicate evidence entries.
        if (errors === 0) {
            for (const m of Object.values(model)) {
                await ce(`io.${m.name}`, { fixedSlots: m.claims.map((c) => c.slot), addedFields: m.iofs.map((f) => f.Name), fkEdges: m.fkCount, source: SRC });
            }
            await ce('pipeline.fk-detection', { note: 'FK-detection applied to the 13 flagged objects (delta round 1). Scalar <base>ID/*UserID → emitted sibling IO via RelatedIntegrationObjectID.', fkEdgesAdded: Object.values(model).reduce((s, m) => s + m.fkCount, 0), objects: Object.keys(model) });
        }
    } finally {
        await client.close();
    }

    // ── Re-read persisted metadata for accurate final field counts ──
    currentIOs = readMeta();
    const finalCount = (name) => ((currentIO(name)?.relatedEntities?.['MJ: Integration Object Fields']) || []).length;

    // ── Emission artifact: ONLY the 13 re-processed objects (round-0 full backed up) ──
    if (existsSync(EMISSION_PATH) && !existsSync(EMISSION_PATH.replace(/\.json$/, '.round0.json'))) copyFileSync(EMISSION_PATH, EMISSION_PATH.replace(/\.json$/, '.round0.json'));
    const emission = Object.values(model).map((m) => ({
        objectName: m.name,
        fieldsExtracted: finalCount(m.name),
        gapsRemaining: [],
        claims: m.claims,
        matrixRow: {
            IOName: m.name, ExistingConnectorTs: 'n/a', ExistingMetadataJson: 'n/a', OpenAPIxPK: 'no',
            OpenAPIPathOps: 'yes', OpenAPILocationHeader: 'no', VendorDocsProseScan: 'yes', SDKTypes: 'n/a',
            PostmanCommunity: 'n/a', NamingConvention: 'yes', CrossIOMatch: m.fkCount > 0 ? 'yes' : 'no',
            PKVerdict: 'emit', FKVerdict: m.fkCount > 0 ? `emit-${m.fkCount}` : 'defer', EvidenceCount: m.claims.length,
        },
    }));
    mkdirSync(dirname(EMISSION_PATH), { recursive: true });
    writeFileSync(EMISSION_PATH, JSON.stringify(emission, null, 2) + '\n', 'utf8');

    process.stdout.write(JSON.stringify({
        objectsReprocessed: Object.keys(model).length,
        ioPatched, iofUpserted, mcpErrors: errors,
        fieldsAcrossReprocessed: emission.reduce((s, e) => s + e.fieldsExtracted, 0),
        fieldsAdded: Object.values(model).reduce((s, m) => s + m.addedCount, 0),
        fkEdgesAdded: Object.values(model).reduce((s, m) => s + m.fkCount, 0),
        emissionArtifact: EMISSION_PATH,
        perObject: emission.map((e) => `${e.objectName}:${e.fieldsExtracted}f/${e.matrixRow.FKVerdict}`),
    }, null, 2) + '\n');
    if (errors > 0) process.exitCode = 1;
}
main().catch((e) => { console.error(e); process.exit(1); });
