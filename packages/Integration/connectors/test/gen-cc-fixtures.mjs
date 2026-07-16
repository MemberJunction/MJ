// One-off: generate the full relational fixtures.json for Constant Contact from the DECLARED metadata file
// (metadata/integrations/constant-contact/.constant-contact.integration.json — 65 Active IntegrationObjects),
// so the mock full-coverage HybridE2E pre-flight passes and every object syncs at least one row.
//
// UNLIKE gen-hs-fixtures.mjs / gen-sf-rich-fixtures.mjs (which call `regenerateFixturesFromDeployed` against a
// SEEDED DB), this reads the metadata file DIRECTLY — no DB, no credentials. It builds the same `rows` shape
// that `regenerateFixturesFromDeployed` derives from the DB (name/apipath/wm/pk/pkType/fields/parentObjectName/
// fkParentName/rdk), then calls the SAME exported `buildFixtureFromRows` builder so the fixture-shape logic
// (parent-scoped concrete routes, template-var wildcard fallback, delta-pass candidate selection, dummy OAuth2
// creds, etc.) is never re-implemented by hand. This is also STRICTLY MORE complete than the legacy
// `node gen-fixture.mjs` CLI (/tmp/<CONN>-meta.txt) path, whose `rowFromMetaLine` parser DROPS every
// template-var object (`apipath.includes('{')` → null) — Constant Contact has 31 such nested objects
// (contact_reports_*, email_campaign_activity_*, email_reports_*, events_*, landing_pages_*) that would be
// silently excluded from coverage under the legacy CLI path.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve as pathResolve } from 'node:path';
import { buildFixtureFromRows } from './gen-fixture.mjs';

const REPO = '/Users/bcladmin/Projects/MemberJunction/MJ';
const METADATA_PATH = `${REPO}/metadata/integrations/constant-contact/.constant-contact.integration.json`;
const FIXTURES_DIR = `${REPO}/packages/Integration/connectors/test/fixtures/constant-contact/fixtures`;
const CFG_KEY = 'BaseURL';

/** Extract the sibling IntegrationObject Name from an IOF's `@lookup:MJ: Integration Objects.Name=<X>&...` FK ref. */
function parseLookupObjectName(relio) {
    if (typeof relio !== 'string') return null;
    const m = relio.match(/MJ: Integration Objects\.Name=([^&]+)/);
    return m ? m[1].trim() : null;
}

function loadMetadata() {
    const raw = JSON.parse(readFileSync(METADATA_PATH, 'utf8'));
    const integrationRecord = raw[0];
    const ioRecords = integrationRecord.relatedEntities['MJ: Integration Objects'];
    return ioRecords;
}

/** Build one normalized row (the exact shape `buildFixtureFromRows` / `regenerateFixturesFromDeployed` expect). */
function buildRow(ioRecord, ioNameSet) {
    const io = ioRecord.fields;
    const iofRecords = ioRecord.relatedEntities?.['MJ: Integration Object Fields'] ?? [];
    const activeIofs = iofRecords.map((r) => r.fields).filter((f) => (f.Status ?? 'Active') === 'Active');

    const fields = activeIofs.map((f) => ({ fn: f.Name, ft: f.Type })).filter((x) => x.fn);
    const pkField = activeIofs.find((f) => f.IsPrimaryKey === true);
    const pk = pkField ? pkField.Name : null;
    const pkType = pkField ? pkField.Type : null;

    // First FK-declared parent (authoritative, mirrors the DB path's ORDER-BY-Sequence-first scan).
    let fkParentName = null;
    for (const f of activeIofs) {
        const nm = parseLookupObjectName(f.RelatedIntegrationObjectID);
        if (nm && ioNameSet.has(nm)) { fkParentName = nm; break; }
    }

    const cfg = io.Configuration ?? {};
    const parentObjectName = typeof cfg.parentObjectName === 'string' ? cfg.parentObjectName : null;
    const parentObjectNames = (cfg.parentObjectNames && typeof cfg.parentObjectNames === 'object') ? cfg.parentObjectNames : null;
    const accessPath = (cfg.AccessPath && typeof cfg.AccessPath === 'object') ? cfg.AccessPath : null;
    const incrementalEndpoint = typeof cfg.incrementalEndpoint === 'string' ? cfg.incrementalEndpoint : null;

    return {
        name: io.Name,
        apipath: io.APIPath,
        rawApiPath: io.APIPath,
        wm: io.IncrementalWatermarkField || null,
        pk,
        pkType,
        fields,
        accessPath,
        parentObjectName,
        parentObjectNames,
        fkParentName,
        rdk: io.ResponseDataKey || null,
        incrementalEndpoint,
        readMethod: 'GET',
    };
}

/**
 * Replace the flat single-page GET route for `hubObjectName` with a genuine TWO-PAGE cursor traversal
 * matching Constant Contact's real pagination contract: `ExtractPaginationInfo` reads `_links.next.href`
 * for the opaque `cursor` query param, and `BuildPaginatedURL` requests `?limit=<n>` on page 1 and
 * `?cursor=<opaque>` on subsequent pages. The mock's `Match` field lets two routes share the same Path
 * (`/contacts`) and disambiguate on the query substring (`limit=` vs `cursor=`) — the same pattern already
 * used for `incrementalEndpoint` objects in gen-fixture.mjs. Page 1 carries 3 rows + a `_links.next.href`
 * cursor pointer; page 2 carries 1 more distinct row + NO `_links.next` (terminal — HasMore:false).
 */
function injectMultiPageCursorHub(manifest, hubObjectName) {
    const hubEntry = manifest.Objects.find((o) => o.Name === hubObjectName);
    if (!hubEntry) return;
    const routeIdx = manifest.Routes.findIndex((r) => r.Method === 'GET' && !r.Match
        && r.Body && typeof r.Body === 'object' && !Array.isArray(r.Body) && Array.isArray(r.Body[hubObjectName]));
    if (routeIdx < 0) return;
    const page1Route = manifest.Routes[routeIdx];
    const rdk = hubObjectName; // this hub's ResponseDataKey equals its object name (contacts -> "contacts")
    const page1Rows = page1Route.Body[rdk];
    const page4Row = { ...page1Rows[0], contact_id: `${hubObjectName}-4`, email_address: 'user4@example.com', first_name: 'Casey', last_name: 'Nguyen', mj_e2e_custom_attr: 'custom-4' };

    manifest.Routes[routeIdx] = {
        Path: page1Route.Path, Method: 'GET', Match: 'limit=', Status: 200,
        Body: { [rdk]: page1Rows, _links: { next: { href: `${page1Route.Path}?cursor=mock-cursor-page2` } } },
    };
    manifest.Routes.splice(routeIdx + 1, 0, {
        Path: page1Route.Path, Method: 'GET', Match: 'cursor=', Status: 200,
        Body: { [rdk]: [page4Row], _links: {} },
    });
}

function main() {
    const ioRecords = loadMetadata();
    const activeIoRecords = ioRecords.filter((r) => (r.fields.Status ?? 'Active') === 'Active');
    const ioNameSet = new Set(activeIoRecords.map((r) => r.fields.Name));

    // Only objects with a non-empty, routable APIPath are syncable via a mock HTTP route. Every Constant
    // Contact V3 object declares a concrete or template-var APIPath (none are embedded/access-path-only), so
    // this should retain all 65 — but filter defensively to mirror the DB path's `(!apipath...) continue`.
    const rows = activeIoRecords
        .filter((r) => typeof r.fields.APIPath === 'string' && r.fields.APIPath.length > 0 && !r.fields.APIPath.startsWith('('))
        .map((r) => buildRow(r, ioNameSet))
        .filter((r) => r.fields.length > 0); // keyless objects are fine; fieldless objects are not

    if (rows.length !== activeIoRecords.length) {
        const missing = activeIoRecords.map((r) => r.fields.Name).filter((n) => !rows.some((r) => r.name === n));
        console.error(`WARNING: ${missing.length} object(s) dropped before fixture build: ${missing.join(', ')}`);
    }

    // Envelope key: most Constant Contact list responses use their OWN ResponseDataKey (34 of 65 objects);
    // the remaining 31 are singleton/xref bodies the connector's NormalizeResponse wraps as a 1-element array
    // when no responseDataKey matches. Pass `null` as the GLOBAL envelope key — buildFixtureFromRows already
    // prefers each row's own `r.rdk` (`objKey = r.rdk || envelopeKey`) per the per-object envelope convention.
    const { manifest, objectNames, deltaObject } = buildFixtureFromRows(rows, CFG_KEY, null);
    if (!manifest) throw new Error('fixture builder produced no objects');

    injectMultiPageCursorHub(manifest, 'contacts');

    // Lightweight, metadata-only Lifecycle block (the DB-driven `deriveLifecycleFromDeployed` equivalent —
    // computed here without a DB since every capability column it reads already lives in this metadata file).
    // supportsDiscovery/authoritativeDiscovery are FALSE: ConstantContactConnector.ts overrides IntrospectSchema
    // (sample-union enrichment) but never overrides DiscoverObjects, and its DiscoveryIsAuthoritative getter
    // explicitly returns false — matching Configuration.DiscoveryIsAuthoritative=false in the frozen contract.
    const anyWatermark = activeIoRecords.some((r) => r.fields.SupportsIncrementalSync === true && r.fields.IncrementalWatermarkField);
    manifest.Lifecycle = {
        supportsDiscovery: false,
        supportsFieldDiscovery: false,
        authoritativeDiscovery: false,
        supportsCustomColumns: true,
        incrementalStrategy: anyWatermark ? 'watermark' : 'content-hash',
        supportsWrite: activeIoRecords.some((r) => r.fields.SupportsCreate === true || r.fields.SupportsWrite === true),
        supportsScheduling: true,
        connectionTestable: true,
        derivedFromMetadata: true,
        sourceClass: 'ConstantContactConnector',
    };

    mkdirSync(FIXTURES_DIR, { recursive: true });
    const out = pathResolve(FIXTURES_DIR, 'fixtures.json');
    writeFileSync(out, JSON.stringify(manifest, null, 2) + '\n');
    console.log(`Generated ${objectNames.length} objects, ${manifest.Routes.length} routes; delta on '${deltaObject}'.`);
    console.log(`Written: ${out}`);
}

main();
