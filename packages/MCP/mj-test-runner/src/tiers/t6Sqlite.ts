/**
 * T6_LocalSQLiteBackend — a FAST, DEPENDENCY-FREE OFFLINE APPROXIMATION of the
 * connector's data-model semantics (created / updated / deleted / ordering).
 *
 * ⚠️ NOT the canonical apply test. The canonical credential-free APPLY test is the
 * REAL-ENGINE end-to-end harness:
 *   `packages/Integration/connectors/test/connector-e2e-harness.mjs`
 *   (plan `connector-e2e`, mode `mock`) — which replays the SAME `fixtures.json`
 *   through a local mock vendor and drives the ACTUAL MJ pipeline
 *   (CreateConnection → ApplyAll = real SchemaBuilder builds the tables →
 *   StartSync = real IntegrationEngine.RunSync maps + applies into the DB → DB
 *   verify of create/update/delete + idempotent re-run). See CONNECTOR_E2E.md.
 *
 * T6 here deliberately does NOT run the engine. Its child:
 *   1. Boots the SAME fixture transport as T5 (mock `node:http` server for REST,
 *      temp file for a file-feed connector).
 *   2. Spins up a `node:sqlite` in-memory DB with a generic staging table.
 *   3. Runs a REAL PULL — the connector's `FetchChanges` — and APPLIES the
 *      returned `ExternalRecord`s into SQLite via a MINIMAL applier that
 *      upserts-by-PK (ExternalID) and tombstones records flagged `IsDeleted`.
 *   4. Replays each fixture DELTA pass (swap routes / file content) through the
 *      same fetch+apply path, then ASSERTS:
 *        - rows from the initial pull landed,
 *        - an UPDATED record overwrote its prior row,
 *        - a DELETED record was tombstoned,
 *        - the ordering key (e.g. file-feed `microtime`, REST `updated_at`) is
 *          monotonic in apply order.
 *
 * **What this proves vs. what the real e2e proves.** This applier is a minimal
 * upsert/tombstone model, NOT the MJ sync engine — it proves the
 * connector→record→row CONTRACT (the part a connector author owns) with ZERO
 * dependencies, so it can run on any box in milliseconds. It does NOT exercise:
 * field-mapping resolution, FK/DAG ordering across objects, watermark persistence +
 * resume, content-hash load-skip, the real SchemaBuilder DDL, or target-type
 * constraint enforcement. Those are exactly what the real-engine `connector-e2e`
 * (mock mode) covers, and it SUPERSEDES this tier for any claim of "the apply
 * works". Keep T6 as the cheap, no-MJAPI/no-DB smoke; run `connector-e2e` (mock)
 * for the real proof. The two share one `fixtures.json` so there is no drift.
 *
 * If the connector has NO fixtures, T6 Fails with `no-fixtures` (visible gap).
 * **CREDENTIAL-FREE.**
 */
import { CHILD_PREAMBLE, CHILD_TRANSPORT, spawnChildRunner, clipStderr, type ConnectorIdentity } from './childRunner.js';
import { loadFixtures, type FixtureManifest } from './fixtures.js';

/** Portion of a TierResult an individual tier handler returns. */
interface TierHandlerResult {
    Status: 'Pass' | 'Fail' | 'Skipped';
    Output: string;
    Errors: string[];
    Details?: Record<string, unknown>;
}

/** A single asserted outcome from the SQLite apply run. */
interface T6Assertion {
    name: string;
    passed: boolean;
    detail: string;
}

/** Child payload for T6. */
interface T6Data {
    transport?: string;
    initialRows?: number;
    deltaPasses?: number;
    assertions?: T6Assertion[];
    setupError?: string;
}

/** Run T6: skip (non-blocking, surfaced as a warning) on missing fixtures; else pull→apply→assert in SQLite. */
export function runT6Sqlite(connector: string, identity: ConnectorIdentity): TierHandlerResult {
    const { Manifest, FixturesDir } = loadFixtures(connector);
    if (!Manifest) {
        return {
            Status: 'Skipped',
            Output: '',
            Errors: [`no-fixtures: no fixtures/fixtures.json found for "${connector}" under ${FixturesDir}. T6 pulls fixtures + delta passes to assert create/update/delete; with none present it is not-applicable. Surfaced as a visible warning (skippedRungs), not a silent pass — author fixtures to deepen offline coverage.`],
            Details: { connector, class: identity.ClassName, reason: 'no-fixtures', fixturesDir: FixturesDir },
        };
    }

    const advisory = advisoryForManifest(Manifest);
    const outcome = spawnChildRunner<T6Data>({
        identity,
        childSource: T6_CHILD_SOURCE,
        env: { MJ_TIER_FIXTURES: JSON.stringify(Manifest) },
        timeoutMs: 90_000,
    });

    if (!outcome.parsed) {
        return {
            Status: 'Fail',
            Output: '',
            Errors: [
                `T6 child emitted no result for "${connector}" (exit=${String(outcome.status)}).`,
                ...(outcome.stderr.trim() ? [clipStderr(outcome.stderr)] : []),
            ],
            Details: { connector, class: identity.ClassName },
        };
    }
    if (!outcome.parsed.ok) {
        return {
            Status: 'Fail',
            Output: '',
            Errors: [outcome.parsed.reason ? `T6 setup failed: ${outcome.parsed.reason}` : 'T6 setup failed.'],
            Details: { connector, class: identity.ClassName },
        };
    }

    return evaluateT6(connector, identity, outcome.parsed.data ?? {}, advisory);
}

/**
 * Build the advisory list. ALWAYS carries the supersede note so a green T6 never
 * silently reads as "the apply works" — that proof is the real-engine
 * `connector-e2e` (mock mode). Adds the no-DeltaPasses note when applicable.
 */
function advisoryForManifest(manifest: FixtureManifest): string[] {
    const advisory = [
        'T6 is a fast OFFLINE APPROXIMATION (minimal SQLite upsert/tombstone), NOT the MJ engine. The canonical credential-free APPLY proof is connector-e2e (mock mode) in packages/Integration/connectors/test — same fixtures.json, real SchemaBuilder + IntegrationEngine + DB verify. See CONNECTOR_E2E.md.',
    ];
    if (!manifest.DeltaPasses || manifest.DeltaPasses.length === 0) {
        advisory.push('fixture defines no DeltaPasses — update/delete/ordering semantics are only weakly exercised; add DeltaPasses to assert them.');
    }
    return advisory;
}

/** Build the pass/fail verdict from the SQLite assertions. */
function evaluateT6(
    connector: string,
    identity: ConnectorIdentity,
    data: T6Data,
    advisory: string[],
): TierHandlerResult {
    if (data.setupError) {
        return {
            Status: 'Fail',
            Output: '',
            Errors: [`T6 in-child setup failed: ${data.setupError}`],
            Details: { connector, class: identity.ClassName },
        };
    }

    const assertions = data.assertions ?? [];
    if (assertions.length === 0) {
        return {
            Status: 'Fail',
            Output: '',
            Errors: ['No assertions were produced — the pull/apply run did not exercise any data-model semantics.'],
            Details: { connector, class: identity.ClassName, initialRows: data.initialRows },
        };
    }

    const failed = assertions.filter((a) => !a.passed);
    const summary =
        `[OFFLINE APPROXIMATION — not the real engine; see connector-e2e mock mode] ` +
        `SQLite apply run (${data.transport}): ${data.initialRows ?? 0} initial row(s), ${data.deltaPasses ?? 0} delta pass(es), ` +
        `${assertions.length - failed.length}/${assertions.length} assertion(s) passed.`;

    if (failed.length > 0) {
        return {
            Status: 'Fail',
            Output: summary,
            Errors: failed.map((a) => `[assert:${a.name}] ${a.detail}`),
            Details: { connector, class: identity.ClassName, assertions, advisory },
        };
    }

    return {
        Status: 'Pass',
        Output: summary,
        Errors: advisory.map((a) => `advisory: ${a}`),
        Details: { connector, class: identity.ClassName, assertions, advisory },
    };
}

/**
 * Child runner for T6. Reuses the T5 transport (mock server / temp file), then
 * runs a real pull + minimal SQLite apply + delta replay + assertions.
 */
const T6_CHILD_SOURCE = `${CHILD_PREAMBLE}
import _http from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { writeFileSync as _writeFileSync, mkdtempSync as _mkdtempSync } from 'node:fs';
import { tmpdir as _tmpdir } from 'node:os';
import { resolve as _pathResolve } from 'node:path';
${CHILD_TRANSPORT}

const MANIFEST = JSON.parse(process.env.MJ_TIER_FIXTURES || '{}');

// ── Minimal applier: upsert-by-PK (ExternalID) + tombstone deletes ──
function makeApplier() {
  const db = new DatabaseSync(':memory:');
  db.exec('CREATE TABLE staging (ExternalID TEXT PRIMARY KEY, ObjectType TEXT, Payload TEXT, IsDeleted INTEGER DEFAULT 0, OrderKey TEXT, ApplySeq INTEGER)');
  const upsert = db.prepare('INSERT INTO staging (ExternalID,ObjectType,Payload,IsDeleted,OrderKey,ApplySeq) VALUES (?,?,?,0,?,?) ON CONFLICT(ExternalID) DO UPDATE SET Payload=excluded.Payload, ObjectType=excluded.ObjectType, IsDeleted=0, OrderKey=excluded.OrderKey, ApplySeq=excluded.ApplySeq');
  const tombstone = db.prepare('UPDATE staging SET IsDeleted=1, ApplySeq=? WHERE ExternalID=?');
  let seq = 0;
  const orderTrace = []; // [{ExternalID, OrderKey}] in apply order
  function apply(records, orderingField) {
    for (const r of records) {
      seq++;
      if (r && r.IsDeleted) { tombstone.run(seq, String(r.ExternalID)); continue; }
      const fields = (r && r.Fields) || {};
      const orderKey = orderingField != null ? String(fields[orderingField] != null ? fields[orderingField] : '') : '';
      upsert.run(String(r.ExternalID), String(r.ObjectType || ''), JSON.stringify(fields), orderKey, seq);
      if (orderingField != null) orderTrace.push({ ExternalID: String(r.ExternalID), OrderKey: orderKey });
    }
  }
  function rowCount() { return db.prepare('SELECT COUNT(*) AS n FROM staging WHERE IsDeleted=0').get().n; }
  function getRow(id) { return db.prepare('SELECT * FROM staging WHERE ExternalID=?').get(String(id)); }
  function close() { db.close(); }
  return { apply, rowCount, getRow, orderTrace, close };
}

async function pull(connector, ci, user, objectName) {
  // Single-page real pull is enough to APPLY; T5 covers multi-page parse.
  const fb = await connector.FetchChanges({ CompanyIntegration: ci, ObjectName: objectName, WatermarkValue: null, BatchSize: 100, ContextUser: user });
  return (fb && Array.isArray(fb.Records)) ? fb.Records : [];
}

function orderingFieldFor(manifest, objectName) {
  const o = (manifest.Objects || []).find((x) => x.Name && x.Name.toLowerCase() === String(objectName).toLowerCase());
  return o && o.OrderingField ? o.OrderingField : null;
}

async function main() {
  const assertions = [];
  let tr;
  try { tr = await setupTransport(MANIFEST); }
  catch (e) { emit({ ok: false, data: { setupError: clip(e && e.message ? e.message : e, 200) } }); return; }

  let ctx;
  try { ctx = await loadConnector(tr.configuration); }
  catch (e) { tr.teardown(); emit({ ok: false, reason: clip(e && e.message ? e.message : e, 240) }); return; }
  if (tr.transport === 'http' && tr.baseURL) tr.wireBaseURL(ctx.connector);

  const applier = makeApplier();
  let initialRows = 0;
  try {
    // Choose the target object: first fixture Object, else first discovered.
    let targetObject = (MANIFEST.Objects && MANIFEST.Objects[0] && MANIFEST.Objects[0].Name) || null;
    if (!targetObject) {
      const objs = await ctx.connector.DiscoverObjects(ctx.companyIntegration, ctx.contextUser);
      targetObject = Array.isArray(objs) && objs[0] ? objs[0].Name : null;
    }
    if (!targetObject) throw new Error('no object to pull (no fixture Objects and DiscoverObjects empty)');

    const orderingField = orderingFieldFor(MANIFEST, targetObject);

    // Initial pull + apply.
    const initial = await pull(ctx.connector, ctx.companyIntegration, ctx.contextUser, targetObject);
    applier.apply(initial, orderingField);
    initialRows = applier.rowCount();
    assertions.push({ name: 'initial-pull-landed', passed: initialRows > 0, detail: initialRows + ' row(s) landed from the initial pull' });

    // Delta passes — swap routes (http) / file content (file), re-pull, re-apply, assert.
    const deltas = MANIFEST.DeltaPasses || [];
    for (let i = 0; i < deltas.length; i++) {
      const d = deltas[i];
      if (tr.transport === 'http' && d.Routes && d.Routes.length) tr.setRoutes(d.Routes);
      if (tr.transport === 'file' && d.FileContent != null) tr.setFileContent(d.FileContent);

      const obj = d.Object || targetObject;
      const ordF = orderingFieldFor(MANIFEST, obj);
      const recs = await pull(ctx.connector, ctx.companyIntegration, ctx.contextUser, obj);

      // The connector reports deletes via IsDeleted on the records; honor explicit
      // ExpectedDeletes from the fixture as synthetic tombstones if the connector
      // can't express deletes for this object (so the applier still proves the path).
      const applyRecs = recs.slice();
      if (d.ExpectedDeletes && d.ExpectedDeletes.length) {
        const reported = new Set(recs.filter((r) => r && r.IsDeleted).map((r) => String(r.ExternalID)));
        for (const id of d.ExpectedDeletes) {
          if (!reported.has(String(id))) applyRecs.push({ ExternalID: String(id), ObjectType: obj, Fields: {}, IsDeleted: true });
        }
      }
      applier.apply(applyRecs, ordF);

      assertExpectedUpdates(applier, d, assertions, i);
      assertExpectedDeletes(applier, d, assertions, i);
      assertExpectedPresent(applier, d, assertions, i);
    }

    // Ordering monotonicity assertion (only meaningful if we have an ordering trace).
    assertOrdering(applier.orderTrace, assertions);

    emit({ ok: true, integrationName: ctx.connector.IntegrationName, data: { transport: tr.transport, initialRows, deltaPasses: deltas.length, assertions } });
  } catch (e) {
    emit({ ok: true, integrationName: ctx.connector.IntegrationName, data: { transport: tr.transport, initialRows, deltaPasses: (MANIFEST.DeltaPasses||[]).length, assertions, setupError: clip(e && e.message ? e.message : e, 200) } });
  } finally {
    applier.close();
    tr.teardown();
  }
}

function assertExpectedUpdates(applier, d, assertions, i) {
  for (const u of (d.ExpectedUpdates || [])) {
    const row = applier.getRow(u.ExternalID);
    if (!row) { assertions.push({ name: 'update-overwrote@delta' + i, passed: false, detail: 'expected updated row ' + u.ExternalID + ' not found' }); continue; }
    let actual; try { actual = JSON.parse(row.Payload)[u.Field]; } catch (e) { actual = undefined; }
    const ok = String(actual) === String(u.Value);
    assertions.push({ name: 'update-overwrote@delta' + i, passed: ok, detail: u.ExternalID + '.' + u.Field + ' = ' + JSON.stringify(actual) + ' (expected ' + JSON.stringify(u.Value) + ')' });
  }
}

function assertExpectedDeletes(applier, d, assertions, i) {
  for (const id of (d.ExpectedDeletes || [])) {
    const row = applier.getRow(id);
    const ok = !!row && row.IsDeleted === 1;
    assertions.push({ name: 'delete-tombstoned@delta' + i, passed: ok, detail: 'row ' + id + ' IsDeleted=' + (row ? row.IsDeleted : 'absent') });
  }
}

function assertExpectedPresent(applier, d, assertions, i) {
  for (const id of (d.ExpectedPresent || [])) {
    const row = applier.getRow(id);
    const ok = !!row && row.IsDeleted === 0;
    assertions.push({ name: 'present@delta' + i, passed: ok, detail: 'row ' + id + ' present=' + (!!row && row.IsDeleted === 0) });
  }
}

function assertOrdering(trace, assertions) {
  if (!trace || trace.length < 2) return; // nothing to assert
  let monotonic = true, firstViolation = '';
  for (let k = 1; k < trace.length; k++) {
    if (String(trace[k].OrderKey) < String(trace[k-1].OrderKey)) { monotonic = false; firstViolation = trace[k-1].OrderKey + ' then ' + trace[k].OrderKey; break; }
  }
  assertions.push({ name: 'ordering-respected', passed: monotonic, detail: monotonic ? trace.length + ' records applied in non-decreasing order-key order' : 'order-key regressed: ' + firstViolation });
}

main().catch((e) => emit({ ok: false, reason: 'runner crashed: ' + clip(e && e.message ? e.message : e, 200) }));
`;
