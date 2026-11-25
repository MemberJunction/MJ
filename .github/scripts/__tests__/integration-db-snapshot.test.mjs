/**
 * Pins the SQL Server DB snapshot reuse and first-run scheduled job pre-bake in integration.yml
 * and .github/actions/restore-sqlserver-db-snapshot.
 *
 * Two kinds of assertion:
 *  - SHAPE, for what only GitHub can run (step `if:` guards, the actions/cache inputs, which job
 *    uses which variant): read from the YAML text.
 *  - BEHAVIOUR, for every shell block that decides something: the block is cut out of the YAML
 *    exactly as shipped and run under `bash -e` (the runner's default shell) against stubbed
 *    `git` / `docker` / `node`, so a change to the shipped logic changes the result here.
 *
 * What is pinned:
 *  - The `changes` job's `migrations` and `vectors` path filters (which files flip them).
 *  - The snapshot key: each variant's hashed inputs, and the unique `<key>-cold-<run_id>` save
 *    key when restore is skipped.
 *  - Restore lookup order: newest `<key>-cold-*` nightly re-seed, then the push's exact `<key>`,
 *    then the newest snapshot on the release line. actions/cache matches `key` exactly, then by
 *    prefix, then each restore-key, so making `<key>-cold-` the lookup key is what lets a clean
 *    nightly re-seed win over the incremental push snapshot of the same inputs.
 *  - The exact-hit decision that lets a run skip `mj sync push`.
 *  - The pre-bake: pauses exactly the Active cron jobs, sets them back to Active, refuses to
 *    snapshot if any is still Paused or a lock/running row is left, and reports every failure
 *    (including a bare SQL error under bash -e) as a FAILED line in the step summary.
 *  - Snapshot saves only on push/schedule backstops (never pull_request or workflow_dispatch);
 *    codegen-drift provisions cold on migration/metadata PRs.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { readFileSync, writeFileSync, mkdtempSync, mkdirSync, rmSync, chmodSync, existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const GITHUB_DIR = resolve(HERE, '..', '..');
const REPO_ROOT = resolve(GITHUB_DIR, '..');
const integrationText = readFileSync(resolve(GITHUB_DIR, 'workflows', 'integration.yml'), 'utf8');
const actionText = readFileSync(
    resolve(GITHUB_DIR, 'actions', 'restore-sqlserver-db-snapshot', 'action.yml'),
    'utf8',
);

function jobBlock(name) {
    const start = integrationText.indexOf(`\n  ${name}:\n`);
    expect(start, `job ${name} must exist in integration.yml`).toBeGreaterThan(-1);
    const rest = integrationText.slice(start + 1);
    const nextMatch = rest.slice(10).search(/\n  [a-z0-9_-]+:\n/);
    return nextMatch === -1 ? rest : rest.slice(0, nextMatch + 10);
}

/** Extract a single step block by exact `- name:` text from a job block (6-space steps). */
function stepBlock(jobText, stepName) {
    const marker = `      - name: ${stepName}\n`;
    const start = jobText.indexOf(marker);
    expect(start, `step "${stepName}" must exist`).toBeGreaterThan(-1);
    const rest = jobText.slice(start + marker.length);
    const nextIdx = rest.search(/\n      - /);
    return nextIdx === -1 ? rest : rest.slice(0, nextIdx);
}

/** Extract a step of the composite action (4-space steps). */
function actionStep(stepName) {
    const marker = `    - name: ${stepName}\n`;
    const start = actionText.indexOf(marker);
    expect(start, `action step "${stepName}" must exist`).toBeGreaterThan(-1);
    const rest = actionText.slice(start + marker.length);
    const nextIdx = rest.search(/\n    - /);
    return nextIdx === -1 ? rest : rest.slice(0, nextIdx);
}

/** Extract the single `if:` line from a workflow step block. */
function stepIfLine(stepText) {
    const m = /^ {8}if:\s*(.+?)\s*$/m.exec(stepText);
    expect(m, 'step must declare an if: guard').not.toBeNull();
    return m[1];
}

/** The literal `run: |` block of a step, dedented, exactly as the runner would receive it. */
function runScript(stepText) {
    const lines = stepText.split('\n');
    const runIdx = lines.findIndex((l) => /^\s*run: \|\s*$/.test(l));
    expect(runIdx, 'step must have a `run: |` block').toBeGreaterThan(-1);
    const keyIndent = lines[runIdx].search(/\S/);
    const body = [];
    for (const line of lines.slice(runIdx + 1)) {
        if (line.trim() !== '' && line.search(/\S/) <= keyIndent) break;
        body.push(line);
    }
    const indent = Math.min(...body.filter((l) => l.trim() !== '').map((l) => l.search(/\S/)));
    return body.map((l) => l.slice(indent)).join('\n') + '\n';
}

/** Parse a GITHUB_OUTPUT file of `name=value` lines. */
function readOutputs(file) {
    const out = {};
    for (const line of readFileSync(file, 'utf8').split('\n')) {
        const eq = line.indexOf('=');
        if (eq > 0) out[line.slice(0, eq)] = line.slice(eq + 1);
    }
    return out;
}

function writeExecutable(path, content) {
    writeFileSync(path, content);
    chmodSync(path, 0o755);
}

let work;
beforeAll(() => {
    work = mkdtempSync(join(tmpdir(), 'db-snapshot-'));
});
afterAll(() => {
    rmSync(work, { recursive: true, force: true });
});

let runCounter = 0;
/** Run `script` under `bash -e` in `cwd` with `env`; returns status, output and step outputs. */
function runBash(script, { cwd, env = {}, pathPrefix } = {}) {
    runCounter += 1;
    const dir = join(work, `run-${runCounter}`);
    mkdirSync(dir, { recursive: true });
    const scriptFile = join(dir, 'step.sh');
    const outputFile = join(dir, 'output');
    const summaryFile = join(dir, 'summary');
    writeFileSync(scriptFile, script);
    writeFileSync(outputFile, '');
    writeFileSync(summaryFile, '');
    const res = spawnSync('bash', ['-e', scriptFile], {
        cwd: cwd ?? dir,
        encoding: 'utf8',
        timeout: 20000,
        env: {
            ...process.env,
            ...env,
            PATH: pathPrefix ? `${pathPrefix}:${process.env.PATH}` : process.env.PATH,
            GITHUB_OUTPUT: outputFile,
            GITHUB_STEP_SUMMARY: summaryFile,
        },
    });
    return {
        status: res.status,
        stdout: res.stdout,
        stderr: res.stderr,
        outputs: readOutputs(outputFile),
        summary: readFileSync(summaryFile, 'utf8'),
    };
}

// ── changes: the `migrations` and `vectors` path filters ─────────────────────────────────────

/** Run the shipped "Check changed paths" step as a pull_request with `changed` as the PR diff. */
function runChangesFilter(changed) {
    const step = stepBlock(jobBlock('changes'), 'Check changed paths');
    const script = runScript(step)
        .replaceAll('${{ github.event_name }}', 'pull_request')
        .replaceAll('${{ inputs.release }}', '');
    expect(script).not.toContain('${{');
    runCounter += 1;
    const bin = join(work, `git-bin-${runCounter}`);
    mkdirSync(bin);
    const changedFile = join(bin, 'changed.txt');
    writeFileSync(changedFile, changed.join('\n') + '\n');
    // Stub git: `fetch` succeeds, `diff --name-only` prints the PR's changed files.
    writeExecutable(
        join(bin, 'git'),
        `#!/usr/bin/env bash\ncase "$1" in\n  fetch) exit 0 ;;\n  diff) cat '${changedFile}' ;;\n  *) exit 2 ;;\nesac\n`,
    );
    const res = runBash(script, { env: { PR_BASE_REF: 'next' }, pathPrefix: bin });
    expect(res.status, res.stderr).toBe(0);
    return res.outputs;
}

/** The vector write path, as hashed by the `full` key (see the action) — files or directories. */
const VECTOR_WRITE_PATHS = [
    'packages/Scheduling/engine/src',
    'packages/Scheduling/base-engine/src',
    'packages/Actions/CoreActions/src/custom/utilities/vectorize-entity.action.ts',
    'packages/AI/Vectors/Sync/src',
    'packages/AI/Vectors/Core/src',
    'packages/AI/EntityDocuments/src',
    'packages/AI/Prompts/src/embedding',
    'packages/AI/Providers/LocalEmbeddings/src',
    'packages/MJGlobal/src/util/BinaryEncoding.ts',
    'packages/MJCore/src/generic/baseEntity.ts',
    'packages/SQLServerDataProvider/src',
];

/** A changed file standing for a path: the file itself, or a file inside the directory. */
const fileUnder = (p) => (/\.[a-z]+$/.test(p) ? p : `${p}/x.ts`);

describe('changes job — migrations and vectors path filters', () => {
    it('flips `migrations` for migrations/ and metadata/ changes only', () => {
        expect(runChangesFilter(['migrations/v6/V202611240000__v6.3.x__Add_Thing.sql']).migrations).toBe('true');
        expect(runChangesFilter(['metadata/scheduled-jobs/.entity-vector-sync-job.json']).migrations).toBe('true');
        expect(runChangesFilter(['packages/MJCore/src/generic/providerBase.ts']).migrations).toBe('false');
        expect(runChangesFilter(['metadata-optional/integration-test/tests/.x.json']).migrations).toBe('false');
        expect(runChangesFilter(['migrations-pg/v6/V1__x.sql']).migrations).toBe('false');
    });

    it('flips `vectors` for every file on the vector write path', () => {
        for (const p of [
            ...VECTOR_WRITE_PATHS,
            'metadata/scheduled-jobs/.entity-vector-sync-job.json',
            'metadata/entity-documents/.entity-documents.json',
            'packages/TestingFramework/integration-test-suite/src/checks/binary-fields.checks.ts',
        ]) {
            expect(runChangesFilter([fileUnder(p)]).vectors, p).toBe('true');
        }
    });

    it('leaves `vectors` off for code that does not write vectors', () => {
        for (const p of [
            'packages/Actions/CoreActions/src/custom/ai/betty.action.ts',
            'packages/MJCore/src/generic/providerBase.ts',
            'packages/MJGlobal/src/util.ts',
            'packages/SQLServerDataProvider/README.md',
            'packages/Angular/Explorer/core/src/app.ts',
        ]) {
            expect(runChangesFilter([p]).vectors, p).toBe('false');
        }
    });
});

// ── the snapshot key ─────────────────────────────────────────────────────────────────────────

/** Run the action's key step in the real repo; returns outputs and the hashed paths it printed. */
function runKeyStep(env) {
    const script = runScript(actionStep('Compute the snapshot cache key'));
    const res = runBash(script, {
        cwd: REPO_ROOT,
        env: { BASE_REF: '', REF_NAME: 'next', RUN_ID: '4242', SKIP_RESTORE: 'false', ...env },
    });
    const hashed = [...res.stdout.matchAll(/^ {2}(\S+) = [0-9a-f]{40}$/gm)].map((m) => m[1]);
    return { ...res, hashed };
}

describe('restore-sqlserver-db-snapshot — key and save key', () => {
    it('is strictly restore-only', () => {
        expect(actionText).not.toContain('actions/cache/save@');
    });

    it('full hashes the DB-producing inputs, metadata-optional and the whole vector write path', () => {
        const { status, stderr, outputs, hashed, stdout } = runKeyStep({ VARIANT: 'full' });
        expect(status, stderr).toBe(0);
        expect(outputs.prefix).toBe('mj-ci-db-v4-next-');
        expect(outputs.key).toMatch(/^mj-ci-db-v4-next-[0-9a-f]{32}$/);
        for (const p of [
            'migrations',
            'metadata',
            'metadata-optional',
            'mj.config.cjs',
            'packages/MJCLI/src',
            'packages/MetadataSync/src',
            '.github/actions/restore-sqlserver-db-snapshot',
            ...VECTOR_WRITE_PATHS,
        ]) {
            expect(hashed, p).toContain(p);
        }
        expect(stdout).toContain('skyway-core lock = ');
    });

    it('base hashes the DB-producing inputs (SQLServerDataProvider included) but not metadata-optional or the vector code', () => {
        const { status, stderr, outputs, hashed } = runKeyStep({ VARIANT: 'base' });
        expect(status, stderr).toBe(0);
        expect(outputs.key).toMatch(/^mj-ci-db-base-v1-next-[0-9a-f]{32}$/);
        for (const p of [
            'migrations',
            'metadata',
            'mj.config.cjs',
            'packages/MJCLI/src',
            'packages/MetadataSync/src',
            'packages/SQLServerDataProvider/src',
            '.github/actions/restore-sqlserver-db-snapshot',
        ]) {
            expect(hashed, p).toContain(p);
        }
        expect(hashed).not.toContain('metadata-optional');
        expect(hashed).not.toContain('packages/MJCore/src/generic/baseEntity.ts');
    });

    it('scopes the key to the PR base branch, not the PR head', () => {
        const { outputs } = runKeyStep({ VARIANT: 'base', BASE_REF: 'lts/6.1', REF_NAME: '6934/merge' });
        expect(outputs.prefix).toBe('mj-ci-db-base-v1-lts-6.1-');
    });

    it('saves under the plain key normally, and under a unique `<key>-cold-<run_id>` when restore is skipped', () => {
        for (const variant of ['full', 'base']) {
            const warm = runKeyStep({ VARIANT: variant, SKIP_RESTORE: 'false' });
            expect(warm.outputs.save_key).toBe(warm.outputs.key);
            const cold = runKeyStep({ VARIANT: variant, SKIP_RESTORE: 'true', RUN_ID: '987654' });
            expect(cold.outputs.key).toBe(warm.outputs.key);
            expect(cold.outputs.save_key).toBe(`${warm.outputs.key}-cold-987654`);
        }
    });

    it('rejects an unknown variant', () => {
        expect(runKeyStep({ VARIANT: 'nope' }).status).not.toBe(0);
    });
});

describe('restore-sqlserver-db-snapshot — restore lookup order', () => {
    it('looks up the newest `<key>-cold-*` re-seed first, then the exact `<key>`, then the release line', () => {
        const step = actionStep('Restore the provisioned-DB snapshot');
        expect(step).toContain('uses: actions/cache/restore@');
        // Never an exact key, so actions/cache prefix-matches it: the newest nightly cold entry.
        expect(step).toMatch(/^ {8}key: \$\{\{ steps\.dbkey\.outputs\.key \}\}-cold-$/m);
        const restoreKeys = /restore-keys: \|\n((?: {10}.+\n?)+)/.exec(step);
        expect(restoreKeys).not.toBeNull();
        expect(restoreKeys[1].trim().split('\n').map((l) => l.trim())).toEqual([
            '${{ steps.dbkey.outputs.key }}',
            '${{ steps.dbkey.outputs.prefix }}',
        ]);
    });
});

// ── exact hit → skip sync push ───────────────────────────────────────────────────────────────

const KEY = 'mj-ci-db-v4-next-0123456789abcdef0123456789abcdef';
function runSyncFlag(env) {
    const res = runBash(runScript(actionStep('Determine whether metadata sync push is required')), {
        env: { KEY, MATCHED: '', WARM: '0', RETRIED: '0', ...env },
    });
    expect(res.status, res.stderr).toBe(0);
    return res.outputs;
}

describe('restore-sqlserver-db-snapshot — exact hit and sync push', () => {
    it('skips sync push only for a warm, un-retried restore of these exact inputs', () => {
        expect(runSyncFlag({ MATCHED: KEY, WARM: '1' })).toEqual({ exact_hit: 'true', needs_sync: 'false' });
        expect(runSyncFlag({ MATCHED: `${KEY}-cold-123456`, WARM: '1' })).toEqual({
            exact_hit: 'true',
            needs_sync: 'false',
        });
    });

    it('treats a prefix restore from other inputs as a miss and runs sync push', () => {
        for (const matched of [
            'mj-ci-db-v4-next-ffffffffffffffffffffffffffffffff',
            'mj-ci-db-v4-next-ffffffffffffffffffffffffffffffff-cold-1',
            `${KEY}-something-else`,
        ]) {
            expect(runSyncFlag({ MATCHED: matched, WARM: '1' }), matched).toEqual({
                exact_hit: 'false',
                needs_sync: 'true',
            });
        }
        expect(runSyncFlag({ MATCHED: '', WARM: '0' })).toEqual({ exact_hit: 'false', needs_sync: 'true' });
    });

    it('runs sync push after an exact hit that failed to load or was rebuilt cold', () => {
        expect(runSyncFlag({ MATCHED: KEY, WARM: '0' }).needs_sync).toBe('true');
        expect(runSyncFlag({ MATCHED: KEY, WARM: '1', RETRIED: '1' }).needs_sync).toBe('true');
    });
});

// ── the pre-bake ─────────────────────────────────────────────────────────────────────────────

const CRON_IDS = ['AAAAAAAA-0000-4000-8000-000000000001', 'AAAAAAAA-0000-4000-8000-000000000002'];

/**
 * Run the shipped pre-bake step against a stub SQL Server. The stub `docker` keeps the paused
 * count in a state file and answers each query by its shape; `FAKE_FAIL` names one query to fail
 * (sqlcmd -b exits 1 on a SQL error), `FAKE_RESTORE_NOOP` makes the restoring UPDATE succeed
 * without changing anything, `FAKE_LOCKED` sets the held-lock count, `FAKE_DONE` reports the
 * first-run job as already completed, and `FAKE_BOOT_RC` is the MJAPI readiness wait's exit code.
 */
function runPrebake(fake = {}) {
    const block = jobBlock('integration-sqlserver');
    runCounter += 1;
    const root = join(work, `prebake-${runCounter}`);
    const bin = join(root, 'bin');
    const state = join(root, 'state');
    mkdirSync(bin, { recursive: true });
    mkdirSync(state);
    mkdirSync(join(root, 'packages', 'MJAPI'), { recursive: true });
    mkdirSync(join(root, '.github', 'scripts'), { recursive: true });
    writeExecutable(join(root, '.github', 'scripts', 'wait-for-mjapi.sh'), `#!/usr/bin/env bash\nexit "\${FAKE_BOOT_RC:-0}"\n`);
    writeExecutable(join(bin, 'node'), '#!/usr/bin/env bash\nexec sleep 30\n');
    writeExecutable(
        join(bin, 'docker'),
        `#!/usr/bin/env bash
SQL="\${@: -1}"
S='${state}'
printf '%s\\n----\\n' "$SQL" >> "$S/sql.log"
fail_if() { [ "\${FAKE_FAIL:-}" = "$1" ] && { echo "Msg 50000, simulated $1 failure" >&2; exit 1; }; return 0; }
case "$SQL" in
  *"NOT EXISTS"*)
    fail_if pending
    if [ -n "\${FAKE_DONE:-}" ] || [ -f "$S/pending-asked" ]; then echo 0; else touch "$S/pending-asked"; echo 1; fi ;;
  *"SELECT [ID] FROM"*)
    fail_if select
    printf '${CRON_IDS[0]}\\r\\n${CRON_IDS[1]}\\r\\n' ;;
  *"SET [Status] = 'Paused'"*)
    fail_if pause
    echo 2 > "$S/paused" ;;
  *"SET [Status] = 'Active'"*)
    fail_if restore
    [ -n "\${FAKE_RESTORE_NOOP:-}" ] || echo 0 > "$S/paused" ;;
  *"SET [NextRunAt] = NULL"*)
    fail_if nextrun ;;
  *"[Status] = 'Paused' AND [ID] IN"*)
    fail_if pausedcheck
    cat "$S/paused" 2>/dev/null || echo 0 ;;
  *"[LockToken] IS NOT NULL"*)
    fail_if locks
    echo "\${FAKE_LOCKED:-0}" ;;
  *"[Status] = 'Running'"*)
    fail_if running
    echo 0 ;;
  *) echo "unexpected SQL: $SQL" >&2; exit 3 ;;
esac
`,
    );
    const script = runScript(stepBlock(block, 'Pre-run first-run scheduled jobs for the snapshot')).replaceAll(
        '/tmp/mjapi-prebake.log',
        join(root, 'mjapi.log'),
    );
    const env = {};
    if (fake.fail) env.FAKE_FAIL = fake.fail;
    if (fake.restoreNoop) env.FAKE_RESTORE_NOOP = '1';
    if (fake.locked) env.FAKE_LOCKED = String(fake.locked);
    if (fake.done) env.FAKE_DONE = '1';
    if (fake.bootRc) env.FAKE_BOOT_RC = String(fake.bootRc);
    const res = runBash(script, { cwd: root, env, pathPrefix: bin });
    const sqlLog = existsSync(join(state, 'sql.log')) ? readFileSync(join(state, 'sql.log'), 'utf8') : '';
    const queries = sqlLog.split('\n----\n').filter((q) => q.trim() !== '');
    const paused = existsSync(join(state, 'paused')) ? readFileSync(join(state, 'paused'), 'utf8').trim() : 'never';
    return { ...res, queries, paused };
}

const failedLines = (summary) => summary.split('\n').filter((l) => l.includes('**FAILED**'));
const idxOf = (queries, needle) => queries.findIndex((q) => q.includes(needle));

describe('integration-sqlserver — pre-bake of first-run scheduled jobs', () => {
    it('pauses exactly the Active cron jobs, sets them back to Active, then verifies before allowing the snapshot', () => {
        const r = runPrebake();
        expect(r.status, r.stderr + r.stdout).toBe(0);
        expect(r.summary).toBe('');
        expect(r.paused).toBe('0');
        const inList = CRON_IDS.map((id) => `'${id}'`).join(',');
        const pause = idxOf(r.queries, "SET [Status] = 'Paused'");
        const restore = idxOf(r.queries, "SET [Status] = 'Active'");
        const nextRun = idxOf(r.queries, 'SET [NextRunAt] = NULL');
        const check = idxOf(r.queries, "[Status] = 'Paused' AND [ID] IN");
        const locks = idxOf(r.queries, '[LockToken] IS NOT NULL');
        expect(r.queries[pause]).toContain(`WHERE [ID] IN (${inList})`);
        expect(r.queries[restore]).toContain(`WHERE [ID] IN (${inList})`);
        expect(r.queries[check]).toContain(`[ID] IN (${inList})`);
        expect(pause).toBeGreaterThan(-1);
        expect(restore).toBeGreaterThan(pause);
        expect(nextRun).toBeGreaterThan(restore);
        expect(check).toBeGreaterThan(restore);
        expect(locks).toBeGreaterThan(check);
    });

    it('does nothing when the first-run jobs already completed', () => {
        const r = runPrebake({ done: true });
        expect(r.status).toBe(0);
        expect(idxOf(r.queries, "SET [Status] = 'Paused'")).toBe(-1);
        expect(r.summary).toBe('');
    });

    it('refuses the snapshot when a paused cron job is still Paused (restore silently did nothing)', () => {
        const r = runPrebake({ restoreNoop: true });
        expect(r.status).not.toBe(0);
        expect(failedLines(r.summary)).toHaveLength(1);
        expect(r.summary).toContain('2 paused cron job(s) not restored to Active');
    });

    it('refuses the snapshot when a lock is still held', () => {
        const r = runPrebake({ locked: 1 });
        expect(r.status).not.toBe(0);
        expect(failedLines(r.summary)).toHaveLength(1);
        expect(r.summary).toContain('dirty scheduler state: locks=1');
    });

    it('reports a boot failure and still sets the paused jobs back to Active', () => {
        const r = runPrebake({ bootRc: 1 });
        expect(r.status).not.toBe(0);
        expect(failedLines(r.summary)).toHaveLength(1);
        expect(r.summary).toContain('transient MJAPI did not boot');
        expect(r.paused).toBe('0');
    });

    it.each([
        ['pending', 'checking for pending first-run jobs'],
        ['select', 'pausing cron jobs'],
        ['pause', 'pausing cron jobs'],
        ['restore', 'restoring paused cron jobs'],
        ['nextrun', 'resetting NextRunAt'],
        ['pausedcheck', 'verifying the paused cron jobs were restored'],
        ['locks', 'checking for held locks and running jobs'],
        ['running', 'checking for held locks and running jobs'],
    ])('a SQL error in the %s query writes one FAILED summary line naming the phase', (query, phase) => {
        const r = runPrebake({ fail: query });
        expect(r.status, r.stdout).not.toBe(0);
        const lines = failedLines(r.summary);
        expect(lines, r.summary).toHaveLength(1);
        expect(lines[0]).toContain(`error while ${phase}`);
    });
});

// ── job wiring (shape only: GitHub evaluates these) ──────────────────────────────────────────

describe('integration.yml — snapshot wiring', () => {
    it('integration-sqlserver restores full, resets baked vectors when needed, and saves strictly on push/schedule', () => {
        const block = jobBlock('integration-sqlserver');
        const restoreStep = stepBlock(block, 'Restore SQL Server DB snapshot and migrate');
        expect(restoreStep).toContain('uses: ./.github/actions/restore-sqlserver-db-snapshot');
        expect(restoreStep).toMatch(/variant:\s*full/);
        expect(restoreStep).toMatch(/skip-restore:\s*\$\{\{\s*github\.event_name == 'schedule'\s*\}\}/);

        // Vector PRs, and pushes that prefix-restored (they save a new snapshot), clear the
        // baked vectors so this commit's code writes them.
        const resetStep = stepBlock(block, 'Reset baked vector-sync state');
        expect(stepIfLine(resetStep)).toBe(
            "steps.db.outputs.warm == '1' && ((github.event_name == 'pull_request' && needs.changes.outputs.vectors == 'true') || (github.event_name == 'push' && steps.db.outputs.cache-hit != 'true'))",
        );
        const resetSql = runScript(resetStep);
        expect(resetSql).toContain('DELETE FROM [__mj].[EntityRecordDocument];');
        expect(resetSql).toMatch(
            /DELETE r FROM \[__mj\]\.\[ScheduledJobRun\] r\s+INNER JOIN \[__mj\]\.\[ScheduledJob\] j ON j\.\[ID\] = r\.\[ScheduledJobID\]\s+WHERE j\.\[RunImmediatelyIfNeverRun\] = 1;/,
        );
        expect(resetSql).toMatch(/SET \[LastRunAt\] = NULL, \[NextRunAt\] = NULL, \[LockToken\] = NULL/);
        expect(resetSql).toContain(' -b ');

        // Ordering: reset -> prebake -> snapshot -> save.
        const resetIdx = block.indexOf('name: Reset baked vector-sync state');
        const prebakeIdx = block.indexOf('name: Pre-run first-run scheduled jobs for the snapshot');
        const snapIdx = block.indexOf('name: Snapshot the provisioned DB');
        const saveIdx = block.indexOf('name: Save the provisioned-DB snapshot');
        expect(prebakeIdx).toBeGreaterThan(resetIdx);
        expect(snapIdx).toBeGreaterThan(prebakeIdx);
        expect(saveIdx).toBeGreaterThan(snapIdx);

        const prebakeStep = stepBlock(block, 'Pre-run first-run scheduled jobs for the snapshot');
        expect(stepIfLine(prebakeStep)).toBe(
            "(github.event_name == 'push' || github.event_name == 'schedule') && steps.db.outputs.cache-hit != 'true'",
        );

        const snapStep = stepBlock(block, 'Snapshot the provisioned DB');
        expect(stepIfLine(snapStep)).toContain("steps.prebake.outcome == 'success'");

        const saveStep = stepBlock(block, 'Save the provisioned-DB snapshot');
        const saveIf = stepIfLine(saveStep);
        expect(saveIf).toMatch(
            /^\(github\.event_name == 'push' \|\| github\.event_name == 'schedule'\) && steps\.db\.outputs\.cache-hit != 'true' && steps\.dbsnapshot\.outcome == 'success'$/,
        );
        expect(saveIf).not.toMatch(/pull_request|workflow_dispatch/);
        expect(saveStep).toContain('key: ${{ steps.db.outputs.save-key }}');
    });

    it('cross-server-invalidation restores variant: full with nightly cold bypass and never saves snapshots', () => {
        const block = jobBlock('cross-server-invalidation');
        const restoreStep = stepBlock(block, 'Restore SQL Server DB snapshot and migrate');
        expect(restoreStep).toContain('uses: ./.github/actions/restore-sqlserver-db-snapshot');
        expect(restoreStep).toMatch(/variant:\s*full/);
        expect(restoreStep).toMatch(/skip-restore:\s*\$\{\{\s*github\.event_name == 'schedule'\s*\}\}/);
        expect(block).not.toContain('actions/cache/save@');
    });

    it('codegen-drift restores variant: base, provisions cold on migration/metadata PRs, and saves strictly on push/schedule before codegen', () => {
        const block = jobBlock('codegen-drift');
        const restoreStep = stepBlock(block, 'Restore SQL Server base DB snapshot and migrate');
        expect(restoreStep).toContain('uses: ./.github/actions/restore-sqlserver-db-snapshot');
        expect(restoreStep).toMatch(/variant:\s*base/);
        expect(block).not.toMatch(/variant:\s*full/);
        expect(restoreStep).toMatch(
            /skip-restore:\s*\$\{\{\s*github\.event_name == 'schedule' \|\| needs\.changes\.outputs\.migrations == 'true'\s*\}\}/,
        );

        const saveIdx = block.indexOf('name: Save the base DB snapshot');
        const codegenIdx = block.indexOf('name: Run CodeGen against the migrated DB');
        expect(saveIdx).toBeGreaterThan(-1);
        expect(codegenIdx).toBeGreaterThan(saveIdx);

        const saveStep = stepBlock(block, 'Save the base DB snapshot');
        const saveIf = stepIfLine(saveStep);
        expect(saveIf).toMatch(
            /^\(github\.event_name == 'push' \|\| github\.event_name == 'schedule'\) && steps\.db\.outputs\.cache-hit != 'true' && steps\.dbsnapshot\.outcome == 'success'$/,
        );
        expect(saveIf).not.toMatch(/pull_request|workflow_dispatch/);
        expect(saveStep).toContain('key: ${{ steps.db.outputs.save-key }}');
    });
});
