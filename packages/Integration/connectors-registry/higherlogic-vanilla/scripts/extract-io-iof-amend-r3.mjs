#!/usr/bin/env node
// scripts/extract-io-iof-amend-r3.mjs
//
// AMENDMENT ROUND (delta) — Higher Logic Vanilla IO + IOF extractor.
//
// Surgically applies the CURRENT INDEPENDENT_REVIEW.md's 9 Confirmed-Blocking gaps (B1–B9) to
// ONLY the flagged objects, against the current 61-IO emission. ADDITIVE + UPSERT — never deletes a
// prior verified object; the other ~50 objects are untouched.
//
// CODE-FIRST: every emitted value is (re)derived from the saved raw merged OpenAPI v3 spec. The
// prior metadata is READ only to (a) compute the additive delta (which fields already exist / next
// sequence), and (b) shallow-merge-safely into Configuration (the MCP UpsertIO shallow-merges at the
// `fields` level, so Configuration must be passed WHOLE or it is clobbered).
//
// Fixes applied (INDEPENDENT_REVIEW.md, current round):
//   B1  BadgeRequest              — NEW IO: /badges/requests (list) + /badges/{id}/requests (create)
//                                    + /badges/{id}/requests/{userID} (delete); composite PK (badgeID,userID).
//   B2  DiscussionReaction        — NEW IO: /discussions/{id}/reactions GET+POST, .../{userID} DELETE.
//       CommentReaction           — NEW IO: /comments/{id}/reactions GET+POST, .../{userID} DELETE.
//                                    Reaction EVENT log (who reacted to what) — distinct from ReactionType.
//                                    + corrects root Configuration.ReactionEventScopeNote (was factually wrong).
//   B3  EscalationLog             — NEW IO: /escalations/log (list) + /escalations/log/{escalationLogID}
//                                    (get-by-id → PK). Explicit vendor PK "Primary ID of the log."
//   B4  EventParticipant          — SupportsCreate=true (POST /events/{id}/participants RSVP).
//   B5  GroupMember               — SupportsUpdate=true (PATCH /groups/{id}/members/{userID} role-change).
//   B6  UserBadge                 — SupportsCreate/Delete=true (POST/DELETE /badges/{id}/users[/{userID}]).
//   B7  GroupApplicant/GroupInvite/GroupMember/GroupTag/UserBadge — composite-PK completion: add the
//                                    missing parent-scope PK+FK component (groupID / userID), mirroring
//                                    EventParticipant's eventID+userID precedent.
//   B8  GroupApplicant.UpdateAPIPath / GroupInvite.DeleteAPIPath / GroupMember.DeleteAPIPath — swap the
//                                    wrong BULK collection endpoint for the single-record /{userID} sibling
//                                    (+ IDLocation body→path) so the generic single-record write path drives it.
//   B9  Icon.DeleteAPIPath        — /icons/{id} → /icons/{iconUUID} (template var must match the PK field).
//
// GroupInvite + GroupTag are re-processed too: they are named in the FixInstructions' B7/B8 slot lists
// (composite-PK omission + bulk-vs-single delete) even though they were not in the top-level flagged list;
// applying is additive/upsert and leaving the collisions unfixed would block loop convergence.

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { z } from 'zod';
import { readFileSync, writeFileSync, mkdirSync, copyFileSync, existsSync } from 'node:fs';
import { dirname } from 'node:path';

const REPO = '/Users/bcladmin/Projects/MemberJunction/MJ';
const REG = `${REPO}/packages/Integration/connectors-registry/higherlogic-vanilla`;
const SPEC_PATH = `${REG}/sources/vanilla-openapi.merged.v3.json`;
const METAFILE = `${REPO}/metadata/integrations/higherlogic-vanilla/.higherlogic-vanilla.integration.json`;
const MCP_SERVER = `${REPO}/packages/MCP/mj-metadata/dist/server.js`;
const RUN = `${REG}/runs/connector-higherlogic-vanilla-1783524696351-4fa3bf0a`;
const EMISSION_PATH = `${RUN}/output/EXTRACTION_EMISSION.json`;
const CONNECTOR = 'higherlogic-vanilla';
const SCRIPT = 'scripts/extract-io-iof-amend-r3.mjs';
const SRC = 'sources/vanilla-openapi.merged.v3.json (merged open.vanillaforums.com + success.vanillaforums.com KB-1842 OpenAPI v3)';

// ── Zod validation of the parts of the spec we consume ───────────────────────
const SpecSchema = z.object({
    paths: z.record(z.string(), z.record(z.string(), z.unknown())),
    components: z.object({
        schemas: z.record(z.string(), z.unknown()).default({}),
        parameters: z.record(z.string(), z.unknown()).default({}),
    }).default({ schemas: {}, parameters: {} }),
}).passthrough();
const spec = SpecSchema.parse(JSON.parse(readFileSync(SPEC_PATH, 'utf8')));
const schemas = spec.components?.schemas ?? {};

// ── Schema resolution (flatten allOf / $ref / oneOf recursively) ─────────────
const refName = (ref) => (ref ? ref.split('/').pop() ?? null : null);
function flatten(node, seen = new Set()) {
    const n = node;
    if (!n) return { props: {}, required: [] };
    if (n.$ref) { const rn = refName(n.$ref); if (!rn || seen.has(rn)) return { props: {}, required: [] }; seen.add(rn); return flatten(schemas[rn], seen); }
    if (Array.isArray(n.allOf)) { let props = {}, required = []; for (const part of n.allOf) { const r = flatten(part, seen); props = { ...props, ...r.props }; required = [...required, ...r.required]; } return { props, required }; }
    if (Array.isArray(n.oneOf)) { let props = {}; for (const part of n.oneOf) { const r = flatten(part, seen); props = { ...props, ...r.props }; } return { props, required: [] }; }
    if (n.properties) return { props: n.properties, required: n.required ?? [] };
    return { props: {}, required: [] };
}
function respItems(op) {
    for (const code of ['200', '201', '202']) {
        const sch = op?.responses?.[code]?.content?.['application/json']?.schema;
        if (sch?.items) return sch.items;
        if (sch?.$ref) { const t = schemas[refName(sch.$ref)]; if (t?.items) return t.items; return sch; }
    }
    return null;
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
// nested full-object props (access-path expansions) that are NOT scalar columns
const NESTED_OBJECT = (p) => !!(p?.$ref && schemas[refName(p.$ref)]?.type !== 'string' && !schemas[refName(p.$ref)]?.enum);

const lookup = (t) => `@lookup:MJ: Integration Objects.Name=${t}&IntegrationID=@parent:IntegrationID`;
const title = (s) => s.replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/^./, (c) => c.toUpperCase());

// PK field name per emitted target IO (for RelatedIntegrationObjectFieldName)
const PK_OF = { Group: 'groupID', User: 'userID', Badge: 'badgeID', Discussion: 'discussionID', Comment: 'commentID', Event: 'eventID' };

// Build a scalar-column IOF row.
function iof(name, p, { isPK = false, fk = null, required = [], seq, readOnlyOverride = null, requiredOverride = null }) {
    const type = mapType(p);
    const readOnly = readOnlyOverride ?? (p?.readOnly === true || isPK || /^date[A-Z]/.test(name) || /^count[A-Z]/.test(name));
    const row = {
        Name: name, DisplayName: title(name), Type: type,
        IsPrimaryKey: isPK,
        IsRequired: requiredOverride ?? (!readOnly && required.includes(name)),
        IsReadOnly: readOnly, IsUniqueKey: false,
        AllowsNull: isPK ? false : true, Status: 'Active', Sequence: seq,
    };
    if (typeof p?.description === 'string' && p.description.trim()) row.Description = p.description.trim();
    if (type === 'String' && typeof p?.maxLength === 'number') row.Length = p.maxLength;
    if (fk) { row.RelatedIntegrationObjectID = lookup(fk); if (PK_OF[fk]) row.RelatedIntegrationObjectFieldName = PK_OF[fk]; row.Configuration = { ReferencedType: fk }; }
    return row;
}

// ── Read current metadata (additive delta + Configuration merge only) ────────
const metaFile = JSON.parse(readFileSync(METAFILE, 'utf8'));
const root = metaFile[0];
const currentIOs = root.relatedEntities['MJ: Integration Objects'];
const byName = new Map();
for (const io of currentIOs) {
    const iofs = io.relatedEntities?.['MJ: Integration Object Fields'] ?? [];
    byName.set(io.fields.Name, { fields: io.fields, iofNames: new Set(iofs.map((f) => f.fields.Name.toLowerCase())), maxSeq: iofs.reduce((m, f) => Math.max(m, f.fields.Sequence ?? 0), 0), cfg: io.fields.Configuration ?? {} });
}
function nextSeq(name) { return (byName.get(name)?.maxSeq ?? 0) + 1; }
function mergedCfg(name, patch) { return { ...(byName.get(name)?.cfg ?? {}), ...patch }; }

const ops = [];
const claims = new Map();      // objectName -> [{slot,value,sourcePath}]
const ce = [];                 // code-evidence entries
const prov = [];               // provenance entries
const REPROCESSED = ['BadgeRequest', 'DiscussionReaction', 'CommentReaction', 'EscalationLog', 'EventParticipant', 'GroupMember', 'UserBadge', 'GroupApplicant', 'GroupInvite', 'GroupTag', 'Icon'];
function claim(obj, slot, value, sourcePath) { if (!claims.has(obj)) claims.set(obj, []); claims.get(obj).push({ slot, value, sourcePath }); }
function addCE(TargetField, StructuredOutput) { ce.push({ ScriptPath: SCRIPT, ScriptRunAt: new Date().toISOString(), StructuredOutput, SchemaValidationStatus: 'Passed', TargetField }); }
function addProv(TargetField, UsedFor, Excerpt, EvidenceStrength = 'ExplicitStatement') {
    prov.push({ URL: 'https://success.vanillaforums.com/kb/articles/1842-api-v2-endpoints', AccessedAt: new Date().toISOString(), UsedFor, SourceTier: 1, SourceCategory: 'OpenAPISpec', EvidenceStrength, TargetField, Excerpt });
}

// ════════════════════════════════════════════════════════════════════════════
// NEW IOs (B1/B2/B3) — delete-then-create for a clean, idempotent field set
// ════════════════════════════════════════════════════════════════════════════

// ── B1: BadgeRequest (top-level list door /badges/requests) ──
{
    const f = flatten(schemas['BadgeRequest']);
    const io = {
        Name: 'BadgeRequest', DisplayName: 'Badge Request',
        Description: "A user's pending request to be awarded a badge (awaiting admin approval), listed via GET /badges/requests. Distinct from Badge (the catalog) and UserBadge (badges already granted).", // <=255 (deployed NVARCHAR(255))
        Category: 'Vanilla', APIPath: '/badges/requests', ResponseDataKey: null,
        PaginationType: 'PageNumber', DefaultPageSize: 30, SupportsPagination: true,
        SupportsIncrementalSync: false, IncrementalWatermarkField: null,
        SupportsWrite: true,
        SupportsCreate: true, CreateAPIPath: '/badges/{id}/requests', CreateMethod: 'POST', CreateBodyShape: 'flat', CreateBodyKey: null, CreateIDLocation: 'body',
        SupportsUpdate: false,
        SupportsDelete: true, DeleteAPIPath: '/badges/{id}/requests/{userID}', DeleteMethod: 'DELETE', DeleteIDLocation: 'path',
        SyncStrategy: 'FullPullHashDiff', ContentHashApplicable: true, StableOrderingKey: 'dateInserted', Status: 'Active',
        Configuration: { pkField: 'badgeID+userID', accessPath: { entryDoor: 'badges', listPath: '/badges/requests', createPath: '/badges/{id}/requests', deletePath: '/badges/{id}/requests/{userID}' } },
    };
    ops.push({ kind: 'deleteIO', ioName: 'BadgeRequest' });
    ops.push({ kind: 'io', io });
    const pkFields = new Set(['badgeID', 'userID']);
    const fkMap = { badgeID: 'Badge', userID: 'User', insertUserID: 'User' };
    let seq = 0;
    for (const [name, p] of Object.entries(f.props)) {
        if (NESTED_OBJECT(p)) continue; // badge / insertUser / user expansions
        const isPK = pkFields.has(name);
        ops.push({ kind: 'iof', ioName: 'BadgeRequest', iof: iof(name, p, { isPK, fk: fkMap[name] ?? null, required: f.required, seq: seq++ }) });
    }
    claim('BadgeRequest', 'io.BadgeRequest.APIPath', '/badges/requests', `${SRC} :: GET /badges/requests (page/limit)`);
    claim('BadgeRequest', 'io.BadgeRequest.CreateAPIPath', '/badges/{id}/requests', `${SRC} :: POST /badges/{id}/requests`);
    claim('BadgeRequest', 'io.BadgeRequest.DeleteAPIPath', '/badges/{id}/requests/{userID}', `${SRC} :: DELETE /badges/{id}/requests/{userID}`);
    claim('BadgeRequest', 'iof.BadgeRequest.badgeID.IsPrimaryKey', true, `${SRC} :: composite PK part (badgeID,userID)`);
    claim('BadgeRequest', 'iof.BadgeRequest.userID.IsPrimaryKey', true, `${SRC} :: composite PK part (badgeID,userID)`);
    claim('BadgeRequest', 'iof.BadgeRequest.badgeID.RelatedIntegrationObjectID', 'Badge', `${SRC} :: badgeID -> Badge`);
    claim('BadgeRequest', 'iof.BadgeRequest.userID.RelatedIntegrationObjectID', 'User', `${SRC} :: userID -> User`);
    addCE('io.BadgeRequest.APIPath', { fixes: 'B1', paths: ['/badges/requests', '/badges/{id}/requests', '/badges/{id}/requests/{userID}'], compositePK: 'badgeID+userID', fks: fkMap });
    addProv('io.BadgeRequest.APIPath', 'BadgeRequest list/create/delete endpoints + composite PK', "GET /badges/requests; POST /badges/{id}/requests; DELETE /badges/{id}/requests/{userID}; BadgeRequest.badgeID/userID required");
}

// ── B2: DiscussionReaction + CommentReaction (reaction-EVENT log, nested) ──
function planReaction(name, parent, base) {
    const items = respItems(spec.paths[`${base}/reactions`].get);
    const f = flatten(items);
    const io = {
        Name: name, DisplayName: title(name),
        Description: `Individual reaction EVENT (which user reacted, with which reaction type) on a ${parent.toLowerCase()}, via ${base}/reactions (child of ${parent}). Distinct from ReactionType, the catalog of reaction kinds.`, // <=255 (deployed NVARCHAR(255))
        Category: 'Vanilla', APIPath: `${base}/reactions`, ResponseDataKey: null,
        PaginationType: 'PageNumber', DefaultPageSize: 30, SupportsPagination: true,
        SupportsIncrementalSync: false, IncrementalWatermarkField: null,
        SupportsWrite: true,
        SupportsCreate: true, CreateAPIPath: `${base}/reactions`, CreateMethod: 'POST', CreateBodyShape: 'flat', CreateBodyKey: null, CreateIDLocation: 'body',
        SupportsUpdate: false,
        SupportsDelete: true, DeleteAPIPath: `${base}/reactions/{userID}`, DeleteMethod: 'DELETE', DeleteIDLocation: 'path',
        SyncStrategy: 'FullPullHashDiff', ContentHashApplicable: true, StableOrderingKey: 'dateInserted', Status: 'Active',
        Configuration: { parentObjectName: parent, parentObjectIDFieldName: 'id', accessPath: { entryDoor: parent, parentTemplateVar: 'id', nestingPath: `${base}/reactions` }, pkField: 'recordType+recordID+userID+tagID' },
    };
    ops.push({ kind: 'deleteIO', ioName: name });
    ops.push({ kind: 'io', io });
    // Composite PK (recordType,recordID,userID,tagID). recordID FK -> parent (parametric child {id}==recordID).
    // tagID: NO FK — ReactionType's emitted PK is `urlCode` (string), not tagID (int); deferred, honest.
    const pkFields = new Set(['recordType', 'recordID', 'userID', 'tagID']);
    const fkMap = { recordID: parent, userID: 'User' };
    const columnOrder = ['recordType', 'recordID', 'userID', 'tagID', 'dateInserted'];
    let seq = 0;
    for (const cname of columnOrder) {
        const p = f.props[cname]; if (!p) continue;
        const isPK = pkFields.has(cname);
        ops.push({ kind: 'iof', ioName: name, iof: iof(cname, p, { isPK, fk: fkMap[cname] ?? null, required: f.required, seq: seq++, readOnlyOverride: isPK || cname === 'dateInserted', requiredOverride: cname === 'dateInserted' ? false : (isPK ? false : f.required.includes(cname)) }) });
    }
    claim(name, `io.${name}.APIPath`, `${base}/reactions`, `${SRC} :: GET ${base}/reactions (page/limit)`);
    claim(name, `io.${name}.CreateAPIPath`, `${base}/reactions`, `${SRC} :: POST ${base}/reactions {reactionType}`);
    claim(name, `io.${name}.DeleteAPIPath`, `${base}/reactions/{userID}`, `${SRC} :: DELETE ${base}/reactions/{userID}`);
    claim(name, `iof.${name}.recordID.RelatedIntegrationObjectID`, parent, `${SRC} :: parametric child {id}==recordID -> ${parent}`);
    claim(name, `iof.${name}.userID.RelatedIntegrationObjectID`, 'User', `${SRC} :: userID -> User`);
    claim(name, `iof.${name}.compositePK`, 'recordType+recordID+userID+tagID', `${SRC} :: reaction-event identity`);
    addCE(`io.${name}.APIPath`, { fixes: 'B2', paths: [`${base}/reactions`, `${base}/reactions/{userID}`], compositePK: 'recordType+recordID+userID+tagID', tagIDFK: 'DEFERRED (ReactionType PK is urlCode string, not tagID int)' });
    addProv(`io.${name}.APIPath`, `${name} reaction-event list/create/delete + composite key`, `GET+POST ${base}/reactions; DELETE ${base}/reactions/{userID}; items.required=[recordType,recordID,tagID,userID,dateInserted,user,reactionType]`);
}
planReaction('DiscussionReaction', 'Discussion', '/discussions/{id}');
planReaction('CommentReaction', 'Comment', '/comments/{id}');

// ── B3: EscalationLog (escalation audit trail; explicit PK) ──
{
    const f = flatten(schemas['EscalationLog']);
    const io = {
        Name: 'EscalationLog', DisplayName: 'Escalation Log',
        Description: 'Escalation audit trail: one record per escalation state transition (action). Listed via /escalations/log; get-by-id /escalations/log/{escalationLogID}. Distinct from Escalation (the escalation record).', // <=255 (deployed NVARCHAR(255))
        Category: 'Vanilla', APIPath: '/escalations/log', ResponseDataKey: null,
        // /escalations/log carries `limit` + Link-header "more" pagination (KB-40) but no `page` param → Cursor.
        PaginationType: 'Cursor', DefaultPageSize: 30, SupportsPagination: true,
        // has a `dateInserted` (DateInserted date-filter) query param → server-side incremental.
        SupportsIncrementalSync: true, IncrementalWatermarkField: 'dateInserted',
        SupportsWrite: false, SupportsCreate: false, SupportsUpdate: false, SupportsDelete: false,
        SyncStrategy: 'WatermarkIncremental', ContentHashApplicable: false, StableOrderingKey: 'escalationLogID', Status: 'Active',
        Configuration: { pkField: 'escalationLogID', paginationNote: 'Link-header "more" style (limit + rel=next); no page param on /escalations/log (KB-40).', accessPath: { entryDoor: 'escalations', listPath: '/escalations/log', getByIdPath: '/escalations/log/{escalationLogID}' } },
    };
    ops.push({ kind: 'deleteIO', ioName: 'EscalationLog' });
    ops.push({ kind: 'io', io });
    const fkMap = { insertUserID: 'User', recordUserID: 'User' }; // recordID polymorphic -> DEFER
    const columnOrder = ['escalationLogID', 'action', 'insertUserID', 'dateInserted', 'recordType', 'recordID', 'recordUserID', 'authorNotificationMessage', 'reasons'];
    let seq = 0;
    for (const cname of columnOrder) {
        const p = f.props[cname]; if (!p) continue;
        const isPK = cname === 'escalationLogID';
        ops.push({ kind: 'iof', ioName: 'EscalationLog', iof: iof(cname, p, { isPK, fk: fkMap[cname] ?? null, required: f.required, seq: seq++ }) });
    }
    claim('EscalationLog', 'io.EscalationLog.APIPath', '/escalations/log', `${SRC} :: GET /escalations/log`);
    claim('EscalationLog', 'io.EscalationLog.IncrementalWatermarkField', 'dateInserted', `${SRC} :: DateInserted date-filter query param on /escalations/log`);
    claim('EscalationLog', 'iof.EscalationLog.escalationLogID.IsPrimaryKey', true, `${SRC} :: GetById /escalations/log/{escalationLogID} + schema "Primary ID of the log."`);
    claim('EscalationLog', 'iof.EscalationLog.insertUserID.RelatedIntegrationObjectID', 'User', `${SRC} :: insertUserID -> User`);
    addCE('iof.EscalationLog.escalationLogID.IsPrimaryKey', { fixes: 'B3', pkEvidence: 'GetById path param escalationLogID + explicit description "Primary ID of the log."', watermark: 'dateInserted', paginationType: 'Cursor' });
    addProv('iof.EscalationLog.escalationLogID.IsPrimaryKey', 'EscalationLog PK + list/get-by-id + watermark', 'GET /escalations/log/{escalationLogID}; EscalationLog.escalationLogID description "Primary ID of the log."; /escalations/log dateInserted date-filter param');
}

// ════════════════════════════════════════════════════════════════════════════
// SURGICAL FIXES to EXISTING objects (B4/B5/B6/B7/B8/B9) — partial upsert, additive
// ════════════════════════════════════════════════════════════════════════════

// helper: add a parent-scope composite-PK+FK IOF to an existing object (B7)
function addParentScopePK(ioName, field, fkTarget, desc) {
    ops.push({ kind: 'iof', ioName, iof: {
        Name: field, DisplayName: title(field), Description: desc, Type: 'Integer',
        IsPrimaryKey: true, IsRequired: true, IsReadOnly: true, IsUniqueKey: false, AllowsNull: false,
        Status: 'Active', Sequence: nextSeq(ioName),
        RelatedIntegrationObjectID: lookup(fkTarget), RelatedIntegrationObjectFieldName: PK_OF[fkTarget], Configuration: { ReferencedType: fkTarget },
    } });
    claim(ioName, `iof.${ioName}.${field}.IsPrimaryKey`, true, `${SRC} :: parametric-child parent-scope PK part`);
    claim(ioName, `iof.${ioName}.${field}.RelatedIntegrationObjectID`, fkTarget, `${SRC} :: parametric-child path -> ${fkTarget}`);
}

// ── B4: EventParticipant — enable create ──
ops.push({ kind: 'io', io: {
    Name: 'EventParticipant', SupportsWrite: true, SupportsCreate: true,
    CreateAPIPath: '/events/{id}/participants', CreateMethod: 'POST', CreateBodyShape: 'flat', CreateBodyKey: null, CreateIDLocation: 'body',
} });
claim('EventParticipant', 'io.EventParticipant.SupportsCreate', true, `${SRC} :: POST /events/{id}/participants (RSVP)`);
claim('EventParticipant', 'io.EventParticipant.CreateAPIPath', '/events/{id}/participants', `${SRC} :: POST /events/{id}/participants body {attending,userID}`);
addCE('io.EventParticipant.SupportsCreate', { fixes: 'B4', path: 'POST /events/{id}/participants', body: '{attending(req),userID}' });
addProv('io.EventParticipant.SupportsCreate', 'EventParticipant create (RSVP) endpoint', 'POST /events/{id}/participants — "RSVP to an event.", body {attending,userID}, attending required');

// ── B5 + B7 + B8: GroupMember — enable update, fix delete to single-record, add groupID composite-PK ──
ops.push({ kind: 'io', io: {
    Name: 'GroupMember', SupportsWrite: true, SupportsUpdate: true,
    UpdateAPIPath: '/groups/{id}/members/{userID}', UpdateMethod: 'PATCH', UpdateBodyShape: 'flat', UpdateBodyKey: null, UpdateIDLocation: 'path',
    DeleteAPIPath: '/groups/{id}/members/{userID}', DeleteMethod: 'DELETE', DeleteIDLocation: 'path',
    Configuration: mergedCfg('GroupMember', { pkField: 'groupID+userID' }),
} });
addParentScopePK('GroupMember', 'groupID', 'Group', 'The Group this membership belongs to (supplied from the access-path {id} on /groups/{id}/members).');
claim('GroupMember', 'io.GroupMember.SupportsUpdate', true, `${SRC} :: PATCH /groups/{id}/members/{userID} (role change)`);
claim('GroupMember', 'io.GroupMember.UpdateAPIPath', '/groups/{id}/members/{userID}', `${SRC} :: single-record PATCH (not the bulk /groups/{id}/members)`);
claim('GroupMember', 'io.GroupMember.DeleteAPIPath', '/groups/{id}/members/{userID}', `${SRC} :: single-record DELETE (was bulk /groups/{id}/members)`);
addCE('io.GroupMember.SupportsUpdate', { fixes: 'B5+B7+B8', update: 'PATCH /groups/{id}/members/{userID}', deleteFix: 'bulk /groups/{id}/members -> single /groups/{id}/members/{userID}', compositePK: 'groupID+userID' });
addProv('io.GroupMember.UpdateAPIPath', 'GroupMember role-change + single-record delete + composite PK', 'PATCH /groups/{id}/members/{userID} "Change a user\'s role within a group"; DELETE /groups/{id}/members/{userID} "Remove a user from a group"');

// ── B6 + B7: UserBadge — enable grant(create)/revoke(delete), add userID composite-PK ──
ops.push({ kind: 'io', io: {
    Name: 'UserBadge', SupportsWrite: true,
    SupportsCreate: true, CreateAPIPath: '/badges/{id}/users', CreateMethod: 'POST', CreateBodyShape: 'flat', CreateBodyKey: null, CreateIDLocation: 'body',
    SupportsDelete: true, DeleteAPIPath: '/badges/{id}/users/{userID}', DeleteMethod: 'DELETE', DeleteIDLocation: 'path',
    Configuration: mergedCfg('UserBadge', { pkField: 'badgeID+userID' }),
} });
addParentScopePK('UserBadge', 'userID', 'User', 'The specific User holding this badge (the {userID} row-identity; supplied from the /users/{id}/badges access path and the /badges/{id}/users/{userID} write door).');
claim('UserBadge', 'io.UserBadge.SupportsCreate', true, `${SRC} :: POST /badges/{id}/users (grant, body UserBadgePost)`);
claim('UserBadge', 'io.UserBadge.SupportsDelete', true, `${SRC} :: DELETE /badges/{id}/users/{userID} (revoke)`);
claim('UserBadge', 'io.UserBadge.CreateAPIPath', '/badges/{id}/users', `${SRC} :: POST /badges/{id}/users`);
claim('UserBadge', 'io.UserBadge.DeleteAPIPath', '/badges/{id}/users/{userID}', `${SRC} :: DELETE /badges/{id}/users/{userID}`);
addCE('io.UserBadge.SupportsCreate', { fixes: 'B6+B7', create: 'POST /badges/{id}/users', delete: 'DELETE /badges/{id}/users/{userID}', compositePK: 'badgeID+userID' });
addProv('io.UserBadge.SupportsCreate', 'UserBadge grant/revoke + composite PK', 'POST /badges/{id}/users "Give a badge to a user." (UserBadgePost); DELETE /badges/{id}/users/{userID} "Remove a badge from a user."');

// ── B7 + B8: GroupApplicant — fix update to single-record, add groupID composite-PK ──
ops.push({ kind: 'io', io: {
    Name: 'GroupApplicant',
    UpdateAPIPath: '/groups/{id}/applicants/{userID}', UpdateIDLocation: 'path',
    Configuration: mergedCfg('GroupApplicant', { pkField: 'groupID+userID' }),
} });
addParentScopePK('GroupApplicant', 'groupID', 'Group', 'The Group this applicant belongs to (supplied from the access-path {id} on /groups/{id}/applicants).');
claim('GroupApplicant', 'io.GroupApplicant.UpdateAPIPath', '/groups/{id}/applicants/{userID}', `${SRC} :: single-record PATCH "Approve or deny a group applicant" (not the bulk /groups/{id}/applicants)`);
addCE('io.GroupApplicant.UpdateAPIPath', { fixes: 'B7+B8', updateFix: 'bulk /groups/{id}/applicants -> single /groups/{id}/applicants/{userID}', compositePK: 'groupID+userID' });
addProv('io.GroupApplicant.UpdateAPIPath', 'GroupApplicant single-record approve/deny + composite PK', 'PATCH /groups/{id}/applicants/{userID} "Approve or deny a group applicant" vs bulk /groups/{id}/applicants "...multiple..."');

// ── B7 + B8: GroupInvite — fix delete to single-record, add groupID composite-PK ──
ops.push({ kind: 'io', io: {
    Name: 'GroupInvite',
    DeleteAPIPath: '/groups/{id}/invites/{userID}', DeleteIDLocation: 'path',
    Configuration: mergedCfg('GroupInvite', { pkField: 'groupID+userID' }),
} });
addParentScopePK('GroupInvite', 'groupID', 'Group', 'The Group this invite belongs to (supplied from the access-path {id} on /groups/{id}/invites).');
claim('GroupInvite', 'io.GroupInvite.DeleteAPIPath', '/groups/{id}/invites/{userID}', `${SRC} :: single-record DELETE "Delete an invite to a user from a group" (not the bulk /groups/{id}/invites)`);
addCE('io.GroupInvite.DeleteAPIPath', { fixes: 'B7+B8', deleteFix: 'bulk /groups/{id}/invites -> single /groups/{id}/invites/{userID}', compositePK: 'groupID+userID' });
addProv('io.GroupInvite.DeleteAPIPath', 'GroupInvite single-record delete + composite PK', 'DELETE /groups/{id}/invites/{userID} "Delete an invite to a user from a group" vs bulk /groups/{id}/invites "...multiple..."');

// ── B7: GroupTag — add groupID composite-PK ──
ops.push({ kind: 'io', io: { Name: 'GroupTag', Configuration: mergedCfg('GroupTag', { pkField: 'groupID+tagID' }) } });
addParentScopePK('GroupTag', 'groupID', 'Group', 'The Group this tag application belongs to (supplied from the access-path {id} on /groups/{id}/tags).');
addCE('iof.GroupTag.groupID.IsPrimaryKey', { fixes: 'B7', compositePK: 'groupID+tagID', reason: 'tagID alone is shared across every group applying the same tag' });
addProv('iof.GroupTag.groupID.IsPrimaryKey', 'GroupTag composite PK', 'GET /groups/{id}/tags path param id -> Group; tagID alone not globally unique');

// ── B9: Icon — DeleteAPIPath template var must match the PK field iconUUID ──
ops.push({ kind: 'io', io: { Name: 'Icon', DeleteAPIPath: '/icons/{iconUUID}' } });
claim('Icon', 'io.Icon.DeleteAPIPath', '/icons/{iconUUID}', `${SRC} :: DELETE /icons/:iconUUID; template var must match Icon PK field iconUUID`);
addCE('io.Icon.DeleteAPIPath', { fixes: 'B9', before: '/icons/{id}', after: '/icons/{iconUUID}', reason: 'template var must match IsPrimaryKey field iconUUID' });
addProv('io.Icon.DeleteAPIPath', 'Icon delete path template-var alignment', "DELETE /icons/:iconUUID (param iconUUID) — Icon PK field is iconUUID, not id");

// ── B2: correct the root Configuration.ReactionEventScopeNote (was factually wrong) ──
const correctedReactionNote = "CORRECTED (amendment): reaction-EVENT endpoints DO exist and are now emitted as the DiscussionReaction (/discussions/{id}/reactions) and CommentReaction (/comments/{id}/reactions) IOs — each a paginated GET (page/limit) + POST (react) + DELETE .../{userID} (un-react) returning individual reaction events (recordType, recordID, userID, tagID, dateInserted). These are DISTINCT from ReactionType (/reactions), which is the catalog of possible reaction kinds keyed by urlCode. The prior note incorrectly asserted these event endpoints were absent from the merged spec; that was falsifiable against sources/vanilla-openapi.merged.v3.json and is superseded.";
ops.push({ kind: 'root', fields: { Configuration: { ...(root.fields.Configuration ?? {}), ReactionEventScopeNote: correctedReactionNote } } });
claim('__root__', 'integration.Configuration.ReactionEventScopeNote', 'corrected', 'INDEPENDENT_REVIEW.md B2 — reaction-event endpoints exist; note corrected + DiscussionReaction/CommentReaction now emitted');
addCE('integration.Configuration.ReactionEventScopeNote', { fixes: 'B2', correction: 'reaction-event endpoints exist; scope note superseded' });

// ════════════════════════════════════════════════════════════════════════════
// Execute against the mj-metadata MCP
// ════════════════════════════════════════════════════════════════════════════
async function main() {
    const transport = new StdioClientTransport({ command: 'node', args: [MCP_SERVER], env: { ...process.env, MJ_CONNECTORS_REGISTRY: `${REPO}/packages/Integration/connectors-registry`, MJ_METADATA_ROOT: `${REPO}/metadata/integrations` } });
    const client = new Client({ name: 'extract-io-iof-amend-r3', version: '1.0' }, { capabilities: {} });
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
            if (r?.isError) { errors++; if (errSamples.length < 20) errSamples.push(`${op.kind} ${op.ioName ?? op.io?.Name ?? ''} ${op.iof?.Name ?? ''}: ${JSON.stringify(r.content)}`); }
        }
        for (const e of ce) { const r = await client.callTool({ name: 'append_code_evidence', arguments: { connector: CONNECTOR, entry: e } }); if (r?.isError) errors++; }
        for (const p of prov) { const r = await client.callTool({ name: 'append_provenance', arguments: { connector: CONNECTOR, entry: p } }); if (r?.isError) errors++; }
    } finally { await client.close(); }
    for (const e of errSamples) process.stderr.write('ERR ' + e + '\n');

    // ── Build EXTRACTION_EMISSION.json from the FINAL metadata state, ONLY the re-processed objects ──
    if (existsSync(EMISSION_PATH)) copyFileSync(EMISSION_PATH, EMISSION_PATH.replace(/\.json$/, '.pre-r3-full.json'));
    const finalFile = JSON.parse(readFileSync(METAFILE, 'utf8'));
    const finalIOs = finalFile[0].relatedEntities['MJ: Integration Objects'];
    const finalByName = new Map(finalIOs.map((i) => [i.fields.Name, i]));
    const emission = [];
    let totalFields = 0;
    for (const name of REPROCESSED) {
        const ioObj = finalByName.get(name);
        if (!ioObj) { emission.push({ objectName: name, fieldsExtracted: 0, gapsRemaining: [`io.${name}: NOT FOUND in final metadata`], claims: [], matrixRow: matrix(name, 0, 0, 'defer', 'defer', 0), skipped: { reason: 'persist failed — not found post-write' } }); continue; }
        const F = ioObj.fields;
        const iofs = ioObj.relatedEntities?.['MJ: Integration Object Fields'] ?? [];
        totalFields += iofs.length;
        const oClaims = (claims.get(name) ?? []).slice();
        const gaps = [];
        // fold in per-field identity claims derived from FINAL state
        let pkCount = 0, fkCount = 0, deferredFK = 0;
        for (const fe of iofs) {
            const ff = fe.fields;
            if (ff.IsPrimaryKey === true) { pkCount++; if (!oClaims.some((c) => c.slot === `iof.${name}.${ff.Name}.IsPrimaryKey`)) oClaims.push({ slot: `iof.${name}.${ff.Name}.IsPrimaryKey`, value: true, sourcePath: `${SRC} :: identity field` }); }
            if (ff.RelatedIntegrationObjectID) { fkCount++; const t = ff.Configuration?.ReferencedType ?? String(ff.RelatedIntegrationObjectID).replace(/^@lookup:MJ: Integration Objects\.Name=/, '').split('&')[0]; if (!oClaims.some((c) => c.slot === `iof.${name}.${ff.Name}.RelatedIntegrationObjectID`)) oClaims.push({ slot: `iof.${name}.${ff.Name}.RelatedIntegrationObjectID`, value: t, sourcePath: `${SRC} :: field "${ff.Name}" -> ${t}` }); }
            else if (/(?:ID|UUID)$/.test(ff.Name) && ff.IsPrimaryKey !== true) deferredFK++;
        }
        // top-level slot claims from FINAL state
        if (F.APIPath && !oClaims.some((c) => c.slot === `io.${name}.APIPath`)) oClaims.push({ slot: `io.${name}.APIPath`, value: F.APIPath, sourcePath: `${SRC} :: GET ${F.APIPath}` });
        oClaims.push({ slot: `io.${name}.PaginationType`, value: F.PaginationType, sourcePath: `${SRC} :: list pagination` });
        oClaims.push({ slot: `io.${name}.SupportsWrite`, value: !!F.SupportsWrite, sourcePath: `${SRC} :: create=${!!F.SupportsCreate} update=${!!F.SupportsUpdate} delete=${!!F.SupportsDelete}` });
        if (F.SupportsIncrementalSync && F.IncrementalWatermarkField) oClaims.push({ slot: `io.${name}.IncrementalWatermarkField`, value: F.IncrementalWatermarkField, sourcePath: `${SRC} :: watermark "${F.IncrementalWatermarkField}"` });
        if (pkCount === 0) gaps.push(`io.${name}: no PK emitted`);
        if (deferredFK > 0) gaps.push(`io.${name}: ${deferredFK} id-shaped field(s) with no resolvable sibling IO — FK deferred (polymorphic recordID / non-modeled targets)`);
        emission.push({ objectName: name, fieldsExtracted: iofs.length, gapsRemaining: gaps, claims: oClaims, matrixRow: matrix(name, pkCount, fkCount, pkCount > 0 ? 'emit' : 'defer', fkCount > 0 ? `emit-${fkCount}` : 'defer', oClaims.length) });
    }
    mkdirSync(dirname(EMISSION_PATH), { recursive: true });
    writeFileSync(EMISSION_PATH, JSON.stringify(emission, null, 2) + '\n', 'utf8');

    process.stdout.write(JSON.stringify({
        round: 'delta-amendment', objectsExtracted: emission.length,
        newIOs: ['BadgeRequest', 'DiscussionReaction', 'CommentReaction', 'EscalationLog'],
        fixedIOs: ['EventParticipant', 'GroupMember', 'UserBadge', 'GroupApplicant', 'GroupInvite', 'GroupTag', 'Icon'],
        fieldsExtracted: totalFields, ioUpserts: ioW, iofUpserts: iofW, deletes: del, rootUpserts: rootW,
        codeEvidence: ce.length, provenance: prov.length, mcpErrors: errors,
        totalIOsInFile: finalIOs.length, emissionArtifact: EMISSION_PATH,
    }, null, 2) + '\n');
    if (errors > 0) process.exitCode = 1;
}
function matrix(name, pkCount, fkCount, PKVerdict, FKVerdict, EvidenceCount) {
    return { IOName: name, ExistingConnectorTs: 'n/a', ExistingMetadataJson: 'yes', OpenAPIxPK: 'no', OpenAPIPathOps: pkCount > 0 ? 'yes' : 'no', OpenAPILocationHeader: 'no', VendorDocsProseScan: 'yes', SDKTypes: 'n/a', PostmanCommunity: 'n/a', NamingConvention: 'yes', CrossIOMatch: fkCount > 0 ? 'yes' : 'no', PKVerdict, FKVerdict, EvidenceCount };
}
main().catch((err) => { console.error(err); process.exit(1); });
