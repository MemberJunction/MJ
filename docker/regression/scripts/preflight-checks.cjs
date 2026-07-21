/**
 * Pre-flight gate — runs before the suite to turn every observed
 * config-failure class into a fast, precise abort instead of a 30-minute
 * hanging run (or hours of LLM spend against a broken stack).
 *
 * GATING checks (any failure → non-zero exit, entrypoint aborts):
 *   - MJAPI healthcheck (direct, must be 2xx)
 *   - GraphQL via nginx (server answered — 401 is expected + proves routing)
 *   - socat TCP proxy (localhost:4200 → mjexplorer:4200)
 *   - nginx static file (MJExplorer index.html, must be 2xx)
 *   - DB suite membership integrity (the baseline-collision tripwire)
 *   - auth material present (TEST_UID / TEST_PWD)
 *   - at least one AI vendor key present (Computer Use cannot run without one)
 *
 * ADVISORY checks (reported, never gating):
 *   - Auth0 OIDC discovery (external dependency; can be flaky)
 *   - memory snapshot
 *
 * Writes /tmp/preflight.json (caller moves it into $RUN_DIR).
 *
 * Exit codes: 0 = healthy; 78 (EX_CONFIG) = a gating check failed. Set
 * PREFLIGHT_SOFT=1 to restore advisory-only behavior (always exit 0) for
 * debugging.
 *
 * DR-E1 (docker-regression-reliability-plan). The host-side gate, the
 * cgroup memory-vs-workers arithmetic (DR-A4), and the first-page Playwright
 * smoke are the Wave-1 remainder of DR-E1; this is the Wave-0 container-side
 * teeth: exit-nonzero + Auth0-probe fix + DB suite-member assertion.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { probeHttp, probeTcp } = require('./lib/probes.cjs');

const SOFT = process.env.PREFLIGHT_SOFT === '1';
const EXIT_CONFIG = 78; // EX_CONFIG (sysexits.h) — "configuration error"
const CORE_SCHEMA = process.env.MJ_CORE_SCHEMA || '__mj';

/**
 * Expected suite-member count from the metadata suite files — the number the
 * `mj sync push --include=test-suites` step should have landed in the DB.
 * Returns { count, file } for the file whose `fields.Name` matches, or null
 * when no matching suite file exists (then the DB check falls back to a
 * non-empty assertion). Active-only on both sides so the comparison is
 * apples-to-apples.
 */
function expectedSuiteMemberCount(metadataDir, suiteName) {
    const dir = path.join(metadataDir, 'test-suites');
    if (!fs.existsSync(dir)) return null;
    for (const f of fs.readdirSync(dir)) {
        if (!f.endsWith('.json') || f === '.mj-sync.json') continue;
        let doc;
        try {
            doc = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
        } catch {
            continue; // a malformed sibling suite file shouldn't blind the check
        }
        if (doc?.fields?.Name !== suiteName) continue;
        const members = doc?.relatedEntities?.['MJ: Test Suite Tests'] ?? [];
        const active = members.filter(m => (m?.fields?.Status ?? 'Active') === 'Active');
        return { count: active.length, file: f };
    }
    return null;
}

/**
 * The baseline-collision tripwire (DR-B4's failure mode, detected here):
 * a Flyway baseline seeds TestSuiteTest rows; the metadata push blind-INSERTs
 * the authoritative set; the first (SuiteID,TestID) collision rolls back the
 * WHOLE member transaction, leaving the DB stuck on the stale baseline subset
 * while metadata declares more. A single COUNT comparison converts that silent
 * failure into a precise abort.
 */
async function checkDbSuiteIntegrity(suiteName, metadataDir) {
    const label = 'DB suite membership';
    // Bacpac mode runs against the customer's own DB with their own suite —
    // the metadata comparison doesn't apply.
    if (process.env.BACPAC_FILE) {
        console.log(`  ⊘ [${label}] skipped (bacpac mode — customer DB)`);
        return { label, ok: true, skipped: 'bacpac mode' };
    }
    let pool;
    try {
        const { connect } = require('./lib/db.cjs');
        pool = await connect();

        const suiteRes = await pool
            .request()
            .input('name', suiteName)
            .query(`SELECT TOP 1 ID FROM ${CORE_SCHEMA}.TestSuite WHERE Name = @name`);
        const suiteId = suiteRes.recordset?.[0]?.ID;
        if (!suiteId) {
            const error = `suite "${suiteName}" not found in the DB — the test-suites metadata push failed or the suite name is wrong`;
            console.log(`  ✗ [${label}] ${error}`);
            return { label, ok: false, error };
        }

        const cntRes = await pool
            .request()
            .input('id', suiteId)
            .query(`SELECT COUNT(*) AS n FROM ${CORE_SCHEMA}.TestSuiteTest WHERE SuiteID = @id AND Status = 'Active'`);
        const dbCount = cntRes.recordset?.[0]?.n ?? 0;

        const expected = expectedSuiteMemberCount(metadataDir, suiteName);
        if (expected == null) {
            // No metadata file to compare against — assert the suite isn't empty.
            // Catches the total-rollback-to-zero case even without an exact count.
            const ok = dbCount > 0;
            console.log(`  ${ok ? '✓' : '✗'} [${label}] ${dbCount} member(s) in DB (no metadata count to compare)`);
            return { label, ok, dbCount, expected: null, error: ok ? undefined : 'suite has 0 members in DB — the metadata push likely rolled back' };
        }

        if (dbCount < expected.count) {
            const error =
                `DB has ${dbCount} active member(s) but metadata (${expected.file}) declares ${expected.count} — ` +
                `the test-suites push partially or entirely rolled back (baseline UQ collision?). ` +
                `Inspect the "mj sync push --include=test-suites" output above.`;
            console.log(`  ✗ [${label}] ${error}`);
            return { label, ok: false, dbCount, expected: expected.count, file: expected.file, error };
        }

        const extra = dbCount - expected.count;
        console.log(`  ✓ [${label}] ${dbCount} member(s) match metadata (${expected.count})${extra ? ` +${extra} extra` : ''}`);
        return { label, ok: true, dbCount, expected: expected.count, note: extra ? `${extra} extra member(s) beyond metadata (stale?)` : undefined };
    } catch (e) {
        const error = `DB check failed: ${e.message}`;
        console.log(`  ✗ [${label}] ${error}`);
        return { label, ok: false, error };
    } finally {
        if (pool) {
            try { await pool.close(); } catch { /* ignore */ }
        }
    }
}

/** Auth material the browser login needs — empty = wrong-password loops or worse. */
function checkAuthMaterial() {
    const label = 'Auth material';
    const missing = [];
    if (!process.env.TEST_UID) missing.push('TEST_UID');
    if (!process.env.TEST_PWD) missing.push('TEST_PWD');
    const ok = missing.length === 0;
    console.log(`  ${ok ? '✓' : '✗'} [${label}] ${ok ? 'present' : 'missing/empty: ' + missing.join(', ')}`);
    return { label, ok, error: ok ? undefined : `missing/empty: ${missing.join(', ')}` };
}

/** At least one AI vendor key — Computer Use tests are LLM-driven; zero keys = every test fails. */
function checkAiKeys() {
    const label = 'AI vendor keys';
    const present = Object.keys(process.env)
        .filter(k => k.startsWith('AI_VENDOR_API_KEY__') && process.env[k])
        .map(k => k.replace('AI_VENDOR_API_KEY__', ''));
    const ok = present.length > 0;
    console.log(`  ${ok ? '✓' : '✗'} [${label}] ${ok ? present.join(', ') : 'none set — Computer Use tests cannot run'}`);
    return { label, ok, present, error: ok ? undefined : 'no non-empty AI_VENDOR_API_KEY__* found' };
}

async function main() {
    const results = {};
    const gqlBody = { query: '{ __schema { queryType { name } } }' };

    // ── Gating connectivity probes ──────────────────────────────────────────
    // mjapiHealth + nginxStatic must be 2xx (treat4xxAsOk=false). graphqlProxy
    // stays lenient: an unauthenticated GraphQL POST returns 401, which still
    // proves nginx→mjapi routing works (the whole point of the probe).
    results.mjapiHealth = await probeHttp('MJAPI healthcheck', 'http://mjapi:4000/healthcheck', { treat4xxAsOk: false, log: true });
    results.graphqlProxy = await probeHttp('GraphQL via nginx', 'http://localhost:4200/api/', { method: 'POST', body: gqlBody, log: true });
    results.socatProxy = await probeTcp('socat proxy', 'localhost', 4200, { log: true });
    results.nginxStatic = await probeHttp('MJExplorer static', 'http://localhost:4200/', { treat4xxAsOk: false, log: true });

    // ── Gating config/state checks ──────────────────────────────────────────
    results.dbSuite = await checkDbSuiteIntegrity(
        process.env.TEST_SUITE_NAME || 'MJ Explorer Regression Suite',
        process.env.METADATA_DIR || '/app/metadata',
    );
    results.authMaterial = checkAuthMaterial();
    results.aiKeys = checkAiKeys();

    // ── Advisory (never gating) ─────────────────────────────────────────────
    // Auth0-domain bug fix: previously `AUTH0_DOMAIN || AUTH0_CLIENT_ID`, which
    // used the client ID as a hostname when the domain was empty. Use the
    // domain only.
    const auth0Domain = process.env.AUTH0_DOMAIN;
    if (auth0Domain) {
        results.auth0 = await probeHttp('Auth0 domain (advisory)', `https://${auth0Domain}/.well-known/openid-configuration`, { log: true });
    }

    results.memory = {
        freeMemMB: Math.round(os.freemem() / 1024 / 1024),
        totalMemMB: Math.round(os.totalmem() / 1024 / 1024),
        usagePercent: Math.round((1 - os.freemem() / os.totalmem()) * 100),
    };
    console.log(`  ℹ Memory: ${results.memory.freeMemMB}MB free / ${results.memory.totalMemMB}MB total (${results.memory.usagePercent}% used)`);

    // ── Verdict ───────────────────────────────────────────────────────────────
    const gating = [
        results.mjapiHealth, results.graphqlProxy, results.socatProxy, results.nginxStatic,
        results.dbSuite, results.authMaterial, results.aiKeys,
    ];
    const failed = gating.filter(c => c && !c.ok && !c.skipped);
    results.healthy = failed.length === 0;
    results.timestamp = new Date().toISOString();

    fs.writeFileSync('/tmp/preflight.json', JSON.stringify(results, null, 2));

    console.log('');
    if (results.healthy) {
        console.log('  Pre-flight: ALL GATING CHECKS PASSED');
        process.exit(0);
    }

    console.error(`  ✗ Pre-flight FAILED — ${failed.length} gating check(s) did not pass:`);
    for (const f of failed) {
        console.error(`      - ${f.label}: ${f.error || 'failed'}`);
    }
    if (SOFT) {
        console.error('  PREFLIGHT_SOFT=1 set — continuing in advisory mode despite failures.');
        process.exit(0);
    }
    console.error('  Aborting before the suite (no LLM spend). Fix the above, or set PREFLIGHT_SOFT=1 to run anyway.');
    process.exit(EXIT_CONFIG);
}

// Exported for unit testing the pure metadata logic; the gate only runs when
// this file is invoked directly (not when required).
module.exports = { expectedSuiteMemberCount, checkAuthMaterial, checkAiKeys };

if (require.main === module) {
    main().catch(err => {
        // A crash in the gate itself must not silently pass — fail closed (unless soft).
        console.error(`  ✗ Pre-flight crashed: ${err && err.stack ? err.stack : err}`);
        process.exit(SOFT ? 0 : EXIT_CONFIG);
    });
}
