import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
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
    readPassedMarker,
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
 * checks out a fresh merge of `pr` into `base` — parent 1 the base, as on refs/pull/N/merge.
 */
function prRepo() {
    const dir = mkdtempSync(join(tmpdir(), 'select-tier-git-'));
    const git = (...args) =>
        execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@example.com', '-c', 'commit.gpgsign=false', ...args], {
            cwd: dir,
            encoding: 'utf8',
            stdio: ['ignore', 'pipe', 'pipe'],
        });
    const write = (file, text) => writeFileSync(join(dir, file), text);
    const commit = (branch, file, text) => {
        git('checkout', '-q', branch);
        write(file, text);
        git('add', file);
        git('commit', '-q', '-m', `${branch}: ${file}`);
    };
    git('init', '-q', '-b', 'base');
    write('pr-file.txt', 'line 1\nline 2\nline 3\nline 4\nline 5\nline 6\nline 7\nline 8\nline 9\n');
    write('other.txt', 'other\n');
    git('add', '.');
    git('commit', '-q', '-m', 'root');
    git('branch', 'pr');
    commit('pr', 'pr-file.txt', 'line 1\nline 2\nline 3\nline 4\nline 5\nline 6\nline 7\nline 8\nPR EDIT\n');
    const mergeRef = () => {
        git('checkout', '-q', '--detach', 'base');
        git('merge', '-q', '--no-ff', '--no-edit', 'pr');
        return computeFingerprint(dir);
    };
    return { dir, git, commit, mergeRef };
}

describe('computeFingerprint', () => {
    const repos = [];
    afterEach(() => repos.splice(0).forEach((r) => rmSync(r.dir, { recursive: true, force: true })));
    const repo = () => {
        const r = prRepo();
        repos.push(r);
        return r;
    };

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

describe('CLI', () => {
    let dir;
    afterEach(() => dir && rmSync(dir, { recursive: true, force: true }));

    /** Run the script against a fixture changed-file list and build graph; return its output value. */
    function runCli(changed, graph, marker) {
        dir = mkdtempSync(join(tmpdir(), 'select-tier-'));
        const output = join(dir, 'out');
        const summary = join(dir, 'summary.md');
        writeFileSync(output, '');
        writeFileSync(join(dir, 'changed.txt'), changed.join('\n'));
        if (graph !== undefined) writeFileSync(join(dir, 'graph.json'), graph);
        if (marker !== undefined) writeFileSync(join(dir, 'run.txt'), marker);
        const r = spawnSync(
            process.execPath,
            [
                SCRIPT,
                `--changed=${join(dir, 'changed.txt')}`,
                `--build-graph=${join(dir, 'graph.json')}`,
                `--root=${REPO_ROOT}`,
                `--passed-marker=${join(dir, 'run.txt')}`,
            ],
            { encoding: 'utf8', env: { ...process.env, GITHUB_OUTPUT: output, GITHUB_STEP_SUMMARY: summary } },
        );
        expect(r.status).toBe(0);
        runCli.summary = readFileSync(summary, 'utf8');
        return readFileSync(output, 'utf8').trim();
    }

    it('writes integration=false when these changes already passed, even for a core change', () => {
        const graph = JSON.stringify(dryRun(['packages/MJCore', 'packages/MJAPI']));
        expect(runCli(['packages/MJCore/src/index.ts'], graph, 'https://example.test/runs/42\n')).toBe('integration=false');
        expect(runCli.summary).toContain('already passed the tier: https://example.test/runs/42');
    });

    it('applies the package rule when the pass record is empty', () => {
        const graph = JSON.stringify(dryRun(['packages/MJCore', 'packages/MJAPI']));
        expect(runCli(['packages/MJCore/src/index.ts'], graph, '')).toBe('integration=true');
    });

    it('fingerprint mode writes the merge commit fingerprint', () => {
        const r = prRepo();
        dir = r.dir;
        const expected = r.mergeRef();
        const output = join(dir, '..', `${dir.split('/').pop()}-out`);
        writeFileSync(output, '');
        try {
            const res = spawnSync(process.execPath, [SCRIPT, 'fingerprint'], {
                cwd: dir,
                encoding: 'utf8',
                env: { ...process.env, GITHUB_OUTPUT: output },
            });
            expect(res.status).toBe(0);
            expect(readFileSync(output, 'utf8')).toBe(`fingerprint=${expected}\n`);
        } finally {
            rmSync(output, { force: true });
        }
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
