import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { stripSqlComments } from '../check-codegen-tail.mjs';
import { scanContent, parseParenList, addedLinesFromDiff, SELF_TEST_FIXTURES } from '../check-migration-entityfield-sequence.mjs';

const SCRIPT = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'check-migration-entityfield-sequence.mjs');

describe('parseParenList (on masked text)', () => {
    it('splits on top-level commas only, honoring brackets and nesting, and records item offsets', () => {
        const raw = `('a, (b)', [c, d], (1, 2), N'it''s', -- x, y\n 3 /* , */)`;
        const text = stripSqlComments(raw);
        const r = parseParenList(text, 0);
        // String literals are masked to spaces by stripSqlComments; brackets survive verbatim.
        expect(r.items).toEqual(['', '[c, d]', '(1, 2)', 'N', '3']);
        expect(r.end).toBe(text.length);
        expect(raw[r.offsets[4]]).toBe('3');
    });
});

describe('scanContent', () => {
    it.each(SELF_TEST_FIXTURES)('%s → %s', (_name, shouldFlag, sql) => {
        expect(scanContent(sql).length > 0).toBe(shouldFlag);
    });

    it('attributes the hit to the line of the Sequence value, not to an earlier value sharing its digits', () => {
        const sql = `INSERT INTO [__mj].[EntityField]\n([ID], [EntityID], [Sequence])\nVALUES\n(\n'3c9ea97f-1616-0000-0000-000000000000',\n'e', -- Entity: X\n16\n);`;
        expect(scanContent(sql)).toEqual([{ line: 7, value: '16', columnIndex: 2 }]);
    });

    it('reports every offending tuple of a multi-row VALUES', () => {
        const sql = `INSERT INTO "__mj"."EntityField" ("ID", "EntityID", "Sequence") VALUES ('a', 'e', (SELECT 1)), ('b', 'e', 5), ('c', 'e', 6);`;
        expect(scanContent(sql).map((h) => h.value)).toEqual(['5', '6']);
    });
});

describe('addedLinesFromDiff', () => {
    it('reads added line numbers off unified-diff hunk headers', () => {
        const diff = `diff --git a/x.sql b/x.sql\n--- a/x.sql\n+++ b/x.sql\n@@ -3,0 +4,2 @@\n+a\n+b\n@@ -10 +12 @@\n-old\n+new\n`;
        expect([...addedLinesFromDiff(diff)].sort((p, q) => p - q)).toEqual([4, 5, 12]);
    });
});

/** A throwaway git repository with a committed base; returns its path and the base commit. */
function makeRepo(prefix, files) {
    const repo = mkdtempSync(join(tmpdir(), prefix));
    const run = (args) => spawnSync('git', args, { cwd: repo, encoding: 'utf8' });
    run(['init', '-q']);
    run(['config', 'user.email', 't@t']); run(['config', 'user.name', 't']);
    for (const [rel, content] of Object.entries(files)) {
        mkdirSync(dirname(join(repo, rel)), { recursive: true });
        writeFileSync(join(repo, rel), content);
    }
    run(['add', '.']); run(['commit', '-q', '-m', 'base']);
    return { repo, run, base: run(['rev-parse', 'HEAD']).stdout.trim() };
}
const LITERAL = `INSERT INTO [__mj].[EntityField] ([ID], [EntityID], [Sequence]) VALUES ('a', 'e', 100025);\n`;

describe('changed-files mode', () => {
    it('reports a new migration, ignores a legacy literal in an untouched region of an edited one, and sees renames', () => {
        const { repo, run, base } = makeRepo('mj-seq-gate-', {
            'migrations/v6/V202601010000__v6.0.x__Legacy.sql': LITERAL + '-- tail\n',
            'migrations/v6/V202601020000__v6.0.x__Moved.sql': '-- nothing yet\n',
        });
        writeFileSync(join(repo, 'migrations/v6/V202601010000__v6.0.x__Legacy.sql'), LITERAL + '-- tail\n-- unrelated edit\n');
        writeFileSync(join(repo, 'migrations/v6/V202609080000__v6.1.x__New.sql'), `INSERT INTO [__mj].[EntityField] ([ID], [EntityID], [Sequence]) VALUES ('b', 'e', 16);\n`);
        // A timestamp bump is a rename; a literal appended to it must still be seen.
        run(['mv', 'migrations/v6/V202601020000__v6.0.x__Moved.sql', 'migrations/v6/V202609090000__v6.1.x__Moved.sql']);
        writeFileSync(join(repo, 'migrations/v6/V202609090000__v6.1.x__Moved.sql'), `-- nothing yet\nINSERT INTO [__mj].[EntityField] ([ID], [EntityID], [Sequence]) VALUES ('c', 'e', 7);\n`);
        run(['add', '-A']); run(['commit', '-q', '-m', 'change']);
        const r = spawnSync(process.execPath, [SCRIPT, base, 'HEAD'], { cwd: repo, encoding: 'utf8' });
        rmSync(repo, { recursive: true, force: true });
        expect(r.status, r.stdout + r.stderr).toBe(1);
        expect(r.stdout).toContain('New.sql');
        expect(r.stdout).toContain('Moved.sql');
        expect(r.stdout).not.toContain('Legacy.sql');
    });

    it('skips baselines and tests/ fixtures, which are literal by construction or never run', () => {
        const { repo, base } = makeRepo('mj-seq-gate-scope-', { 'README.md': 'x' });
        writeFileSync(join(repo, 'migrations/v7/B202701010000__v7.0__Baseline.sql'.replace('migrations/v7/', '')), ''); // placeholder to create nothing
        mkdirSync(join(repo, 'migrations/v7/tests'), { recursive: true });
        writeFileSync(join(repo, 'migrations/v7/B202701010000__v7.0__Baseline.sql'), LITERAL);
        writeFileSync(join(repo, 'migrations/v7/tests/fixture.sql'), LITERAL);
        const r = spawnSync(process.execPath, [SCRIPT], { cwd: repo, encoding: 'utf8', env: { ...process.env, BASE_REF: base } });
        rmSync(repo, { recursive: true, force: true });
        expect(r.status, r.stdout + r.stderr).toBe(0);
    });

    it('local form sees an untracked migration and works from a subdirectory', () => {
        const { repo, base } = makeRepo('mj-seq-gate-wt-', { 'README.md': 'x', 'packages/X/.keep': '' });
        // Not added, not committed — the state right after `cat CodeGen_Run_*.sql >> migration.sql`.
        writeFileSync(join(repo, 'migrations/v6/V202609080000__v6.1.x__Fresh.sql'.replace('migrations/v6/', '')), '');
        mkdirSync(join(repo, 'migrations/v6'), { recursive: true });
        writeFileSync(join(repo, 'migrations/v6/V202609080000__v6.1.x__Fresh.sql'), `INSERT INTO [__mj].[EntityField] ([ID], [EntityID], [Sequence]) VALUES ('b', 'e', 16);\n`);
        const r = spawnSync(process.execPath, [SCRIPT], { cwd: join(repo, 'packages', 'X'), encoding: 'utf8', env: { ...process.env, BASE_REF: base } });
        rmSync(repo, { recursive: true, force: true });
        expect(r.status, r.stdout + r.stderr).toBe(1);
        expect(r.stdout).toContain('Fresh.sql');
    });

    it('does not crash on a migration larger than the default child-process buffer', () => {
        const { repo, base } = makeRepo('mj-seq-gate-big-', { 'README.md': 'x' });
        mkdirSync(join(repo, 'migrations/v6'), { recursive: true });
        const big = ('-- ' + 'x'.repeat(200) + '\n').repeat(6000) + `INSERT INTO [__mj].[EntityField] ([ID], [EntityID], [Sequence]) VALUES ('b', 'e', 16);\n`;
        expect(big.length).toBeGreaterThan(1024 * 1024);
        writeFileSync(join(repo, 'migrations/v6/V202609080000__v6.1.x__Big.sql'), big);
        const r = spawnSync(process.execPath, [SCRIPT], { cwd: repo, encoding: 'utf8', env: { ...process.env, BASE_REF: base } });
        rmSync(repo, { recursive: true, force: true });
        expect(r.status, r.stdout + r.stderr).toBe(1);
        expect(r.stderr).not.toContain('ENOBUFS');
    });
});

describe('CLI', () => {
    it('--self-test passes, also when invoked through a symlinked path', () => {
        const dir = mkdtempSync(join(tmpdir(), 'mj-seq-link-'));
        const link = join(dir, 'gate.mjs');
        symlinkSync(SCRIPT, link);
        const r = spawnSync(process.execPath, [link, '--self-test'], { encoding: 'utf8' });
        rmSync(dir, { recursive: true, force: true });
        expect(r.status, r.stdout + r.stderr).toBe(0);
        expect(r.stdout).toContain('all self-tests passed');
    });
});
