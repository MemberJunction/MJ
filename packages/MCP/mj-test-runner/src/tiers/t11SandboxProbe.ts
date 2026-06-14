/**
 * T11_SandboxProbe — CREDENTIAL-FREE, opportunistic read against a PUBLIC sandbox/demo.
 * Some vendors expose an unauthenticated demo API or a public sandbox base URL. When the
 * connector's metadata declares one (`Configuration.SandboxBaseURL`, optionally
 * `Configuration.SandboxToken` for a vendor-PUBLISHED test token like Stripe `pk_test_…`),
 * this tier instantiates the connector against it and runs ONLY non-mutating ops
 * (DiscoverObjects + one FetchChanges page) — a genuine live read with zero private creds.
 *
 * The overwhelmingly common case is "no public sandbox declared" → `Skipped:
 * no-public-sandbox` (an honest not-applicable, not a stub). It NEVER writes, and any
 * `SandboxToken` it uses must be a vendor-published PUBLIC test token recorded in metadata
 * — never a private credential (those only ever reach the broker-mediated T8).
 *
 * @see .claude/rules/connector-credential-testing.md § PATH 2 (public sandbox/demo #16)
 */
import { resolve } from 'node:path';
import { existsSync, readFileSync } from 'node:fs';
import { spawnChildRunner, CHILD_PREAMBLE, clipStderr, REGISTRY_ROOT, type ConnectorIdentity } from './childRunner.js';

interface TierHandlerResult {
    Status: 'Pass' | 'Fail' | 'Skipped';
    Output: string;
    Errors: string[];
    Details?: Record<string, unknown>;
}

interface T11Data {
    objectsDiscovered?: number;
    fetchedObject?: string | null;
    recordCount?: number;
    notes?: string[];
    errors?: string[];
}

function loadConfiguration(connector: string): Record<string, unknown> | null {
    const candidates = [
        resolve(REGISTRY_ROOT, connector, `.${connector}.integration.json`),
        resolve(REGISTRY_ROOT, connector, `${connector}.integration.json`),
    ];
    for (const p of candidates) {
        if (!existsSync(p)) continue;
        try {
            const parsed = JSON.parse(readFileSync(p, 'utf-8')) as unknown;
            const row = (Array.isArray(parsed) ? parsed[0] : parsed) as { fields?: Record<string, unknown> } | undefined;
            const cfg = row?.fields?.Configuration;
            if (cfg && typeof cfg === 'object') return cfg as Record<string, unknown>;
        } catch { /* fall through */ }
    }
    return null;
}

export function runT11SandboxProbe(connector: string, identity: ConnectorIdentity): TierHandlerResult {
    const cfg = loadConfiguration(connector);
    const sandboxURL = cfg && typeof cfg.SandboxBaseURL === 'string' ? (cfg.SandboxBaseURL as string) : null;
    if (!sandboxURL) {
        return { Status: 'Skipped', Output: 'no public sandbox/demo declared', Errors: [], Details: { connector, reason: 'no-public-sandbox' } };
    }
    const sandboxToken = cfg && typeof cfg.SandboxToken === 'string' ? (cfg.SandboxToken as string) : null;
    const urlKey = cfg && typeof cfg.ConfigUrlKey === 'string' ? (cfg.ConfigUrlKey as string) : 'BaseURL';

    const outcome = spawnChildRunner<T11Data>({
        identity,
        childSource: T11_CHILD_SOURCE,
        env: {
            MJ_T11_SANDBOX_URL: sandboxURL,
            MJ_T11_SANDBOX_TOKEN: sandboxToken ?? '',
            MJ_T11_URL_KEY: urlKey,
            MJ_T11_BASE_CONFIG: JSON.stringify(cfg ?? {}),
        },
        timeoutMs: 60_000,
    });

    if (!outcome.parsed) {
        return { Status: 'Fail', Output: '', Errors: [`sandbox-probe child produced no result. stderr: ${clipStderr(outcome.stderr)}`], Details: { connector } };
    }
    if (!outcome.parsed.ok) {
        // A sandbox that is unreachable / down is an honest skip, not a connector failure.
        const reason = outcome.parsed.reason ?? 'sandbox probe failed';
        if (/unreachable|ENOTFOUND|ECONNREFUSED|timeout|abort/i.test(reason)) {
            return { Status: 'Skipped', Output: `sandbox unreachable: ${reason}`, Errors: [], Details: { connector, reason: 'sandbox-unreachable', sandboxURL } };
        }
        return { Status: 'Fail', Output: '', Errors: [reason], Details: { connector, sandboxURL } };
    }

    const d = outcome.parsed.data ?? {};
    const ok = (d.objectsDiscovered ?? 0) > 0;
    return {
        Status: ok ? 'Pass' : 'Fail',
        Output: `sandbox ${sandboxURL}: discovered ${d.objectsDiscovered ?? 0} object(s); read '${d.fetchedObject ?? '(none)'}' → ${d.recordCount ?? 0} record(s)`,
        Errors: ok ? [] : (d.errors ?? ['no objects discovered against the public sandbox']),
        Details: { connector, sandboxURL, data: d },
    };
}

const T11_CHILD_SOURCE = `${CHILD_PREAMBLE}
async function main() {
  const url = process.env.MJ_T11_SANDBOX_URL;
  const token = process.env.MJ_T11_SANDBOX_TOKEN || '';
  const urlKey = process.env.MJ_T11_URL_KEY || 'BaseURL';
  const baseConfig = JSON.parse(process.env.MJ_T11_BASE_CONFIG || '{}');
  const cfgObj = { ...baseConfig, [urlKey]: url, BaseURL: url };
  if (token) { cfgObj.Token = token; cfgObj.token = token; cfgObj.ApiKey = token; cfgObj.apiKey = token; }

  let ctx;
  try { ctx = await loadConnector(JSON.stringify(cfgObj)); }
  catch (e) { emit({ ok: false, reason: 'loadConnector failed: ' + clip(e && e.message, 200) }); return; }
  try { if (typeof ctx.connector.GetBaseURL === 'function') ctx.connector.GetBaseURL = function(){ return url; }; } catch {}

  const out = { ok: true, data: { notes: [], errors: [] } };
  let objs = [];
  try { objs = await ctx.connector.DiscoverObjects(ctx.companyIntegration, ctx.contextUser); }
  catch (e) { emit({ ok: false, reason: clip(e && e.message, 200) }); return; }
  out.data.objectsDiscovered = Array.isArray(objs) ? objs.length : 0;

  // One READ-ONLY fetch page against the first object.
  let fetched = null, count = 0;
  if (Array.isArray(objs) && objs.length) {
    const name = objs[0]?.Name ?? objs[0]?.ObjectName ?? null;
    try {
      // FetchChanges takes a SINGLE FetchContext object. The old 4-arg positional call left
      // ctx.CompanyIntegration undefined and threw before any request, so the sandbox probe never
      // actually fetched from the public sandbox.
      const page = await ctx.connector.FetchChanges({
        CompanyIntegration: ctx.companyIntegration,
        ObjectName: name,
        WatermarkValue: null,
        BatchSize: 10,
        ContextUser: ctx.contextUser,
      });
      fetched = name;
      const recs = page && (page.Records || page.records || (Array.isArray(page) ? page : []));
      count = Array.isArray(recs) ? recs.length : 0;
    } catch (e) { out.data.errors.push('fetch ' + name + ': ' + clip(e && e.message, 120)); }
  }
  out.data.fetchedObject = fetched;
  out.data.recordCount = count;
  emit(out);
}
main().catch((e) => emit({ ok: false, reason: 'crashed: ' + clip(e && e.message, 200) }));
`;
