// Stripe fixture generator (adapter over the shared gen-fixture.mjs buildFixtureFromRows).
//
// Reads the DEPLOYED-shape metadata (metadata/integrations/stripe/.stripe.integration.json), builds the
// normalized row array the shared builder consumes, and writes
// packages/Integration/connectors/test/fixtures/stripe/fixtures/fixtures.json for the credential-free
// hybrid-e2e MOCK mode.
//
// Object classification (64 total):
//   • 45 FLAT           — clean list APIPath (/v1/customers, /v1/charges, …)      → flat GET route each.
//   • 13 FETCHABLE TMPL — {parent} path whose Configuration.parentObjectName points at a FLAT parent IO;
//                         the base connector iterates synced parent ids and the mock wildcard-matches the
//                         parent-substituted path (matchRoute {seg} matching)     → raw template route each.
//   •  6 SKIPPED (structurally unfetchable — excluded from the fixtures Objects[] AND Disabled in the DB):
//       - mandate / payment_record / source / token — get-by-id ONLY (no list endpoint, no parentObjectName)
//       - source_transaction                        — parent `source` is itself unfetchable → 0 parents
//       - discount                                  — APIPath null, embeddedOnly (no independent read endpoint)
//
// The Stripe list envelope is `{ data:[...], has_more:<bool>, object:'list' }`. buildFixtureFromRows wraps
// rows under `data` (envelopeKey='data'); this adapter then injects `has_more:false` + `object:'list'` into
// every route body so the connector's ExtractPaginationInfo terminates cleanly, and seeds a dummy Stripe
// secret key (secretKey / Token = 'sk_test_mock') into Configuration so Authenticate() passes against the mock.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildFixtureFromRows } from '../../gen-fixture.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, '../../../../../..');
const META_PATH = resolve(REPO_ROOT, 'metadata/integrations/stripe/.stripe.integration.json');
const OUT_PATH = resolve(HERE, 'fixtures/fixtures.json');

/** Objects that are structurally unfetchable → excluded from the Objects[] and Disabled in the deployed DB. */
export const SKIPPED_OBJECTS = [
    { object: 'mandate', reason: 'get-by-id only (/v1/mandates/{mandate}); Stripe has no list-all endpoint and no parentObjectName → ResolveParentForVar cannot resolve a parent to iterate.' },
    { object: 'payment_record', reason: 'get-by-id only (/v1/payment_records/{id}); no list endpoint and no parentObjectName → unfetchable.' },
    { object: 'source', reason: 'get-by-id only (/v1/sources/{source}); no list endpoint and no parentObjectName → unfetchable.' },
    { object: 'token', reason: 'get-by-id only (/v1/tokens/{token}); no list endpoint and no parentObjectName → unfetchable.' },
    { object: 'source_transaction', reason: 'parent object `source` is itself unfetchable (get-by-id only), so there are zero synced parents to iterate /v1/sources/{source}/source_transactions over.' },
    { object: 'discount', reason: 'embeddedOnly — APIPath is null; a discount is an inline sub-object of customer/subscription/invoice with no independent read endpoint.' },
];
const SKIPPED_SET = new Set(SKIPPED_OBJECTS.map((s) => s.object));

/** Map a metadata logical Type (json/enum/boolean/string/datetime/integer/array/number) to the coarse
 *  field-type string gen-fixture's synth() keys off (it substring-matches int/bool/date/char/etc.). */
function coarseType(t) {
    const s = String(t || '').toLowerCase();
    if (s === 'integer') return 'int';
    if (s === 'number') return 'decimal';
    if (s === 'boolean') return 'boolean';
    if (s === 'datetime') return 'datetime';
    // string / enum / json / array → a plain string column (mock passes the value through verbatim).
    return 'nvarchar';
}

function loadRows() {
    const meta = JSON.parse(readFileSync(META_PATH, 'utf8'));
    const root = Array.isArray(meta) ? meta[0] : meta;
    const ios = root.relatedEntities['MJ: Integration Objects'] || [];

    // First pass: index every object by name + classify flat vs template vs embedded so we can prove
    // a template object's parent is itself FLAT (fetchable) before treating the child as fetchable.
    const info = {};
    for (const io of ios) {
        const ap = io.fields.APIPath;
        info[io.fields.Name] = {
            apipath: ap,
            kind: ap == null ? 'embedded' : (/\{[^}]+\}/.test(ap) ? 'template' : 'flat'),
            parent: (io.fields.Configuration || {}).parentObjectName || null,
        };
    }
    const isFetchable = (name) => {
        const i = info[name];
        if (!i) return false;
        if (i.kind === 'flat') return true;
        if (i.kind === 'embedded') return false;
        // template: fetchable iff a declared parentObjectName resolves to a FLAT sibling.
        return !!(i.parent && info[i.parent] && info[i.parent].kind === 'flat');
    };

    const rows = [];
    const covered = [];
    const skippedComputed = [];
    for (const io of ios) {
        const name = io.fields.Name;
        if (SKIPPED_SET.has(name)) { skippedComputed.push(name); continue; }
        if (!isFetchable(name)) { skippedComputed.push(name); continue; }  // defense-in-depth (should not trigger given SKIPPED_SET)
        const iofs = (io.relatedEntities && io.relatedEntities['MJ: Integration Object Fields']) || [];
        const pkField = iofs.find((f) => f.fields.IsPrimaryKey === true || f.fields.IsPrimaryKey === 1);
        rows.push({
            name,
            apipath: io.fields.APIPath,        // may contain {parent} for a fetchable-template object (raw route)
            rawApiPath: io.fields.APIPath,
            wm: io.fields.IncrementalWatermarkField || null,
            pk: pkField ? pkField.fields.Name : 'id',
            pkType: 'nvarchar',                 // Stripe ids are always strings (cus_, ch_, in_, …)
            fields: iofs.map((f) => ({ fn: f.fields.Name, ft: coarseType(f.fields.Type) })),
        });
        covered.push(name);
    }
    return { rows, covered, skippedComputed, totalObjects: ios.length };
}

/** Inject Stripe list-envelope shape into every route body: `has_more:false` + `object:'list'`. The rows
 *  already live under `data` (envelopeKey='data'). Idempotent + shape-preserving. */
function stripeEnvelopeBody(body) {
    if (body && typeof body === 'object' && !Array.isArray(body) && Array.isArray(body.data)) {
        return { object: 'list', has_more: false, ...body };
    }
    return body;
}

/**
 * Split ONE flat hub object's single-page route into a TWO-PAGE cursor sequence so the e2e exercises
 * the connector's `starting_after` cursor-FOLLOW (not just single-page fetch):
 *   • page 1  — the original rows, `has_more:true` (connector then sends `starting_after=<last id>`)
 *   • page 2  — a clone of those rows with DISTINCT ids (`-p2` suffix), `has_more:false` (terminates)
 * matchRoute breaks on the FIRST exact-path candidate, and a `Match` route is only a candidate when the
 * request query contains its substring — so the page-2 route (Match:'starting_after') MUST precede the
 * page-1 route (no Match). A page-1 request (no cursor) skips page-2 and hits page-1; the follow-up
 * request (carrying `starting_after=`) matches page-2 first. Result: the hub lands 2×N DISTINCT rows and
 * the mock logs exactly 2 requests to the path (advance + terminate, no over-fetch).
 */
function injectMultiPage(manifest, routePath, pkField = 'id') {
    const path = routePath;
    const idx = manifest.Routes.findIndex((r) => r.Path === path && (r.Method || 'GET').toUpperCase() === 'GET' && !r.Match);
    if (idx < 0) return false;
    const page1Route = manifest.Routes[idx];
    const page1Rows = (page1Route.Body && page1Route.Body.data) || [];
    if (page1Rows.length === 0) return false;
    const page2Rows = page1Rows.map((row) => ({ ...row, [pkField]: `${row[pkField]}-p2` }));
    page1Route.Body = { object: 'list', has_more: true, data: page1Rows };
    const page2Route = { Path: path, Method: 'GET', Status: 200, Match: 'starting_after', Body: { object: 'list', has_more: false, data: page2Rows } };
    // page-2 (Match) route MUST come before the page-1 fallback (matchRoute breaks on first exact candidate).
    manifest.Routes.splice(idx, 0, page2Route);
    return true;
}

function main() {
    const { rows, covered, skippedComputed, totalObjects } = loadRows();
    const { manifest, objectNames } = buildFixtureFromRows(rows, 'BaseURL', 'data');
    if (!manifest) throw new Error('buildFixtureFromRows returned a null manifest (no routable rows).');

    // Inject the Stripe list envelope into every route + delta-pass body.
    for (const r of manifest.Routes) r.Body = stripeEnvelopeBody(r.Body);
    for (const d of manifest.DeltaPasses || []) for (const r of d.Routes || []) r.Body = stripeEnvelopeBody(r.Body);

    // MULTI-PAGE cursor-follow: split the `customer` hub into 2 pages (proves starting_after advance+terminate).
    // Use the object's ACTUAL list APIPath (plural `/v1/customers`), not `/v1/<name>` — object name is singular.
    const multiPageObjects = ['customer'];
    const multiPaged = multiPageObjects.filter((name) => {
        const row = rows.find((r) => r.name === name);
        return row && injectMultiPage(manifest, row.rawApiPath || row.apipath);
    });

    // Seed the dummy Stripe secret key the connector's Authenticate() reads (secretKey / Token). The mock
    // ignores auth, but the connector validates a key is present before fetching.
    manifest.Configuration = { ...(manifest.Configuration || {}), secretKey: 'sk_test_mock', Token: 'sk_test_mock', apiKey: 'sk_test_mock' };

    mkdirSync(dirname(OUT_PATH), { recursive: true });
    writeFileSync(OUT_PATH, JSON.stringify(manifest, null, 1) + '\n');

    const stats = {
        fixturesWritten: OUT_PATH,
        totalObjects,
        objectsInFixture: objectNames.length,
        covered,
        skipped: SKIPPED_OBJECTS,
        skippedComputed,
        routes: manifest.Routes.length,
        multiPaged,
        deltaPasses: (manifest.DeltaPasses || []).map((d) => ({ object: d.Object, updField: (d.ExpectedUpdates || [])[0]?.Field })),
    };
    process.stdout.write(JSON.stringify(stats, null, 2) + '\n');
}

main();
