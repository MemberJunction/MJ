/**
 * run-all.ts — the single CI entry point for the deterministic integration tier
 * (`npm run test:integration`).
 *
 * Each suite OWNS ITS PROCESS (D1): the cache instrumentation requires being the first
 * caller of LocalCacheManager.Initialize, which only one component per process can be.
 * So this aggregator spawns each suite as a SEPARATE `tsx` child, lets it install its
 * own instrumented cache + provider, and collects the harness exit-code contract:
 *
 *   0 = all checks passed (or gracefully skipped)
 *   1 = at least one check failed
 *   2 = a bootstrap / connectivity error (DB or MJAPI unreachable)
 *
 * The aggregate exit code is `2` if any suite hit a bootstrap error, else `1` if any
 * suite reported failures, else `0`. Any non-zero fails the CI job (D8).
 *
 * EXCLUSIONS:
 *  - `client-cache-tests.ts` needs a running MJAPI the in-process lanes don't provide
 *    (run it directly with MJAPI up + MJ_API_KEY set). It is intentionally NOT here.
 *  - `cross-server-invalidation-tests.ts` needs Redis + two MJAPI processes; it is
 *    opt-in behind RUN_CROSS_SERVER=1 (nightly / dedicated job), never in the PR gate.
 *
 * Mutation checks remain gated per-suite by RUN_MUTATION_TESTS (the suites read it
 * themselves); this aggregator just forwards the ambient environment.
 */
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));

interface Suite {
    name: string;
    script: string;
    /** When false the suite is reported as SKIP and not spawned. */
    enabled: boolean;
    /** Note shown next to a skipped suite. */
    skipReason?: string;
}

const SUITES: Suite[] = [
    { name: 'server-cache', script: 'server-cache-tests.ts', enabled: true },
    { name: 'runquery-cache', script: 'runquery-cache-tests.ts', enabled: true },
    { name: 'dataset-cache', script: 'dataset-cache-tests.ts', enabled: true },
    { name: 'aggregates-cache', script: 'aggregates-cache-tests.ts', enabled: true },
    { name: 'rls-isolation', script: 'rls-isolation-tests.ts', enabled: true },
    {
        name: 'cross-server',
        script: 'cross-server-invalidation-tests.ts',
        enabled: process.env.RUN_CROSS_SERVER === '1',
        skipReason: 'set RUN_CROSS_SERVER=1 with Redis + MJAPI_A_URL/MJAPI_B_URL to enable'
    }
];

/** Spawn one suite in its own process; resolve with its exit code (2 if it never started). */
function runSuite(script: string): Promise<number> {
    return new Promise(resolve => {
        const child = spawn('npx', ['tsx', path.join(HERE, script)], {
            stdio: 'inherit',
            cwd: process.cwd(), // repo root — suites read .env relative to cwd
            env: process.env
        });
        child.on('close', code => resolve(code ?? 1));
        child.on('error', () => resolve(2));
    });
}

async function main(): Promise<void> {
    const results: { name: string; code: number }[] = [];

    for (const suite of SUITES) {
        if (!suite.enabled) {
            console.log(`\n⊘ SKIP  ${suite.name}${suite.skipReason ? ` — ${suite.skipReason}` : ''}`);
            continue;
        }
        console.log(`\n════════ ▶ ${suite.name} ════════`);
        const code = await runSuite(suite.script);
        results.push({ name: suite.name, code });
    }

    console.log('\n════════ Integration tier summary ════════');
    for (const r of results) {
        const status = r.code === 0 ? '✓ PASS' : r.code === 2 ? '✗ BOOTSTRAP-ERR' : '✗ FAIL';
        console.log(`  ${status.padEnd(16)} ${r.name} (exit ${r.code})`);
    }

    const anyBootstrap = results.some(r => r.code === 2);
    const anyFail = results.some(r => r.code === 1);
    const overall = anyBootstrap ? 2 : anyFail ? 1 : 0;
    console.log(`════════ overall exit ${overall} ════════`);
    process.exit(overall);
}

main().catch(err => {
    console.error(`run-all bootstrap error: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(2);
});
