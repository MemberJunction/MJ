/**
 * T12_IdempotencyReplay — two-pass fixture replay proving RECORD-IDENTITY STABILITY
 * (ARCHITECTURE_REFACTOR.md P3 — the v2 idempotency rung).
 *
 * Why this tier exists: no single-pass tier can catch identity drift on
 * unchanged-but-noisy input. GrowthZone shipped green through T0–T8 while its §4
 * content-hash identity drifted on every re-fetch of the empty event-child wrapper
 * (a volatile per-fetch audit field entered the hashed raw), doubling 9 tables on
 * every sync (GZ PROBLEMS_LOG #22/#23: 127 → 254 → 381…). PropFuel hit the same
 * class via nested-object PKs. The trigger is always the same: the connector's
 * record IDENTITY is a function of bytes that vary between fetches.
 *
 * What it does (credential-free, read-only — same transport harness as T5):
 *   PASS 1 — replay the recorded fixtures; collect each object's ExternalID multiset.
 *   PASS 2 — replay again with a VOLATILE FIELD injected into every record object
 *            (http transport; file transport re-replays verbatim — catches
 *            time/nonce-based drift, not raw-volatility). Collect IDs again.
 *   ASSERT — per object: pass-2 ExternalID multiset === pass-1 multiset, and the
 *            record count did not grow. Any drift = the GZ #22 class = Fail.
 *
 * A connector whose identity comes from a real PK is untouched by the volatile
 * field (it ignores unknown keys). A connector that hashes the full raw for
 * keyless records MUST hash a STABLE projection — this tier is what enforces that.
 *
 * If the connector has NO fixtures, T12 returns Skipped with `no-fixtures`
 * (surfaced as a visible warning — never a silent pass).
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

/** Per-object two-pass outcome reported by the child. */
interface ObjectReplayResult {
    object: string;
    pass1Count: number;
    pass2Count: number;
    /** IDs present in exactly one of the two passes (symmetric difference, clipped). */
    driftedIDs: string[];
    /** Count of IDs in the symmetric difference (full, not clipped). */
    driftCount: number;
    stable: boolean;
    error?: string;
}

/** Child payload for T12. */
interface T12Data {
    transport?: string;
    volatileInjected?: boolean;
    objects?: ObjectReplayResult[];
    setupError?: string;
}

/** Run T12: two-pass identity-stability replay over the recorded fixtures. */
export function runT12IdempotencyReplay(connector: string, identity: ConnectorIdentity): TierHandlerResult {
    const { Manifest, FixturesDir, Warnings, Source } = loadFixturesOrSynthesize(connector);
    if (!Manifest) {
        return {
            Status: 'Skipped',
            Output: '',
            Errors: [`no-fixtures: no fixtures/fixtures.json, Postman collection, or OpenAPI examples found for "${connector}" under ${FixturesDir} (or sources/). T12 replays recorded fixtures twice; with none present it is not-applicable. Surfaced as a visible warning, not a silent pass.`],
            Details: { connector, class: identity.ClassName, reason: 'no-fixtures', fixturesDir: FixturesDir },
        };
    }

    const outcome = spawnChildRunner<T12Data>({
        identity,
        connector,
        childSource: T12_CHILD_SOURCE,
        env: { MJ_TIER_FIXTURES: JSON.stringify(Manifest) },
        timeoutMs: 120_000,
    });

    if (!outcome.parsed) {
        return {
            Status: 'Fail',
            Output: '',
            Errors: [
                `T12 child emitted no result for "${connector}" (exit=${String(outcome.status)}).`,
                ...(outcome.stderr.trim() ? [clipStderr(outcome.stderr)] : []),
            ],
            Details: { connector, class: identity.ClassName },
        };
    }
    if (!outcome.parsed.ok) {
        return {
            Status: 'Fail',
            Output: '',
            Errors: [outcome.parsed.reason ? `T12 setup failed: ${outcome.parsed.reason}` : 'T12 setup failed.'],
            Details: { connector, class: identity.ClassName },
        };
    }

    return evaluateT12(connector, identity, outcome.parsed.data ?? {}, Warnings, Source);
}

/** Build the pass/fail verdict from the child's per-object two-pass outcomes. */
function evaluateT12(
    connector: string,
    identity: ConnectorIdentity,
    data: T12Data,
    fixtureWarnings: string[],
    fixtureSource: string,
): TierHandlerResult {
    if (data.setupError) {
        return {
            Status: 'Fail',
            Output: '',
            Errors: [`T12 in-child setup failed: ${data.setupError}`],
            Details: { connector, class: identity.ClassName },
        };
    }

    const objects = data.objects ?? [];
    if (objects.length === 0) {
        return {
            Status: 'Fail',
            Output: '',
            Errors: ['Connector discovered no objects against the replay transport — nothing was exercised.'],
            Details: { connector, class: identity.ClassName },
        };
    }

    // Per-object replay ERRORS outrank the no-records skip — when every object errors, the counts
    // are all 0 and a skip would MASK the failure (found during the GZ seeding validation).
    const erroredObjects = objects.filter((o) => o.error);
    const totalRecords = objects.reduce((n, o) => n + o.pass1Count, 0);
    if (totalRecords === 0 && erroredObjects.length === 0) {
        return {
            Status: 'Skipped',
            Output: '',
            Errors: [`no-records-in-fixtures: ${objects.length} object(s) discovered but every fixture replay returned 0 records — identity stability was not exercised. Author record-bearing fixtures (vendor-published examples or probe captures).`],
            Details: { connector, class: identity.ClassName, reason: 'no-records-in-fixtures', objects },
        };
    }

    const errors: string[] = [];
    for (const o of objects) {
        if (o.error) {
            errors.push(`[${o.object}] replay error: ${o.error}`);
            continue;
        }
        if (!o.stable) {
            errors.push(
                `[${o.object}] IDENTITY DRIFT across passes (the GZ #22 class): pass1=${o.pass1Count} pass2=${o.pass2Count} ` +
                `drifted=${o.driftCount} (sample: ${o.driftedIDs.slice(0, 3).join(', ')}). ` +
                `The record identity is a function of volatile bytes — for keyless records, hash a STABLE projection ` +
                `(or strip the volatile keys via ExcludedSourceKeys) instead of the full raw.`
            );
        }
        if (o.pass2Count > o.pass1Count) {
            errors.push(`[${o.object}] pass-2 record count GREW (${o.pass1Count} → ${o.pass2Count}) — placeholder/dupe minting on re-fetch.`);
        }
    }

    const stableCount = objects.filter((o) => o.stable && !o.error).length;
    const summary =
        `Two-pass identity replay over ${objects.length} object(s) (${totalRecords} record(s), ` +
        `volatile-injected=${data.volatileInjected === true}, transport=${data.transport ?? 'n/a'}): ` +
        `${stableCount}/${objects.length} stable. [fixture-source=${fixtureSource}]`;

    if (errors.length > 0) {
        return {
            Status: 'Fail',
            Output: summary,
            Errors: [...errors, ...fixtureWarnings.map((w) => `fixture-warning: ${w}`)],
            Details: { connector, class: identity.ClassName, fixtureSource, objects, volatileInjected: data.volatileInjected },
        };
    }

    return {
        Status: 'Pass',
        Output: summary,
        Errors: fixtureWarnings.map((w) => `fixture-warning: ${w}`),
        Details: { connector, class: identity.ClassName, fixtureSource, objects, totalRecords, volatileInjected: data.volatileInjected },
    };
}

/**
 * Child runner for T12. Boots the same transport as T5, fetches every object's full
 * ID set twice — the second pass against volatile-field-injected routes (http) or a
 * verbatim re-replay (file) — and reports the per-object symmetric difference.
 */
const T12_CHILD_SOURCE = `${CHILD_PREAMBLE}
import _http from 'node:http';
import { writeFileSync as _writeFileSync, mkdtempSync as _mkdtempSync } from 'node:fs';
import { tmpdir as _tmpdir } from 'node:os';
import { resolve as _pathResolve } from 'node:path';
${CHILD_TRANSPORT}

const MANIFEST = JSON.parse(process.env.MJ_TIER_FIXTURES || '{}');

// Deep-walk a JSON value, adding a volatile key to EVERY plain object. Record objects get it
// regardless of envelope shape; a correct connector's identity must be unaffected by it.
function injectVolatile(value, tag) {
  if (Array.isArray(value)) return value.map((v) => injectVolatile(v, tag));
  if (value && typeof value === 'object') {
    const out = {};
    for (const k of Object.keys(value)) out[k] = injectVolatile(value[k], tag);
    out.__mj_t12_volatile = tag;
    return out;
  }
  return value;
}

async function fetchAllIDs(connector, companyIntegration, contextUser, objectName) {
  let page = 0, offset = 0, cursor = undefined, afterKey = undefined;
  const ids = [];
  let pages = 0;
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
    for (const r of recs) ids.push(String(r && r.ExternalID != null ? r.ExternalID : ''));
    pages++;
    if (!fb || !fb.HasMore) break;
    if (fb.NextPage != null) page = fb.NextPage;
    else if (fb.NextOffset != null) offset = fb.NextOffset;
    else if (fb.NextCursor != null) cursor = fb.NextCursor;
    else if (fb.NextAfterKeyValue != null) afterKey = fb.NextAfterKeyValue;
    else break;
  }
  return ids;
}

// Multiset symmetric difference of two string arrays.
function symmetricDiff(a, b) {
  const count = new Map();
  for (const x of a) count.set(x, (count.get(x) || 0) + 1);
  for (const y of b) count.set(y, (count.get(y) || 0) - 1);
  const out = [];
  for (const [k, v] of count) { for (let i = 0; i < Math.abs(v); i++) out.push(k); }
  return out;
}

async function main() {
  let tr;
  try { tr = await setupTransport(MANIFEST); }
  catch (e) { emit({ ok: false, data: { setupError: clip(e && e.message ? e.message : e, 200) } }); return; }

  let ctx;
  try { ctx = await loadConnector(tr.configuration); }
  catch (e) { tr.teardown(); emit({ ok: false, reason: clip(e && e.message ? e.message : e, 240) }); return; }

  if (tr.transport === 'http' && tr.baseURL) tr.wireBaseURL(ctx.connector);

  const out = { ok: true, integrationName: ctx.connector.IntegrationName, data: { transport: tr.transport, volatileInjected: false, objects: [] } };
  try {
    // DETERMINISTIC object set: the fixture's declared Objects drive the replay when present
    // (same convention as T6); DiscoverObjects is the fallback. A fixture-declared set makes the
    // rung's input pinned + reproducible rather than dependent on discovery's runtime behaviour.
    let names;
    if (Array.isArray(MANIFEST.Objects) && MANIFEST.Objects.length > 0) {
      names = MANIFEST.Objects.map((o) => o && o.Name).filter((n) => n != null);
    } else {
      const objs = await ctx.connector.DiscoverObjects(ctx.companyIntegration, ctx.contextUser);
      const list = Array.isArray(objs) ? objs : [];
      names = list.map((o) => o && o.Name).filter((n) => n != null);
    }

    // PASS 1 — original fixtures.
    const pass1 = new Map();
    for (const name of names) {
      try { pass1.set(name, await fetchAllIDs(ctx.connector, ctx.companyIntegration, ctx.contextUser, name)); }
      catch (e) { pass1.set(name, { error: clip(e && e.message ? e.message : e, 200) }); }
    }

    // VOLATILITY INJECTION — http: rewrite every route body with a per-pass volatile key.
    // file: verbatim re-replay (still catches time/nonce-derived identity drift).
    if (tr.transport === 'http') {
      const volRoutes = (MANIFEST.Routes || []).map((r) => ({ ...r, Body: injectVolatile(r.Body, 'pass2-' + Math.random().toString(36).slice(2, 10)) }));
      tr.setRoutes(volRoutes);
      out.data.volatileInjected = true;
    }

    // PASS 2 — volatile (or verbatim) replay.
    for (const name of names) {
      const p1 = pass1.get(name);
      const r = { object: name, pass1Count: 0, pass2Count: 0, driftedIDs: [], driftCount: 0, stable: false };
      if (p1 && p1.error) { r.error = p1.error; out.data.objects.push(r); continue; }
      r.pass1Count = p1.length;
      try {
        const p2 = await fetchAllIDs(ctx.connector, ctx.companyIntegration, ctx.contextUser, name);
        r.pass2Count = p2.length;
        const drift = symmetricDiff(p1, p2);
        r.driftCount = drift.length;
        r.driftedIDs = drift.slice(0, 10);
        r.stable = drift.length === 0;
      } catch (e) { r.error = clip(e && e.message ? e.message : e, 200); }
      out.data.objects.push(r);
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
