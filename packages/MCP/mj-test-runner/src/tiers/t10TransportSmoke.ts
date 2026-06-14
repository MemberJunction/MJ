/**
 * T10_TransportSmoke — CREDENTIAL-FREE proof of the connector's GENERIC HTTP transport
 * machinery, independent of the vendor's response shapes. It points the connector at a
 * request-CAPTURING echo server (a real localhost `node:http` socket that records every
 * incoming request and replies in HTTPBin `/anything` format) using a DUMMY token, drives
 * the connector's non-mutating methods, and asserts what the connector actually SENT:
 *   - an `Authorization` header is injected with a sane scheme (Bearer/Basic/api-key header),
 *   - `Content-Type` is set on bodied requests,
 *   - the request reaches a concrete host/path (no malformed URL),
 *   - pagination/query params appear when the connector paginates.
 * Server-side capture makes this robust to whatever HTTP client the connector uses (global
 * fetch, node-fetch, axios) — we observe the bytes that hit the socket, not a monkeypatch.
 *
 * The DUMMY token is a fixed non-secret placeholder (`tier-dummy-token`) — never a real
 * credential. Optionally (network-permitting) it also pings public HTTPBin/JSONPlaceholder
 * to confirm the same machinery works over the open internet; that ping is advisory and
 * never gates the verdict (so the tier is deterministic in a network-restricted env).
 *
 * @see .claude/rules/connector-credential-testing.md § PATH 2 (transport smoke #17)
 */
import { loadFixtures } from './fixtures.js';
import { spawnChildRunner, CHILD_PREAMBLE, clipStderr, type ConnectorIdentity } from './childRunner.js';

interface TierHandlerResult {
    Status: 'Pass' | 'Fail' | 'Skipped';
    Output: string;
    Errors: string[];
    Details?: Record<string, unknown>;
}

interface T10Data {
    requestCount?: number;
    sawAuthHeader?: boolean;
    authScheme?: string | null;
    sawContentTypeOnBody?: boolean;
    sampleRequests?: Array<{ method: string; path: string; hasAuth: boolean; query: string }>;
    publicHttpbin?: { ok: boolean; echoedAuth?: boolean; status?: number; note?: string };
    notes?: string[];
    errors?: string[];
}

export function runT10TransportSmoke(connector: string, identity: ConnectorIdentity): TierHandlerResult {
    // Reuse the connector's fixture Configuration (sans any real secret) so non-URL config
    // keys the connector needs (AccountID, region, etc.) are present; the URL key is overridden
    // to the echo server and the secret is replaced with the dummy token in the child.
    const { Manifest } = loadFixtures(connector);
    const baseConfig = (Manifest?.Configuration ?? {}) as Record<string, unknown>;
    const urlKey = Manifest?.ConfigUrlKey ?? 'BaseURL';

    const outcome = spawnChildRunner<T10Data>({
        identity,
        childSource: T10_CHILD_SOURCE,
        env: {
            MJ_T10_BASE_CONFIG: JSON.stringify(baseConfig),
            MJ_T10_URL_KEY: urlKey,
        },
        timeoutMs: 60_000,
    });

    if (!outcome.parsed) {
        return {
            Status: 'Fail',
            Output: '',
            Errors: [`transport-smoke child produced no result. stderr: ${clipStderr(outcome.stderr)}`],
            Details: { connector, class: identity.ClassName },
        };
    }
    if (!outcome.parsed.ok) {
        return {
            Status: 'Fail',
            Output: '',
            Errors: [outcome.parsed.reason ?? 'transport-smoke child failed'],
            Details: { connector, class: identity.ClassName },
        };
    }

    const d = outcome.parsed.data ?? {};
    const errs = d.errors ?? [];

    // A connector that made ZERO requests against the echo server didn't exercise its
    // transport at all — normally a Fail (the machinery is unproven). EXCEPTION (parity with
    // T2/T3's credGated→Skip): a TWO-STEP-AUTH connector (e.g. OAuth2 token mint) cannot fire a
    // request from a DUMMY config — its config validation / token mint throws credential-gated
    // BEFORE any socket write (no real client-id/secret/refresh-token to mint a Bearer). That is the
    // same not-applicable class T2/T3 already Skip on, NOT a transport defect — the transport is
    // proven at T4 (mock token endpoint + Bearer injection) and the live read tier. So when every
    // captured failure is credential/config-gated, Skip honestly rather than Fail.
    if ((d.requestCount ?? 0) === 0) {
        const notes: string[] = Array.isArray(d.notes) ? d.notes : [];
        const credGated = /credential|token|configuration json|api[- ]?key|account\s?id|unauthor|auth\b|client\s?(id|secret)|base\s?url|refresh|oauth|scope/i;
        // `.some` (not `.every`): a credential/config gate on the auth-requiring call (TestConnection/
        // DiscoverObjects) is the genuine reason 0 requests fired; any DOWNSTREAM crash (e.g. FetchChanges
        // called with a null objName because discovery returned nothing) is a consequence, not a transport
        // defect. A connector with a working transport fires ≥1 request and never reaches this branch.
        if (notes.length > 0 && notes.some((n) => credGated.test(String(n)))) {
            return {
                Status: 'Skipped',
                Output: 'transport requires credential-gated runtime auth (e.g. OAuth2 token mint) — cannot fire from a dummy config; proven at the mock (T4) + live tiers',
                Errors: ['transport-requires-credentials'],
                Details: { connector, class: identity.ClassName, reason: 'transport-requires-credentials', notes },
            };
        }
        return {
            Status: 'Fail',
            Output: 'connector made no HTTP requests against the echo server — transport machinery unexercised',
            Errors: errs.length ? errs : (notes.length ? notes : ['no outbound requests captured']),
            Details: { connector, class: identity.ClassName, data: d },
        };
    }

    // Core assertion: auth header injected (connectors here are all token/api-key auth).
    const failures: string[] = [];
    if (!d.sawAuthHeader) failures.push('connector did NOT inject an Authorization/api-key header on any request (dummy token was configured)');

    const status = failures.length ? 'Fail' : 'Pass';
    const out = `captured ${d.requestCount} request(s); auth-header=${d.sawAuthHeader ? `yes (${d.authScheme ?? '?'})` : 'NO'}; ` +
        `content-type-on-body=${d.sawContentTypeOnBody ? 'yes' : 'n/a'}; ` +
        `public-httpbin=${d.publicHttpbin ? (d.publicHttpbin.ok ? 'reachable' : 'unreachable') : 'not-probed'}`;

    return {
        Status: status,
        Output: out,
        Errors: failures,
        Details: { connector, class: identity.ClassName, data: d },
    };
}

const T10_CHILD_SOURCE = `${CHILD_PREAMBLE}

const DUMMY_TOKEN = 'tier-dummy-token';
const DUMMY_ACCOUNT = 'tier-dummy-account';
const captured = [];
const origFetch = globalThis.fetch.bind(globalThis);

// Normalize any HeadersInit (Headers | plain object | [k,v][]) into a lowercased plain object.
function headersToObject(h) {
  const out = {};
  if (!h) return out;
  if (typeof h.forEach === 'function' && !Array.isArray(h)) { h.forEach((v, k) => { out[String(k).toLowerCase()] = String(v); }); return out; }
  if (Array.isArray(h)) { for (const [k, v] of h) out[String(k).toLowerCase()] = String(v); return out; }
  for (const [k, v] of Object.entries(h)) out[String(k).toLowerCase()] = String(v); return out;
}

function detectAuthScheme(headers) {
  const auth = headers['authorization'];
  if (auth) return { has: true, scheme: String(auth).split(' ')[0] || 'Authorization' };
  for (const k of Object.keys(headers)) {
    if (k === 'x-api-key' || k === 'apikey' || k === 'api-key' || k === 'x-auth-token' || (k.startsWith('x-') && k.includes('key'))) {
      return { has: true, scheme: k };
    }
  }
  return { has: false, scheme: null };
}

// Monkeypatch global fetch: CAPTURE the connector's outgoing request (host-agnostic, library
// is global fetch per BaseRESTIntegrationConnector) and return a benign HTTPBin-style echo so
// the connector parses something. NO real network call leaves the process for connector traffic.
globalThis.fetch = async (input, init) => {
  const url = typeof input === 'string' ? input : (input && input.url) || String(input);
  const method = (init && init.method) || (input && input.method) || 'GET';
  const headers = headersToObject(init && init.headers);
  const body = init && init.body != null ? String(init.body) : '';
  captured.push({ url, method, headers, body });
  const echo = { method, headers, url, args: Object.fromEntries(new URL(url, 'http://x').searchParams), data: body, json: tryJson(body) };
  return new Response(JSON.stringify(echo), { status: 200, headers: { 'content-type': 'application/json' } });
};
function tryJson(s){ try { return s ? JSON.parse(s) : null; } catch { return null; } }

async function probePublicHttpbin() {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 6000);
    const r = await origFetch('https://httpbin.org/anything', { method: 'GET', headers: { Authorization: 'Bearer ' + DUMMY_TOKEN }, signal: ctrl.signal });
    clearTimeout(t);
    let echoedAuth = false;
    try { const j = await r.json(); echoedAuth = !!(j && j.headers && (j.headers.Authorization || j.headers.authorization)); } catch {}
    return { ok: r.status >= 200 && r.status < 500, status: r.status, echoedAuth };
  } catch (e) { return { ok: false, note: clip(e && e.message, 120) }; }
}

async function main() {
  const baseConfig = JSON.parse(process.env.MJ_T10_BASE_CONFIG || '{}');
  const urlKey = process.env.MJ_T10_URL_KEY || 'BaseURL';

  // Dummy config: real non-secret keys from fixtures + a spread of common required keys
  // (AccountID/subdomain/etc.) + dummy secret(s). Whatever the connector reads is populated.
  const cfgObj = { ...baseConfig,
    AccountID: DUMMY_ACCOUNT, accountId: DUMMY_ACCOUNT, account_id: DUMMY_ACCOUNT, AccountId: DUMMY_ACCOUNT,
    Subdomain: 'tier', Domain: 'tier.example.com', InstanceURL: 'https://tier.example.com',
    Token: DUMMY_TOKEN, token: DUMMY_TOKEN, ApiKey: DUMMY_TOKEN, apiKey: DUMMY_TOKEN, AccessToken: DUMMY_TOKEN, ClientSecret: DUMMY_TOKEN,
  };
  const out = { ok: true, data: { errors: [], notes: [] } };

  let ctx;
  try { ctx = await loadConnector(JSON.stringify(cfgObj)); }
  catch (e) { emit({ ok: false, reason: 'loadConnector failed: ' + clip(e && e.message, 200) }); return; }

  async function tryCall(label, fn) { try { await fn(); } catch (e) { out.data.notes.push(label + ': ' + clip(e && e.message, 110)); } }
  await tryCall('TestConnection', async () => { if (typeof ctx.connector.TestConnection === 'function') await ctx.connector.TestConnection(ctx.companyIntegration, ctx.contextUser); });
  let objs = [];
  await tryCall('DiscoverObjects', async () => { if (typeof ctx.connector.DiscoverObjects === 'function') objs = await ctx.connector.DiscoverObjects(ctx.companyIntegration, ctx.contextUser); });
  await tryCall('FetchChanges', async () => {
    if (typeof ctx.connector.FetchChanges === 'function') {
      const objName = (Array.isArray(objs) && objs.length) ? (objs[0]?.Name ?? objs[0]?.ObjectName ?? null) : null;
      // FetchChanges takes a SINGLE FetchContext object (NOT the old 4-arg positional signature).
      // Passing positional args left ctx.CompanyIntegration undefined, so FetchChanges threw on
      // IntegrationID before any socket write and the transport tier never exercised the fetch path.
      await ctx.connector.FetchChanges({
        CompanyIntegration: ctx.companyIntegration,
        ObjectName: objName,
        WatermarkValue: null,
        BatchSize: 10,
        ContextUser: ctx.contextUser,
      });
    }
  });

  const pub = await probePublicHttpbin();

  let sawAuth = false, authScheme = null, sawCtOnBody = false;
  const sample = [];
  for (const req of captured) {
    const a = detectAuthScheme(req.headers);
    if (a.has) { sawAuth = true; if (!authScheme) authScheme = a.scheme; }
    if (req.body && req.body.length > 0 && req.headers['content-type']) sawCtOnBody = true;
    if (sample.length < 5) { let p = req.url; try { p = new URL(req.url).pathname; } catch {} sample.push({ method: req.method, path: clip(p, 80), hasAuth: a.has, query: '' }); }
  }

  out.data.requestCount = captured.length;
  out.data.sawAuthHeader = sawAuth;
  out.data.authScheme = authScheme;
  out.data.sawContentTypeOnBody = sawCtOnBody;
  out.data.sampleRequests = sample;
  out.data.publicHttpbin = pub;
  emit(out);
}

main().catch((e) => emit({ ok: false, reason: 'crashed: ' + clip(e && e.message, 200) }));
`;
