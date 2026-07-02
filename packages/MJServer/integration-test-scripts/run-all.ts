/**
 * run-all.ts — runs the whole MJServer integration suite in sequence and aggregates the result.
 *
 * Each underlying script is self-contained (own bootstrap, own exit code); this spawns them via tsx,
 * shows a clean per-suite progress line (with a live elapsed timer on a TTY), captures each suite's
 * output, and prints a grouped results table + one aggregate exit code for CI. Suite output is hidden
 * by default and shown ONLY for a failing/erroring suite — pass `--verbose` (or INTEGRATION_VERBOSE=1)
 * to stream every suite's output live instead.
 *
 * Tiers gate themselves via env: the Predictive Studio flows SKIP unless PS_INTEGRATION=1 (+ a live
 * Python sidecar), the client suite SKIPs unless a live MJAPI is reachable, and the Live Model suites
 * SKIP unless RUN_AGENT_TESTS=1. The default run is the deterministic, credential-free tier.
 *
 * USAGE (from the repo root):
 *   npm run test:integration                                   # deterministic tier (others skip)
 *   RUN_AGENT_TESTS=1 npm run test:integration                 # + the live-model tier
 *   PS_INTEGRATION=1  npm run test:integration                 # + the Predictive Studio flows
 *   npx tsx packages/MJServer/integration-test-scripts/run-all.ts --verbose   # stream all output live
 *
 * Exit code: 0 = all passed/skipped, 1 = any suite had failures, 2 = any suite hit a bootstrap error.
 */
import { spawn } from 'child_process';

const DIR = 'packages/MJServer/integration-test-scripts';
const VERBOSE = process.argv.includes('--verbose') || process.env.INTEGRATION_VERBOSE === '1';

/** Suites grouped by tier — the table + the header reflect these groups; execution runs top-to-bottom. */
const GROUPS: { Tier: string; Gate: string; Scripts: string[] }[] = [
    {
        Tier: 'Deterministic',
        Gate: 'server · credential-free · blocking gate',
        Scripts: [
            'server-cache-tests.ts',
            'runquery-cache-tests.ts',
            'dataset-cache-tests.ts',
            'aggregates-cache-tests.ts',
            'record-process-tests.ts',
            'record-process-facade-tests.ts',
            'rls-isolation-tests.ts',
            'api-keys-tests.ts',
            'scheduled-jobs-tests.ts',
            'field-rules-bulk-update-tests.ts',
            'remote-operations-tests.ts',
            'ai-skills-tests.ts',
            'predictive-studio-tests.ts',
        ],
    },
    {
        Tier: 'Deterministic · client',
        Gate: 'needs a live MJAPI (skips if unreachable)',
        Scripts: ['remote-op-wire-progress-tests.ts'],
    },
    {
        Tier: 'Predictive Studio flows',
        Gate: process.env.PS_INTEGRATION === '1' ? 'PS_INTEGRATION=1 · Python sidecar' : 'PS_INTEGRATION not set → skip',
        Scripts: [
            'ps-inproc-scored-query.ts',
            'ps-inproc-scheduled-scoring.ts',
            'ps-inproc-operate-flow.ts',
            'ps-inproc-agent-builder.ts',
            'ps-inproc-agent-run.ts',
            'ps-live-recordprocess-scoring.ts',
            'ps-live-modelaction-generation.ts',
            'ps-live-renewal-lifecycle.ts',
            'ps-live-writeback-demo.ts',
            'ps-live-multimodel-lifecycle.ts',
        ],
    },
    {
        Tier: 'Live Model',
        Gate: process.env.RUN_AGENT_TESTS === '1' ? 'RUN_AGENT_TESTS=1 · real model calls' : 'RUN_AGENT_TESTS not set → skip',
        Scripts: [
            'prompt-runner-tests.ts',
            'agent-runner-tests.ts',
            'concurrent-tests.ts',
            'remote-op-ai-authoring-tests.ts',
        ],
    },
];

// ── tiny, dependency-free, TTY-aware ANSI helpers ──────────────────────────────────────────────
const COLOR = process.stdout.isTTY && !process.env.NO_COLOR;
const paint = (code: string) => (s: string) => (COLOR ? `\x1b[${code}m${s}\x1b[0m` : s);
const bold = paint('1'), dim = paint('2'), red = paint('31'), green = paint('32'), cyan = paint('36');

type Status = 'pass' | 'fail' | 'error' | 'skip';
interface SuiteResult { Script: string; Tier: string; Code: number; Status: Status; DurationMs: number; Passed?: number; Total?: number; }

const ICON: Record<Status, string> = { pass: green('✓'), fail: red('✗'), error: red('✗'), skip: dim('–') };
const LABEL: Record<Status, string> = { pass: green('PASS '), fail: red('FAIL '), error: red('ERROR'), skip: dim('SKIP ') };

function fmtDuration(ms: number): string {
    if (ms < 1000) return `${ms}ms`;
    const s = ms / 1000;
    return s < 60 ? `${s.toFixed(1)}s` : `${Math.floor(s / 60)}m ${Math.round(s % 60)}s`;
}

/** Parse a suite's captured output into a status. TestRunner prints "──── <name>: X/Y passed ────". */
function classify(code: number, out: string): { Status: Status; Passed?: number; Total?: number } {
    if (code === 2) return { Status: 'error' };
    if (code === 1) return { Status: 'fail' };
    const matches = [...out.matchAll(/:\s*(\d+)\/(\d+)\s+passed/g)];
    if (matches.length === 0) return { Status: 'skip' }; // exit 0 with no test summary ⇒ the dispatcher skipped
    const passed = matches.reduce((a, m) => a + Number(m[1]), 0);
    const total = matches.reduce((a, m) => a + Number(m[2]), 0);
    return { Status: 'pass', Passed: passed, Total: total };
}

/** Run one suite: stream-or-capture its output, animate an elapsed timer on a TTY, and classify. */
function runSuite(script: string, tier: string, index: number, count: number): Promise<SuiteResult> {
    return new Promise((resolve) => {
        const started = Date.now();
        const prefix = `${dim(`[${index}/${count}]`)} ${bold(script.replace(/-tests?\.ts$/, ''))} ${dim('·')} ${dim(tier)}`;

        let timer: ReturnType<typeof setInterval> | undefined;
        if (VERBOSE) {
            console.log(`\n${cyan('▶')} ${prefix}`);
        } else if (COLOR) {
            // animate an in-place elapsed timer while the suite runs
            const tick = () => process.stdout.write(`\r  ${dim('⏳')} ${prefix}  ${dim(fmtDuration(Date.now() - started))}   `);
            tick();
            timer = setInterval(tick, 250);
        } else {
            process.stdout.write(`  ⏳ ${prefix}\n`);
        }

        const child = spawn('npx', ['tsx', `${DIR}/${script}`], { env: process.env });
        let out = '';
        const capture = (chunk: { toString(): string }, isErr: boolean) => {
            const s = chunk.toString();
            out += s;
            if (VERBOSE) (isErr ? process.stderr : process.stdout).write(s);
        };
        child.stdout.on('data', (c: { toString(): string }) => capture(c, false));
        child.stderr.on('data', (c: { toString(): string }) => capture(c, true));
        child.on('close', (code: number | null) => {
            if (timer) clearInterval(timer);
            const durationMs = Date.now() - started;
            const { Status, Passed, Total } = classify(code ?? 2, out);
            const counts = Status === 'pass' && Total != null ? dim(`  ${Passed}/${Total}`) : '';
            const line = `  ${ICON[Status]} ${LABEL[Status]} ${bold(script.replace(/-tests?\.ts$/, ''))}${counts} ${dim(fmtDuration(durationMs))}`;
            // overwrite the animated line (TTY) or just print (verbose/non-TTY)
            if (!VERBOSE && COLOR) process.stdout.write(`\r${' '.repeat(process.stdout.columns ?? 80)}\r`);
            console.log(line);
            // On failure, surface the captured output (unless we already streamed it live).
            if (!VERBOSE && (Status === 'fail' || Status === 'error')) {
                console.log(dim('  ┄┄ output ┄┄'));
                console.log(out.trimEnd().split('\n').map((l) => `  ${dim('│')} ${l}`).join('\n'));
                console.log(dim('  ┄┄┄┄┄┄┄┄┄┄┄┄'));
            }
            resolve({ Script: script, Tier: tier, Code: code ?? 2, Status, DurationMs: durationMs, Passed, Total });
        });
    });
}

async function main(): Promise<void> {
    const total = GROUPS.reduce((a, g) => a + g.Scripts.length, 0);
    const db = `${process.env.DB_DATABASE ?? '?'} @ ${process.env.DB_HOST ?? 'localhost'}:${process.env.DB_PORT ?? '1433'}`;

    console.log(`\n${bold(cyan('╭─ MemberJunction Integration Suite ' + '─'.repeat(38)))}`);
    console.log(`${cyan('│')}  ${bold('Database')}  ${db}`);
    console.log(`${cyan('│')}  ${bold('Suites')}    ${total} across ${GROUPS.length} tiers`);
    for (const g of GROUPS) {
        console.log(`${cyan('│')}    ${dim('•')} ${g.Tier} ${dim(`(${g.Scripts.length})`)} ${dim('— ' + g.Gate)}`);
    }
    console.log(`${bold(cyan('╰' + '─'.repeat(73)))}\n`);

    const runStart = Date.now();
    const results: SuiteResult[] = [];
    let index = 0;
    for (const g of GROUPS) {
        for (const script of g.Scripts) {
            results.push(await runSuite(script, g.Tier, ++index, total));
        }
    }

    // ── results table, grouped by tier ────────────────────────────────────────────────────────
    console.log(`\n${bold(cyan('╭─ Results ' + '─'.repeat(63)))}`);
    const nameW = Math.max(...results.map((r) => r.Script.replace(/-tests?\.ts$/, '').length)) + 1;
    for (const g of GROUPS) {
        const rows = results.filter((r) => r.Tier === g.Tier);
        const p = rows.filter((r) => r.Status === 'pass').length;
        const f = rows.filter((r) => r.Status === 'fail' || r.Status === 'error').length;
        const s = rows.filter((r) => r.Status === 'skip').length;
        console.log(`${cyan('│')} ${bold(g.Tier)}  ${dim(`${p} passed · ${f} failed · ${s} skipped`)}`);
        for (const r of rows) {
            const name = r.Script.replace(/-tests?\.ts$/, '').padEnd(nameW);
            const counts = r.Status === 'pass' && r.Total != null ? `${r.Passed}/${r.Total}` : '';
            console.log(`${cyan('│')}   ${ICON[r.Status]} ${LABEL[r.Status]} ${name} ${dim(counts.padEnd(7))} ${dim(fmtDuration(r.DurationMs))}`);
        }
    }
    console.log(`${bold(cyan('╰' + '─'.repeat(73)))}`);

    // ── aggregate ──────────────────────────────────────────────────────────────────────────────
    const passed = results.filter((r) => r.Status === 'pass').length;
    const failed = results.filter((r) => r.Status === 'fail').length;
    const errored = results.filter((r) => r.Status === 'error').length;
    const skipped = results.filter((r) => r.Status === 'skip').length;
    const worst = results.reduce((a, r) => Math.max(a, r.Code), 0);
    const parts = [
        green(`${passed} passed`),
        failed ? red(`${failed} failed`) : dim('0 failed'),
        errored ? red(`${errored} errored`) : dim('0 errored'),
        dim(`${skipped} skipped`),
    ];
    const banner = worst === 0 ? green(bold(' PASS ')) : red(bold(worst === 2 ? ' ERROR ' : ' FAIL '));
    console.log(`\n  ${banner}  ${parts.join(dim(' · '))}   ${dim(`(${fmtDuration(Date.now() - runStart)} wall)`)}\n`);
    process.exit(worst);
}

main().catch((error) => {
    console.error(`\nrun-all error: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(2);
});
