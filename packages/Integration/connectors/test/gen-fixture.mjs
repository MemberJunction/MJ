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

/**
 * Synthesize a deterministic, VENDOR-FAITHFUL sample value for a (fieldName, type, rowIndex).
 *
 * NOT `val-1`. The cred-free test only earns "would-work-with-creds" confidence if the mock data is
 * SHAPED like real vendor data — so the connector's REAL coercion / field-mapping / validation / date
 * parsing / numeric handling runs on realistic values, not placeholders. Type is authoritative for
 * bool/number/date; field NAME drives realistic string shapes (email, phone, url, money, address,
 * status, etc.). Deterministic in `i` so runs are reproducible and delta assertions are stable.
 */
function synth(fieldName, type, i) {
  const t = (type || '').toLowerCase();
  const f = (fieldName || '').toLowerCase();
  const pick = (arr) => arr[(i - 1) % arr.length];
  // --- TYPE-authoritative kinds first (bool / date / number) ---
  if (t.includes('bit') || t.includes('bool') || /^is[A-Z]|^has[A-Z]|enabled$|active$/i.test(fieldName || '')) return i % 2 === 1;
  if (t.includes('date') || t.includes('time')) {
    const d = `2026-06-${String(9 + i).padStart(2, '0')}`;
    return (/(^|_)date$/i.test(fieldName || '') && !/time/i.test(f)) ? d : `${d}T0${i}:30:00Z`;
  }
  if (/(int|decimal|float|double|real|numer|money|bigint)/.test(t)) {
    if (/price|cost|amount|total|fee|balance|revenue|salary|paid/.test(f)) return Number((10 * i + 9.99).toFixed(2));
    if (/percent|rate|ratio/.test(f)) return Number((0.1 * i).toFixed(2));
    if (/year/.test(f)) return 2020 + i;
    if (/\blat(itude)?\b/.test(f)) return Number((40 + i * 0.013).toFixed(6));
    if (/\b(lon|lng|longitude)\b/.test(f)) return Number((-74 - i * 0.013).toFixed(6));
    if (/count|qty|quantity|number|num|total|seats|capacity|attendees/.test(f)) return i * 3 + 1;
    return i + 1;
  }
  // --- STRING shapes driven by field NAME (faithful real-world payloads) ---
  if (/e-?mail/.test(f)) return `user${i}@example.com`;
  if (/first.?name|given.?name|fname/.test(f)) return pick(['Alex', 'Jordan', 'Taylor', 'Morgan']);
  if (/last.?name|surname|family.?name|lname/.test(f)) return pick(['Rivera', 'Chen', 'Patel', 'Nguyen']);
  if (/full.?name|display.?name|contact.?name|attendee.?name|^name$/.test(f)) return pick(['Alex Rivera', 'Jordan Chen', 'Taylor Patel']);
  if (/company|organization|org.?name|account.?name|business|exhibitor|sponsor/.test(f)) return pick(['Acme Corp', 'Globex LLC', 'Initech']);
  if (/phone|mobile|\btel\b|fax|cell/.test(f)) return `555-01${String(i).padStart(2, '0')}`;
  if (/url|link|website|href|\buri\b|webpage|portal/.test(f)) return `https://example.com/${fieldName}/${i}`;
  if (/zip|postal/.test(f)) return `021${String(i).padStart(2, '0')}`;
  if (/country/.test(f)) return 'US';
  if (/\bstate\b|province/.test(f) && f.length < 16) return pick(['MA', 'NY', 'CA']);
  if (/\bcity\b|town/.test(f)) return pick(['Boston', 'New York', 'San Francisco']);
  if (/street|address|addr(?!ess_)/.test(f)) return `${100 + i} Test St`;
  if (/currency/.test(f)) return 'USD';
  if (/timezone|tz\b/.test(f)) return 'America/New_York';
  if (/locale|language|lang\b/.test(f)) return 'en-US';
  if (/status|stage|phase/.test(f)) return pick(['active', 'pending', 'completed']);
  if (/\btype\b|category|kind|tier|level/.test(f)) return pick(['standard', 'premium', 'basic']);
  if (/guid|uuid/.test(f)) return `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`;
  if (/desc|description|note|comment|message|body|content|summary|bio|about/.test(f)) return `Sample ${fieldName} ${i}`;
  if (/title|label|headline|subject/.test(f)) return `Sample Title ${i}`;
  if (/color|colour/.test(f)) return pick(['#1A73E8', '#34A853', '#FBBC05']);
  if (/(^|_)(id|code|key|ref|slug|handle|token|sku|barcode)$/.test(f)) return `${fieldName}-${i}`;
  if (t.includes('max')) return '[]'; // JSON/blob column → empty-array string (connector reshapes)
  return `${fieldName} ${i}`; // faithful default: carries the field name + a stable index
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
    for (const { fn, ft } of r.fields) row[fn] = fn === r.pk ? synthPk(r.name, r.pkType, n) : (fn === r.wm ? `2026-06-1${n}T00:00:00Z` : synth(fn, ft, n));
    if (r.pk) row[r.pk] = synthPk(r.name, r.pkType, n);   // keyless object → no PK column; content-hash/synthetic-PK identity (§4)
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

// PER-CONNECTOR TEST DESCRIPTOR (each connector is unique). A connector's build may drop a
// `test-descriptor.json` next to its fixtures declaring what the GENERIC generator can't infer:
//   { "credentials": { "ApiKey": "...", "ApiSecret": "...", "OrganizationCode": "..." },
//     "envelopeKey": "value", "fetchShape": "rest|accesspath|template-var|soql|soap|graphql", "liveOnly": true }
// `credentials` are merged into the fixture Configuration (mock uses Configuration for BOTH the credential
// AND config, so connectors that read specific cred keys — PheedLoop ApiKey/ApiSecret, OrgCode — pass).
// Applied to BOTH regenerated AND preserved (hand-authored) fixtures. Returns true if anything was applied.
export function applyTestDescriptor(manifest, fixturesDir) {
  let descriptor = null;
  try {
    const dPath = pathResolve(fixturesDir, 'test-descriptor.json');
    if (existsSync(dPath)) descriptor = JSON.parse(readFileSync(dPath, 'utf8'));
  } catch { return false; }
  if (!descriptor) return false;
  let changed = false;
  if (descriptor.credentials) { manifest.Configuration = { ...(manifest.Configuration || {}), ...descriptor.credentials }; changed = true; }
  if (descriptor.fetchShape) { manifest.FetchShape = descriptor.fetchShape; changed = true; }
  if (descriptor.liveOnly) { manifest.LiveOnly = true; changed = true; }
  // The `lifecycle` block is the SINGLE declared-capability gating source for the production-faithful
  // lifecycle harness (which stages a connector supports). Stamp it onto the manifest so
  // matrixSpecsFromManifest (connector-e2e-adapters.mjs) and the harness phases can read it.
  if (descriptor.lifecycle && typeof descriptor.lifecycle === 'object') { manifest.Lifecycle = descriptor.lifecycle; changed = true; }
  return changed;
}

// Build ONE synthetic row for object r at index n: the deployed PK + watermark + per-field provable-
// shape values, PLUS one UNDECLARED custom field (`mj_e2e_custom_attr`) so the custom-column capture
// cell is non-vacuous (a real source returns vendor fields the static schema doesn't list → overflow →
// promotion). Module-level so the clobber path (buildFixtureFromRows) and the merge path
// (mergeAllObjectDataRoutes) emit byte-identical rows. Gated off by E2E_FIXTURE_CUSTOM_FIELDS=0.
function mkSynthRow(r, n) {
  const emitCustom = process.env.E2E_FIXTURE_CUSTOM_FIELDS !== '0';
  const row = {};
  for (const { fn, ft } of r.fields) row[fn] = fn === r.pk ? synthPk(r.name, r.pkType, n) : (fn === r.wm ? `2026-06-1${n}T00:00:00Z` : synth(fn, ft, n));
  if (r.pk) row[r.pk] = synthPk(r.name, r.pkType, n);   // keyless object → no PK column; content-hash/synthetic-PK identity (§4)
  if (r.wm) row[r.wm] = `2026-06-1${n}T00:00:00Z`;
  if (emitCustom) row.mj_e2e_custom_attr = `custom-${n}`;   // undeclared → must be captured to overflow
  return row;
}

// MERGE-ALL-OBJECTS — a hand-authored SOQL/GraphQL/by-id fixture carries the faithful auth/token/
// describe routes the generic generator can't infer, but is THIN on per-object DATA routes (fonteva:
// 5 of 28 queryAll). Given the FULL deployed `rows`, KEEP every hand route and ADD a shape-correct data
// route for each deployed object lacking one — turning a thin hand fixture all-object WITHOUT clobbering
// its hand-authored auth. The mock already matches SOQL (`Match:"FROM <obj>"` over the decoded query),
// GraphQL (`Match:"operationName:<op>"`), and by-id (`/{iD}/<section>` template-var) — we only need the
// per-object routes to exist. Returns { added, totalObjects, shape }.
function mergeAllObjectDataRoutes(handM, rows, shape, envelopeKey) {
  handM.Routes = Array.isArray(handM.Routes) ? handM.Routes : [];
  handM.Objects = Array.isArray(handM.Objects) ? handM.Objects : [];
  const haveMatch = new Set(handM.Routes.filter((r) => r.Match).map((r) => String(r.Match).toLowerCase()));
  const havePath = new Set(handM.Routes.map((r) => String(r.Path)));
  const haveObj = new Set(handM.Objects.map((o) => String(o.Name)));
  const addObj = (r) => { if (!haveObj.has(r.name)) { handM.Objects.push({ Name: r.name, OrderingField: r.wm || r.pk }); haveObj.add(r.name); } };
  // SOQL FROM target = the real Salesforce API name, which lives in the APIPath (/sobjects/<sObject>),
  // NOT the friendly IO Name (fonteva IO 'Item' → sObject 'OrderApi__Item__c'). Parse it from the path.
  const sObjOf = (r) => (String(r.rawApiPath ?? r.apipath ?? '').match(/\/sobjects\/([^/?]+)/)?.[1]) || r.name;
  // SOQL data routes MUST use the SAME full path the connector calls (/services/data/vXX/queryAll), NOT a
  // bare prefix: the hand fixture carries a catch-all no-Match queryAll route whose EXACT-path match would
  // otherwise intercept every prefix route (→ 0 rows for the 23 new objects, the exact bug observed).
  // Reuse an existing FROM-route's Path as the exemplar; the desc-length sort below keeps the new
  // exact-path Match routes ahead of the no-Match catch-all so they win the first-exact-wins scan.
  const soqlExemplarPath = handM.Routes.find((r) => r.Match && /^from /i.test(String(r.Match)))?.Path
    || handM.Routes.find((r) => /\/query(all)?$/i.test(String(r.Path)))?.Path
    || '/services/data';
  // IDEMPOTENT REBUILD of shape DATA routes: strip every existing FROM-data (soql) / operationName-data
  // (graphql) route — hand-authored AND prior-merge — then re-add fresh below. WITHOUT this, a generator
  // FIX never reaches a fixture a prior (buggy) run already wrote: the haveMatch dedup keeps the stale
  // body (the exact reason the capital-`Id` SOQL fix didn't apply on re-run). Auth/token/describe routes
  // carry no FROM/operationName Match, so they survive untouched. (by-id is path-keyed → deduped per-object.)
  if (shape === 'soql') handM.Routes = handM.Routes.filter((rt) => !(rt.Match && /^from /i.test(String(rt.Match))));
  else if (shape === 'graphql') handM.Routes = handM.Routes.filter((rt) => !(rt.Match && /^operationname:/i.test(String(rt.Match))));
  haveMatch.clear();
  for (const rt of handM.Routes) if (rt.Match) haveMatch.add(String(rt.Match).toLowerCase());
  let added = 0;
  for (const r of rows) {
    const body = [mkSynthRow(r, 1), mkSynthRow(r, 2), mkSynthRow(r, 3)];
    if (shape === 'soql') {
      const sObj = sObjOf(r);
      const match = `FROM ${sObj}`;
      if (!haveMatch.has(match.toLowerCase())) {
        // SF SOQL records are identified by the CAPITAL `Id` (REQUIRED_SOQL_FIELDS + raw['Id'] dedup in
        // SalesforceConnector), NOT the lowercased deployed PK IOF ('id') — without it the connector reads
        // raw['Id']=undefined → empty ExternalID → create fails (the observed 23/28 zero-row failure).
        // Mirror the PK value onto capital `Id`, add the SF system fields + the `attributes` envelope the
        // SOQL path expects (TransformRecord strips attributes; ExcludedSourceKeys agrees on the removal).
        const recs = [1, 2, 3].map((n) => {
          const row = mkSynthRow(r, n);
          row.Id = row[r.pk] ?? synthPk(r.name, r.pkType, n);
          if (row.SystemModstamp == null) row.SystemModstamp = `2026-06-1${n}T00:00:00Z`;
          if (row.IsDeleted == null) row.IsDeleted = false;
          row.attributes = { type: sObj };
          return row;
        });
        handM.Routes.push({ Path: soqlExemplarPath, Method: 'GET', Status: 200, Match: match, Body: { records: recs, done: true, totalSize: recs.length } });
        haveMatch.add(match.toLowerCase()); added++;
      }
    } else if (shape === 'graphql') {
      const qn = r.rdk || r.name;   // GraphQL query/operation name = the IO's ResponseDataKey
      const match = `operationName:${qn}`;
      if (!haveMatch.has(match.toLowerCase())) {
        handM.Routes.push({ Path: '/graphql', Method: 'POST', Status: 200, Match: match, Body: { data: { [qn]: body } } });
        haveMatch.add(match.toLowerCase()); added++;
      }
    } else {   // by-id / byid: deployed apipath is /{iD}/<section> (template-var) — a flat GET the mock {seg}-matches
      const p = String(r.apipath);
      if (!havePath.has(p)) {
        handM.Routes.push({ Path: p, Method: 'GET', Status: 200, Body: (envelopeKey ? { [envelopeKey]: body } : body) });
        havePath.add(p); added++;
      }
    }
    addObj(r);
  }
  // SOQL substring-collision tie-break: matchRoute keeps the FIRST same-prefix candidate, so order the
  // `FROM <obj>` routes DESC by Match length — `FROM AccountContact` is tried before `FROM Account`, else
  // a 'FROM AccountContact' query substring-hits the shorter 'FROM Account' route first → wrong data.
  // Non-FROM routes (token/describe) get -1 and sort to the end; they're exact-path matched, so order is moot.
  if (shape === 'soql') {
    const fromLen = (r) => (r.Match && /^from /i.test(String(r.Match)) ? String(r.Match).length : -1);
    handM.Routes.sort((a, b) => fromLen(b) - fromLen(a));
  }
  return { added, totalObjects: handM.Objects.length, shape };
}

export function buildFixtureFromRows(rows, cfgKey = 'BaseURL', envelopeKey = null) {
  // Wrap a synthetic row array in the connector's response envelope (`{[envelopeKey]: rows}`) when the
  // connector reads `body.<key>`; bare array otherwise. Centralized so route + delta bodies stay consistent.
  const wrapBody = (arr) => (envelopeKey ? { [envelopeKey]: arr } : arr);
  // Inverse of wrapBody — get the row array back out of a (possibly enveloped) route Body so the
  // delta-candidate scan + delta-pass construction work identically for bare-array and enveloped fixtures.
  const unwrapBody = (b) => (Array.isArray(b) ? b : (b && envelopeKey && Array.isArray(b[envelopeKey]) ? b[envelopeKey] : []));
  // ACCESS-PATH connectors (nested doors) need a nested door body, not a flat route-per-object.
  // Use the pure access-path manifest ONLY when EVERY routable object is access-path (e.g. neon).
  // A MIXED catalog (a few access-path objects among many flat ones — openwater had 1 of 25) must
  // NOT take this branch: it only emits the access-path objects and DROPS every flat object, which
  // is what reduced openwater to 1 fixtured object of 25. Mixed/flat → the flat route-per-object path.
  if (Array.isArray(rows) && rows.length > 0 && rows.every((r) => r && r.accessPath && r.accessPath.door)) {
    return buildAccessPathManifest(rows, cfgKey);
  }
  // Build a synthetic row for ANY object r at index n (PK + watermark + per-field provable-shape values).
  // Each row ALSO carries one UNDECLARED custom field (not in the IOF set) so the custom-column capture
  // cell is genuinely exercised: a real source returns vendor/custom fields the static schema doesn't list,
  // and the connector's full-record passthrough must surface them → overflow → promotion. A bare declared-
  // only row makes the custom-column cell vacuous. Gated by E2E_FIXTURE_CUSTOM_FIELDS!=0.
  const mkRowFor = (r, n) => mkSynthRow(r, n);   // module-level builder, shared with the merge-all-objects path
  // MIXED catalog (flat door objects + access-path children): flat objects get a route-per-object;
  // access-path objects either EMBED into their door object's records (embedded-array extraction, e.g.
  // Program.rounds[]) or get their OWN entry route (path/query-injected, called once per parent id — the
  // mock answers regardless of the injected id). This makes a real DAG sync populate EVERY layer
  // (door → embedded child → per-parent grandchild), which is what the all-object coverage gate requires.
  const accessRows = rows.filter((r) => r.accessPath && r.accessPath.door);
  const flatRows = rows.filter((r) => !(r.accessPath && r.accessPath.door));
  const objs = [], routes = [], routeRows = [], bodyByDoor = new Map();
  for (const r of flatRows) {
    const body = [mkRowFor(r, 1), mkRowFor(r, 2), mkRowFor(r, 3)];
    routes.push({ Path: r.apipath, Method: 'GET', Status: 200, Body: wrapBody(body) });
    routeRows.push(r);
    objs.push({ Name: r.name, OrderingField: r.wm || r.pk });
    bodyByDoor.set(r.name, body);
  }
  for (const r of accessRows) {
    objs.push({ Name: r.name, OrderingField: r.wm || r.pk });
    const ap = r.accessPath;
    const mode = String(ap.extractionMode || '').toLowerCase();
    const segs = ap.nestingSegments || [];
    const field = String(segs[segs.length - 1] || '').replace(/\[\]$/, '');
    const doorBody = bodyByDoor.get(ap.door);
    // parent-id params any access child of this door injects — alias them onto the embedded element's PK
    // so the connector finds whatever id it descends to (e.g. roundId off Program.rounds[]).
    const childParams = accessRows.filter((a) => a.accessPath.door === ap.door && a.accessPath.parentParamName)
      .map((a) => a.accessPath.parentParamName);
    // Embed when the source marks it embedded-array OR it has no own route (apipath is a "(embedded …)"
    // marker) — either way its records live inside the door object's nesting field, not at a route.
    const isEmbedded = mode.includes('embed') || !r.apipath || String(r.apipath).startsWith('(');
    if (isEmbedded && doorBody && field) {
      for (const dr of doorBody) {
        dr[field] = [1, 2, 3].map((n) => {
          const e = mkRowFor(r, n);
          for (const p of childParams) e[p] = e[r.pk];
          if (e.id == null) e.id = e[r.pk];
          return e;
        });
      }
    } else {
      // path/query-injected child: own GET route(s). The connector fetches access-path children from
      // accessPath.entryPath AND every accessPath.alternativePaths entry (e.g. openwater Report tries
      // /v2/Rounds/{roundId}/ApplicationReports, /v2/Rounds/{roundId}/JudgeReports,
      // /v2/Programs/{programId}/SessionReports). A 404 on ANY of them aborts the whole object's leaf fetch
      // → 0 rows. So emit a route for the entryPath, EVERY alternativePath, AND the APIPath — every path the
      // connector might call must answer. Template vars are kept (mock wildcard-matches the injected id).
      const childPaths = [ap.entryPath, ...(ap.alternativePaths || []), r.apipath]
        .filter((p) => p && !String(p).startsWith('('));
      const seenPaths = new Set();
      for (const cp of childPaths) {
        if (seenPaths.has(cp)) continue;
        seenPaths.add(cp);
        routes.push({ Path: cp, Method: 'GET', Status: 200, Body: wrapBody([mkRowFor(r, 1), mkRowFor(r, 2), mkRowFor(r, 3)]) });
      }
      routeRows.push(r);
    }
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
  // Delta operates on objects with a TOP-LEVEL route (routeRows aligns 1:1 with routes); embedded-only
  // access objects have no own route and are excluded from the delta candidate scan.
  let pick = -1, updField = null;
  for (let i = 0; i < routeRows.length; i++) {
    const rr = routeRows[i], body = unwrapBody(routes[i]?.Body);
    if (!rr.pk || !Array.isArray(body) || body.length < 3 || String(rr.rawApiPath ?? rr.apipath ?? '').includes('{') || rr.accessPath) continue; // delta target must be FLAT (no parent chain to replay in the delta pass)
    const uf = rr.fields.map((f) => f.fn).find((fn) => isSafeScalarStr(body, fn, (rr.fields.find((x) => x.fn === fn) || {}).ft, rr.pk, rr.wm));
    if (uf) { pick = i; updField = uf; break; }
  }
  // Fallback: first PK-bearing object with any non-PK/non-wm string body value (excluding link/json names).
  if (pick < 0) for (let i = 0; i < routeRows.length; i++) {
    const rr = routeRows[i], body = unwrapBody(routes[i]?.Body);
    if (!rr.pk || !Array.isArray(body) || body.length < 3 || String(rr.rawApiPath ?? rr.apipath ?? '').includes('{') || rr.accessPath) continue; // delta target must be FLAT (no parent chain to replay in the delta pass)
    updField = Object.keys(body[0]).find((k) => k !== rr.pk && k !== rr.wm
      && typeof body[0][k] === 'string' && !/date|time|_links|link|url|json|fields/i.test(k)) || null;
    pick = i; break;
  }
  // Last resort — an ALL-ACCESS-PATH connector (e.g. PheedLoop, where EVERY object carries a
  // Configuration.AccessPath so the two loops above skip them all) lands here. Prefer a DIRECT
  // (non-template-var) object: its route replays standalone in the delta pass, so present/update/delete
  // round-trip even though it's technically an access object. Only TEMPLATE-VAR objects truly need a
  // parent chain the delta pass can't replay. Green connectors already picked above → never reach here.
  if (pick < 0) {
    for (let i = 0; i < routeRows.length; i++) {
      const rr = routeRows[i], body = unwrapBody(routes[i]?.Body);
      if (!rr.pk || !Array.isArray(body) || body.length < 3 || String(rr.rawApiPath ?? rr.apipath ?? '').includes('{')) continue;
      updField = rr.fields.map((f) => f.fn).find((fn) => isSafeScalarStr(body, fn, (rr.fields.find((x) => x.fn === fn) || {}).ft, rr.pk, rr.wm))
        || Object.keys(body[0]).find((k) => k !== rr.pk && k !== rr.wm && typeof body[0][k] === 'string' && !/date|time|_links|link|url|json|fields/i.test(k)) || null;
      pick = i; break;
    }
  }
  if (pick < 0) pick = 0; // absolute last resort: first object, no update sub-assert
  const first = routeRows[pick], r0 = routes[pick];
  const r0Body = unwrapBody(r0.Body);
  const pk0 = first.pk;
  const NEW_VAL = 'updated-delta';
  const deltaRow1 = { ...r0Body[0] }; if (updField) deltaRow1[updField] = NEW_VAL;
  const deltaPass = {
    Object: first.name,
    // ExpectedDeletes ⇒ phaseDelta runs this as a FULL sync (orphan detection needs the complete set);
    // row3 absent ⇒ deleted/tombstoned, rows 1+2 present, row1's updField now equals NEW_VAL.
    Routes: [{ Path: r0.Path, Method: 'GET', Status: 200, Body: wrapBody([deltaRow1, r0Body[1]]) }],
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
    // API key + paired secret (PheedLoop ApiKey/ApiSecret; others use Secret/AppKey/AppSecret/PrivateToken).
    ApiSecret: 'mock-api-secret', apiSecret: 'mock-api-secret', Secret: 'mock-secret',
    AppKey: 'mock-app-key', AppSecret: 'mock-app-secret', PrivateToken: 'mock-private-token', PublicKey: 'mock-public-key',
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
    // Microsoft Graph / Azure AD (SharePoint, Dynamics 365): the connector validates a directory
    // (tenant) id before any fetch — `TenantId is required`. Seed all common casings so the connector's
    // own config check passes against the mock (the mock ignores auth; this only satisfies validation).
    TenantId: 'mock-tenant-id', TenantID: 'mock-tenant-id', tenantId: 'mock-tenant-id', Tenant: 'mock-tenant',
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
 * @param {number} [args.maxObjects]  cap routable objects (default 100000 — effectively uncapped, FULL per-object coverage)
 * @returns {Promise<{ ok:boolean, written?:string, objectNames?:string[], deltaObject?:string|null, reason?:string }>}
 */
export async function regenerateFixturesFromDeployed({ db, platform, mjSchema = '__mj', integrationID, fixturesDir, cfgKey = 'BaseURL', maxObjects = 100000 }) {
  // HAND-AUTHORED FIXTURE GUARD: connectors whose routes cannot be derived from the deployed IO
  // APIPaths — SOQL (Salesforce/Fonteva/Nimble use /services/data/.../queryAll + describe), file-feed
  // (PropFuel), by-ID (ORCID /{iD}/...), or any fixture that hardcodes its base (UpstreamHost), uses a
  // non-default ConfigUrlKey (LoginUrl / ApiBaseUrl / storagePath), or declares DeltaPasses/file
  // transport — get a CAREFULLY hand-authored fixtures.json. Auto-regen from deployed APIPaths would
  // CLOBBER it with naive GET-list routes the connector never calls, causing empty fetches / infinite
  // non-advancing pagination (the Fonteva BusinessGroup 5000-batch loop). Detect + preserve them.
  // Read the per-connector test-descriptor up front: it supplies the faithful SHAPE the generic
  // generator can't infer — `pathPrefix` (the real base path the connector prepends, e.g. PheedLoop's
  // `/api/v3/organization/{OrganizationCode}`, so routes EXACTLY match the connector's real call and a
  // wrong path correctly fails), `envelopeKey`, `credentials` — AND can FORCE all-object regen via
  // `"expandToAllObjects": true` so a thin hand fixture no longer caps coverage to its few objects.
  let descriptorCfg = null;
  try { const dp = pathResolve(fixturesDir, 'test-descriptor.json'); if (existsSync(dp)) descriptorCfg = JSON.parse(readFileSync(dp, 'utf8')); } catch { /* no descriptor */ }
  const forceAllObjects = descriptorCfg?.expandToAllObjects === true;
  try {
    const existing = pathResolve(fixturesDir, 'fixtures.json');
    if (!forceAllObjects && existsSync(existing)) {
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
        // Even when we PRESERVE a hand-authored fixture, apply the per-connector test-descriptor's
        // credentials/flags to it (each connector is unique — e.g. PheedLoop reads ApiKey+ApiSecret from
        // the Credential and OrganizationCode from Configuration; its hand fixture lacks them). The merge
        // is into the existing fixture's Configuration so the connector's cred validation passes in mock.
        const applied = applyTestDescriptor(m, fixturesDir);
        if (applied) { writeFileSync(existing, JSON.stringify(m, null, 2) + '\n'); }
        return { ok: false, reason: `hand-authored fixture preserved (ConfigUrlKey=${m.ConfigUrlKey}, transport=${m.Transport || 'http'})${applied ? ' + descriptor applied' : ''} — regen skipped`, preserved: true, descriptorApplied: applied };
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
    ? `SELECT "ID" AS id, "Name" AS name, "APIPath" AS apipath, "IncrementalWatermarkField" AS wm, "Configuration" AS cfg, "ResponseDataKey" AS rdk FROM ${IO} WHERE "IntegrationID" = ${lit(integrationID)} AND "Status" = 'Active' ORDER BY CASE WHEN "Name" ILIKE '%custom%' OR "Name" ILIKE '%webhook%' OR "Name" ILIKE '%validator%' OR "Name" ILIKE '%relation%' THEN 1 ELSE 0 END, "Name"`
    : `SELECT ID AS id, Name AS name, APIPath AS apipath, IncrementalWatermarkField AS wm, Configuration AS cfg, ResponseDataKey AS rdk FROM ${IO} WHERE IntegrationID = ${lit(integrationID)} AND Status = 'Active' ORDER BY CASE WHEN Name LIKE '%Custom%' OR Name LIKE '%Webhook%' OR Name LIKE '%Validator%' OR Name LIKE '%Relation%' THEN 1 ELSE 0 END, Name`;
  const ioRows = await db.rows(ioSql);
  if (!ioRows?.length) return { ok: false, reason: `no deployed IntegrationObject rows for integration ${integrationID}` };

  // Bounded-Goldilocks exclude list: objects known to inject a sync-time defect the mock can't model
  // (e.g. neon CustomObjectValidatorRuleResponse → a content-hash key promoted to a column the table
  // lacks → "Invalid column name" → poisons the whole run). Excluding them is honest bounded scoping —
  // the residual is REPORTED, never hidden. Set via E2E_EXCLUDE_OBJECTS=comma,list (case-insensitive).
  const excludeObjects = new Set(String(process.env.E2E_EXCLUDE_OBJECTS || '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean));

  // The connector's real base path (descriptor.pathPrefix) — e.g. PheedLoop prepends
  // `/api/v3/organization/{OrganizationCode}` in GetBaseURL — must be on EVERY route so the mock serves
  // the EXACT full path the connector calls (a wrong path/prefix then correctly fails; no loose match).
  // Template vars in the prefix (e.g. {OrganizationCode}) stay literal; matchRoute wildcard-matches them.
  const pfx = String(descriptorCfg?.pathPrefix || '').trim();
  const prefixed = (p) => (pfx && p && !String(p).startsWith('(') ? `/${pfx.replace(/^\/+|\/+$/g, '')}/${String(p).replace(/^\/+/, '')}` : p);

  // 2) Per-object fields + the deployed PK column.
  const rows = [];
  for (const ioRow of ioRows) {
    if (rows.length >= maxObjects) break;
    const apipath = col(ioRow, 'apipath');
    // Parse the access-path block (door + nesting chain) EARLY — it decides whether a non-routable apipath
    // is still keepable: an EMBEDDED-array object (e.g. openwater Rounds, apipath "(embedded in …)") has no
    // own route but MUST be carried so the door-embed logic nests it into its parent's records. Skipping it
    // (the old `startsWith('(')` filter) left the parent's nesting field a scalar → the nested grandchildren
    // (JudgeAssignment/Report, fetched per parent id) found no ids → 0 rows. Keep any object with a door.
    let accessPath = null;
    try { const j = JSON.parse(col(ioRow, 'cfg') || '{}'); accessPath = j.AccessPath || null; } catch { /* not JSON */ }
    const hasDoor = !!(accessPath && accessPath.door);
    // Skip only truly non-routable paths (embedded/parenthesized markers) THAT also have no access-path door.
    // TEMPLATE-VAR paths (`/{iD}/works`) ARE routable (wildcard-matched). by-iD/template-var connectors kept.
    if ((!apipath || String(apipath).startsWith('(')) && !hasDoor) continue;
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
    if (!fields.length) continue; // keyless objects are FINE — the engine assigns identity via DiscoverFields
    // streaming PK ideation, else synthetic-PK / content-hash fallback (§4). The harness must NOT drop them
    // (requiring a hard PK was the bug that made neon's 24 soft-keyless objects show as untested).
    const apForRow = accessPath ? { ...accessPath, door: prefixed(accessPath.door), entryPath: prefixed(accessPath.entryPath), alternativePaths: (accessPath.alternativePaths || []).map(prefixed) } : accessPath;
    rows.push({ name: col(ioRow, 'name'), apipath: prefixed(apipath), rawApiPath: apipath, wm: col(ioRow, 'wm') || null, pk, pkType, fields, accessPath: apForRow, rdk: col(ioRow, 'rdk') || null });
  }
  if (!rows.length) return { ok: false, reason: `no routable, PK-bearing deployed objects for integration ${integrationID}` };

  // RESPONSE ENVELOPE: a Graph/OData/REST connector whose NormalizeResponse reads `body.<key>` (e.g.
  // `value`, `data`, `results`, `items`) needs the fixture body wrapped in that envelope — a bare array
  // yields `body[key]===undefined` → 0 records (the SharePoint Site 0-row trap). The key comes from the
  // IO's declared `ResponseDataKey`; for connectors that default the envelope in CODE (SharePoint hard-
  // codes `value` while ResponseDataKey is null), the global override `E2E_RESPONSE_ENVELOPE_KEY` supplies
  // it. Null ⇒ bare array (the openwater/plain-REST case, unchanged).
  const envelopeKey = descriptorCfg?.envelopeKey
    || process.env.E2E_RESPONSE_ENVELOPE_KEY
    || (rows.map((r) => r.rdk).filter(Boolean).sort((a, b) =>
        rows.filter((r) => r.rdk === b).length - rows.filter((r) => r.rdk === a).length)[0])
    || null;

  // MERGE-ALL-OBJECTS for auth-bearing shapes (SOQL / GraphQL / by-id): when expandToAllObjects is set
  // AND a hand-authored fixture exists AND the descriptor declares one of these shapes, PRESERVE the hand
  // fixture's token/describe/auth routes and ADD a shape-correct data route for every deployed object that
  // lacks one — instead of clobbering with generic regen (which can't reproduce the faithful auth, e.g.
  // fonteva's LoginUrl key + instance_url two-phase OAuth). This is what turns fonteva 5/28 → 28/28,
  // path-lms 1/84 → 84/84, orcid 3/12 → 12/12 without losing their hand-authored connection plumbing.
  const fetchShape = String(descriptorCfg?.fetchShape || '').toLowerCase();
  const MERGE_SHAPES = new Set(['soql', 'graphql', 'by-id', 'byid']);
  if (forceAllObjects && MERGE_SHAPES.has(fetchShape)) {
    const handPath = pathResolve(fixturesDir, 'fixtures.json');
    if (existsSync(handPath)) {
      let handM = null;
      try { handM = JSON.parse(readFileSync(handPath, 'utf8')); } catch { handM = null; }
      if (handM && Array.isArray(handM.Routes)) {
        const merged = mergeAllObjectDataRoutes(handM, rows, fetchShape, envelopeKey);
        applyTestDescriptor(handM, fixturesDir);   // merge descriptor creds/flags into the hand Configuration
        writeFileSync(handPath, JSON.stringify(handM, null, 2) + '\n');
        return { ok: true, written: handPath, merged: true, mergeShape: fetchShape, added: merged.added,
                 objectNames: handM.Objects.map((o) => o.Name), deltaObject: (handM.DeltaPasses?.[0]?.Object ?? null) };
      }
    }
  }

  const { manifest, objectNames, deltaObject } = buildFixtureFromRows(rows, cfgKey, envelopeKey);
  if (!manifest) return { ok: false, reason: 'fixture builder produced no objects' };

  // PER-CONNECTOR TEST DESCRIPTOR (each connector is unique). A connector's build may drop a
  // `test-descriptor.json` next to its fixtures declaring what the GENERIC generator can't infer:
  //   { "credentials": { "ApiKey": "...", "ApiSecret": "..." },   // exact keys this connector validates
  //     "envelopeKey": "value",                                    // response envelope if code-defined
  //     "fetchShape": "rest|accesspath|template-var|soql|soap|graphql",
  //     "liveOnly": true }                                         // auth can't be mocked (Graph hardcoded host)
  // `credentials` are merged into the fixture Configuration so connectors that validate specific cred keys
  // (e.g. PheedLoop ApiKey/ApiSecret) stop failing "No credential found" in mock. liveOnly/fetchShape are
  // surfaced for the harness/operator. This is the seam that makes the generic generator connector-aware.
  applyTestDescriptor(manifest, fixturesDir);

  mkdirSync(fixturesDir, { recursive: true });
  const out = pathResolve(fixturesDir, 'fixtures.json');
  writeFileSync(out, JSON.stringify(manifest, null, 2) + '\n');
  return { ok: true, written: out, objectNames, deltaObject, descriptor: descriptorCfg ? Object.keys(descriptorCfg) : null };
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
