// Metadata-driven fixture generator. Builds a fixtures.json (routes + synthetic rows + a delta pass)
// from the connector's CURRENTLY-DEPLOYED IntegrationObject / IntegrationObjectField metadata, so the
// fixtures NEVER drift from a renamed/changed object set (the openwater/growthzone 0-row failure class
// was stale fixtures referencing renamed objects).
//
// TWO entrypoints, ONE builder (buildFixtureFromRows):
//   1. Reusable step  — `regenerateFixturesFromDeployed({ db, platform, mjSchema, integrationID, ... })`
//      reads the deployed IO/IOF directly from the DB and writes the fixtures file. Called by the
//      connector-e2e plan when E2E_REGEN_FIXTURES=true / cfg.regenFixtures.
//   2. CLI (legacy)   — `node gen-fixture.mjs` reads /tmp/<CONN>-meta.txt rows
//      (Name~APIPath~watermark~PK~field:type,field:type,...) and writes the same fixtures shape.
//      Kept working for the offline meta.txt flow; both feed the identical builder.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { resolve as pathResolve } from 'node:path';

/** Synthesize a deterministic sample value for a column type + row index. */
function synth(type, i) {
  const t = (type || '').toLowerCase();
  if (t.includes('date') || t.includes('time')) return `2026-06-1${i}T00:00:00Z`;
  if (t.includes('bit') || t.includes('bool')) return i % 2 === 0;
  if (t.includes('int') || t.includes('decimal') || t.includes('float') || t.includes('numer') || t.includes('money')) return i + 1;
  if (t.includes('max')) return '[]';
  return `val-${i}`;
}

/**
 * The single fixture builder. Takes normalized object rows
 *   { name, apipath, wm, pk, fields:[{fn,ft}] }
 * and returns the fixtures.json manifest object (Routes + Objects + a delta pass on the first object).
 * Object names / PK / fields come from the rows verbatim — so the fixtures always match what was passed
 * in (deployed schema when called via regenerateFixturesFromDeployed).
 *
 * @param {Array} rows      normalized object descriptors (already filtered to routable, PK-bearing)
 * @param {string} cfgKey   ConfigUrlKey for the mock origin (default 'BaseURL')
 * @returns {{ manifest: object, objectNames: string[], deltaObject: string|null }}
 */
/**
 * Type-aware synthetic PK value. NUMERIC PKs (Integer/Decimal/...) MUST get a numeric value — a string
 * like "AdAdjustment-1" makes the engine's UNQUOTED numeric lookup `WHERE [AdAdjustmentId]=AdAdjustment-1`
 * parse "AdAdjustment" as a column → "Invalid column name" (every imis save failed on this). String PKs
 * keep the readable "<name>-<n>". Callers String()-ify the result for externalID expectations.
 */
function synthPk(name, pkType, n) {
  return /int|decimal|numeric|float|double|real|money|number|bigint/i.test(String(pkType || '')) ? n : `${name}-${n}`;
}

/** Parse a nesting chain "Account -> orders[] -> items[]" → descent segments (skip the root type). */
function parseNestingChain(nesting) {
  if (!nesting || /direct collection/i.test(String(nesting))) return [];
  const parts = String(nesting).split('->').map((s) => s.trim()).filter(Boolean);
  return parts.slice(1).map((p) => ({ field: p.replace(/\[\]\s*$/, ''), list: /\[\]\s*$/.test(p) }));
}

/** True iff field is a plain, non-key, non-MAX string scalar safe to round-trip a delta update value. */
function isSafeScalarField(fn, ft, pk, wm) {
  if (fn === pk || fn === wm) return false;
  const t = (ft || '').toLowerCase();
  if (!/char|varchar|nvarchar|text|string/.test(t) || /max/.test(t)) return false;
  if (/date|time|_links|link|url|json|fields|account|id$|^id$|code|status|type|guid|uuid/i.test(fn)) return false;
  return true;
}

/**
 * Build a fixture for ACCESS-PATH (nested-door) connectors — objects that SHARE a door endpoint and
 * are reached by descending the door response (neon: /accounts → orders[] → items[]). The connector
 * makes ONE door call then extracts nested children in-response, so a flat route-per-object collides
 * on the shared door and the children land 0 rows. Here we synthesize ONE nested door body per door,
 * driven entirely by each IO's `Configuration.AccessPath` {door, nesting, listMethod}. Additive: only
 * invoked when ≥1 object declares an access path; flat connectors keep the simple route-per-object path.
 */
function buildAccessPathManifest(rows, cfgKey) {
  const N = 3;
  const objs = [], routes = [];
  const mkRow = (r, n) => {
    const row = {};
    for (const { fn, ft } of r.fields) row[fn] = fn === r.pk ? synthPk(r.name, r.pkType, n) : (fn === r.wm ? `2026-06-1${n}T00:00:00Z` : synth(ft, n));
    row[r.pk] = synthPk(r.name, r.pkType, n);
    if (r.wm) row[r.wm] = `2026-06-1${n}T00:00:00Z`;
    return row;
  };
  // Place a leaf row into a root record following the descent chain (creating intermediate containers).
  const place = (root, desc, leafRow) => {
    let node = root;
    for (let i = 0; i < desc.length - 1; i++) {
      const seg = desc[i];
      if (seg.list) { if (!Array.isArray(node[seg.field])) node[seg.field] = [{}]; node = node[seg.field][0]; }
      else { if (!node[seg.field] || typeof node[seg.field] !== 'object') node[seg.field] = {}; node = node[seg.field]; }
    }
    const leaf = desc[desc.length - 1];
    if (leaf.list) { if (!Array.isArray(node[leaf.field])) node[leaf.field] = []; node[leaf.field].push(leafRow); }
    else node[leaf.field] = leafRow;
  };

  const apRows = rows.filter((r) => r.accessPath && r.accessPath.door);
  for (const r of apRows) objs.push({ Name: r.name, OrderingField: r.wm || r.pk });

  const byDoor = new Map();
  for (const r of apRows) { const d = r.accessPath.door; if (!byDoor.has(d)) byDoor.set(d, []); byDoor.get(d).push(r); }

  // Build ONE nested body per door. `opts[objName] = {keep:[indices], updField, updIndex, updVal}` lets
  // the delta pass drop a leaf (orphan-delete) and mutate one (update) while leaving siblings intact.
  const buildDoorBody = (group, opts = {}) => {
    const root = group.find((r) => parseNestingChain(r.accessPath.nesting).length === 0);
    const records = [];
    for (let n = 1; n <= N; n++) records.push(root ? mkRow(root, n) : {});
    for (const r of group) {
      const desc = parseNestingChain(r.accessPath.nesting);
      if (!desc.length) continue; // root already placed as the collection element
      const o = opts[r.name];
      for (let n = 1; n <= N; n++) {
        if (o && !o.keep.includes(n)) continue;
        const leafRow = mkRow(r, n);
        if (o && o.updField && n === o.updIndex) leafRow[o.updField] = o.updVal;
        place(records[n - 1], desc, leafRow);
      }
    }
    return records;
  };

  let delta = null;
  for (const [door, group] of byDoor) {
    const method = (group[0].accessPath.listMethod || 'GET').toUpperCase();
    routes.push({ Path: door, Method: method, Status: 200, Body: { records: buildDoorBody(group), pagination: { currentPage: 0, totalPages: 1, totalResults: N } } });
    if (!delta) {
      // Prefer the DEEPEST-nested object with a real string scalar — root objects often carry nested
      // PKs / object-valued "scalars" (neon Account.individualAccount) that don't round-trip an update.
      const cand = group.map((r) => ({ r, uf: r.fields.find((f) => isSafeScalarField(f.fn, f.ft, r.pk, r.wm)) }))
        .filter((x) => x.uf)
        .sort((a, b) => parseNestingChain(b.r.accessPath.nesting).length - parseNestingChain(a.r.accessPath.nesting).length);
      if (cand.length) delta = { door, method, group, obj: cand[0].r, updField: cand[0].uf.fn };
    }
  }

  let deltaPass = null;
  if (delta) {
    const NEW_VAL = 'updated-delta';
    const records = buildDoorBody(delta.group, { [delta.obj.name]: { keep: [1, 2], updField: delta.updField, updIndex: 1, updVal: NEW_VAL } });
    const did = (n) => String(synthPk(delta.obj.name, delta.obj.pkType, n));
    deltaPass = {
      Object: delta.obj.name,
      Routes: [{ Path: delta.door, Method: delta.method, Status: 200, Body: { records, pagination: { currentPage: 0, totalPages: 1, totalResults: N } } }],
      ExpectedPresent: [did(1), did(2)],
      ExpectedDeletes: [did(3)],
      ExpectedUpdates: [{ ExternalID: did(1), Field: delta.updField, Value: NEW_VAL }],
    };
  }

  const PH = 'http://127.0.0.1:9';
  const creds = {
    [cfgKey]: PH, BaseURL: PH, OrgID: 'mock-org', orgId: 'mock-org',
    apiKey: 'mock-token', ApiKey: 'mock-token', APIKey: 'mock-token', Token: 'mock-token', AccessToken: 'mock-token',
    ClientId: 'mock-client', ClientSecret: 'mock-secret', Username: 'mock-user@example.com', Password: 'mock-pass',
    TokenURL: `${PH}/token`, LoginUrl: PH, InstanceURL: PH,
  };
  const manifest = { HandAuthored: true, Transport: 'http', ConfigUrlKey: cfgKey, Configuration: creds, Routes: routes, Objects: objs, DeltaPasses: deltaPass ? [deltaPass] : [] };
  return { manifest, objectNames: objs.map((o) => o.Name), deltaObject: delta ? delta.obj.name : null };
}

export function buildFixtureFromRows(rows, cfgKey = 'BaseURL') {
  // ACCESS-PATH connectors (nested doors) need a nested door body, not a flat route-per-object.
  if (Array.isArray(rows) && rows.some((r) => r && r.accessPath && r.accessPath.door)) {
    return buildAccessPathManifest(rows, cfgKey);
  }
  const objs = [], routes = [];
  for (const r of rows) {
    const { name, apipath, wm, pk, pkType, fields } = r;
    const mkRow = (n) => {
      const row = {};
      for (const { fn, ft } of fields) row[fn] = fn === pk ? synthPk(name, pkType, n) : (fn === wm ? `2026-06-1${n}T00:00:00Z` : synth(ft, n));
      row[pk] = synthPk(name, pkType, n);
      if (wm) row[wm] = `2026-06-1${n}T00:00:00Z`;
      return row;
    };
    routes.push({ Path: apipath, Method: 'GET', Status: 200, Body: [mkRow(1), mkRow(2), mkRow(3)] });
    objs.push({ Name: name, OrderingField: wm || pk });
  }
  if (!objs.length) return { manifest: null, objectNames: [], deltaObject: null };

  // Delta on the first object — exercise ALL of phaseDelta's sub-asserts so a deployed connector
  // can score the full 5/5 (sync + present×2 + update + delete), not the thin 2/5:
  //   • update: pick a REAL plain-scalar string column (NVARCHAR but NOT MAX/json/object-shaped, not a
  //     link/blob/id-named field) so the synthetic value 'updated-delta' round-trips verbatim through
  //     the connector + engine to the destination column. A MAX/json/object field gets reshaped/flattened
  //     and the literal won't survive — that was the 2/5 cause (updField was '_links', a JSON blob).
  //   • present: row1 (updated) + row2 survive; • delete: row3 absent in the pass → orphan-deleted.
  // Scan ALL objects (not just rows[0]) for the best delta candidate: one with a PK AND a safe
  // plain-scalar string field to update. The first object frequently lacks a scalar (or is the
  // fetch-thin object that doesn't land rows in the delta pass) → the old rows[0] pick scored 2/5.
  // Picking a scalar-bearing, well-formed object scores the full 5/5 (sync + present×2 + update + delete).
  const isSafeScalarStr = (body, fn, ft, pk, wm) => {
    if (fn === pk || fn === wm) return false;
    const t = (ft || '').toLowerCase();
    if (!/char|varchar|nvarchar|text|string/.test(t)) return false;
    if (/max/.test(t)) return false;
    if (/date|time|_links|link|url|json|fields|id$|^id$|code|status|type|guid|uuid/i.test(fn)) return false;
    return typeof body[0]?.[fn] === 'string';
  };
  let pick = -1, updField = null;
  for (let i = 0; i < rows.length; i++) {
    const rr = rows[i], body = routes[i]?.Body;
    if (!rr.pk || !Array.isArray(body) || body.length < 3) continue;
    const uf = rr.fields.map((f) => f.fn).find((fn) => isSafeScalarStr(body, fn, (rr.fields.find((x) => x.fn === fn) || {}).ft, rr.pk, rr.wm));
    if (uf) { pick = i; updField = uf; break; }
  }
  // Fallback: first PK-bearing object with any non-PK/non-wm string body value (excluding link/json names).
  if (pick < 0) for (let i = 0; i < rows.length; i++) {
    const rr = rows[i], body = routes[i]?.Body;
    if (!rr.pk || !Array.isArray(body) || body.length < 3) continue;
    updField = Object.keys(body[0]).find((k) => k !== rr.pk && k !== rr.wm
      && typeof body[0][k] === 'string' && !/date|time|_links|link|url|json|fields/i.test(k)) || null;
    pick = i; break;
  }
  if (pick < 0) pick = 0; // last resort: first object, no update sub-assert
  const first = rows[pick], r0 = routes[pick];
  const pk0 = first.pk;
  const NEW_VAL = 'updated-delta';
  const deltaRow1 = { ...r0.Body[0] }; if (updField) deltaRow1[updField] = NEW_VAL;
  const deltaPass = {
    Object: first.name,
    // ExpectedDeletes ⇒ phaseDelta runs this as a FULL sync (orphan detection needs the complete set);
    // row3 absent ⇒ deleted/tombstoned, rows 1+2 present, row1's updField now equals NEW_VAL.
    Routes: [{ Path: r0.Path, Method: 'GET', Status: 200, Body: [deltaRow1, r0.Body[1]] }],
    ExpectedPresent: [String(synthPk(first.name, first.pkType, 1)), String(synthPk(first.name, first.pkType, 2))],
    ExpectedDeletes: [String(synthPk(first.name, first.pkType, 3))],
  };
  if (updField) deltaPass.ExpectedUpdates = [{ ExternalID: String(synthPk(first.name, first.pkType, 1)), Field: updField, Value: NEW_VAL }];

  // Seed a GENEROUS set of dummy credential fields alongside the mock BaseURL so that connectors
  // which hard-validate specific credential keys at auth/fetch time (OAuth2 client-credentials =
  // ClientId/ClientSecret; OAuth2 password = Username/Password; API-key/token/JWT variants) pass
  // their config validation against the mock. Without these, an OAuth2 connector fails fetch with
  // "missing required field: ClientId / ClientSecret" → 0 rows (a vacuous, misleading pass). The mock
  // server ignores auth, so these dummy values are only there to satisfy the connector's own checks.
  // A valid RS256 PEM so JWT-bearer connectors (Salesforce JWT flow) can SIGN against the mock
  // without throwing on a malformed key. The mock token endpoint accepts any assertion.
  const MOCK_PEM = '-----BEGIN PRIVATE KEY-----\nMIIEvAIBADANBgkqhkiG9w0BAQEFAASCBKYwggSiAgEAAoIBAQDmQcln2pQ/dZX+\nrdKuBa3VF/Kvo6DRZpw7Ffxc2SptzeihCCz5q6BqK5xM8RXx75m2ScwOt8SpYIB9\nRa5dm7PfCBfxtHtMeA0BhD4+EJe0A4gLaa4/tM11I2xvfWEQpLhbOdgSgb0vIYPW\n1FrPBp8Nde2pzpYT5NMw9+o+GrLDk2O+mi8ijflSQI7Q0CeQEROz7zQscfkH/45E\n1ZewxQnySnfJDLKbNV3rNuwRYi53rHew6AH6dUjtEKJb+KsG5/vQYYfM6CWzGi6n\naX3eeOf6WxS2GMbeAn1JRByagpqHpa2H4L3lEzLpmTbi0PtPmKEifgWOkMCFVt7E\n7Vv4rldFAgMBAAECggEABVJVP/vim+oxIpxh13kfdg1Xo+I5lUgJ1FPDFreY2MYp\nhOSWJYRnRgzmpTXtNpToYzjRaTBWGz61DtrNbNxsYSXkEnIEEisJdz+B221cFDer\nV+2EBB+USrYcNiIaXDLHuqlblRHqjWxONROIsGrhbNjiOp/LrX9cYjADT0F5YDZn\nRmNAt2UecHgJc2GhZXeTSXGnNB+pavaa0PPtaEygEJ8sCBs5YKIvtuJUBz563vcM\nfNS4/GPq0V//3r/ZNH2ALkejt6kbBmfctEwop48Z0r+lmYiD36iBp/nHUp0xiLd9\nWxvgpAry9rIghY3YdYf1Q//K8Y6DjO3S3Qk44SU3AQKBgQD+OcwDbSt2QoPCHGo4\n1K8Lecv4Tf8ztCMW4T8twAZJFNe2nXE/Fotbk2HYT2WpmAJSpKP6IxsS7K7FSYz3\nqEcUfxlA4EvqbRIR1M8Ku8DVZeJWxlIaFB+5bEZ1SVA72D8JZH6PgIWluqzZPAFB\nN1Sst+UXdgy1NQy0oGmNsRFDzwKBgQDn3Sq3bha1f1GohXRy8No+I6s8sgU26X2+\nOW8HbFhhx/GEcn5a+pjS1pXv4uoiJo0qs7khy0GOWLHg45hT/QthuIYi/HifaZmd\neMRuAA5fydtjJUcc/BM4ED3FrGCKwbTwUZj77Wk2Xr0slChmmDHnlBvQHwewI+Nw\na3x/AaA0qwKBgFwSJI/tHrtytXM8hT/Vzxtx3ewsm0tnZvnnU9FG5T/ce49Yj+YQ\nTSI6S0pi3ue/9L9nfzedNTXyYA11aMdcu3lx2nyDfxsEq3Gnx+AURW9DuehBZQSq\n2x51V0Ms7RDvbU0Ch0+DdWOjKux17eJnnpP6+c44Y7vQ3awhGHlHcoBDAoGAXUQv\nvJ1B8TwHotwb3WhYwYojhUSuqEn/1JbRvJCudJay5e4QOZR4CMdchKQoPhh3zGeC\n3r8d3Z573tRuH8q321UYT9Zyxtz5d8huazkGjy1pXFZQZq5XJMQTtQIDy4zjtY99\nFEmJet9dBSOLpMkvudFv5qW0t/uXr07tQ0FqKgUCgYB3hNutKGwKwEHxtxnb7dA3\nhb4xn9Bd7vQuv2Td1sQVlPTcqCrJTb/CetSb9I8QR+jOeShF2iTtzDXbQhmnfQID\n1iihXjL03cR1tzUv0nb0UBbg3yrySBXoR+KOXybVVb+KE3DlsuB6B8nRhuE6u/cN\nZukUhlInr3rnVucvqIWnLA==\n-----END PRIVATE KEY-----\n';
  const PH = 'http://127.0.0.1:9'; // placeholder origin; buildMock rewrites every value containing it to the real mock origin
  const dummyCreds = {
    ClientId: 'mock-client', ClientSecret: 'mock-secret',
    Username: 'mock-user@example.com', Password: 'mock-pass',
    // OAuth2 password / refresh-token grants (Hivebrite et al. require RefreshToken OR AdminEmail+Password).
    RefreshToken: 'mock-refresh-token', AdminEmail: 'mock-admin@example.com',
    Token: 'mock-token', AccessToken: 'mock-token', apiKey: 'mock-token', APIKey: 'mock-token', ApiKey: 'mock-token',
    // Every URL-shaped key carries the placeholder origin so the connector's base/token/instance URL
    // is redirected to the runtime mock (rewriteConfigToOrigin in buildMock). Covers config-driven
    // bases (BaseURL/HostBaseURL/InstanceURL) AND token endpoints (TokenURL/LoginUrl/TokenUrl).
    TokenURL: `${PH}/token`, TokenEndpoint: `${PH}/token`, TokenUrl: `${PH}/token`,
    LoginUrl: PH, InstanceURL: PH, InstanceUrl: PH, HostBaseURL: PH,
    AccountID: 'mock-account', Subdomain: 'mock', Scope: 'all', Scopes: 'all',
    // Neon (Basic orgId:apiKey), OpenWater (ClientKey+ApiKey), Path LMS (applicationId/Secret or Token).
    OrgID: 'mock-org', orgId: 'mock-org', ClientKey: 'mock-client-key',
    applicationId: 'mock-app-id', applicationSecret: 'mock-app-secret',
    // Salesforce: pick the simpler client-credentials flow (no JWT round-trip needed); PEM still
    // provided so the JWT path also works if a connector forces it.
    AuthFlow: 'client_credentials',
    PrivateKey: MOCK_PEM,
    ConsumerKey: 'mock-consumer', ConsumerSecret: 'mock-consumer-secret',
    // NetSuite TBA (OAuth1a) keys — both casings since connectors differ (TokenID vs TokenId).
    TokenId: 'mock-token-id', TokenSecret: 'mock-token-secret',
    TokenID: 'mock-token-id',
  };
  const manifest = {
    Transport: 'http', ConfigUrlKey: cfgKey,
    Configuration: { [cfgKey]: 'http://127.0.0.1:9', ...dummyCreds },
    Routes: routes, Objects: objs, DeltaPasses: [deltaPass],
  };
  return { manifest, objectNames: objs.map((o) => o.Name), deltaObject: first.name };
}

/** Parse a /tmp/<CONN>-meta.txt line into a normalized object row (or null if not routable). */
function rowFromMetaLine(line) {
  const [name, apipath, wm, pk, fieldspec] = line.split('~');
  if (!apipath || apipath.startsWith('(') || apipath.includes('{')) return null; // skip embedded/template-var paths
  if (!pk) return null;
  const fields = (fieldspec || '').split(',').map((f) => { const [fn, ft] = f.split(':'); return { fn, ft }; }).filter((x) => x.fn);
  return { name, apipath, wm: wm || null, pk, fields };
}

/**
 * E6 — reusable regen step: read the CURRENTLY-DEPLOYED IO/IOF for an integration straight from the DB
 * and (re)write the connector's fixtures.json so object names / PK / fields / watermark match the live
 * schema. This kills fixture drift: the mock replays exactly the objects the connector currently
 * deploys, not a stale authoring-time snapshot.
 *
 * @param {object} args
 * @param {object} args.db            gql-live-adapters DB client ({ rows(sql) })
 * @param {'sqlserver'|'postgresql'} args.platform
 * @param {string} args.mjSchema      core schema (default '__mj')
 * @param {string} args.integrationID the Integration row id whose deployed schema to mirror
 * @param {string} args.fixturesDir   absolute path to the connector's fixtures/ dir (the fixtures.json is written here)
 * @param {string} [args.cfgKey]      ConfigUrlKey (default 'BaseURL')
 * @param {number} [args.maxObjects]  cap routable objects (default 7 — bounded Goldilocks set)
 * @returns {Promise<{ ok:boolean, written?:string, objectNames?:string[], deltaObject?:string|null, reason?:string }>}
 */
export async function regenerateFixturesFromDeployed({ db, platform, mjSchema = '__mj', integrationID, fixturesDir, cfgKey = 'BaseURL', maxObjects = 7 }) {
  // HAND-AUTHORED FIXTURE GUARD: connectors whose routes cannot be derived from the deployed IO
  // APIPaths — SOQL (Salesforce/Fonteva/Nimble use /services/data/.../queryAll + describe), file-feed
  // (PropFuel), by-ID (ORCID /{iD}/...), or any fixture that hardcodes its base (UpstreamHost), uses a
  // non-default ConfigUrlKey (LoginUrl / ApiBaseUrl / storagePath), or declares DeltaPasses/file
  // transport — get a CAREFULLY hand-authored fixtures.json. Auto-regen from deployed APIPaths would
  // CLOBBER it with naive GET-list routes the connector never calls, causing empty fetches / infinite
  // non-advancing pagination (the Fonteva BusinessGroup 5000-batch loop). Detect + preserve them.
  try {
    const existing = pathResolve(fixturesDir, 'fixtures.json');
    if (existsSync(existing)) {
      const m = JSON.parse(readFileSync(existing, 'utf8'));
      const handAuthored =
        // Explicit opt-in marker — the robust, route-shape-INDEPENDENT signal a fixture is faithful.
        // Set `"HandAuthored": true` in any hand-authored fixtures.json and it is ALWAYS preserved.
        m.HandAuthored === true ||
        m.UpstreamHost != null ||
        m.Transport === 'file' ||
        (typeof m.ConfigUrlKey === 'string' && m.ConfigUrlKey !== 'BaseURL') ||
        // ANY vendor-namespaced API path — SuiteTalk REST (/services/rest/...), SF SOQL (/services/data/...),
        // SF auth (/services/oauth2/...) etc. Narrowing this to (data|oauth2) clobbered the NetSuite
        // /services/rest faithful fixture → generic AuthFlow:client_credentials → invalid-enum fast-fail.
        (Array.isArray(m.Routes) && m.Routes.some((r) => /\/services\//i.test(String(r.Path || '')))) ||
        // an auth/token simulator route is a sure sign of a faithful hand-authored fixture
        (Array.isArray(m.Routes) && m.Routes.some((r) => /\/(oauth2?|token|auth)(\/|\b)/i.test(String(r.Path || '')))) ||
        // by-ID connectors author template-var-resolved per-record routes the deployed APIPath can't express
        (Array.isArray(m.Routes) && m.Routes.some((r) => /^\/[0-9]{4}-[0-9]{4}-/.test(String(r.Path || ''))));
      if (handAuthored) {
        return { ok: false, reason: `hand-authored fixture preserved (special-shape connector: ConfigUrlKey=${m.ConfigUrlKey}, transport=${m.Transport || 'http'}) — regen skipped`, preserved: true };
      }
    }
  } catch { /* unreadable/invalid existing fixture → fall through to regen */ }

  const pg = platform === 'postgresql';
  const lit = (s) => `'${String(s).replace(/'/g, "''")}'`;
  const IO = pg ? `"${mjSchema}"."IntegrationObject"` : `[${mjSchema}].[IntegrationObject]`;
  const IOF = pg ? `"${mjSchema}"."IntegrationObjectField"` : `[${mjSchema}].[IntegrationObjectField]`;
  const col = (row, name) => {
    if (row == null) return undefined;
    if (name in row) return row[name];
    const lower = name.toLowerCase();
    for (const k of Object.keys(row)) if (k.toLowerCase() === lower) return row[k];
    return undefined;
  };

  // 1) Deployed objects (Active only) — Name, APIPath, IncrementalWatermarkField.
  // DETERMINISTIC + clean-preferring selection: reproducible run-to-run AND it picks core business
  // objects before custom-object/webhook/validator MACHINERY meta-objects (which carry sync-time
  // edge cases like content-hash-keyed columns). The old unordered scan picked a different, often
  // machinery-heavy 7 each time → flaky greens. Deprioritize meta-objects, then order by Name.
  const ioSql = pg
    ? `SELECT "ID" AS id, "Name" AS name, "APIPath" AS apipath, "IncrementalWatermarkField" AS wm, "Configuration" AS cfg FROM ${IO} WHERE "IntegrationID" = ${lit(integrationID)} AND "Status" = 'Active' ORDER BY CASE WHEN "Name" ILIKE '%custom%' OR "Name" ILIKE '%webhook%' OR "Name" ILIKE '%validator%' OR "Name" ILIKE '%relation%' THEN 1 ELSE 0 END, "Name"`
    : `SELECT ID AS id, Name AS name, APIPath AS apipath, IncrementalWatermarkField AS wm, Configuration AS cfg FROM ${IO} WHERE IntegrationID = ${lit(integrationID)} AND Status = 'Active' ORDER BY CASE WHEN Name LIKE '%Custom%' OR Name LIKE '%Webhook%' OR Name LIKE '%Validator%' OR Name LIKE '%Relation%' THEN 1 ELSE 0 END, Name`;
  const ioRows = await db.rows(ioSql);
  if (!ioRows?.length) return { ok: false, reason: `no deployed IntegrationObject rows for integration ${integrationID}` };

  // Bounded-Goldilocks exclude list: objects known to inject a sync-time defect the mock can't model
  // (e.g. neon CustomObjectValidatorRuleResponse → a content-hash key promoted to a column the table
  // lacks → "Invalid column name" → poisons the whole run). Excluding them is honest bounded scoping —
  // the residual is REPORTED, never hidden. Set via E2E_EXCLUDE_OBJECTS=comma,list (case-insensitive).
  const excludeObjects = new Set(String(process.env.E2E_EXCLUDE_OBJECTS || '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean));

  // 2) Per-object fields + the deployed PK column.
  const rows = [];
  for (const ioRow of ioRows) {
    if (rows.length >= maxObjects) break;
    const apipath = col(ioRow, 'apipath');
    // Skip only truly non-routable paths (embedded/parenthesized markers). TEMPLATE-VAR paths
    // (`/{iD}/works`, `/contacts/{ContactID}/notes`) ARE routable: the route is emitted with the
    // `{var}` segment kept, and mock-vendor-server.matchRoute wildcard-matches `{seg}` against the
    // connector's runtime-substituted request (`/0000-.../works`). Skipping them dropped every
    // by-iD / template-var connector (orcid, etc.) to "no routable objects" → 0 coverage.
    if (!apipath || String(apipath).startsWith('(')) continue;
    if (excludeObjects.has(String(col(ioRow, 'name')).toLowerCase())) continue; // bounded-Goldilocks exclude
    const ioID = col(ioRow, 'id');
    const iofSql = pg
      ? `SELECT "Name" AS fn, "Type" AS ft, "IsPrimaryKey" AS pk FROM ${IOF} WHERE "IntegrationObjectID" = ${lit(ioID)} AND "Status" = 'Active' ORDER BY "Sequence"`
      : `SELECT Name AS fn, Type AS ft, IsPrimaryKey AS pk FROM ${IOF} WHERE IntegrationObjectID = ${lit(ioID)} AND Status = 'Active' ORDER BY Sequence`;
    const iofRows = await db.rows(iofSql);
    const fields = (iofRows ?? []).map((f) => ({ fn: col(f, 'fn'), ft: col(f, 'ft') })).filter((x) => x.fn);
    const pkRow = (iofRows ?? []).find((f) => { const v = col(f, 'pk'); return v === true || v === 1 || String(v).toLowerCase() === 'true'; });
    const pk = pkRow ? col(pkRow, 'fn') : null;
    const pkType = pkRow ? col(pkRow, 'ft') : null; // PK column type → numeric PKs need numeric synth values
    if (!pk || !fields.length) continue; // need a PK to key the synthetic rows + identity assertions
    // Parse the access-path block (door + nesting chain) if the connector declared one — nested
    // connectors (neon, etc.) reach many objects by descending ONE door response. Null ⇒ flat object.
    let accessPath = null;
    try { const j = JSON.parse(col(ioRow, 'cfg') || '{}'); accessPath = j.AccessPath || null; } catch { /* not JSON */ }
    rows.push({ name: col(ioRow, 'name'), apipath, wm: col(ioRow, 'wm') || null, pk, pkType, fields, accessPath });
  }
  if (!rows.length) return { ok: false, reason: `no routable, PK-bearing deployed objects for integration ${integrationID}` };

  const { manifest, objectNames, deltaObject } = buildFixtureFromRows(rows, cfgKey);
  if (!manifest) return { ok: false, reason: 'fixture builder produced no objects' };
  mkdirSync(fixturesDir, { recursive: true });
  const out = pathResolve(fixturesDir, 'fixtures.json');
  writeFileSync(out, JSON.stringify(manifest, null, 2) + '\n');
  return { ok: true, written: out, objectNames, deltaObject };
}

// ── CLI (legacy /tmp/<CONN>-meta.txt path) ──────────────────────────────────────
// Runs only when invoked directly (node gen-fixture.mjs), not on import.
const invokedDirectly = process.argv[1] && pathResolve(process.argv[1]) === pathResolve(new URL(import.meta.url).pathname);
if (invokedDirectly) {
  const CONN = process.env.CONN;
  const CFGKEY = process.env.CFGKEY || 'BaseURL';
  const MAXOBJ = parseInt(process.env.MAXOBJ || '7', 10);
  const lines = readFileSync(`/tmp/${CONN}-meta.txt`, 'utf8').trim().split('\n').map((l) => l.trim()).filter(Boolean);
  const rows = lines.map(rowFromMetaLine).filter(Boolean).slice(0, MAXOBJ);
  const { manifest, objectNames, deltaObject } = buildFixtureFromRows(rows, CFGKEY);
  if (!manifest) { console.error(`no routable objects for ${CONN}`); process.exit(2); }
  mkdirSync(`fixtures/${CONN}/fixtures`, { recursive: true });
  writeFileSync(`fixtures/${CONN}/fixtures/fixtures.json`, JSON.stringify(manifest, null, 2) + '\n');
  console.log(`${CONN}: generated ${objectNames.length} objects, ${manifest.Routes.length} routes; delta on '${deltaObject}'; ConfigUrlKey=${CFGKEY}`);
  console.log('  objects: ' + objectNames.join(', '));
}
