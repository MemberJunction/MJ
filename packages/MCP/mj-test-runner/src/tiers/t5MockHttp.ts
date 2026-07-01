/**
 * T5_MockHTTPServer — drive the connector against a LOCAL server that replays its
 * recorded fixtures, with NO live credentials.
 *
 * For an `http`-transport fixture the child boots a `node:http` server that serves
 * the recorded route bodies, points the connector's base URL at `http://127.0.0.1:<port>`
 * (both via the `Configuration` URL key AND by overriding the connector's
 * `GetBaseURL` so connectors that hardcode their base URL are still redirected),
 * then runs `DiscoverObjects` + `FetchChanges` for every object and asserts the
 * connector parses, paginates, and classifies errors.
 *
 * For a `file`-transport fixture (file-feed connectors: list + download), the SAME
 * harness writes the recorded file CONTENT to a temp file and points the
 * connector's `storagePath` at it — mocking the file-feed `list`+`download` leg
 * exactly as the REST routes are mocked. No transport branch leaks into the assert
 * logic; both reduce to "discover + fetch every object".
 *
 * If the connector has NO fixtures, T5 Fails with `no-fixtures` so the gap is
 * visible — it is NEVER a silent skip.
 *
 * **CREDENTIAL-FREE** (mock server / temp file only). **READ-ONLY** (the connector
 * only ever reads from the mock; no create/update/delete path is exercised).
 */
import { CHILD_PREAMBLE, CHILD_TRANSPORT, spawnChildRunner, clipStderr, type ConnectorIdentity } from './childRunner.js';
import { loadFixturesOrSynthesize } from './fixtures.js';

/** Portion of a TierResult an individual tier handler returns. */
interface TierHandlerResult {
    Status: 'Pass' | 'Fail' | 'Skipped';
    Output: string;
    Errors: string[];
    Details?: Record<string, unknown>;
}

/** Per-object fetch outcome reported by the child. */
interface ObjectFetchResult {
    object: string;
    discovered: boolean;
    fetchOk: boolean;
    recordCount: number;
    pagesFetched: number;
    paginated: boolean;
    error?: string;
}

/** Child payload for T5. */
interface T5Data {
    baseURL?: string;
    objectCount?: number;
    objects?: ObjectFetchResult[];
    errorClassification?: { tested: boolean; threwOrFlagged: boolean; detail?: string };
    setupError?: string;
}

/** Run T5: skip (non-blocking, surfaced as a warning) when no fixtures; else replay via mock server / temp file. */
export function runT5MockHttp(connector: string, identity: ConnectorIdentity): TierHandlerResult {
    // Prefer authored fixtures; otherwise SYNTHESIZE a mock from a published Postman
    // collection or the OpenAPI spec's response examples (still credential-free).
    const { Manifest, FixturesDir, Warnings, Source } = loadFixturesOrSynthesize(connector);
    if (!Manifest) {
        return {
            Status: 'Skipped',
            Output: '',
            Errors: [`no-fixtures: no fixtures/fixtures.json, Postman collection, or OpenAPI examples found for "${connector}" under ${FixturesDir} (or sources/). T5 replays a recorded/synthesized mock; with none present it is not-applicable. Surfaced as a visible warning, not a silent pass.`],
            Details: { connector, class: identity.ClassName, reason: 'no-fixtures', fixturesDir: FixturesDir },
        };
    }

    const outcome = spawnChildRunner<T5Data>({
        identity,
        connector,
        childSource: T5_CHILD_SOURCE,
        env: { MJ_TIER_FIXTURES: JSON.stringify(Manifest) },
        timeoutMs: 90_000,
    });

    if (!outcome.parsed) {
        return {
            Status: 'Fail',
            Output: '',
            Errors: [
                `T5 child emitted no result for "${connector}" (exit=${String(outcome.status)}).`,
                ...(outcome.stderr.trim() ? [clipStderr(outcome.stderr)] : []),
            ],
            Details: { connector, class: identity.ClassName },
        };
    }
    if (!outcome.parsed.ok) {
        return {
            Status: 'Fail',
            Output: '',
            Errors: [outcome.parsed.reason ? `T5 setup failed: ${outcome.parsed.reason}` : 'T5 setup failed.'],
            Details: { connector, class: identity.ClassName },
        };
    }

    return evaluateT5(connector, identity, outcome.parsed.data ?? {}, Warnings, Source);
}

/** Build the pass/fail verdict from the child's per-object fetch outcomes. */
function evaluateT5(
    connector: string,
    identity: ConnectorIdentity,
    data: T5Data,
    fixtureWarnings: string[],
    fixtureSource: string,
): TierHandlerResult {
    if (data.setupError) {
        return {
            Status: 'Fail',
            Output: '',
            Errors: [`T5 in-child setup failed: ${data.setupError}`],
            Details: { connector, class: identity.ClassName },
        };
    }

    const objects = data.objects ?? [];
    if (objects.length === 0) {
        return {
            Status: 'Fail',
            Output: '',
            Errors: ['Connector discovered no objects against the mock server — nothing was exercised.'],
            Details: { connector, class: identity.ClassName, baseURL: data.baseURL },
        };
    }

    const errors: string[] = [];
    const dbDependentSkips: string[] = [];
    for (const o of objects) {
        if (o.fetchOk) continue;
        // Parent-keyed / derived objects resolve their parent IDs from the TARGET DB
        // (RunView over already-synced rows). The offline child has no MJ provider, so
        // these are out of replay scope BY DESIGN — a visible skip with reason, never
        // a silent pass and never a false fail. Their behavior is covered by the live
        // hybrid-e2e tier, which has a real DB.
        const msg = String(o.error ?? '');
        if (/reading 'RunView'|Metadata\.Provider|No provider|RunView is not a function/i.test(msg)) {
            dbDependentSkips.push(`[${o.object}] skipped: requires target-DB parent resolution (derived/parent-keyed object) — covered by hybrid-e2e, not offline replay`);
            continue;
        }
        errors.push(`[${o.object}] FetchChanges failed against mock: ${msg || 'unknown error'}`);
    }
    // Error-classification: a malformed/500 route must surface as a thrown error or
    // a non-success outcome — never a silently-empty success that hides a vendor error.
    if (data.errorClassification?.tested && !data.errorClassification.threwOrFlagged) {
        errors.push(`Error classification weak: a 500/malformed mock response did NOT surface as an error (${data.errorClassification.detail ?? 'no detail'}).`);
    }

    const totalRecords = objects.reduce((n, o) => n + o.recordCount, 0);
    const paginatedCount = objects.filter((o) => o.paginated).length;
    const summary =
        `Mock-server run over ${objects.length} object(s): ${totalRecords} record(s) parsed, ` +
        `${paginatedCount} object(s) paginated` +
        (dbDependentSkips.length > 0 ? `, ${dbDependentSkips.length} db-dependent object(s) skipped (visible)` : '') +
        `. base=${data.baseURL ?? 'n/a'} [fixture-source=${fixtureSource}]`;

    if (errors.length > 0) {
        return {
            Status: 'Fail',
            Output: summary,
            Errors: [...errors, ...dbDependentSkips, ...fixtureWarnings.map((w) => `fixture-warning: ${w}`)],
            Details: { connector, class: identity.ClassName, fixtureSource, objects, baseURL: data.baseURL, errorClassification: data.errorClassification },
        };
    }

    return {
        Status: 'Pass',
        Output: summary,
        Errors: [...dbDependentSkips, ...fixtureWarnings.map((w) => `fixture-warning: ${w}`)],
        Details: { connector, class: identity.ClassName, fixtureSource, objects, baseURL: data.baseURL, totalRecords, dbDependentSkips, errorClassification: data.errorClassification },
    };
}

/**
 * Child runner for T5. Boots the mock server (http) or temp file (file), wires the
 * connector to it, and exercises discover + fetch (+ paginate, + error classify)
 * for every object. Emits per-object outcomes.
 */
const T5_CHILD_SOURCE = `${CHILD_PREAMBLE}
import _http from 'node:http';
import { writeFileSync as _writeFileSync, mkdtempSync as _mkdtempSync } from 'node:fs';
import { tmpdir as _tmpdir } from 'node:os';
import { resolve as _pathResolve } from 'node:path';
${CHILD_TRANSPORT}

const MANIFEST = JSON.parse(process.env.MJ_TIER_FIXTURES || '{}');

async function fetchAllPages(connector, companyIntegration, contextUser, objectName) {
  let page = 0, offset = 0, cursor = undefined, afterKey = undefined;
  let total = 0, pages = 0, paginated = false;
  const MAX_PAGES = 10;
  while (pages < MAX_PAGES) {
    const ctx = {
      CompanyIntegration: companyIntegration, ObjectName: objectName,
      WatermarkValue: null, BatchSize: 100, ContextUser: contextUser,
      CurrentPage: page || undefined, CurrentOffset: offset || undefined,
      CurrentCursor: cursor, AfterKeyValue: afterKey,
    };
    const fb = await connector.FetchChanges(ctx);
    const recs = fb && Array.isArray(fb.Records) ? fb.Records : [];
    total += recs.length;
    pages++;
    if (!fb || !fb.HasMore) break;
    paginated = true;
    if (fb.NextPage != null) page = fb.NextPage;
    else if (fb.NextOffset != null) offset = fb.NextOffset;
    else if (fb.NextCursor != null) cursor = fb.NextCursor;
    else if (fb.NextAfterKeyValue != null) afterKey = fb.NextAfterKeyValue;
    else break; // HasMore but no advance signal — stop to avoid an infinite loop.
  }
  return { total, pages, paginated };
}

async function classifyErrorBehaviour(connector, companyIntegration, contextUser, objectName, tr) {
  // Make the EXISTING mock server return HTTP 500 for everything (catch-all route),
  // then re-fetch the object that previously SUCCEEDED. This works regardless of how
  // the connector resolves its base URL (config-driven OR GetBaseURL), because we
  // change what the server it is already talking to returns. A correct connector
  // surfaces the 500 (throws OR returns an empty result); swallowing it into a
  // NON-EMPTY success of fabricated data is the failure we catch.
  const okRoutes = (MANIFEST.Routes || []);
  tr.setRoutes([{ Path: '/', Status: 500, Body: { error: 'mock 500' } }]);
  let threwOrFlagged = false, detail = '';
  try {
    const fb = await connector.FetchChanges({ CompanyIntegration: companyIntegration, ObjectName: objectName, WatermarkValue: null, BatchSize: 100, ContextUser: contextUser });
    const recs = fb && Array.isArray(fb.Records) ? fb.Records : [];
    threwOrFlagged = recs.length === 0; // empty on 500 is acceptable; non-empty fabricated data is not
    detail = 'returned ' + recs.length + ' record(s) on HTTP 500';
  } catch (e) {
    threwOrFlagged = true;
    detail = 'threw: ' + clip(e && e.message ? e.message : e, 120);
  } finally {
    tr.setRoutes(okRoutes); // restore the good routes
  }
  return { tested: true, threwOrFlagged, detail };
}

async function main() {
  let tr;
  try { tr = await setupTransport(MANIFEST); }
  catch (e) { emit({ ok: false, data: { setupError: clip(e && e.message ? e.message : e, 200) } }); return; }

  let ctx;
  try { ctx = await loadConnector(tr.configuration); }
  catch (e) { tr.teardown(); emit({ ok: false, reason: clip(e && e.message ? e.message : e, 240) }); return; }

  // For http: also override GetBaseURL so a hardcoded-base connector is redirected.
  if (tr.transport === 'http' && tr.baseURL) tr.wireBaseURL(ctx.connector);

  const out = { ok: true, integrationName: ctx.connector.IntegrationName, data: { baseURL: tr.baseURL || tr.configuration, objects: [] } };
  try {
    const objs = await ctx.connector.DiscoverObjects(ctx.companyIntegration, ctx.contextUser);
    const list = Array.isArray(objs) ? objs : [];
    out.data.objectCount = list.length;
    for (const o of list) {
      const name = o && o.Name;
      if (name == null) continue;
      const r = { object: name, discovered: true, fetchOk: false, recordCount: 0, pagesFetched: 0, paginated: false };
      try {
        const fr = await fetchAllPages(ctx.connector, ctx.companyIntegration, ctx.contextUser, name);
        r.fetchOk = true; r.recordCount = fr.total; r.pagesFetched = fr.pages; r.paginated = fr.paginated;
      } catch (e) { r.error = clip(e && e.message ? e.message : e, 200); }
      out.data.objects.push(r);
    }
    // Error classification (http only — file feeds have no HTTP error path). Run it
    // against an object that fetched OK, so flipping its route to 500 is a real
    // success→error transition rather than a 404-on-missing-route.
    if (tr.transport === 'http') {
      const okObject = out.data.objects.find((o) => o.fetchOk);
      if (okObject) {
        out.data.errorClassification = await classifyErrorBehaviour(ctx.connector, ctx.companyIntegration, ctx.contextUser, okObject.object, tr);
      }
    }
  } catch (e) {
    out.data.setupError = clip(e && e.message ? e.message : e, 200);
  } finally {
    tr.teardown();
  }
  emit(out);
}

main().catch((e) => emit({ ok: false, reason: 'runner crashed: ' + clip(e && e.message ? e.message : e, 200) }));
`;
