#!/usr/bin/env node
/**
 * reality-probe.mjs — the v2 RealityProbe (S7) as a DETERMINISTIC FINDER (ARCHITECTURE_REFACTOR.md
 * P2 + P9). Pinned claim-list in (the connector's Declared metadata file), verdict-list out
 * (recorded artifact), scrubbed captures recorded. NEVER authors metadata; NEVER issues a write.
 *
 * Modes:
 *   unauthenticated (default)  — per-claim status-code probing of every declared door.
 *                                401/403 = path real + auth-gated; 404 = path wrong; 200 = public.
 *   credentialed (--token-env) — READ-ONLY verdicts with a bearer token taken from the named env
 *                                var (designed to run UNDER THE BROKER — the token never appears in
 *                                argv or output; Authorization headers are never recorded):
 *                                  • per-object path → status + records-present + record count
 *                                  • pagination → declared param advances? $-prefixed alternate? cap?
 *                                  • per-declared-PK → populated | null | absent over the probe page
 *                                  • watermark param → accepted (200) or rejected
 *                                  • write surface → OPTIONS/405/401 existence evidence ONLY
 *                                  • rate headers → X-RateLimit-* / Retry-After observed
 *
 * Usage:
 *   node reality-probe.mjs --metadata <path> --base-url <url> [--token-env NAME]
 *        [--out <dir>] [--max-claims N] [--objects a,b,c] [--qps 2]
 *
 * Exit code: 0 = ran (verdicts in the artifact decide pass/fail downstream); 2 = setup error.
 * The floor-check `reality-probe-*` rules consume the emitted verdicts.json.
 *
 * GZ arithmetic (why this script exists): ~40 GETs ≈ 1 minute would have caught GZ PROBLEMS_LOG
 * #1/#2/#3 (skip-vs-$skip + page cap), all of §B (17 wrong paths), #5 (null PKs) and flagged #30
 * (write endpoints existing while metadata said pull-only) — before any connector code existed.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';

// ── args ─────────────────────────────────────────────────────────────
const args = {};
for (let i = 2; i < process.argv.length; i++) {
    const a = process.argv[i];
    if (a.startsWith('--')) { args[a.slice(2)] = process.argv[i + 1] && !process.argv[i + 1].startsWith('--') ? process.argv[++i] : true; }
}
const METADATA = args.metadata;
const BASE_URL = (args['base-url'] || '').replace(/\/$/, '');
const TOKEN = args['token-env'] ? (process.env[args['token-env']] || null) : null;
const OUT_DIR = args.out || '.';
const MAX_CLAIMS = Number(args['max-claims'] || 500);
const ONLY = args.objects ? String(args.objects).split(',').map((s) => s.trim()) : null;
const QPS = Math.max(0.2, Number(args.qps || 2));

if (!METADATA || !BASE_URL) {
    process.stderr.write('usage: reality-probe.mjs --metadata <file> --base-url <url> [--token-env NAME] [--out dir] [--objects a,b] [--qps 2]\n');
    process.exit(2);
}

// ── pinned input ─────────────────────────────────────────────────────
const rawBytes = readFileSync(METADATA);
const inputHash = createHash('sha256').update(rawBytes).digest('hex');
const root = (() => { const j = JSON.parse(rawBytes.toString('utf-8')); return Array.isArray(j) ? j[0] : j; })();
const ios = ((root.relatedEntities || {})['MJ: Integration Objects'] || [])
    .map((r) => ({ fields: r.fields || {}, iofs: ((r.relatedEntities || {})['MJ: Integration Object Fields'] || []).map((f) => f.fields || {}) }))
    .filter((o) => !ONLY || ONLY.includes(o.fields.Name));

// ── helpers ──────────────────────────────────────────────────────────
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const GAP_MS = Math.round(1000 / QPS);
const SCRUB_HEADERS = new Set(['authorization', 'cookie', 'set-cookie', 'x-api-key']);

function authHeaders() {
    const h = { accept: 'application/json' };
    if (TOKEN) h.authorization = `Bearer ${TOKEN}`;
    return h;
}
/** Records of a response: status + safe headers + (cred-mode) scrubbed body capture. NEVER auth headers. */
function safeHeaders(res) {
    const out = {};
    for (const [k, v] of res.headers.entries()) {
        const lk = k.toLowerCase();
        if (SCRUB_HEADERS.has(lk)) continue;
        if (/^x-ratelimit|^retry-after$|^www-authenticate$|^allow$|^content-type$/i.test(lk)) out[lk] = v;
    }
    return out;
}
async function get(url, withAuth) {
    await sleep(GAP_MS);
    try {
        const res = await fetch(url, { method: 'GET', headers: withAuth ? authHeaders() : { accept: 'application/json' }, redirect: 'manual', signal: AbortSignal.timeout(15000) });
        let body = null;
        try { body = await res.json(); } catch { /* non-JSON */ }
        return { status: res.status, headers: safeHeaders(res), body };
    } catch (e) {
        return { status: 0, headers: {}, body: null, error: String(e && e.message ? e.message : e).slice(0, 120) };
    }
}
async function options(url) {
    await sleep(GAP_MS);
    try {
        const res = await fetch(url, { method: 'OPTIONS', headers: TOKEN ? authHeaders() : { accept: 'application/json' }, signal: AbortSignal.timeout(15000) });
        return { status: res.status, headers: safeHeaders(res) };
    } catch (e) {
        return { status: 0, headers: {}, error: String(e && e.message ? e.message : e).slice(0, 120) };
    }
}
/**
 * Envelope keys + pagination-alternate forms are CONVENTION DATA, not logic (P10): explicit,
 * overridable per vendor (--envelope-keys a,b,c / --alt-param-forms), never silently extended.
 * An unmatched shape is a NAMED verdict (non-list / no-advance), never a guess.
 */
const ENVELOPE_KEYS = args['envelope-keys']
    ? String(args['envelope-keys']).split(',').map((s) => s.trim())
    : ['Results', 'results', 'data', 'items', 'value', 'records'];
/** Diagnostic ALTERNATE param forms tried only AFTER the DECLARED form fails to advance — the
 *  verdict is about the DECLARED claim; alternates are evidence hints for the amend round. */
const ALT_PARAM_FORMS = args['alt-param-forms']
    ? String(args['alt-param-forms']).split(',').map((s) => s.trim())
    : ['$<param>', 'offset', 'page'];

/** Extract the record array from a response body, envelope-agnostically (convention list above). */
function recordsOf(body) {
    if (Array.isArray(body)) return body;
    if (body && typeof body === 'object') {
        for (const k of ENVELOPE_KEYS) {
            if (Array.isArray(body[k])) return body[k];
        }
    }
    return null; // non-list shape from a list endpoint = ZERO records, named in the verdict (never a guess)
}
/** Stable ID list of a record page for pagination-advance comparison. */
function pageIDs(recs) {
    return (recs || []).map((r) => { try { return JSON.stringify(r).slice(0, 200); } catch { return ''; } });
}
function stripTemplateVars(path) { return /\{[^}]+\}/.test(path); }

// ── the probe ────────────────────────────────────────────────────────
const verdicts = [];
const captures = [];
let claimCount = 0;
function emitVerdict(v) { verdicts.push(v); claimCount++; }

const integCfg = (() => { try { return JSON.parse(root.fields?.Configuration || '{}'); } catch { return {}; } })();

for (const io of ios) {
    if (claimCount >= MAX_CLAIMS) break;
    const f = io.fields;
    const name = f.Name;
    const path = f.APIPath || '';
    const cfg = (() => { try { return typeof f.Configuration === 'string' ? JSON.parse(f.Configuration) : (f.Configuration || {}); } catch { return {}; } })();

    // 1. PATH claim. Template-var (parent-iterated) paths can't be probed without a parent ID —
    //    recorded as 'unverified' BY NAME (never silently skipped; P9 probe-coverage rule).
    if (stripTemplateVars(path)) {
        emitVerdict({ object: name, kind: 'path', claim: path, verdict: 'unverified', evidence: 'template-var path needs a live parent ID; probe after a parent page is captured' });
        continue;
    }
    const url = `${BASE_URL}${path.startsWith('/') ? path : `/${path}`}`;
    const r = await get(url, !!TOKEN);
    const recs = recordsOf(r.body);
    let pathVerdict;
    if (r.status === 0) pathVerdict = { verdict: 'unverified', evidence: `network: ${r.error}` };
    else if (TOKEN ? r.status >= 200 && r.status < 300 : [200, 401, 403].includes(r.status)) pathVerdict = { verdict: 'confirmed', evidence: `HTTP ${r.status}${recs ? `, ${recs.length} record(s)` : ''}` };
    else if ([404, 405, 400].includes(r.status)) pathVerdict = { verdict: 'wrong', evidence: `HTTP ${r.status} on declared path` };
    else pathVerdict = { verdict: 'unverified', evidence: `HTTP ${r.status}` };
    emitVerdict({ object: name, kind: 'path', claim: path, ...pathVerdict, rateHeaders: r.headers });
    if (TOKEN && recs && recs.length > 0) {
        captures.push({ object: name, path, page: recs.slice(0, 5) }); // scrubbed downstream by scrub-fixture before any commit
    }

    if (!TOKEN || r.status < 200 || r.status >= 300) continue; // deeper claims need a readable page

    // 2. PAGINATION claim: does the DECLARED param advance? Does the $-prefixed alternate?
    const pag = cfg.pagination || {};
    const skipParam = pag.skipParam || 'skip';
    if (f.SupportsPagination && recs && recs.length > 0) {
        const sep = url.includes('?') ? '&' : '?';
        const p0 = pageIDs(recs);
        const off = Math.max(1, Math.min(3, recs.length));
        const declared = await get(`${url}${sep}${encodeURIComponent(skipParam)}=${off}`, true);
        const dRecs = recordsOf(declared.body);
        const declaredAdvances = dRecs != null && JSON.stringify(pageIDs(dRecs)) !== JSON.stringify(p0);
        // Alternates are DIAGNOSTIC ONLY (P10) — tried after a declared-form failure to give the
        // amend round a docs-checkable lead; the verdict is about the DECLARED claim.
        const altHints = [];
        if (!declaredAdvances) {
            for (const form of ALT_PARAM_FORMS) {
                const alt = form.includes('<param>') ? form.replace('<param>', skipParam) : form;
                if (alt === skipParam) continue;
                const r2 = await get(`${url}${sep}${encodeURIComponent(alt)}=${off}`, true);
                const a2 = recordsOf(r2.body);
                if (a2 != null && JSON.stringify(pageIDs(a2)) !== JSON.stringify(p0)) { altHints.push(alt); break; }
            }
        }
        emitVerdict({
            object: name, kind: 'pagination', claim: `param '${skipParam}' advances`,
            verdict: declaredAdvances ? 'confirmed' : 'wrong',
            evidence: declaredAdvances
                ? `'${skipParam}' advanced past page 1`
                : `'${skipParam}' did NOT advance (silently-ignored-param class)${altHints.length ? `; alternate '${altHints[0]}' DID advance — verify against the docs in the amend round` : '; no probed alternate advanced'}`,
        });
    }

    // 3. PK claims: each declared-PK field populated | null | absent over the probe page.
    if (recs && recs.length > 0) {
        for (const iof of io.iofs.filter((x) => x.IsPrimaryKey === true)) {
            const k = iof.Name;
            const present = recs.filter((rec) => rec && rec[k] != null && String(rec[k]).length > 0).length;
            const absent = recs.filter((rec) => !(rec && k in rec)).length;
            emitVerdict({
                object: name, kind: 'pk', claim: `${k} is the populated PK`,
                verdict: present === recs.length ? 'confirmed' : present === 0 ? 'wrong' : 'unverified',
                evidence: `${present}/${recs.length} populated, ${absent}/${recs.length} absent on the probe page${present === 0 ? ' — the GZ #5 class (null-PK declaration)' : ''}`,
            });
        }
    }

    // 4. WATERMARK claim: incremental param accepted?
    if (f.SupportsIncrementalSync && f.IncrementalWatermarkField) {
        const sep = url.includes('?') ? '&' : '?';
        const w = await get(`${url}${sep}${encodeURIComponent(f.IncrementalWatermarkField)}=2026-01-01T00:00:00Z`, true);
        emitVerdict({
            object: name, kind: 'watermark', claim: `param '${f.IncrementalWatermarkField}' accepted`,
            verdict: w.status >= 200 && w.status < 300 ? 'confirmed' : 'wrong',
            evidence: `HTTP ${w.status}`,
        });
    }

    // 5. WRITE-SURFACE claims: existence evidence ONLY (OPTIONS/405/401) — NEVER a write call.
    for (const [col, method] of [['CreateAPIPath', f.CreateMethod || 'POST'], ['UpdateAPIPath', f.UpdateMethod || 'POST'], ['DeleteAPIPath', f.DeleteMethod || 'DELETE']]) {
        const wp = f[col];
        if (!wp || stripTemplateVars(wp)) continue;
        const o = await options(`${BASE_URL}${wp.startsWith('/') ? wp : `/${wp}`}`);
        const allow = (o.headers.allow || '').toUpperCase();
        emitVerdict({
            object: name, kind: 'writeSurface', claim: `${col} supports ${method}`,
            verdict: o.status === 404 ? 'wrong' : allow ? (allow.includes(String(method).toUpperCase()) ? 'confirmed' : 'wrong') : [200, 204, 401, 403, 405].includes(o.status) ? 'confirmed' : 'unverified',
            evidence: `OPTIONS → HTTP ${o.status}${allow ? `, Allow: ${allow}` : ''}`,
        });
    }
}

// ── recorded artifact ────────────────────────────────────────────────
const summary = {
    mode: TOKEN ? 'credentialed-readonly' : 'unauthenticated',
    metadataFile: resolve(METADATA),
    metadataSha256: inputHash,
    baseURL: BASE_URL,
    objectsProbed: ios.length,
    claims: verdicts.length,
    confirmed: verdicts.filter((v) => v.verdict === 'confirmed').length,
    wrong: verdicts.filter((v) => v.verdict === 'wrong').length,
    unverified: verdicts.filter((v) => v.verdict === 'unverified').length,
    unverifiedByName: verdicts.filter((v) => v.verdict === 'unverified').map((v) => `${v.object}:${v.kind}`),
    metadataDelta: false, // the probe NEVER authors metadata — structural constant
    verdicts,
};
mkdirSync(OUT_DIR, { recursive: true });
writeFileSync(resolve(OUT_DIR, 'verdicts.json'), JSON.stringify(summary, null, 2) + '\n');
if (captures.length > 0) writeFileSync(resolve(OUT_DIR, 'probe-captures.unscrubbed.json'), JSON.stringify(captures, null, 2) + '\n');
process.stdout.write(JSON.stringify({ mode: summary.mode, claims: summary.claims, confirmed: summary.confirmed, wrong: summary.wrong, unverified: summary.unverified, out: resolve(OUT_DIR, 'verdicts.json') }, null, 2) + '\n');
