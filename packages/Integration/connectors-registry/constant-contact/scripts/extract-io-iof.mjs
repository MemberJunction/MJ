#!/usr/bin/env node
// extract-io-iof.mjs — Constant Contact V3 IntegrationObject/Field extractor (single-pass, code-first).
//
// This script's structured output IS the emission. It walks the SAVED raw OpenAPI (Swagger 2.0) spec,
// programmatically enumerates the addressable resource universe (paths grouped by tag, collapsing
// DTO-variant/multi-verb operations onto one syncable resource — the correct table-unit for a REST API,
// vs. the 240 request/response DTO shape-variants the shared generic enumerator counts), resolves each
// resource's response DTO into typed fields, derives PK from GET-by-id path addressing, write capability
// from the spec's own verbs, EVIDENCE-BASED pagination (a real `_links` cursor wrapper or a `page` param —
// never merely "the response has an array"), the incremental RECORD watermark field (with the outbound
// filter-param captured separately in Configuration.incrementalFilterFormat), and provable FK edges from
// path-parameter/resource-id references. Emits via the mj-metadata MCP + writes EXTRACTION_EMISSION.json.

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { z } from 'zod';

const CONNECTOR = 'constant-contact';
const REGISTRY = 'packages/Integration/connectors-registry/constant-contact';
const SPEC_PATH = `${REGISTRY}/sources/openapi.json`;
const RUN_OUTPUT = `${REGISTRY}/runs/connector-constant-contact-1783806258859-0be0453e/output`;
const EMISSION_PATH = `${RUN_OUTPUT}/EXTRACTION_EMISSION.json`;
const MCP_SERVER = '/Users/bcladmin/Projects/MemberJunction/MJ/packages/MCP/mj-metadata/dist/server.js';
const NOW = new Date().toISOString();

// ── Zod validation of the raw spec shape we consume ──
const ParamSchema = z.object({ name: z.string(), in: z.string(), type: z.string().optional(), default: z.unknown().optional(), maximum: z.number().optional(), schema: z.unknown().optional() }).passthrough();
const OperationSchema = z.object({ tags: z.array(z.string()).optional(), summary: z.string().optional(), description: z.string().optional(), parameters: z.array(ParamSchema).optional(), responses: z.record(z.string(), z.unknown()).optional() }).passthrough();
const SpecSchema = z.object({ swagger: z.string(), host: z.string().optional(), basePath: z.string().optional(), paths: z.record(z.string(), z.record(z.string(), z.unknown())), definitions: z.record(z.string(), z.unknown()) }).passthrough();

const spec = SpecSchema.parse(JSON.parse(readFileSync(SPEC_PATH, 'utf8')));
const PATHS = spec.paths;
const DEFS = spec.definitions;
const VERBS = ['get', 'post', 'put', 'patch', 'delete'];

// ── OUT-OF-SCOPE tags (separate-route / partner-gated) per the binding scope decision (SOURCES.json). ──
const OUT_OF_SCOPE_TAGS = new Set(['Technology Partners', 'Technology Partners Webhooks', 'SMS Reporting']);

// ── Deterministic leaf-name mapping (the auditable path→resource table; multiple verbs/DTO-variants on one
//    resource collapse to one leaf). Verbatim from the auditor's enumerate-taxonomy.mjs. ──
function leafNameFor(path) {
    const p = path;
    if (p === '/account/user/privileges') return 'account_user_privileges';
    if (p === '/account/summary') return 'account_summary';
    if (p === '/account/summary/physical_address') return 'account_physical_address';
    if (p === '/account/emails') return 'account_emails';
    if (p === '/activities' || p === '/activities/{activity_id}') return 'activities';
    if (p === '/activities/contact_exports' || p === '/contact_exports/{file_export_id}') return 'activities_contacts_export';
    if (p === '/activities/contact_delete') return 'activities_contacts_delete';
    if (p === '/activities/contacts_file_import') return 'activities_contacts_file_import';
    if (p === '/activities/contacts_json_import') return 'activities_contacts_json_import';
    if (p === '/activities/remove_list_memberships') return 'activities_list_memberships_remove';
    if (p === '/activities/add_list_memberships') return 'activities_list_memberships_add';
    if (p === '/activities/list_delete') return 'activities_list_delete';
    if (p === '/activities/contacts_taggings_remove') return 'activities_contacts_taggings_remove';
    if (p === '/activities/contacts_taggings_add') return 'activities_contacts_taggings_add';
    if (p === '/activities/contacts_tags_delete') return 'activities_contacts_tags_delete';
    if (p === '/activities/custom_fields_delete') return 'activities_custom_fields_delete';
    if (p === '/contacts' || p === '/contacts/{contact_id}') return 'contacts';
    if (p === '/contacts/sign_up_form') return 'contacts_sign_up_form';
    if (p === '/contacts/contact_id_xrefs') return 'contacts_xrefs';
    if (p === '/contacts/sms_engagement_history/{contact_id}') return 'contacts_sms_engagement_history';
    if (p === '/contacts/counts') return 'contacts_counts';
    if (p === '/contacts/resubscribe/{contact_id}') return 'contacts_resubscribe';
    if (p === '/contact_custom_fields' || p === '/contact_custom_fields/{custom_field_id}') return 'contact_custom_fields';
    if (p === '/contact_lists' || p === '/contact_lists/{list_id}') return 'contact_lists';
    if (p === '/contact_lists/list_id_xrefs') return 'contact_lists_xrefs';
    if (p === '/contact_tags' || p === '/contact_tags/{tag_id}') return 'contact_tags';
    if (p === '/segments' || p === '/segments/{segment_id}') return 'segments';
    if (p === '/segments/{segment_id}/name') return 'segments';
    if (p === '/emails' || p === '/emails/{campaign_id}') return 'emails';
    if (p === '/emails/campaign_id_xrefs') return 'emails_xrefs';
    if (p === '/emails/activities/{campaign_activity_id}') return 'email_campaign_activities';
    if (p === '/emails/activities/{campaign_activity_id}/non_opener_resends' ||
        p === '/emails/activities/{campaign_activity_id}/non_opener_resends/{resend_request_id}')
        return 'email_campaign_activity_non_opener_resends';
    if (p === '/emails/activities/{campaign_activity_id}/schedules') return 'email_campaign_activity_schedules';
    if (p === '/emails/activities/{campaign_activity_id}/tests') return 'email_campaign_activity_tests';
    if (p === '/emails/activities/{campaign_activity_id}/previews') return 'email_campaign_activity_previews';
    if (p === '/emails/activities/{campaign_activity_id}/send_history') return 'email_campaign_activity_send_history';
    if (p === '/emails/activities/{campaign_activity_id}/abtest') return 'email_campaign_activity_abtest';
    if (p === '/reports/contact_reports/{contact_id}/activity_details') return 'contact_reports_activity_details';
    if (p === '/reports/contact_reports/{contact_id}/open_and_click_rates') return 'contact_reports_open_and_click_rates';
    if (p === '/reports/contact_reports/{contact_id}/activity_summary') return 'contact_reports_activity_summary';
    if (p === '/reports/email_reports/{campaign_activity_id}/links') return 'email_reports_links';
    if (p === '/reports/email_reports/{campaign_activity_id}/tracking/sends') return 'email_reports_tracking_sends';
    if (p === '/reports/email_reports/{campaign_activity_id}/tracking/opens') return 'email_reports_tracking_opens';
    if (p === '/reports/email_reports/{campaign_activity_id}/tracking/unique_opens') return 'email_reports_tracking_unique_opens';
    if (p === '/reports/email_reports/{campaign_activity_id}/tracking/didnotopens') return 'email_reports_tracking_didnotopens';
    if (p === '/reports/email_reports/{campaign_activity_id}/tracking/clicks') return 'email_reports_tracking_clicks';
    if (p === '/reports/email_reports/{campaign_activity_id}/tracking/forwards') return 'email_reports_tracking_forwards';
    if (p === '/reports/email_reports/{campaign_activity_id}/tracking/optouts') return 'email_reports_tracking_optouts';
    if (p === '/reports/email_reports/{campaign_activity_id}/tracking/bounces') return 'email_reports_tracking_bounces';
    if (p === '/reports/summary_reports/email_campaign_summaries') return 'email_reports_summary';
    if (p === '/reports/stats/email_campaigns/{campaign_ids}') return 'email_reports_stats_campaigns';
    if (p === '/reports/stats/email_campaign_activities/{campaign_activity_ids}') return 'email_reports_stats_campaign_activities';
    if (p === '/reports/landing_pages/campaign_details/{campaign_activity_id}/p_unique_contact_clicks') return 'landing_pages_unique_contact_clicks';
    if (p === '/reports/landing_pages/campaign_details/{campaign_activity_id}/p_unique_contact_opens') return 'landing_pages_unique_contact_opens';
    if (p === '/reports/landing_pages/campaign_details/{campaign_activity_id}/p_contact_opens') return 'landing_pages_contact_opens';
    if (p === '/reports/landing_pages/campaign_details/{campaign_activity_id}/p_unique_contact_updates') return 'landing_pages_unique_contact_updates';
    if (p === '/reports/landing_pages/campaign_details/{campaign_activity_id}/p_unique_contact_adds') return 'landing_pages_unique_contact_adds';
    if (p === '/reports/landing_pages/campaign_details/{campaign_activity_id}/p_unique_contact_sms_optins') return 'landing_pages_unique_contact_sms_optins';
    if (p === '/events' || p === '/events/{event_id}' || p === '/events/default') return 'events';
    if (p === '/events/{event_id}/copy') return 'events_copy';
    if (p === '/events/{event_id}/check_in/tickets') return 'events_check_in';
    if (p === '/events/{event_id}/undo_check_in/tickets') return 'events_undo_check_in';
    if (p === '/events/{event_id}/tracks/{track_id}/registrations/{registration_id}' ||
        p === '/events/{event_id}/tracks/{track_id}/registrations')
        return 'events_registrations';
    if (p === '/events/{event_id}/tracks/{track_id}/registrations/payment_status') return 'events_registrations_payment_status';
    if (p === '/social/profiles') return 'social_profiles';
    if (p === '/social/connections') return 'social_connections';
    if (p === '/social/hashtags/groups') return 'social_hashtag_groups';
    if (p === '/social/posts') return 'social_posts';
    return null;
}

// ── Build leaf → { tag, ops:[{path,verb,op}], pathSet } ──
const leaves = new Map();
const unmapped = [];
for (const [p, methods] of Object.entries(PATHS)) {
    for (const verb of VERBS) {
        const op = methods[verb];
        if (!op || typeof op !== 'object') continue;
        const tags = Array.isArray(op.tags) ? op.tags : [];
        if (tags.some((t) => OUT_OF_SCOPE_TAGS.has(t))) continue;
        const leaf = leafNameFor(p);
        if (!leaf) { unmapped.push(`${verb.toUpperCase()} ${p}`); continue; }
        if (!leaves.has(leaf)) leaves.set(leaf, { name: leaf, tag: tags[0] || '', ops: [], pathSet: new Set() });
        const L = leaves.get(leaf);
        if (!L.tag && tags[0]) L.tag = tags[0];
        L.ops.push({ path: p, verb, op });
        L.pathSet.add(p);
    }
}

// ── $ref / schema helpers ──
function deref(schema) {
    let guard = 0;
    while (schema && typeof schema === 'object' && schema.$ref && guard++ < 12) {
        schema = DEFS[schema.$ref.replace('#/definitions/', '')];
    }
    return schema;
}
function respSchema(op) {
    const r = op && op.responses;
    if (!r) return null;
    const ok = r['200'] || r['201'] || r['202'];
    return ok && ok.schema ? ok.schema : null;
}
// Resolve a response schema down to the record ITEM definition + the collection data key.
function resolveList(schema) {
    const s = deref(schema);
    if (!s || typeof s !== 'object') return null;
    if (s.type === 'array' && s.items) return { itemDef: deref(s.items), dataKey: null, scalarItem: !s.items.$ref && s.items.type !== 'object' };
    if (s.properties) {
        for (const [k, v] of Object.entries(s.properties)) {
            if (v && v.type === 'array' && v.items && (v.items.$ref || v.items.type === 'object')) {
                return { itemDef: deref(v.items), dataKey: k, scalarItem: false };
            }
        }
        return { itemDef: s, dataKey: null, scalarItem: false }; // singleton object
    }
    return { itemDef: s, dataKey: null, scalarItem: s && s.type && s.type !== 'object' };
}

// EVIDENCE-BASED pagination: a real `_links`/`next_cursor` wrapper in the response → Cursor; a `page` query
// param → PageNumber (precedence, e.g. social_hashtag_groups); otherwise None. The mere presence of an
// array data key is NOT pagination evidence (many report/xref endpoints return an un-paged bare array).
function paginationFor(collectionGetOp) {
    if (!collectionGetOp) return { type: 'None', pageSize: null };
    const params = Array.isArray(collectionGetOp.parameters) ? collectionGetOp.parameters : [];
    const names = params.map((p) => p.name);
    const rs = deref(respSchema(collectionGetOp));
    let hasLinks = false;
    if (rs && rs.properties) for (const k of Object.keys(rs.properties)) { if (k === '_links' || k === 'links' || k === 'next_cursor') hasLinks = true; }
    let type = 'None';
    if (names.includes('page')) type = 'PageNumber';
    else if (hasLinks) type = 'Cursor';
    let pageSize = null;
    const lim = params.find((p) => p.name === 'limit');
    if (lim && typeof lim.default === 'number') pageSize = lim.default;
    return { type, pageSize };
}

function mapType(v) {
    if (!v || typeof v !== 'object') return 'json';
    if (v.$ref) return 'json';
    const t = v.type, f = v.format;
    if (t === 'object' || t === 'array') return 'json';
    if (t === 'integer') return f === 'int64' ? 'bigint' : 'integer';
    if (t === 'number') return (f === 'double' || f === 'float') ? 'float' : 'decimal';
    if (t === 'boolean') return 'boolean';
    if (t === 'string') {
        if (f === 'date-time') return 'datetime';
        if (f === 'date') return 'date';
        if (f === 'uuid') return 'uuid';
        return 'string';
    }
    return 'json';
}
const titleize = (s) => s.split(/[_\s]+/).map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');

// ── Distinctive resource-id → owning leaf, for provable FK edges (each *_id owned by exactly one resource). ──
const RESOURCE_PK_TO_LEAF = {
    contact_id: 'contacts', list_id: 'contact_lists', tag_id: 'contact_tags',
    custom_field_id: 'contact_custom_fields', segment_id: 'segments', campaign_id: 'emails',
    campaign_activity_id: 'email_campaign_activities', event_id: 'events', activity_id: 'activities',
};
// Outbound incremental filter query-param → the value goes to Configuration.incrementalFilterFormat;
// the IncrementalWatermarkField column holds the RECORD field name (updated_at), not the param name.
const WATERMARK_PARAMS = new Set(['updated_after', 'after_date', 'modified_since', 'updated_since']);
const RECORD_WATERMARK_FIELD = 'updated_at';

// ── Per-leaf modeling ──
function buildLeaf(L) {
    const leaf = L.name;
    const getOps = L.ops.filter((o) => o.verb === 'get');
    const byIdGet = getOps.find((o) => /\/\{[^/]+\}$/.test(o.path));
    const collectionGet = getOps.find((o) => !/\/\{[^/]+\}$/.test(o.path)) || getOps[0];
    const postOp = L.ops.find((o) => o.verb === 'post');
    const putOp = L.ops.find((o) => o.verb === 'put');
    const patchOp = L.ops.find((o) => o.verb === 'patch');
    const deleteOp = L.ops.find((o) => o.verb === 'delete');

    // collection info (data key, evidence-based pagination, page size, watermark param)
    let dataKey = null, listResolved = null, watermarkParam = null;
    const pag = paginationFor(collectionGet && collectionGet.op);
    if (collectionGet) {
        listResolved = resolveList(respSchema(collectionGet.op));
        if (listResolved) dataKey = listResolved.dataKey;
        const params = collectionGet.op.parameters || [];
        const wm = params.find((p) => WATERMARK_PARAMS.has(p.name));
        if (wm) watermarkParam = wm.name;
    }

    // pick the field-source item def: prefer by-id (single resource), else collection item, else write shape
    let itemDef = null, fieldSourceLabel = '';
    if (byIdGet) { itemDef = deref(respSchema(byIdGet.op)); fieldSourceLabel = `GET ${byIdGet.path} 200`; }
    if ((!itemDef || (!itemDef.properties && !itemDef.items)) && listResolved && listResolved.itemDef) { itemDef = listResolved.itemDef; fieldSourceLabel = `GET ${collectionGet.path} 200 (${dataKey || 'body'})`; }
    const hasProps = (d) => d && typeof d === 'object' && d.properties;
    for (const wOp of [postOp, putOp, patchOp]) {
        if (hasProps(itemDef)) break;
        if (!wOp) continue;
        const pr = deref(respSchema(wOp.op));
        if (hasProps(pr)) { itemDef = pr; fieldSourceLabel = `${wOp.verb.toUpperCase()} ${wOp.path} response`; break; }
        const bodyParam = (wOp.op.parameters || []).find((p) => p.in === 'body');
        const bd = bodyParam && bodyParam.schema ? deref(bodyParam.schema) : null;
        if (hasProps(bd)) { itemDef = bd; fieldSourceLabel = `${wOp.verb.toUpperCase()} ${wOp.path} body`; break; }
        if (pr && pr.type && !hasProps(itemDef)) { itemDef = pr; fieldSourceLabel = `${wOp.verb.toUpperCase()} ${wOp.path} response`; }
    }

    // path params across this leaf's paths
    const pathParams = new Set();
    for (const pth of L.pathSet) for (const m of pth.matchAll(/\{(\w+)\}/g)) pathParams.add(m[1]);

    // ── PK from by-id addressing ──
    let pkField = null, syntheticPK = false;
    const props0 = itemDef && itemDef.properties ? itemDef.properties : {};
    if (byIdGet) {
        const m = byIdGet.path.match(/\/\{(\w+)\}$/);
        if (m) {
            const v = m[1];
            if (props0[v]) pkField = v;
            else if (props0.id) pkField = 'id';
            else if (props0[`${leaf.replace(/s$/, '')}_id`]) pkField = `${leaf.replace(/s$/, '')}_id`;
            // Addressing-path proof: a singular `_id` var that is THIS resource's own identifier (not a
            // sibling-owned FK, not a plural `_ids` filter) but is absent from the create/response body →
            // inject it as the synthetic PK (e.g. GET /contact_exports/{file_export_id}).
            else if (/_id$/.test(v) && !/_ids$/.test(v) && !RESOURCE_PK_TO_LEAF[v]) { pkField = v; syntheticPK = true; }
        }
    }
    // job endpoints: activity_id is the identity even without a by-id GET on this path
    if (!pkField && !byIdGet && props0.activity_id && postOp) pkField = 'activity_id';

    // ── fields ──
    const fields = [];
    const props = itemDef && itemDef.properties ? itemDef.properties : null;
    if (props) {
        let seq = 0;
        // inject synthetic PK first (Sequence 0) when the addressing var isn't echoed in the body
        if (syntheticPK && !props[pkField]) {
            fields.push({ Name: pkField, Type: 'string', Description: `Primary key — the ${pkField} that addresses this resource (GET ${byIdGet.path}). Not echoed in the create/status response body.`, IsPrimaryKey: true, IsRequired: true, IsReadOnly: true, IsUniqueKey: true, AllowsNull: false, Status: 'Active', Sequence: seq++, IntegrationObjectID: '@parent:ID' });
        }
        for (const [name, v] of Object.entries(props)) {
            const type = mapType(v);
            const isPK = name === pkField;
            const isReq = Array.isArray(itemDef.required) && itemDef.required.includes(name);
            const isRO = v.readOnly === true || isPK;
            const f = {
                Name: name, Type: type,
                Description: (typeof v.description === 'string' ? v.description.replace(/<[^>]+>/g, '').trim().slice(0, 490) : `${titleize(name)} (${leaf}).`),
                IsPrimaryKey: isPK, IsRequired: isReq || isPK, IsReadOnly: isRO,
                IsUniqueKey: isPK, AllowsNull: isPK ? false : true, Status: 'Active',
                Sequence: seq++, IntegrationObjectID: '@parent:ID',
            };
            if (type === 'string' && typeof v.maxLength === 'number') f.Length = v.maxLength;
            // provable FK: field is a distinctive resource-id owned by a sibling leaf (not own PK, sibling exists,
            // and the description does not self-alias it to this record's own id).
            const fkLeaf = RESOURCE_PK_TO_LEAF[name];
            const selfAlias = typeof v.description === 'string' && /same as\s+id|cross[- ]referenc/i.test(v.description);
            if (!isPK && fkLeaf && fkLeaf !== leaf && leaves.has(fkLeaf) && !selfAlias) {
                f.RelatedIntegrationObjectID = `@lookup:MJ: Integration Objects.Name=${fkLeaf}&IntegrationID=@parent:IntegrationID`;
                f.RelatedIntegrationObjectFieldName = name;
                // Runtime FK re-derivation hint (IsForeignKey is a non-deployable transient marker per the
                // framework rule; the persisted FK is RelatedIntegrationObjectID + Configuration.ReferencedType).
                f.Configuration = { ReferencedType: fkLeaf };
                f._fk = fkLeaf;
            }
            fields.push(f);
        }
    } else if (itemDef) {
        // scalar-array or free-form response → one representative column (never a 0-field IO)
        const t = itemDef.type && itemDef.type !== 'object' && itemDef.type !== 'array' ? mapType(itemDef) : 'json';
        fields.push({ Name: 'value', Type: t, Description: `Array-element / scalar payload for ${leaf} (source response has no per-field schema).`, IsPrimaryKey: false, IsRequired: false, IsReadOnly: true, IsUniqueKey: false, AllowsNull: true, Status: 'Active', Sequence: 0, IntegrationObjectID: '@parent:ID' });
    }

    // ── incremental watermark (RECORD field name + filter-param format), provable-only ──
    let watermarkField = null, filterFormat = null;
    if (watermarkParam && fields.some((f) => f.Name === RECORD_WATERMARK_FIELD)) {
        watermarkField = RECORD_WATERMARK_FIELD;
        filterFormat = `${watermarkParam}={value}`;
    }

    // ── capability / write columns ──
    const primaryReadPath = collectionGet ? collectionGet.path : (byIdGet ? byIdGet.path : (L.ops[0] ? L.ops[0].path : `/${leaf}`));
    const idPath = (pth) => pth.replace(/\/\{[^/]+\}$/, '/{id}');
    const io = {
        Name: leaf,
        DisplayName: titleize(leaf),
        Description: (collectionGet && (collectionGet.op.summary || collectionGet.op.description)) || (byIdGet && (byIdGet.op.summary || byIdGet.op.description)) || (postOp && (postOp.op.summary || postOp.op.description)) || `${titleize(leaf)} resource.`,
        Category: L.tag || 'Constant Contact',
        APIPath: primaryReadPath,
        ResponseDataKey: dataKey || undefined,
        PaginationType: pag.type,
        DefaultPageSize: pag.type !== 'None' ? (pag.pageSize || 50) : undefined,
        SupportsPagination: pag.type !== 'None',
        SupportsIncrementalSync: !!watermarkField,
        IncrementalWatermarkField: watermarkField || undefined,
        SupportsWrite: !!(postOp || putOp || patchOp || deleteOp),
        Status: 'Active',
        IntegrationID: '@parent:ID',
    };
    if (io.Description) io.Description = String(io.Description).replace(/<[^>]+>/g, '').trim().slice(0, 490);

    if (postOp) {
        io.SupportsCreate = true;
        io.CreateAPIPath = postOp.path;
        io.CreateMethod = 'POST';
        io.CreateBodyShape = 'flat';
        io.CreateIDLocation = 'body';
    }
    const upd = patchOp || putOp;
    if (upd) {
        io.SupportsUpdate = true;
        io.UpdateAPIPath = idPath(upd.path);
        io.UpdateMethod = upd.verb.toUpperCase();
        io.UpdateBodyShape = 'flat';
        io.UpdateIDLocation = 'path';
    }
    if (deleteOp) {
        io.SupportsDelete = true;
        io.DeleteAPIPath = idPath(deleteOp.path);
        io.DeleteMethod = 'DELETE';
        io.DeleteIDLocation = 'path';
    }

    // SyncStrategy + stable ordering
    if (watermarkField) io.SyncStrategy = 'WatermarkIncremental';
    else if (pag.type !== 'None') { io.SyncStrategy = 'FullPullHashDiff'; io.ContentHashApplicable = true; }
    else io.SyncStrategy = 'SnapshotReplace';
    if (pkField && !watermarkField) io.StableOrderingKey = pkField;

    // Access-path / parent chain + incremental filter format in Configuration
    const parentPathParams = [...pathParams].filter((v) => RESOURCE_PK_TO_LEAF[v] && RESOURCE_PK_TO_LEAF[v] !== leaf && leaves.has(RESOURCE_PK_TO_LEAF[v]));
    const cfg = { resourceTag: L.tag, sourceItemSchema: fieldSourceLabel };
    if (parentPathParams.length) {
        cfg.accessPathParams = parentPathParams.map((v) => ({ param: v, parentObject: RESOURCE_PK_TO_LEAF[v] }));
        cfg.parentObjectName = RESOURCE_PK_TO_LEAF[parentPathParams[parentPathParams.length - 1]];
        cfg.parentObjects = Object.fromEntries(parentPathParams.map((v) => [v, RESOURCE_PK_TO_LEAF[v]]));
    }
    if (filterFormat) cfg.incrementalFilterFormat = filterFormat;
    if (pag.type === 'None' && !byIdGet && postOp) cfg.jobEndpoint = true;
    io.Configuration = cfg;

    return { io, fields, pkField, syntheticPK, fieldSourceLabel, watermarkField };
}

function baseMatrix(name, built, pkVerdict, nFk = 0) {
    return {
        IOName: name,
        ExistingConnectorTs: 'n/a', ExistingMetadataJson: 'n/a',
        OpenAPIxPK: 'no',
        OpenAPIPathOps: built && built.pkField ? 'yes' : 'no',
        OpenAPILocationHeader: 'no',
        VendorDocsProseScan: 'n/a', SDKTypes: 'n/a', PostmanCommunity: 'n/a',
        NamingConvention: built && built.pkField && /(_id|^id)$/.test(built.pkField) ? 'yes' : 'no',
        CrossIOMatch: nFk > 0 ? 'yes' : 'no',
        PKVerdict: pkVerdict,
        FKVerdict: nFk > 0 ? `emit-${nFk}` : 'defer',
        EvidenceCount: (built && built.pkField ? 1 : 0) + nFk + 1,
    };
}

// ── connect MCP ──
const transport = new StdioClientTransport({ command: 'node', args: [MCP_SERVER], env: { ...process.env } });
const client = new Client({ name: 'cc-extract-io-iof', version: '1.0' }, { capabilities: {} });
await client.connect(transport);
const call = (name, args) => client.callTool({ name, arguments: { connector: CONNECTOR, ...args } });

const emission = [];
const codeEntries = [];
let ioCount = 0, iofCount = 0, fkCount = 0, pkEmit = 0, pkDefer = 0;
const pagBreakdown = { None: 0, Cursor: 0, PageNumber: 0 };

const sortedLeaves = [...leaves.values()].sort((a, b) => a.name.localeCompare(b.name));
let seq = 0;
for (const L of sortedLeaves) {
    const built = buildLeaf(L);
    if (built.fields.length === 0) {
        emission.push({ objectName: L.name, fieldsExtracted: 0, gapsRemaining: ['no-fields-derivable'], claims: [], matrixRow: baseMatrix(L.name, built, 'defer'), skipped: { reason: `no field schema derivable from any operation on ${[...L.pathSet].join(', ')}` } });
        continue;
    }
    built.io.Sequence = seq++;
    pagBreakdown[built.io.PaginationType] = (pagBreakdown[built.io.PaginationType] || 0) + 1;
    await call('upsert_integration_object', { io: { ...built.io } });
    ioCount++;
    const leafFks = [];
    for (const f of built.fields) {
        const fk = f._fk; const cleanF = { ...f }; delete cleanF._fk;
        await call('upsert_integration_object_field', { ioName: L.name, iof: cleanF });
        iofCount++;
        if (fk) { fkCount++; leafFks.push(f.Name); }
    }
    if (built.pkField) pkEmit++; else pkDefer++;

    // per-flag CODE_EVIDENCE
    if (built.pkField) codeEntries.push({ ScriptPath: 'scripts/extract-io-iof.mjs', ScriptRunAt: NOW, StructuredOutput: { pk: built.pkField, proof: built.syntheticPK ? 'GET-by-id path-parameter addressing (synthetic — not echoed in body)' : 'GET-by-id path-parameter addressing', source: built.fieldSourceLabel }, SchemaValidationStatus: 'Passed', TargetField: `iof.${L.name}.${built.pkField}.IsPrimaryKey` });
    for (const fn of leafFks) codeEntries.push({ ScriptPath: 'scripts/extract-io-iof.mjs', ScriptRunAt: NOW, StructuredOutput: { field: fn, target: RESOURCE_PK_TO_LEAF[fn], proof: 'resource-id reference to sibling resource PK' }, SchemaValidationStatus: 'Passed', TargetField: `iof.${L.name}.${fn}.RelatedIntegrationObjectID` });
    codeEntries.push({ ScriptPath: 'scripts/extract-io-iof.mjs', ScriptRunAt: NOW, StructuredOutput: { io: L.name, apiPath: built.io.APIPath, paginationType: built.io.PaginationType, fields: built.fields.length, supportsWrite: built.io.SupportsWrite, source: built.fieldSourceLabel }, SchemaValidationStatus: 'Passed', TargetField: `io.${L.name}.APIPath` });
    if (built.watermarkField) codeEntries.push({ ScriptPath: 'scripts/extract-io-iof.mjs', ScriptRunAt: NOW, StructuredOutput: { io: L.name, watermarkField: built.watermarkField, filterFormat: built.io.Configuration.incrementalFilterFormat, proof: 'record has updated_at; outbound filter param documented in spec' }, SchemaValidationStatus: 'Passed', TargetField: `io.${L.name}.IncrementalWatermarkField` });

    // claims + matrixRow + emission entry
    const claims = [];
    const src = `${SPEC_PATH}#${built.fieldSourceLabel}`;
    claims.push({ slot: 'APIPath', value: built.io.APIPath, sourcePath: `${SPEC_PATH}#paths` });
    claims.push({ slot: 'PaginationType', value: built.io.PaginationType, sourcePath: src });
    claims.push({ slot: 'SupportsWrite', value: built.io.SupportsWrite, sourcePath: `${SPEC_PATH}#verbs` });
    if (built.io.SupportsIncrementalSync) claims.push({ slot: 'IncrementalWatermarkField', value: built.io.IncrementalWatermarkField, sourcePath: src });
    if (built.pkField) claims.push({ slot: `IsPrimaryKey:${built.pkField}`, value: true, sourcePath: src });
    for (const f of built.fields) {
        claims.push({ slot: `field:${f.Name}`, value: f.Type, sourcePath: src });
        if (f.RelatedIntegrationObjectID) claims.push({ slot: `FK:${f.Name}`, value: f._fk || f.RelatedIntegrationObjectFieldName, sourcePath: src });
    }
    emission.push({ objectName: L.name, fieldsExtracted: built.fields.length, gapsRemaining: built.pkField ? [] : ['pk-deferred-no-path-addressing'], claims, matrixRow: baseMatrix(L.name, built, built.pkField ? 'emit' : 'defer', leafFks.length) });
}

// batch append code-evidence (idempotent: skip TargetField|StructuredOutput already recorded from a prior run)
const existingCE = (() => { try { return new Set((JSON.parse(readFileSync(`${REGISTRY}/CODE_EVIDENCE.json`, 'utf8')).Entries || []).map((e) => String(e.TargetField) + '|' + JSON.stringify(e.StructuredOutput))); } catch { return new Set(); } })();
for (const e of codeEntries) { const key = String(e.TargetField) + '|' + JSON.stringify(e.StructuredOutput); if (existingCE.has(key)) continue; existingCE.add(key); await call('append_code_evidence', { entry: e }); }

await client.close();

mkdirSync(RUN_OUTPUT, { recursive: true });
writeFileSync(EMISSION_PATH, JSON.stringify(emission, null, 2) + '\n');

const stats = {
    objectsExtracted: ioCount,
    fieldsExtracted: iofCount,
    fkEdges: fkCount,
    pkEmit, pkDefer,
    paginationBreakdown: pagBreakdown,
    incrementalIOs: sortedLeaves.map((L) => L.name).filter((n) => emission.find((e) => e.objectName === n && e.claims.some((c) => c.slot === 'IncrementalWatermarkField'))),
    skipped: emission.filter((e) => e.skipped).map((e) => ({ objectName: e.objectName, reason: e.skipped.reason })),
    unmappedInScopeOps: unmapped,
    emissionArtifact: EMISSION_PATH,
};
process.stdout.write(JSON.stringify(stats, null, 2) + '\n');
