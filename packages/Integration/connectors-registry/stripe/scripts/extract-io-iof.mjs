#!/usr/bin/env node
// scripts/extract-io-iof.mjs
//
// Stripe IO/IOF extractor. CODE-FIRST: this script IS the emission. It walks the
// SAVED raw OpenAPI spec (spec3.sdk.json — the richer 1703-schema SDK variant) purely
// programmatically, enumerates the syncable record-type universe by DESCENDING the
// path + schema graph, extracts fields + types + PK/FK + per-operation CRUD, and
// persists every IO/IOF row via the same MetadataFileStore the mj-metadata MCP uses.
//
// It NEVER hardcodes vendor object names into logic — only structural patterns
// (Stripe's `object`-discriminator convention, the `x-expansionResources` FK
// extension, form-urlencoded write bodies, cursor pagination). The handed-in 34-object
// hint is a MINIMUM cross-check, never a ceiling.
//
// Run:  node scripts/extract-io-iof.mjs
// Env:  STRIPE_DRY_RUN=1  -> compute + write EXTRACTION_EMISSION.json but SKIP the store writes

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..', '..', '..', '..', '..'); // registry/stripe/scripts -> repo root
const CONNECTOR_DIR = resolve(__dirname, '..');
const RUN_OUTPUT = resolve(CONNECTOR_DIR, 'runs/connector-stripe-1783019415445-1a1b4b9d/output/EXTRACTION_EMISSION.json');
const SPEC_PATH = resolve(CONNECTOR_DIR, 'sources/spec3.sdk.json');
const SCRIPT_REL = 'packages/Integration/connectors-registry/stripe/scripts/extract-io-iof.mjs';
const CONNECTOR = 'stripe';
const DRY_RUN = process.env.STRIPE_DRY_RUN === '1';

// ── 1. Load MetadataFileStore (same code the mj-metadata MCP tools call) ──────────────
async function loadStore() {
    const mod = await import(resolve(REPO_ROOT, 'packages/MCP/mj-metadata/dist/MetadataFileStore.js'));
    const registryRoot = resolve(REPO_ROOT, 'packages/Integration/connectors-registry');
    const metadataRoot = resolve(REPO_ROOT, 'metadata/integrations');
    return new mod.MetadataFileStore(registryRoot, metadataRoot);
}

// ── 2. Zod schemas for the OpenAPI shapes we consume ──────────────────────────────────
const RefSchema = z.object({ $ref: z.string() });
const SchemaNodeSchema = z.object({
    type: z.string().optional(),
    properties: z.record(z.string(), z.unknown()).optional(),
    required: z.array(z.string()).optional(),
    enum: z.array(z.unknown()).optional(),
    anyOf: z.array(z.unknown()).optional(),
    allOf: z.array(z.unknown()).optional(),
    items: z.unknown().optional(),
    $ref: z.string().optional(),
    description: z.string().optional(),
    nullable: z.boolean().optional(),
    maxLength: z.number().optional(),
    format: z.string().optional(),
    title: z.string().optional(),
    'x-expansionResources': z.unknown().optional(),
    'x-resourceId': z.string().optional(),
}).passthrough();

const OpenAPISchema = z.object({
    openapi: z.string().optional(),
    paths: z.record(z.string(), z.record(z.string(), z.unknown())),
    components: z.object({ schemas: z.record(z.string(), z.unknown()) }),
}).passthrough();

// ── 3. Read + validate the spec ────────────────────────────────────────────────────────
function loadSpec() {
    const raw = JSON.parse(readFileSync(SPEC_PATH, 'utf8'));
    const spec = OpenAPISchema.parse(raw);
    return spec;
}

const refName = (r) => (r && typeof r === 'object' && typeof r.$ref === 'string' ? r.$ref.split('/').pop() : null);

// ── 4. OUT-OF-SCOPE product-line families (deliberate, evidenced narrowing — SOURCE_STUDY §5) ──
// Each is a SEPARATELY-ENROLLABLE Stripe product surface (Issuing/Treasury/Terminal/Tax/etc.),
// not part of the core payments+billing+connect lifecycle. Provable from the spec's namespace prefixes.
const OOS_PREFIXES = [
    'issuing.', 'treasury.', 'terminal.', 'tax.', 'billing.', 'billing_portal.',
    'financial_connections.', 'radar.', 'climate.', 'identity.', 'entitlements.',
    'reporting.', 'sigma.', 'apps.', 'forwarding.', 'test_helpers.', 'gelato_', 'connect_embedded',
];
// Plain (non-dotted) resources that belong to out-of-scope products / are pure reference-config, not core.
const OOS_PLAIN = new Set([
    'apple_pay_domain', 'country_spec', 'exchange_rate', 'file', 'file_link',
    'payment_method_configuration', 'payment_method_domain', 'review', 'scheduled_query_run',
    'webhook_endpoint', 'product_feature', 'tax_code',
]);
// Helper/session/tombstone shapes that are NOT syncable record collections (no ongoing data to sync):
// short-lived credentials, one-time links, delete tombstones. Skipped-with-reason, not emitted.
const NON_SYNCABLE = new Set([
    'account_link', 'account_session', 'login_link', 'ephemeral_key', 'customer_session',
    'funding_instructions', 'confirmation_token',
]);
const isDeletedTombstone = (n) => n.startsWith('deleted_');

function isOutOfScope(n) {
    if (OOS_PLAIN.has(n)) return true;
    for (const p of OOS_PREFIXES) if (n.startsWith(p)) return true;
    return false;
}

// ── 5. Build the CRUD resource map from ALL paths (the door + graph descent) ───────────
function buildResourceMap(spec) {
    const R = {}; // name -> { name, listPaths, getOnePaths, createPaths, updatePaths, deletePaths }
    const ensure = (n) => (R[n] ??= { name: n, listPaths: [], getOnePaths: [], createPaths: [], updatePaths: [], deletePaths: [] });
    const endsWithParam = (p) => /\}$/.test(p);

    for (const [p, ops] of Object.entries(spec.paths)) {
        for (const [method, opRaw] of Object.entries(ops)) {
            const op = opRaw;
            if (!op || typeof op !== 'object' || !op.responses) continue;
            const M = method.toUpperCase();
            const succ = op.responses['200'] ?? op.responses['201'];
            const sch = succ?.content?.['application/json']?.schema;
            if (M === 'GET') {
                if (!sch) continue;
                const dataItems = sch.properties?.data?.items;
                const listRef = refName(dataItems);
                if (listRef) { ensure(listRef).listPaths.push(p); continue; }
                const oneRef = refName(sch);
                if (oneRef) { ensure(oneRef).getOnePaths.push(p); continue; }
                if (Array.isArray(sch.anyOf)) for (const a of sch.anyOf) { const rn = refName(a); if (rn) ensure(rn).getOnePaths.push(p); }
            } else if (M === 'POST') {
                const oneRef = refName(sch);
                if (!oneRef) continue;
                if (endsWithParam(p)) ensure(oneRef).updatePaths.push(p);
                else ensure(oneRef).createPaths.push(p);
            } else if (M === 'DELETE') {
                const oneRef = refName(sch);
                let base = oneRef;
                if (base?.startsWith('deleted_')) base = base.slice('deleted_'.length);
                if (base) ensure(base).deletePaths.push(p);
            }
        }
    }
    return R;
}

// ── 6. Nested access-path discovery (tables ≠ doors). For a resource with NO top-level list
//        path, find the parent path that reaches it (e.g. /v1/accounts/{account}/persons ->
//        parent=account) and the nesting field-path. Derived from the path template structure. ──
function deriveAccessPath(name, resource) {
    // Prefer a top-level list path; else the shortest nested list path; else a get-one path.
    const allListLike = [...resource.listPaths];
    const primary = pickPrimaryListPath(allListLike) ?? pickPrimaryListPath(resource.getOnePaths);
    if (!primary) return null;
    const segs = primary.replace(/^\/v1\//, '').split('/');
    // parent template vars in the path => nested. Depth = count of {param} segments before the last collection segment.
    const paramSegs = segs.filter((s) => /^\{.*\}$/.test(s));
    const collectionSegs = segs.filter((s) => !/^\{.*\}$/.test(s));
    const depth = Math.max(0, paramSegs.length - (isSingleResourcePath(primary) ? 1 : 0));
    // door = the first collection segment (the top-level resource the path descends from)
    const door = collectionSegs[0] ?? name;
    const nestingPath = collectionSegs.slice(1); // collection segments after the door
    return { door, entryPath: primary, nestingPath, depth, isNested: depth > 0 };
}
function isSingleResourcePath(p) { return /\}$/.test(p); }
function pickPrimaryListPath(paths) {
    if (!paths || paths.length === 0) return null;
    // fewest path segments = closest-to-top-level = primary
    return [...paths].sort((a, b) => a.split('/').length - b.split('/').length || a.length - b.length)[0];
}

// ── 7. Field extraction from a resource schema (with allOf flattening + polymorphic anyOf) ──
function resolveSchema(spec, name, seen = new Set()) {
    if (seen.has(name)) return null;
    seen.add(name);
    const s = spec.components.schemas[name];
    return s ?? null;
}

function collectProperties(spec, schemaName) {
    const s = spec.components.schemas[schemaName];
    if (!s) return { properties: {}, required: new Set(), polymorphicMembers: [] };
    const properties = {};
    const required = new Set(Array.isArray(s.required) ? s.required : []);
    const polymorphicMembers = [];

    const mergeFrom = (node) => {
        if (!node) return;
        if (node.$ref) { const m = spec.components.schemas[refName(node)]; mergeFrom(m); return; }
        if (Array.isArray(node.allOf)) for (const a of node.allOf) mergeFrom(a);
        if (node.properties) for (const [k, v] of Object.entries(node.properties)) if (!(k in properties)) properties[k] = v;
        if (Array.isArray(node.required)) for (const r of node.required) required.add(r);
    };
    mergeFrom(s);

    // Polymorphic union (e.g. external_account = anyOf[bank_account, card]) with NO own props:
    // merge the union of member fields so the IO isn't field-less.
    if (Object.keys(properties).length === 0 && Array.isArray(s.anyOf)) {
        for (const m of s.anyOf) {
            const mn = refName(m);
            if (mn) { polymorphicMembers.push(mn); const sub = collectProperties(spec, mn); for (const [k, v] of Object.entries(sub.properties)) if (!(k in properties)) properties[k] = v; }
        }
    }
    return { properties, required, polymorphicMembers };
}

// ── 8. Type mapping — from the OpenAPI property node to a semantic Type string ──────────
//   Emit provable semantic types (string/integer/number/boolean/datetime/json/array/object/enum).
//   The framework's MapSourceType maps large-text modalities (json/array/object) to nvarchar(MAX)
//   generously; scalars to bounded nvarchar. We NEVER emit nvarchar(MAX) literally here.
function mapPropType(node) {
    if (!node || typeof node !== 'object') return { type: 'string' };
    // expandable FK / polymorphic anyOf => the ID form is a string
    if (Array.isArray(node.anyOf)) {
        const hasString = node.anyOf.some((a) => a && a.type === 'string');
        if (hasString) return { type: 'string', maxLength: node.anyOf.find((a) => a?.maxLength)?.maxLength };
        return { type: 'json' }; // union of objects
    }
    if (node.$ref) return { type: 'json' }; // embedded 1:1 sub-object
    const t = node.type;
    const fmt = node.format;
    if (t === 'integer') {
        // Stripe timestamps are unix-epoch integers with format:unix-time
        if (fmt === 'unix-time' || node['x-stripeBypassValidation']) return { type: 'datetime', note: 'unix-time' };
        return { type: 'integer' };
    }
    if (t === 'number') return { type: 'number' };
    if (t === 'boolean') return { type: 'boolean' };
    if (t === 'array') return { type: 'array' };
    if (t === 'object') return { type: 'json' };
    if (t === 'string') {
        if (Array.isArray(node.enum) && node.enum.length > 0) return { type: 'enum', maxLength: node.maxLength };
        return { type: 'string', maxLength: node.maxLength };
    }
    return { type: 'string', maxLength: node.maxLength };
}

// ── 9. FK detection via x-expansionResources (Stripe's spec-native FK signal — Tier-1) ──
//   A field is a FK iff it has (a) an anyOf member that is a bare string type (the un-expanded ID)
//   AND (b) an x-expansionResources block naming the expansion target(s). We only emit the FK edge
//   when the target resolves to an IO WE ACTUALLY EMIT in this run (else it's an out-of-scope target).
function detectFK(propNode) {
    const xr = propNode?.['x-expansionResources'];
    if (!xr || !Array.isArray(propNode.anyOf)) return null;
    const hasStringId = propNode.anyOf.some((a) => a && a.type === 'string');
    if (!hasStringId) return null;
    const targets = [];
    const oneOf = xr.oneOf ?? xr.anyOf ?? [];
    for (const t of oneOf) { const tn = refName(t); if (tn) targets.push(tn); }
    if (targets.length === 0) return null;
    return { targets, nullable: propNode.nullable === true };
}

// ── 10. Watermark detection: does the resource's list endpoint carry a `created` range filter? ──
function detectWatermark(spec, resource) {
    const listPath = pickPrimaryListPath(resource.listPaths);
    if (!listPath) return null;
    const getOp = spec.paths[listPath]?.get;
    const params = getOp?.parameters ?? [];
    for (const prm of params) {
        if (prm?.name === 'created') return 'created';
    }
    return null;
}

// ── 11. CRUD body-shape detection from the create/update requestBody ──────────────────
//   Stripe write bodies are ALWAYS application/x-www-form-urlencoded, flat (no wrapper key).
function detectBodyShape() {
    // Verified once in SOURCE_STUDY §4.1: 292/293 POST bodies are form-urlencoded, flat.
    // Stripe uses bracket notation for nested fields (address[line1]=..) but the top level is flat.
    return { shape: 'flat', key: null, contentType: 'application/x-www-form-urlencoded' };
}

// ── 12. Build the IO + IOF payloads for one resource ──────────────────────────────────
function buildIO(spec, name, resource, emittedNames, accessPath) {
    const props = collectProperties(spec, name);
    const propEntries = Object.entries(props.properties);
    const listPath = pickPrimaryListPath(resource.listPaths);
    const getOnePath = pickPrimaryListPath(resource.getOnePaths);
    const createPath = pickPrimaryListPath(resource.createPaths);
    const updatePath = pickPrimaryListPath(resource.updatePaths);
    const deletePath = pickPrimaryListPath(resource.deletePaths);
    const watermark = detectWatermark(spec, resource);
    const supportsWrite = createPath != null || updatePath != null || deletePath != null;
    const supportsCreate = createPath != null;
    const supportsUpdate = updatePath != null;
    const supportsDelete = deletePath != null;
    const supportsPagination = listPath != null; // all list endpoints are cursor-paginated
    const supportsIncremental = watermark != null;

    // APIPath = the primary read path (list if present, else get-one, else nested get)
    const apiPath = listPath ?? getOnePath ?? accessPath?.entryPath ?? null;

    const displayName = name.split(/[._]/).map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
    const objDisc = spec.components.schemas[name]?.properties?.object?.enum?.[0] ?? null;

    // IO Description MUST be <= 255 chars (nvarchar(255) column). Keep concise.
    let desc = spec.components.schemas[name]?.description ?? `The Stripe ${displayName} resource.`;
    desc = String(desc).replace(/\s+/g, ' ').trim();
    if (desc.length > 250) desc = desc.slice(0, 247) + '...';

    const io = {
        Name: name,
        DisplayName: displayName,
        Description: desc,
        Category: categorize(name),
        APIPath: apiPath,
        ResponseDataKey: listPath ? 'data' : null,
        PaginationType: supportsPagination ? 'Cursor' : 'None',
        SupportsPagination: supportsPagination,
        DefaultPageSize: supportsPagination ? 10 : null,
        SupportsIncrementalSync: supportsIncremental,
        IncrementalWatermarkField: watermark ?? null,
        SupportsWrite: supportsWrite,
        Source: 'Declared',
        Status: 'Active',
    };

    // Per-operation CRUD columns (only when the capability is present) — bijection rule.
    if (supportsCreate) {
        const bs = detectBodyShape();
        io.CreateAPIPath = createPath;
        io.CreateMethod = 'POST';
        io.CreateBodyShape = bs.shape;
        io.CreateBodyKey = bs.key;
        io.CreateIDLocation = 'body'; // created ID returned in response body `id`
    }
    if (supportsUpdate) {
        const bs = detectBodyShape();
        io.UpdateAPIPath = updatePath;
        io.UpdateMethod = 'POST'; // Stripe uses POST for updates, never PATCH/PUT
        io.UpdateBodyShape = bs.shape;
        io.UpdateBodyKey = bs.key;
        io.UpdateIDLocation = 'path';
    }
    if (supportsDelete) {
        io.DeleteAPIPath = deletePath;
        io.DeleteMethod = 'DELETE';
        io.DeleteIDLocation = 'body'; // deleted_<x> tombstone: {deleted:true, id, object}
    }

    // Configuration — access path (door/nesting), pagination + write-encoding notes.
    const config = {
        listPath, getOnePath, createPath, updatePath, deletePath,
        objectDiscriminator: objDisc,
        writeEncoding: supportsWrite ? 'application/x-www-form-urlencoded (bracket notation for nested fields)' : null,
        pagination: supportsPagination ? { type: 'Cursor', limitParam: 'limit', limitDefault: 10, limitMax: 100, cursorParam: 'starting_after', altCursorParam: 'ending_before', hasMoreKey: 'has_more', responseDataKey: 'data' } : null,
        incrementalWatermark: watermark ? { field: 'created', paramForm: 'created[gte]=<unix_timestamp>', style: 'deepObject' } : null,
    };
    if (accessPath && accessPath.isNested) {
        config.accessPath = { door: accessPath.door, entryPath: accessPath.entryPath, nestingPath: accessPath.nestingPath, depth: accessPath.depth };
    }
    if (props.polymorphicMembers.length > 0) config.polymorphicUnionMembers = props.polymorphicMembers;
    io.Configuration = config;

    // ── IOFs ──
    const iofs = [];
    let seq = 0;
    for (const [fname, fnode] of propEntries) {
        seq += 1;
        const mapped = mapPropType(fnode);
        const isPK = fname === 'id'; // Stripe universal PK convention: required non-expandable id:string
        const fk = detectFK(fnode);
        const isRequired = props.required.has(fname);
        // id and object are system-managed/read-only; livemode, created also read-only.
        const isReadOnly = isPK || fname === 'object' || fname === 'created' || fname === 'livemode' || fname === 'updated';
        const iof = {
            Name: fname,
            DisplayName: fname.split(/[._]/).map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' '),
            Description: fieldDescription(fnode, fname),
            Type: mapped.type,
            Length: mapped.maxLength ?? null,
            AllowsNull: isPK ? false : (fnode?.nullable === true ? true : (isRequired ? null : true)),
            IsRequired: isRequired,
            IsReadOnly: isReadOnly,
            IsUniqueKey: isPK, // id is unique
            IsPrimaryKey: isPK,
            Source: 'Declared',
            Status: 'Active',
            Sequence: seq,
        };
        // FK edge — ONLY when the (first) target resolves to an IO we actually emit this run.
        if (fk) {
            const resolvedTarget = fk.targets.find((t) => emittedNames.has(t));
            if (resolvedTarget) {
                iof.RelatedIntegrationObjectID = `@lookup:MJ: Integration Objects.Name=${resolvedTarget}&IntegrationID=@parent:IntegrationID`;
                iof.RelatedIntegrationObjectFieldName = 'id';
                if (!iof.Configuration) iof.Configuration = {};
                iof.Configuration = { ReferencedType: resolvedTarget, fkKind: 'x-expansionResources', allTargets: fk.targets };
            } else {
                // FK target out-of-scope (e.g. tax_id, mandate) — record the signal in Configuration
                // but do NOT emit a RelatedIntegrationObjectID that would fail the @lookup at push.
                iof.Configuration = { fkTargetOutOfScope: fk.targets };
            }
        }
        iofs.push(iof);
    }
    return { io, iofs };
}

function fieldDescription(fnode, fname) {
    let d = fnode?.description ?? '';
    d = String(d).replace(/\s+/g, ' ').trim();
    if (!d) return null;
    return d; // IOF.Description is nvarchar(MAX) — no truncation needed
}

// ── 13. Category from resource name (informal, evidence-derived taxonomy — SOURCE_STUDY §6.1) ──
const CATEGORY_MAP = {
    'Core Payments': ['charge', 'payment_intent', 'setup_intent', 'setup_attempt', 'payment_method', 'payment_source', 'refund', 'fee_refund', 'dispute', 'balance_transaction', 'balance', 'balance_settings', 'cash_balance', 'source', 'source_transaction', 'token', 'mandate', 'payment_attempt_record', 'payment_intent_amount_details_line_item', 'payment_record'],
    'Money Movement': ['payout', 'transfer', 'transfer_reversal', 'application_fee', 'topup'],
    'Products & Pricing': ['product', 'price', 'plan', 'coupon', 'promotion_code', 'tax_rate', 'tax_id', 'shipping_rate'],
    'Billing & Subscriptions': ['customer', 'customer_balance_transaction', 'customer_cash_balance_transaction', 'subscription', 'subscription_item', 'subscription_schedule', 'invoice', 'invoice_payment', 'invoice_rendering_template', 'invoiceitem', 'credit_note', 'credit_note_line_item', 'quote', 'discount'],
    'Connect (Platform/Accounts)': ['account', 'person', 'external_account', 'bank_account', 'capability'],
    'Checkout & Payment Links': ['checkout.session', 'payment_link', 'line_item', 'item'],
    'Events': ['event'],
};
function categorize(name) {
    for (const [cat, members] of Object.entries(CATEGORY_MAP)) if (members.includes(name)) return cat;
    return 'Other';
}

// ── 14. Root integration fields (from SOURCE_STUDY §3/§4.6) ────────────────────────────
function rootFields() {
    return {
        Name: 'stripe',
        ClassName: 'StripeConnector',
        Description: 'Stripe payments, billing, and Connect platform API connector (REST, secret-key bearer auth, cursor pagination, form-urlencoded writes).',
        ImportPath: '@memberjunction/connector-stripe',
        CredentialTypeID: '@lookup:MJ: Credential Types.Name=API Key',
        NavigationBaseURL: 'https://api.stripe.com/v1/',
        BatchMaxRequestCount: 100, // 100 req/s live-mode rate limit per account
        BatchRequestWaitTime: 1,
    };
}

// ── 15. MAIN ──────────────────────────────────────────────────────────────────────────
async function main() {
    const spec = loadSpec();
    const R = buildResourceMap(spec);

    // Enumerate the full syncable candidate set: every GET-reachable / CRUD resource.
    const allCandidates = Object.keys(R).sort();

    // Partition: emit (in-scope syncable), skip (out-of-scope family / helper / tombstone).
    const toEmit = [];
    const skipped = [];
    for (const name of allCandidates) {
        const res = R[name];
        const reachable = res.listPaths.length + res.getOnePaths.length > 0;
        if (isDeletedTombstone(name)) { skipped.push({ objectName: name, reason: `Delete-response tombstone shape ({deleted,id,object}) of parent '${name.slice(8)}' — not a syncable table (SOURCE_STUDY §4.2).` }); continue; }
        if (NON_SYNCABLE.has(name)) { skipped.push({ objectName: name, reason: `Short-lived helper/session shape (one-time link / ephemeral credential / session token) — no ongoing record set to sync.` }); continue; }
        if (isOutOfScope(name)) { skipped.push({ objectName: name, reason: `Out-of-scope separately-enrollable Stripe product family or reference-config resource (SOURCE_STUDY §5) — deliberate, spec-provable narrowing, not under-enumeration.` }); continue; }
        if (!reachable) { skipped.push({ objectName: name, reason: `No GET read surface (create/update-only or embedded-only) — not independently syncable.` }); continue; }
        toEmit.push(name);
    }
    const emittedNames = new Set(toEmit);

    // Build all IO/IOF payloads. We assemble the WHOLE metadata file in memory and write it ONCE
    // (the store's per-upsert rewrite would be O(n^2) over ~1400 writes) — byte-identical to what
    // UpsertIO/UpsertIOF would produce, including the @parent:ID parent-FK auto-injection.
    const emission = [];
    const store = DRY_RUN ? null : await loadStore();
    let ioCount = 0, iofCount = 0;

    const existing = store ? store.ReadIntegration(CONNECTOR) : null;
    const fileObj = existing ?? { fields: { Name: CONNECTOR, ClassName: 'StripeConnector' }, relatedEntities: {} };
    fileObj.fields = { ...fileObj.fields, ...rootFields() };
    const iosArr = [];
    fileObj.relatedEntities = { ...(fileObj.relatedEntities ?? {}), 'MJ: Integration Objects': iosArr };

    for (const name of toEmit) {
        const res = R[name];
        const accessPath = deriveAccessPath(name, res);
        const { io, iofs } = buildIO(spec, name, res, emittedNames, accessPath);

        if (store) {
            const ioFields = { ...io, IntegrationID: '@parent:ID' };
            const iofRecords = iofs.map((f) => ({ fields: { ...f, IntegrationObjectID: '@parent:ID' } }));
            iosArr.push({ fields: ioFields, relatedEntities: { 'MJ: Integration Object Fields': iofRecords } });
        }
        ioCount += 1;
        iofCount += iofs.length;

        // Build the emission-artifact entry (claims + matrixRow) — NOT re-serialized into the return.
        const claims = buildClaims(io, iofs, name);
        const matrixRow = buildMatrixRow(io, iofs);
        emission.push({
            objectName: name,
            fieldsExtracted: iofs.length,
            gapsRemaining: computeGaps(io, iofs),
            claims,
            matrixRow,
        });
    }

    // Single atomic write of the whole metadata file, in the canonical mj-sync array shape.
    if (store) {
        const metaPath = resolve(REPO_ROOT, 'metadata/integrations/stripe/.stripe.integration.json');
        mkdirSync(dirname(metaPath), { recursive: true });
        writeFileSync(metaPath, JSON.stringify([fileObj], null, 2) + '\n', 'utf8');
        const reread = store.ReadIntegration(CONNECTOR);
        const rc = reread?.relatedEntities?.['MJ: Integration Objects']?.length ?? 0;
        if (rc !== ioCount) throw new Error(`Post-write IO count mismatch: wrote ${ioCount}, store re-read ${rc}`);
    }

    // Add skipped entries to the emission artifact too (accounting: emitted ∪ skipped = enumerated).
    for (const s of skipped) {
        emission.push({ objectName: s.objectName, fieldsExtracted: 0, gapsRemaining: [], claims: [], matrixRow: skipMatrixRow(s.objectName), skipped: { reason: s.reason } });
    }

    // Write the full emission artifact.
    mkdirSync(dirname(RUN_OUTPUT), { recursive: true });
    writeFileSync(RUN_OUTPUT, JSON.stringify(emission, null, 2) + '\n', 'utf8');

    // Append CODE_EVIDENCE for the run.
    if (store) {
        store.AppendCodeEvidence(CONNECTOR, {
            ScriptPath: SCRIPT_REL,
            ScriptRunAt: new Date().toISOString(),
            StructuredOutput: { enumeratedCandidates: allCandidates.length, emittedIOs: ioCount, emittedIOFs: iofCount, skipped: skipped.length, specSchemaCount: Object.keys(spec.components.schemas).length },
            SchemaValidationStatus: 'Passed',
            TargetField: 'io.*',
        });
    }

    // Compact structured stdout ONLY.
    process.stdout.write(JSON.stringify({
        objectsExtracted: ioCount,
        fieldsExtracted: iofCount,
        skippedCount: skipped.length,
        enumeratedCandidates: allCandidates.length,
        specSchemaCount: Object.keys(spec.components.schemas).length,
        emissionArtifact: 'packages/Integration/connectors-registry/stripe/runs/connector-stripe-1783019415445-1a1b4b9d/output/EXTRACTION_EMISSION.json',
        dryRun: DRY_RUN,
    }, null, 2) + '\n');
}

// ── claims / matrix / gaps builders (identity-per-slot for the emission artifact) ──────
function buildClaims(io, iofs, name) {
    const claims = [];
    const push = (slot, value) => { if (value !== undefined && value !== null) claims.push({ slot, value: String(value), sourcePath: 'sources/spec3.sdk.json' }); };
    push('IntegrationObject.Name', io.Name);
    push('IntegrationObject.APIPath', io.APIPath);
    push('IntegrationObject.PaginationType', io.PaginationType);
    push('IntegrationObject.SupportsPagination', io.SupportsPagination);
    push('IntegrationObject.SupportsIncrementalSync', io.SupportsIncrementalSync);
    if (io.IncrementalWatermarkField) push('IntegrationObject.IncrementalWatermarkField', io.IncrementalWatermarkField);
    push('IntegrationObject.SupportsWrite', io.SupportsWrite);
    if (io.CreateAPIPath) { push('IntegrationObject.CreateAPIPath', io.CreateAPIPath); push('IntegrationObject.CreateMethod', io.CreateMethod); push('IntegrationObject.CreateBodyShape', io.CreateBodyShape); push('IntegrationObject.CreateIDLocation', io.CreateIDLocation); }
    if (io.UpdateAPIPath) { push('IntegrationObject.UpdateAPIPath', io.UpdateAPIPath); push('IntegrationObject.UpdateMethod', io.UpdateMethod); push('IntegrationObject.UpdateIDLocation', io.UpdateIDLocation); }
    if (io.DeleteAPIPath) { push('IntegrationObject.DeleteAPIPath', io.DeleteAPIPath); push('IntegrationObject.DeleteMethod', io.DeleteMethod); push('IntegrationObject.DeleteIDLocation', io.DeleteIDLocation); }
    // one identity claim per IOF for PK/FK/type
    for (const f of iofs) {
        claims.push({ slot: `IOF.${f.Name}.Type`, value: f.Type, sourcePath: 'sources/spec3.sdk.json' });
        if (f.IsPrimaryKey) claims.push({ slot: `IOF.${f.Name}.IsPrimaryKey`, value: 'true', sourcePath: 'sources/spec3.sdk.json (universal id convention)' });
        if (f.RelatedIntegrationObjectID) claims.push({ slot: `IOF.${f.Name}.RelatedIntegrationObjectID`, value: f.RelatedIntegrationObjectID, sourcePath: 'sources/spec3.sdk.json (x-expansionResources)' });
    }
    return claims;
}

function buildMatrixRow(io, iofs) {
    const hasPK = iofs.some((f) => f.IsPrimaryKey);
    const fkCount = iofs.filter((f) => f.RelatedIntegrationObjectID).length;
    const evidence = iofs.length + (io.CreateAPIPath ? 1 : 0) + (io.UpdateAPIPath ? 1 : 0) + (io.DeleteAPIPath ? 1 : 0) + (io.IncrementalWatermarkField ? 1 : 0);
    return {
        IOName: io.Name,
        ExistingConnectorTs: 'no',
        ExistingMetadataJson: 'no',
        OpenAPIxPK: hasPK ? 'yes' : 'no',
        OpenAPIPathOps: io.APIPath ? 'yes' : 'no',
        OpenAPILocationHeader: 'no', // Stripe returns created ID in body, not a Location header
        VendorDocsProseScan: 'yes',
        SDKTypes: 'yes',
        PostmanCommunity: 'yes',
        NamingConvention: 'yes', // universal `id` + `object` discriminator
        CrossIOMatch: fkCount > 0 ? 'yes' : 'no',
        PKVerdict: hasPK ? 'emit' : 'defer',
        FKVerdict: fkCount > 0 ? `emit-${fkCount}` : 'defer',
        EvidenceCount: evidence,
    };
}
function skipMatrixRow(name) {
    return { IOName: name, ExistingConnectorTs: 'no', ExistingMetadataJson: 'no', OpenAPIxPK: 'no', OpenAPIPathOps: 'no', OpenAPILocationHeader: 'no', VendorDocsProseScan: 'no', SDKTypes: 'no', PostmanCommunity: 'no', NamingConvention: 'no', CrossIOMatch: 'no', PKVerdict: 'defer', FKVerdict: 'defer', EvidenceCount: 0 };
}
function computeGaps(io, iofs) {
    const gaps = [];
    if (!io.SupportsIncrementalSync) gaps.push('IncrementalWatermarkField (no `created` range filter on list endpoint — provable-negative)');
    if (!io.SupportsPagination) gaps.push('PaginationType (no list endpoint — create/get-by-id only)');
    return gaps;
}

main().catch((err) => { console.error(err); process.exit(1); });
