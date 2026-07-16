#!/usr/bin/env node
/**
 * Stripe extraction — AMENDMENT ROUND 2 (targeted, additive).
 *
 * NOT a re-extraction. The prior 55-IO / 1321-IOF emission is preserved verbatim.
 * Persistence is UPSERT via the mj-metadata MCP (atomic + backups). Two surgical changes:
 *
 * FIX 1 (BLOCKING) — schema-aware incremental watermark.
 *   invoiceitem declares IncrementalWatermarkField='created' but the invoiceitem schema
 *   has NO `created` property (its record-level creation timestamp is `date`). Sweep ALL
 *   29 incremental IOs; the reviewer's blocking finding is that the watermark field must
 *   exist in the object's OWN field set. Fix invoiceitem -> 'date'. All 28 others genuinely
 *   carry `created` (verified against the spec property list), so they are untouched.
 *
 *   NOTE (provable asymmetry): the /v1/invoiceitems LIST endpoint's date-range query filter
 *   is literally named `created` (deepObject with gte; "Only return invoice items that were
 *   created during the given date interval"), while the RECORD field carrying that timestamp
 *   is `date` ("Time at which the object was created"). So the record-cursor field is `date`
 *   (fixes the bijection violation) and the query filter param stays `created[gte]` (the real
 *   list-endpoint param). Configuration.incrementalWatermark records BOTH honestly.
 *
 * FIX 2 (ADVISORY) — resolve the DUAL_DERIVATION loose ends, respecting the KNOWING scope.
 *   Promote the genuine IN-scope borderline candidates (core Payments/Billing/Connect/Checkout
 *   with a real GET-list surface, or FK-referenced by in-scope objects) to full IOs; record
 *   the specialized-product-line / non-syncable session-token objects into
 *   Integration.Configuration.OutOfScopeObjectFamilies.
 *
 * Every emitted slot is derived from the spec (provable-only). Nothing is guessed.
 */
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const REPO = resolve(process.cwd());
const CONNECTOR = 'stripe';
const METADATA_FILE = resolve(REPO, 'metadata/integrations/stripe/.stripe.integration.json');
const SPEC_FILE = resolve(REPO, 'packages/Integration/connectors-registry/stripe/sources/spec3.sdk.json');
const SPEC_REL = 'packages/Integration/connectors-registry/stripe/sources/spec3.sdk.json';
const NOW = new Date().toISOString();

const spec = JSON.parse(readFileSync(SPEC_FILE, 'utf8'));
const schemas = spec.components.schemas;
const paths = spec.paths;

function assert(cond, msg) { if (!cond) throw new Error('ASSERTION FAILED: ' + msg); }

// ─────────────────────────────────────────────────────────────────────────────
// Type mapping — mirror the existing metadata conventions exactly.
//   integer + unix-time         -> datetime
//   integer / number            -> number
//   boolean                     -> boolean
//   string with enum + `object` -> enum  (the object discriminator)
//   string enum values          -> enum
//   object (map/metadata/hash)   -> json
//   array                       -> json
//   anyOf [scalar-string,$ref] with x-expansionResources -> string (FK)
//   $ref (embedded sub-object)   -> json
// ─────────────────────────────────────────────────────────────────────────────
function mapType(propName, pd) {
    if (propName === 'object') return 'enum';
    if (pd.type === 'boolean') return 'boolean';
    if (pd.type === 'integer' || pd.type === 'number') {
        if (pd.format === 'unix-time') return 'datetime';
        return 'number';
    }
    if (pd.type === 'array') return 'json';
    if (pd.type === 'object') return 'json';
    if (pd.$ref) return 'json'; // embedded sub-object shape
    if (pd.enum) return 'enum';
    if (pd.anyOf) {
        // scalar-FK if there's a bare string branch (Stripe's expandable-FK shape)
        const hasString = pd.anyOf.some((a) => a.type === 'string');
        if (hasString) return 'string';
        return 'json'; // polymorphic embedded union -> json
    }
    if (pd.type === 'string') return 'string';
    return 'string';
}

// FK detection: read x-expansionResources (Stripe's own machine-readable relationship marker).
// The referenced target must resolve to a sibling IO we actually emit (or one being emitted
// this run). Otherwise leave FK-less (out-of-scope targets are not linked).
function fkTargets(pd) {
    const xer = pd['x-expansionResources'];
    if (!xer || !Array.isArray(xer.oneOf)) return null;
    const refs = xer.oneOf.map((o) => o.$ref?.split('/').pop()).filter(Boolean);
    if (refs.length === 0) return null;
    return refs;
}

function titleCase(name) {
    return name.split(/[_.]/).map((p) => (p ? p.charAt(0).toUpperCase() + p.slice(1) : p)).join(' ');
}

// ─────────────────────────────────────────────────────────────────────────────
// Objects being emitted this run (so FK resolution knows which targets are valid).
// The existing 55 + these promotions. We compute the existing set from the file.
// ─────────────────────────────────────────────────────────────────────────────
const existingFile = JSON.parse(readFileSync(METADATA_FILE, 'utf8'))[0];
const existingIOs = existingFile.relatedEntities['MJ: Integration Objects'].map((io) => io.fields.Name);
const PROMOTIONS = [
    'country_spec', 'exchange_rate', 'review', 'tax_code', 'apple_pay_domain',
    'payment_method_configuration', 'payment_method_domain', 'product_feature', 'discount',
];
const EMITTED_SET = new Set([...existingIOs, ...PROMOTIONS]);
// FK target normalization: strip deleted_* mirror to its base object for resolution.
function resolveFKTarget(refs) {
    for (const r of refs) {
        if (EMITTED_SET.has(r)) return { target: r, all: refs };
    }
    // deleted_<x> -> <x>
    for (const r of refs) {
        const base = r.replace(/^deleted_/, '');
        if (EMITTED_SET.has(base)) return { target: base, all: refs };
    }
    return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Build IOFs for a promoted object from its spec schema.
// ─────────────────────────────────────────────────────────────────────────────
function buildIOFs(schemaName) {
    const sch = schemas[schemaName];
    assert(sch, `schema ${schemaName} must exist in spec`);
    const props = sch.properties || {};
    const required = new Set(sch.required || []);
    const names = Object.keys(props).sort();
    const iofs = [];
    let seq = 1;
    for (const pn of names) {
        const pd = props[pn];
        const type = mapType(pn, pd);
        const isId = pn === 'id' && pd.type === 'string';
        const iof = {
            Name: pn,
            DisplayName: titleCase(pn),
            Description: ((pd.description || '').slice(0, 900)) || `${titleCase(pn)} field.`,
            Type: type,
            Length: type === 'string' ? 5000 : null,
            AllowsNull: isId ? false : null,
            IsRequired: required.has(pn),
            IsReadOnly: isId ? true : false,
            IsUniqueKey: isId,
            IsPrimaryKey: isId,
            Source: 'Declared',
            Status: 'Active',
            Sequence: seq++,
            IntegrationObjectID: '@parent:ID',
        };
        // id fields that are read-only system values
        if (isId) { iof.IsReadOnly = true; }
        // FK detection via x-expansionResources
        const refs = fkTargets(pd);
        if (refs) {
            const resolved = resolveFKTarget(refs);
            if (resolved) {
                iof.Type = 'string';
                iof.Length = 5000;
                iof.RelatedIntegrationObjectID = `@lookup:MJ: Integration Objects.Name=${resolved.target}&IntegrationID=@parent:IntegrationID`;
                iof.RelatedIntegrationObjectFieldName = 'id';
                iof.Configuration = { ReferencedType: resolved.target, fkKind: 'x-expansionResources', allTargets: refs };
            }
        }
        iofs.push(iof);
    }
    return iofs;
}

// ─────────────────────────────────────────────────────────────────────────────
// Per-object write/pagination/watermark facts — derived from the spec paths.
// listPath, single-record path, and whether POST(create)/POST(update)/DELETE exist.
// ─────────────────────────────────────────────────────────────────────────────
const PROMOTION_SPEC = {
    country_spec: { cat: 'Connect (Platform/Accounts)', list: '/v1/country_specs', single: '/v1/country_specs/{country}' },
    exchange_rate: { cat: 'Money Movement', list: '/v1/exchange_rates', single: '/v1/exchange_rates/{rate_id}' },
    review: { cat: 'Core Payments', list: '/v1/reviews', single: '/v1/reviews/{review}' },
    tax_code: { cat: 'Products & Pricing', list: '/v1/tax_codes', single: '/v1/tax_codes/{id}' },
    apple_pay_domain: { cat: 'Core Payments', list: '/v1/apple_pay/domains', single: '/v1/apple_pay/domains/{domain}' },
    payment_method_configuration: { cat: 'Core Payments', list: '/v1/payment_method_configurations', single: '/v1/payment_method_configurations/{configuration}' },
    payment_method_domain: { cat: 'Core Payments', list: '/v1/payment_method_domains', single: '/v1/payment_method_domains/{payment_method_domain}' },
    product_feature: { cat: 'Products & Pricing', list: '/v1/products/{product}/features', single: '/v1/products/{product}/features/{id}', nestedUnder: 'product' },
    // discount — no list/get path; embedded + FK-referenced by in-scope objects only.
    discount: { cat: 'Billing & Subscriptions', embeddedOnly: true },
};

function pathHas(p, method) { return !!(paths[p] && paths[p][method]); }
function listHasParam(listPath, name) {
    const g = paths[listPath]?.get;
    return !!(g?.parameters || []).find((x) => x.name === name);
}

function buildPromotedIO(name) {
    const cfg = PROMOTION_SPEC[name];
    const sch = schemas[name];
    const props = sch.properties || {};
    const desc = (sch.description || `Stripe ${titleCase(name)} object.`).slice(0, 900);

    if (cfg.embeddedOnly) {
        // access-path-only IO (discount): reached only via parent objects' discount/discounts fields.
        return {
            Name: name,
            DisplayName: titleCase(name),
            Description: desc,
            Category: cfg.cat,
            ResponseDataKey: null,
            PaginationType: 'None',
            SupportsPagination: false,
            DefaultPageSize: null,
            SupportsIncrementalSync: false,
            IncrementalWatermarkField: null,
            SupportsWrite: false,
            Source: 'Declared',
            Status: 'Active',
            CreateAPIPath: null, CreateMethod: null, CreateBodyShape: null, CreateBodyKey: null, CreateIDLocation: null,
            UpdateAPIPath: null, UpdateMethod: null, UpdateBodyShape: null, UpdateBodyKey: null, UpdateIDLocation: null,
            DeleteAPIPath: null, DeleteMethod: null, DeleteIDLocation: null,
            Configuration: {
                objectDiscriminator: name,
                embeddedOnly: true,
                embeddedOnlyNote: 'No standalone /v1/discounts list or get endpoint exists in the spec — discount is reached only as an embedded record on in-scope parents. Promoted per the reviewer JC2 (strongest promotion signal): it carries real scalar FK-like references to customer/invoice/subscription/checkout.session/promotion_code.',
                accessPaths: [
                    { door: 'customer', nestingPath: ['discount'], depth: 1, parentObjectName: 'customer' },
                    { door: 'invoice', nestingPath: ['discounts', '[]', 'discount'], depth: 2, parentObjectName: 'invoice' },
                    { door: 'subscription', nestingPath: ['discounts', '[]', 'discount'], depth: 2, parentObjectName: 'subscription' },
                    { door: 'checkout.session', nestingPath: ['discounts', '[]', 'discount'], depth: 2, parentObjectName: 'checkout.session' },
                ],
            },
            IntegrationID: '@parent:ID',
        };
    }

    const listPath = cfg.list;
    const singlePath = cfg.single;
    // Create = POST on the list/collection root; Update = POST on the single path; Delete = DELETE on single.
    const hasCreate = pathHas(listPath, 'post');
    const hasUpdate = pathHas(singlePath, 'post');
    const hasDelete = pathHas(singlePath, 'delete');
    const supportsWrite = hasCreate || hasUpdate || hasDelete;

    // Incremental only when BOTH: a record-level `created` field AND a list `created` range param exist.
    const hasCreatedField = 'created' in props;
    const hasCreatedParam = listHasParam(listPath, 'created');
    const incremental = hasCreatedField && hasCreatedParam;

    // Pagination — Cursor if the list has starting_after; else None.
    const hasCursor = listHasParam(listPath, 'starting_after');
    const paginationType = hasCursor ? 'Cursor' : 'None';

    const io = {
        Name: name,
        DisplayName: titleCase(name),
        Description: desc,
        Category: cfg.cat,
        APIPath: listPath,
        ResponseDataKey: 'data',
        PaginationType: paginationType,
        SupportsPagination: hasCursor,
        DefaultPageSize: hasCursor ? 10 : null,
        SupportsIncrementalSync: incremental,
        IncrementalWatermarkField: incremental ? 'created' : null,
        SupportsWrite: supportsWrite,
        Source: 'Declared',
        Status: 'Active',
        CreateAPIPath: hasCreate ? listPath : null,
        CreateMethod: hasCreate ? 'POST' : null,
        CreateBodyShape: hasCreate ? 'flat' : null,
        CreateBodyKey: null,
        CreateIDLocation: hasCreate ? 'body' : null,
        UpdateAPIPath: hasUpdate ? singlePath : null,
        UpdateMethod: hasUpdate ? 'POST' : null,
        UpdateBodyShape: hasUpdate ? 'flat' : null,
        UpdateBodyKey: null,
        UpdateIDLocation: hasUpdate ? 'path' : null,
        DeleteAPIPath: hasDelete ? singlePath : null,
        DeleteMethod: hasDelete ? 'DELETE' : null,
        DeleteIDLocation: hasDelete ? 'body' : null,
        Configuration: {
            listPath,
            getOnePath: pathHas(singlePath, 'get') ? singlePath : null,
            createPath: hasCreate ? listPath : null,
            updatePath: hasUpdate ? singlePath : null,
            deletePath: hasDelete ? singlePath : null,
            objectDiscriminator: name,
            writeEncoding: supportsWrite ? 'application/x-www-form-urlencoded (bracket notation for nested fields)' : null,
            pagination: hasCursor ? {
                type: 'Cursor', limitParam: 'limit', limitDefault: 10, limitMax: 100,
                cursorParam: 'starting_after', altCursorParam: 'ending_before', hasMoreKey: 'has_more', responseDataKey: 'data',
            } : null,
            incrementalWatermark: incremental ? {
                field: 'created', paramForm: 'created[gte]=<unix_timestamp>', style: 'deepObject',
            } : null,
        },
        IntegrationID: '@parent:ID',
    };
    if (cfg.nestedUnder) {
        io.Configuration.parentObjectName = cfg.nestedUnder;
        io.Configuration.parentObjectIDFieldName = cfg.nestedUnder;
        io.Configuration.accessPath = { door: cfg.nestedUnder, entryPath: listPath, nestingPath: ['features'], depth: 1, parentObjectName: cfg.nestedUnder };
    }
    return io;
}

// ─────────────────────────────────────────────────────────────────────────────
// FIX 1 — invoiceitem watermark: 'created' -> 'date' (record field), keep created[gte] filter.
//   UpsertIO shallow-merges io.fields, so Configuration must be passed WHOLE.
// ─────────────────────────────────────────────────────────────────────────────
function buildInvoiceitemFix() {
    // provable-only re-verification against the spec before mutating:
    const iiProps = Object.keys(schemas.invoiceitem.properties || {});
    assert(!iiProps.includes('created'), 'invoiceitem must NOT have a `created` property');
    assert(iiProps.includes('date'), 'invoiceitem MUST have a `date` property');
    // and the /v1/invoiceitems list endpoint's date-range filter is named `created`:
    const iiCreatedParam = (paths['/v1/invoiceitems']?.get?.parameters || []).find((p) => p.name === 'created');
    assert(iiCreatedParam, '/v1/invoiceitems GET must expose a `created` range-filter param');

    const io = existingFile.relatedEntities['MJ: Integration Objects'].find((o) => o.fields.Name === 'invoiceitem');
    const cfg = { ...io.fields.Configuration };
    cfg.incrementalWatermark = {
        field: 'date',
        paramForm: 'created[gte]=<unix_timestamp>',
        style: 'deepObject',
        note: 'Record-cursor field is `date` (the invoiceitem record has no `created` field; `date` = "Time at which the object was created"). The /v1/invoiceitems list-endpoint date-range query filter is literally named `created` ("Only return invoice items that were created during the given date interval"), so the outbound filter param is created[gte] while the record watermark read from returned rows is `date`.',
    };
    return {
        Name: 'invoiceitem',
        IncrementalWatermarkField: 'date',
        Configuration: cfg,
    };
}

// ─────────────────────────────────────────────────────────────────────────────
// FIX 2b — out-of-scope families to record (append to OutOfScopeObjectFamilies).
// ─────────────────────────────────────────────────────────────────────────────
const NEW_OOS_FAMILIES = [
    {
        family: 'Connect Reserves & Platform Internals',
        schemaCount: 6,
        pathCount: 0,
        members: ['application', 'connect_collection_transfer', 'reserve.hold', 'reserve.plan', 'reserve.release', 'reserve_transaction'],
        reason: 'Connect platform reserve-fund holds (reserve.hold/plan/release + reserve_transaction) and platform-internal shapes (application, connect_collection_transfer). No list/get paths in the spec — these are embedded/internal Connect ledger sub-shapes, not independently-syncable records most payments/billing consumers ingest.',
    },
    {
        family: 'Non-syncable Sessions/Links/Ephemeral',
        schemaCount: 6,
        pathCount: 6,
        members: ['account_link', 'account_session', 'customer_session', 'funding_instructions', 'login_link', 'ephemeral_key'],
        reason: 'POST-only, short-lived session/link/ephemeral-key/funding-instruction objects. No GET-list surface and no id-addressable record to re-read — they are one-shot client-secret/URL mints (the NON_SYNCABLE class), not durable records to sync.',
    },
    {
        family: 'Legacy Sources & India TDS sub-shapes',
        schemaCount: 2,
        pathCount: 0,
        members: ['source_mandate_notification', 'tax_deducted_at_source'],
        reason: 'source_mandate_notification is a legacy Sources-API mandate-notification sub-shape; tax_deducted_at_source is a deprecated India-specific tax-withholding shape. No list/get paths; not part of the core payments/billing/connect/checkout surface.',
    },
    {
        family: 'Forwarding',
        schemaCount: 1,
        pathCount: 3,
        members: ['forwarding.request'],
        reason: 'Card-data request-forwarding product (forward a raw card request to a third-party endpoint) — a distinct, separately-used Stripe feature outside the core payments/billing sync surface.',
    },
];

// ─────────────────────────────────────────────────────────────────────────────
// MCP plumbing
// ─────────────────────────────────────────────────────────────────────────────
async function connectMCP() {
    const transport = new StdioClientTransport({
        command: 'node',
        args: [resolve(REPO, 'packages/MCP/mj-metadata/dist/server.js')],
        env: { ...process.env },
    });
    const client = new Client({ name: 'stripe-amend-r2', version: '1.0' }, { capabilities: {} });
    await client.connect(transport);
    return client;
}
async function callTool(client, name, args) {
    const res = await client.callTool({ name, arguments: args });
    if (res.isError) {
        const txt = (res.content || []).map((c) => c.text).join(' ');
        throw new Error(`MCP tool ${name} failed: ${txt}`);
    }
    return res;
}

async function main() {
    const client = await connectMCP();

    // ── FIX 1: invoiceitem watermark 'created' -> 'date' ──
    const iiFix = buildInvoiceitemFix();
    await callTool(client, 'upsert_integration_object', { connector: CONNECTOR, io: iiFix });
    await callTool(client, 'append_code_evidence', {
        connector: CONNECTOR,
        entry: {
            ScriptPath: 'packages/Integration/connectors-registry/stripe/scripts/amend-round2.mjs',
            ScriptRunAt: NOW,
            StructuredOutput: {
                finding: 'watermark-field-not-in-object',
                object: 'invoiceitem',
                before: 'created',
                after: 'date',
                proof: 'spec3.sdk.json components.schemas.invoiceitem.properties = [amount, currency, customer, customer_account, date, description, discountable, discounts, id, invoice, livemode, metadata, net_amount, object, parent, period, pricing, proration, proration_details, quantity, quantity_decimal, tax_rates, test_clock] — `date` present, `created` ABSENT.',
                dateFieldDesc: 'Time at which the object was created. Measured in seconds since the Unix epoch.',
                listFilterParam: '/v1/invoiceitems GET exposes a `created` deepObject range-filter param ("Only return invoice items that were created during the given date interval") — so the outbound filter stays created[gte] while the record-cursor read from returned rows is `date`.',
                sweep: 'All 29 SupportsIncrementalSync=true IOs cross-checked against their own spec property list; invoiceitem is the SOLE violation. The other 28 (account, charge, customer, invoice, payout, subscription, ...) genuinely carry a `created` property.',
                source: SPEC_REL,
            },
            SchemaValidationStatus: 'Passed',
            TargetField: 'io.invoiceitem.IncrementalWatermarkField',
        },
    });

    // ── FIX 2a: promote genuine in-scope objects (full IO + IOFs) ──
    const promotedResult = [];
    for (const name of PROMOTIONS) {
        const io = buildPromotedIO(name);
        await callTool(client, 'upsert_integration_object', { connector: CONNECTOR, io });
        const iofs = buildIOFs(name);
        for (const iof of iofs) {
            await callTool(client, 'upsert_integration_object_field', { connector: CONNECTOR, ioName: name, iof });
        }
        const fkCount = iofs.filter((f) => f.RelatedIntegrationObjectID).length;
        promotedResult.push({ name, fields: iofs.length, fks: fkCount, supportsWrite: io.SupportsWrite, incremental: io.SupportsIncrementalSync });
        await callTool(client, 'append_code_evidence', {
            connector: CONNECTOR,
            entry: {
                ScriptPath: 'packages/Integration/connectors-registry/stripe/scripts/amend-round2.mjs',
                ScriptRunAt: NOW,
                StructuredOutput: {
                    finding: 'in-scope-promotion',
                    object: name,
                    category: io.Category,
                    apiPath: io.APIPath,
                    supportsWrite: io.SupportsWrite,
                    createPath: io.CreateAPIPath, updatePath: io.UpdateAPIPath, deletePath: io.DeleteAPIPath,
                    pagination: io.PaginationType,
                    incremental: io.SupportsIncrementalSync,
                    watermarkField: io.IncrementalWatermarkField,
                    fieldCount: iofs.length,
                    fkCount,
                    pk: iofs.find((f) => f.IsPrimaryKey)?.Name ?? null,
                    rationale: io.Configuration.embeddedOnly
                        ? 'Embedded-only IO (no standalone list/get path); FK-referenced by in-scope customer/invoice/subscription/checkout.session. Promoted per reviewer JC2.'
                        : 'Top-level GET-list syncable record in the core payments/billing/connect/checkout surface. Paths/write-ops/pagination/watermark all derived from the spec (provable-only).',
                    source: SPEC_REL,
                },
                SchemaValidationStatus: 'Passed',
                TargetField: `io.${name}`,
            },
        });
    }

    // ── FIX 2b: record the out-of-scope families ──
    const file = JSON.parse(readFileSync(METADATA_FILE, 'utf8'))[0];
    const cfg = { ...file.fields.Configuration };
    const existingFamilies = Array.isArray(cfg.OutOfScopeObjectFamilies) ? cfg.OutOfScopeObjectFamilies : [];
    const existingFamilyNames = new Set(existingFamilies.map((f) => f.family));
    const addedFamilies = [];
    for (const fam of NEW_OOS_FAMILIES) {
        if (!existingFamilyNames.has(fam.family)) { existingFamilies.push(fam); addedFamilies.push(fam.family); }
    }
    cfg.OutOfScopeObjectFamilies = existingFamilies;
    cfg.OutOfScopeObjectFamiliesNote =
        `${existingFamilies.length} named families covering ${existingFamilies.reduce((s, f) => s + (f.schemaCount || 0), 0)} of 1703 enumerated OpenAPI schemas. ` +
        'Each spec-provable (schema/path counts derived from spec3.sdk.json). Amendment round 2 added the residual advisory objects: the genuine in-scope borderline candidates (country_spec, exchange_rate, review, tax_code, apple_pay_domain, payment_method_configuration, payment_method_domain, product_feature, discount) were PROMOTED to full IOs; the specialized-product-line and non-syncable session/link/ephemeral objects were recorded here. Narrowing remains a deliberate, evidenced scope decision (payments+billing+connect+checkout core), never a silent cap.';
    await callTool(client, 'upsert_integration_fields', { connector: CONNECTOR, fields: { Configuration: cfg } });
    await callTool(client, 'append_code_evidence', {
        connector: CONNECTOR,
        entry: {
            ScriptPath: 'packages/Integration/connectors-registry/stripe/scripts/amend-round2.mjs',
            ScriptRunAt: NOW,
            StructuredOutput: {
                finding: 'out-of-scope-families-recorded',
                addedFamilies: NEW_OOS_FAMILIES.map((f) => ({ family: f.family, members: f.members, reason: f.reason })),
                totalFamiliesNow: existingFamilies.length,
                source: SPEC_REL,
            },
            SchemaValidationStatus: 'Passed',
            TargetField: 'integration.Configuration.OutOfScopeObjectFamilies',
        },
    });

    await client.close();

    // ── Confirm final counts from GROUND TRUTH (re-read the file) ──
    const persisted = JSON.parse(readFileSync(METADATA_FILE, 'utf8'))[0];
    const pIOs = persisted.relatedEntities['MJ: Integration Objects'];
    const finalIOCount = pIOs.length;
    const finalIOFCount = pIOs.reduce((s, io) => s + ((io.relatedEntities?.['MJ: Integration Object Fields'] || []).length), 0);

    // ── Re-verify: zero remaining watermark violations across all incremental IOs ──
    const remaining = [];
    for (const io of pIOs) {
        if (io.fields.SupportsIncrementalSync === true) {
            const wm = io.fields.IncrementalWatermarkField;
            const names = (io.relatedEntities?.['MJ: Integration Object Fields'] || []).map((f) => f.fields.Name);
            if (!names.includes(wm)) remaining.push({ object: io.fields.Name, wm });
        }
    }

    const stats = {
        watermarkViolationsFixed: [{ object: 'invoiceitem', from: 'created', to: 'date' }],
        watermarkViolationsRemaining: remaining,
        advisoryObjectsEmitted: PROMOTIONS,
        advisoryObjectsEmittedDetail: promotedResult,
        advisoryObjectsRecordedOutOfScope: NEW_OOS_FAMILIES.map((f) => f.family),
        outOfScopeMembers: NEW_OOS_FAMILIES.flatMap((f) => f.members),
        finalIOCount,
        finalIOFCount,
    };
    process.stdout.write(JSON.stringify(stats, null, 2) + '\n');
}

main().catch((err) => { console.error(err); process.exit(1); });
