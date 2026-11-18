import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, readFileSync, existsSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync, execFileSync } from 'node:child_process';
import {
    TRIGGER_GLOBS,
    globToRegExp,
    matchesTrigger,
    builtPackageDirs,
    owningPackageDir,
    decide,
    formatSummary,
    computeFingerprint,
    changedPathsOfMergeCommit,
    readPassedMarker,
    parseRunId,
    verifyPassRecord,
    checkPassRecord,
    WORKFLOW_PATH,
    TIER_JOB_NAME,
    CHANGES_JOB_NAME,
} from '../select-integration-tier.mjs';

const SCRIPTS_DIR = dirname(dirname(fileURLToPath(import.meta.url)));
const REPO_ROOT = resolve(SCRIPTS_DIR, '..', '..');
const SCRIPT = join(SCRIPTS_DIR, 'select-integration-tier.mjs');

/** A turbo dry-run result whose build tasks cover `dirs`. */
const dryRun = (dirs) => ({
    tasks: [
        ...dirs.map((directory) => ({ task: 'build', package: directory, directory })),
        { task: 'test', package: 'x', directory: 'packages/NotBuiltButTested' },
    ],
});

/** Workspace layout shared by the fixture PRs: two built packages, two Angular ones. */
const PACKAGE_DIRS = new Set([
    'packages/MJCore',
    'packages/MJAPI',
    'packages/Angular/Generic/artifacts',
    'packages/Angular/Explorer/explorer-core',
]);
const hasPackageJson = (dir) => PACKAGE_DIRS.has(dir);
const BUILT = builtPackageDirs(dryRun(['packages/MJCore', 'packages/MJAPI']));

describe('decide — fixture PRs', () => {
    it('skips a PR confined to packages the tier does not build', () => {
        const d = decide(
            [
                'packages/Angular/Generic/artifacts/src/lib/viewer.component.ts',
                'packages/Angular/Explorer/explorer-core/src/app.scss',
                '.changeset/quiet-owls.md',
            ],
            BUILT,
            hasPackageJson,
        );
        expect(d).toEqual({
            run: false,
            reasons: [],
            unbuiltPackages: ['packages/Angular/Explorer/explorer-core', 'packages/Angular/Generic/artifacts'],
        });
    });

    it('runs when any changed file is in a package the tier builds', () => {
        const d = decide(
            ['packages/Angular/Generic/artifacts/src/a.ts', 'packages/MJCore/src/generic/runView.ts'],
            BUILT,
            hasPackageJson,
        );
        expect(d.run).toBe(true);
        expect(d.reasons).toEqual(['packages/MJCore is built by the integration tier']);
    });

    it('runs for a package.json edit in a built package (a new dependency edge)', () => {
        expect(decide(['packages/MJAPI/package.json'], BUILT, hasPackageJson).run).toBe(true);
    });

    it.each([
        'migrations/v6/V202611130000__v6.2.x_Something.sql',
        'metadata/actions/.actions.json',
        'metadata-optional/integration-test/tests/integration/.it01.json',
        'pnpm-lock.yaml',
        'turbo.json',
        'tsconfig.json',
        'mj.config.cjs',
        '.github/workflows/integration.yml',
        '.github/scripts/wait-for-mjapi.sh',
        '.github/scripts/select-integration-tier.mjs',
        'package.json',
        'pnpm-workspace.yaml',
        '.npmrc',
    ])('runs when a UI-only PR also changes %s', (path) => {
        const d = decide(['packages/Angular/Generic/artifacts/src/a.ts', path], BUILT, hasPackageJson);
        expect(d.run).toBe(true);
        expect(d.reasons).toEqual([`${path} is outside packages/ (feeds the database or the whole build)`]);
    });

    it('runs for a file under packages/ that no package owns (e.g. a deleted package)', () => {
        const d = decide(['packages/RemovedThing/src/index.ts'], BUILT, hasPackageJson);
        expect(d.run).toBe(true);
        expect(d.reasons).toEqual(['packages/RemovedThing/src/index.ts belongs to no workspace package']);
    });

    it('runs when the changed-file list is empty (a failed diff must not skip)', () => {
        expect(decide(['', '  '], BUILT, hasPackageJson).run).toBe(true);
    });

    it('ignores changed files the workflow does not watch', () => {
        const d = decide(['docs/guide.md', 'packages/Angular/Generic/artifacts/README.md'], BUILT, hasPackageJson);
        expect(d.run).toBe(false);
    });
});

describe('builtPackageDirs', () => {
    it('keeps only build tasks and normalises trailing slashes', () => {
        expect(builtPackageDirs(dryRun(['packages/MJCore/']))).toEqual(new Set(['packages/MJCore']));
    });

    it('throws on a dry run with no build tasks, so it can never read as "builds nothing"', () => {
        expect(() => builtPackageDirs({ tasks: [] })).toThrow(/no build tasks/);
        expect(() => builtPackageDirs({})).toThrow(/no `tasks` array/);
    });
});

describe('owningPackageDir', () => {
    it('finds the nearest package.json, not an enclosing folder', () => {
        expect(owningPackageDir('packages/Angular/Generic/artifacts/src/lib/x.ts', hasPackageJson)).toBe(
            'packages/Angular/Generic/artifacts',
        );
    });

    it('reads the real workspace layout', () => {
        const real = (dir) => existsSync(join(REPO_ROOT, dir, 'package.json'));
        expect(owningPackageDir('packages/MJAPI/src/index.ts', real)).toBe('packages/MJAPI');
        expect(owningPackageDir('packages/Angular/Generic/artifacts/src/public-api.ts', real)).toBe(
            'packages/Angular/Generic/artifacts',
        );
    });
});

describe('trigger globs', () => {
    it('match the pull_request paths filter in integration.yml exactly', () => {
        const yml = readFileSync(join(REPO_ROOT, '.github/workflows/integration.yml'), 'utf8');
        const block = yml.split(/\n  pull_request:\n/)[1].split(/\n    paths:\n/)[1];
        const globs = [];
        for (const line of block.split('\n')) {
            if (/^\s*#/.test(line)) continue;
            const m = /^      - '([^']+)'\s*$/.exec(line);
            if (!m) break;
            globs.push(m[1]);
        }
        expect(globs).toEqual(TRIGGER_GLOBS);
    });

    it('keep `*` within one directory and let `**` cross directories', () => {
        expect(globToRegExp('tsconfig*').test('tsconfig.base.json')).toBe(true);
        expect(globToRegExp('tsconfig*').test('tsconfig.d/base.json')).toBe(false);
        expect(globToRegExp('packages/**').test('packages/a/b/c.ts')).toBe(true);
        expect(matchesTrigger('packages/a/b/c.ts')).toBe(true);
        expect(matchesTrigger('.changeset/x.md')).toBe(false);
        expect(matchesTrigger('mj.config.cjsx')).toBe(false);
    });
});

describe('formatSummary', () => {
    it('lists the unbuilt packages on a skip', () => {
        const text = formatSummary({ run: false, reasons: [], unbuiltPackages: ['packages/Angular/Generic/artifacts'] });
        expect(text).toContain('**Skipped.**');
        expect(text).toContain('- packages/Angular/Generic/artifacts');
    });
});

/**
 * A throwaway repo shaped like a GitHub PR run: `base` and `pr` branches, and `mergeRef()`
 * checks out a fresh merge of `pr` into `base` — parent 1 the base, as on refs/pull/N/merge —
 * and returns its fingerprint. The root commit carries the files the selection cares about:
 * the trusted workflow and script, a migration, and a built and an unbuilt package.
 */
function prRepo() {
    const dir = mkdtempSync(join(tmpdir(), 'select-tier-git-'));
    const git = (...args) =>
        execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@example.com', '-c', 'commit.gpgsign=false', ...args], {
            cwd: dir,
            encoding: 'utf8',
            stdio: ['ignore', 'pipe', 'pipe'],
        });
    const write = (file, text) => {
        mkdirSync(dirname(join(dir, file)), { recursive: true });
        writeFileSync(join(dir, file), text);
    };
    const commit = (branch, file, text) => {
        git('checkout', '-q', branch);
        write(file, text);
        git('add', file);
        git('commit', '-q', '-m', `${branch}: ${file}`);
    };
    const move = (branch, from, to) => {
        git('checkout', '-q', branch);
        mkdirSync(dirname(join(dir, to)), { recursive: true });
        git('mv', from, to);
        git('commit', '-q', '-m', `${branch}: move ${from}`);
    };
    git('init', '-q', '-b', 'base');
    write('pr-file.txt', 'line 1\nline 2\nline 3\nline 4\nline 5\nline 6\nline 7\nline 8\nline 9\n');
    write('other.txt', 'other\n');
    write(WORKFLOW_PATH, 'name: Integration Tier\n');
    write('.github/scripts/select-integration-tier.mjs', '// selector\n');
    write('migrations/V1__init.sql', 'SELECT 1;\n');
    write('packages/MJCore/package.json', '{"name":"@memberjunction/core"}\n');
    write('packages/MJCore/src/register.ts', 'export const x = 1;\n');
    write('packages/Angular/X/package.json', '{"name":"ng-x"}\n');
    git('add', '.');
    git('commit', '-q', '-m', 'root');
    git('branch', 'pr');
    commit('pr', 'pr-file.txt', 'line 1\nline 2\nline 3\nline 4\nline 5\nline 6\nline 7\nline 8\nPR EDIT\n');
    const mergeRef = () => {
        git('checkout', '-q', '--detach', 'base');
        git('merge', '-q', '--no-ff', '--no-edit', 'pr');
        return computeFingerprint(dir);
    };
    const prHead = () => git('rev-parse', 'pr').trim();
    return { dir, git, commit, move, mergeRef, prHead };
}

/** Repos created by a test, removed after it. */
const repos = [];
afterEach(() => repos.splice(0).forEach((r) => rmSync(r.dir, { recursive: true, force: true })));
const repo = () => {
    const r = prRepo();
    repos.push(r);
    return r;
};

describe('computeFingerprint', () => {
    it('is unchanged by a catch-up merge where the base moved only in files the PR does not touch', () => {
        const r = repo();
        const before = r.mergeRef();
        r.commit('base', 'other.txt', 'other, changed on the base branch\n');
        expect(r.mergeRef()).toBe(before);
    });

    it('changes when the base edits a file the PR also touches, even far from the PR hunk', () => {
        const r = repo();
        const before = r.mergeRef();
        r.commit('base', 'pr-file.txt', 'BASE EDIT\nline 2\nline 3\nline 4\nline 5\nline 6\nline 7\nline 8\nline 9\n');
        expect(r.mergeRef()).not.toBe(before);
    });

    it.each(['migrations/V2__new.sql', 'metadata/entities/.new.json', 'metadata-optional/integration-test/tests/.it999.json'])(
        'changes when the base adds %s, which the tier migrates or pushes before testing',
        (file) => {
            const r = repo();
            const before = r.mergeRef();
            r.commit('base', file, 'new on the base branch\n');
            expect(r.mergeRef()).not.toBe(before);
        },
    );

    it('changes when the author adds a commit', () => {
        const r = repo();
        const before = r.mergeRef();
        r.commit('pr', 'new-file.txt', 'new\n');
        expect(r.mergeRef()).not.toBe(before);
    });

    it('throws when HEAD is not a merge commit, so no fingerprint is ever guessed', () => {
        const r = repo();
        r.git('checkout', '-q', 'pr');
        expect(() => computeFingerprint(r.dir)).toThrow(/expected the two-parent PR merge commit/);
    });
});

describe('changedPathsOfMergeCommit', () => {
    it('lists both paths of a file moved out of a package, so the package it left counts as changed', () => {
        const r = repo();
        r.move('pr', 'packages/MJCore/src/register.ts', 'packages/Angular/X/src/register.ts');
        r.mergeRef();
        const paths = changedPathsOfMergeCommit(r.dir);
        expect(paths).toContain('packages/MJCore/src/register.ts');
        expect(paths).toContain('packages/Angular/X/src/register.ts');
    });
});

describe('readPassedMarker', () => {
    let dir;
    afterEach(() => dir && rmSync(dir, { recursive: true, force: true }));

    it('returns the recorded URL, and null for a missing, empty or unset marker', () => {
        dir = mkdtempSync(join(tmpdir(), 'select-tier-marker-'));
        writeFileSync(join(dir, 'run.txt'), 'https://example.test/runs/1\n');
        writeFileSync(join(dir, 'empty.txt'), '  \n');
        expect(readPassedMarker(join(dir, 'run.txt'))).toBe('https://example.test/runs/1');
        expect(readPassedMarker(join(dir, 'empty.txt'))).toBeNull();
        expect(readPassedMarker(join(dir, 'missing.txt'))).toBeNull();
        expect(readPassedMarker(undefined)).toBeNull();
    });
});

describe('parseRunId', () => {
    it('reads the id from an Actions run URL and rejects anything else', () => {
        expect(parseRunId('https://github.com/MemberJunction/MJ/actions/runs/44201461128\n')).toBe('44201461128');
        expect(() => parseRunId('https://example.test/runs/1')).toThrow(/not an Actions run URL/);
    });
});

describe('verifyPassRecord', () => {
    const PR = 7;

    /** A fake API serving one recorded run, its jobs and its changes-job log. */
    function fakeApi({ run, jobs, log }) {
        return async (path, { text = false } = {}) => {
            if (path.endsWith('/logs')) return text ? log : JSON.parse(log);
            if (path.includes('/jobs')) return { jobs };
            return run;
        };
    }

    /** The API view of an honest passing run at PR head `headSha` that logged `fingerprint`. */
    function honestRun(headSha, fingerprint, overrides = {}) {
        return {
            run: { path: WORKFLOW_PATH, event: 'pull_request', pull_requests: [{ number: PR }], head_sha: headSha, ...overrides.run },
            jobs: overrides.jobs ?? [
                { name: CHANGES_JOB_NAME, id: 11, conclusion: 'success' },
                { name: TIER_JOB_NAME, id: 12, conclusion: 'success' },
            ],
            log: overrides.log ?? `2026-11-17T00:00:00.0000000Z PR change fingerprint: ${fingerprint}\n`,
        };
    }

    const verify = (r, fingerprint, api) => verifyPassRecord({ runId: '1', fingerprint, prNumber: PR, repository: 'o/r', api, cwd: r.dir });

    it('trusts an honest passing run of the same changes after an unrelated catch-up merge', async () => {
        const r = repo();
        const fingerprint = r.mergeRef();
        const head = r.prHead();
        r.commit('base', 'other.txt', 'moved on the base branch\n');
        expect(r.mergeRef()).toBe(fingerprint);
        await expect(verify(r, fingerprint, fakeApi(honestRun(head, fingerprint)))).resolves.toBeUndefined();
    });

    it.each([
        ['a run of another workflow', { run: { path: '.github/workflows/test.yml' } }, /not \.github\/workflows\/integration\.yml/],
        ['a push run', { run: { event: 'push' } }, /was a push run/],
        ['a run for another PR', { run: { pull_requests: [{ number: 8 }] } }, /not for PR #7/],
        ['a run whose tier job failed', { jobs: [{ name: CHANGES_JOB_NAME, id: 11 }, { name: TIER_JOB_NAME, id: 12, conclusion: 'failure' }] }, /concluded failure/],
        ['a run that logged another fingerprint', { log: 'PR change fingerprint: 0000\n' }, /fingerprint differs/],
    ])('rejects %s', async (_label, overrides, reason) => {
        const r = repo();
        const fingerprint = r.mergeRef();
        await expect(verify(r, fingerprint, fakeApi(honestRun(r.prHead(), fingerprint, overrides)))).rejects.toThrow(reason);
    });

    it('rejects a record from a run where the PR had changed the workflow, once that change is dropped', async () => {
        const r = repo();
        r.commit('pr', WORKFLOW_PATH, 'name: Integration Tier\n# tampered: tier job just echoes\n');
        const tamperedHead = r.prHead();
        r.commit('pr', WORKFLOW_PATH, 'name: Integration Tier\n');
        const fingerprint = r.mergeRef();
        // The tampered run could have logged (and cached) any fingerprint, including this one.
        await expect(verify(r, fingerprint, fakeApi(honestRun(tamperedHead, fingerprint)))).rejects.toThrow(
            /had a version of \.github\/workflows\/integration\.yml it no longer has/,
        );
    });

    it('trusts a run where the PR changed the workflow when the PR still carries that version', async () => {
        const r = repo();
        r.commit('pr', WORKFLOW_PATH, 'name: Integration Tier\n# reviewed change\n');
        const fingerprint = r.mergeRef();
        await expect(verify(r, fingerprint, fakeApi(honestRun(r.prHead(), fingerprint)))).resolves.toBeUndefined();
    });

    it('checkPassRecord skips only on a record that verifies, and says why it distrusts one', async () => {
        const r = repo();
        const fingerprint = r.mergeRef();
        const marker = join(r.dir, '..', `${r.dir.split('/').pop()}-run.txt`);
        writeFileSync(marker, 'https://github.com/o/r/actions/runs/1\n');
        try {
            const args = { 'passed-marker': marker, fingerprint, pr: String(PR) };
            await expect(checkPassRecord(args, r.dir, fakeApi(honestRun(r.prHead(), fingerprint)))).resolves.toEqual({
                passedRun: 'https://github.com/o/r/actions/runs/1',
            });
            const pushRun = fakeApi(honestRun(r.prHead(), fingerprint, { run: { event: 'push' } }));
            const distrusted = await checkPassRecord(args, r.dir, pushRun);
            expect(distrusted.passedRun).toBeUndefined();
            expect(distrusted.note).toMatch(/was found but not trusted: the recorded run was a push run/);
        } finally {
            rmSync(marker, { force: true });
        }
    });

    it('rejects when this run has no fingerprint, the API fails, or the run head cannot be fetched', async () => {
        const r = repo();
        const fingerprint = r.mergeRef();
        await expect(verify(r, '', fakeApi(honestRun(r.prHead(), fingerprint)))).rejects.toThrow(/no fingerprint/);
        const failing = async () => {
            throw new Error('GET /x returned HTTP 403');
        };
        await expect(verify(r, fingerprint, failing)).rejects.toThrow(/HTTP 403/);
        await expect(verify(r, fingerprint, fakeApi(honestRun('0'.repeat(40), fingerprint)))).rejects.toThrow();
    });
});

describe('CLI', () => {
    let dir;
    afterEach(() => dir && rmSync(dir, { recursive: true, force: true }));

    /** Run the selection in `cwd` with `args`; return the output value and the summary. */
    function spawnSelect(cwd, args, outDir) {
        const output = join(outDir, 'out');
        const summary = join(outDir, 'summary.md');
        writeFileSync(output, '');
        const r = spawnSync(process.execPath, [SCRIPT, ...args], {
            cwd,
            encoding: 'utf8',
            env: { ...process.env, GITHUB_OUTPUT: output, GITHUB_STEP_SUMMARY: summary, GITHUB_TOKEN: '', GITHUB_REPOSITORY: 'o/r' },
        });
        expect(r.status).toBe(0);
        return { value: readFileSync(output, 'utf8').trim(), summary: readFileSync(summary, 'utf8') };
    }

    /** Run the script against a fixture changed-file list and build graph; return its output value. */
    function runCli(changed, graph, marker) {
        dir = mkdtempSync(join(tmpdir(), 'select-tier-'));
        writeFileSync(join(dir, 'changed.txt'), changed.join('\n'));
        if (graph !== undefined) writeFileSync(join(dir, 'graph.json'), graph);
        if (marker !== undefined) writeFileSync(join(dir, 'run.txt'), marker);
        const { value, summary } = spawnSelect(
            REPO_ROOT,
            [
                `--changed=${join(dir, 'changed.txt')}`,
                `--build-graph=${join(dir, 'graph.json')}`,
                `--root=${REPO_ROOT}`,
                `--passed-marker=${join(dir, 'run.txt')}`,
                '--fingerprint=abc',
                '--pr=7',
            ],
            dir,
        );
        runCli.summary = summary;
        return value;
    }

    it('does not trust a pass record it cannot verify: the tier runs and the summary says why', () => {
        const graph = JSON.stringify(dryRun(['packages/MJCore', 'packages/MJAPI']));
        const url = 'https://github.com/o/r/actions/runs/42';
        expect(runCli(['packages/MJCore/src/index.ts'], graph, `${url}\n`)).toBe('integration=true');
        expect(runCli.summary).toContain(`a pass record (${url}) was found but not trusted: GITHUB_TOKEN is not set`);
    });

    it('applies the package rule when the pass record is empty', () => {
        const graph = JSON.stringify(dryRun(['packages/MJCore', 'packages/MJAPI']));
        expect(runCli(['packages/MJCore/src/index.ts'], graph, '')).toBe('integration=true');
    });

    it('takes the changed files from the merge commit, so a file moved out of a built package runs the tier', () => {
        const r = repo();
        r.move('pr', 'packages/MJCore/src/register.ts', 'packages/Angular/X/src/register.ts');
        r.mergeRef();
        dir = mkdtempSync(join(tmpdir(), 'select-tier-'));
        writeFileSync(join(dir, 'graph.json'), JSON.stringify(dryRun(['packages/MJCore'])));
        const { value, summary } = spawnSelect(r.dir, [`--build-graph=${join(dir, 'graph.json')}`, `--root=${r.dir}`], dir);
        expect(value).toBe('integration=true');
        expect(summary).toContain('packages/MJCore is built by the integration tier');
    });

    it('fingerprint mode writes the merge commit fingerprint', () => {
        const r = repo();
        const expected = r.mergeRef();
        dir = mkdtempSync(join(tmpdir(), 'select-tier-fp-'));
        const output = join(dir, 'out');
        writeFileSync(output, '');
        const res = spawnSync(process.execPath, [SCRIPT, 'fingerprint'], {
            cwd: r.dir,
            encoding: 'utf8',
            env: { ...process.env, GITHUB_OUTPUT: output },
        });
        expect(res.status).toBe(0);
        expect(readFileSync(output, 'utf8')).toBe(`fingerprint=${expected}\n`);
    });

    it('fingerprint mode writes an empty fingerprint, exit 0, outside a merge commit', () => {
        dir = mkdtempSync(join(tmpdir(), 'select-tier-fp-'));
        const output = join(dir, 'out');
        writeFileSync(output, '');
        execFileSync('git', ['init', '-q'], { cwd: dir });
        const r = spawnSync(process.execPath, [SCRIPT, 'fingerprint'], {
            cwd: dir,
            encoding: 'utf8',
            env: { ...process.env, GITHUB_OUTPUT: output },
        });
        expect(r.status).toBe(0);
        expect(readFileSync(output, 'utf8')).toBe('fingerprint=\n');
    });

    it('writes integration=false for an Angular-only change against the real workspace', () => {
        const graph = JSON.stringify(dryRun(['packages/MJCore', 'packages/MJAPI']));
        expect(runCli(['packages/Angular/Generic/artifacts/src/public-api.ts'], graph)).toBe('integration=false');
    });

    it('writes integration=true for a change in a built package', () => {
        const graph = JSON.stringify(dryRun(['packages/MJCore', 'packages/MJAPI']));
        expect(runCli(['packages/MJAPI/src/index.ts'], graph)).toBe('integration=true');
    });

    it('fails open — integration=true, exit 0 — when the build graph is missing or invalid', () => {
        expect(runCli(['packages/Angular/Generic/artifacts/src/public-api.ts'], undefined)).toBe('integration=true');
        expect(runCli(['packages/Angular/Generic/artifacts/src/public-api.ts'], '{not json')).toBe('integration=true');
    });
});
