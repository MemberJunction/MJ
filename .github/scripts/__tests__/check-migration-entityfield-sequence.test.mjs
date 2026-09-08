import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { scanContent, parseParenList } from '../check-migration-entityfield-sequence.mjs';
import { symlinkSync } from 'node:fs';

const SCRIPT = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'check-migration-entityfield-sequence.mjs');

describe('parseParenList', () => {
    it('splits on top-level commas only, honoring quotes, brackets, nesting and comments', () => {
        const text = `('a, (b)', [c, d], (1, 2), N'it''s', -- x, y\n 3 /* , */)`;
        const r = parseParenList(text, 0);
        expect(r.items).toEqual([`'a, (b)'`, `[c, d]`, `(1, 2)`, `N'it''s'`, `3`]);
        expect(r.end).toBe(text.length);
        expect(text.slice(r.offsets[4], r.offsets[4] + 1)).toBe('3');
    });
});

describe('scanContent', () => {
    it('flags a bare integer in the Sequence position and reports its line', () => {
        const sql = `INSERT INTO [__mj].[EntityField]\n([ID], [EntityID], [Sequence], [Name])\nVALUES\n(\n'a',\n'e',\n16,\n'Name'\n);`;
        expect(scanContent(sql)).toEqual([{ line: 7, value: '16', columnIndex: 2 }]);
    });

    it('attributes the hit to the line of the Sequence value, not to an earlier value sharing its digits', () => {
        const sql = `INSERT INTO [__mj].[EntityField]\n([ID], [EntityID], [Sequence])\nVALUES\n(\n'3c9ea97f-1616-0000-0000-000000000000',\n'e', -- Entity: X\n16\n);`;
        expect(scanContent(sql)).toEqual([{ line: 7, value: '16', columnIndex: 2 }]);
    });

    it('locates Sequence positionally, so an earlier quoted value with commas does not shift it', () => {
        const sql = `INSERT INTO [__mj].[EntityField] ([Description], [ID], [EntityID], [Sequence]) VALUES (N'x, (y), ''z''', 'id', 'eid', 7);`;
        expect(scanContent(sql).map((h) => h.value)).toEqual(['7']);
    });

    it('sees a literal hidden behind a comment', () => {
        const sql = `INSERT INTO [__mj].[EntityField] ([ID], [EntityID], [Sequence]) VALUES ('a', 'e', -- ordinal\n 16);`;
        expect(scanContent(sql).map((h) => h.value)).toEqual(['16']);
    });

    it('accepts the apply-time expression CodeGen emits', () => {
        const sql = `INSERT INTO [__mj].[EntityField] ([ID], [EntityID], [Sequence]) VALUES ('a', 'e', (SELECT COALESCE(MAX([Sequence]), 0) FROM [__mj].[EntityField] WHERE [EntityID] = 'e') + 20);`;
        expect(scanContent(sql)).toEqual([]);
    });

    it('ignores other tables, EntityFieldValue, and inserts without a Sequence column', () => {
        expect(scanContent(`INSERT INTO [__mj].[EntityFieldValue] ([ID], [Sequence]) VALUES ('a', 3);`)).toEqual([]);
        expect(scanContent(`INSERT INTO [__mj].[Other] ([ID], [Sequence]) VALUES ('a', 100025);`)).toEqual([]);
        expect(scanContent(`INSERT INTO [__mj].[EntityField] ([ID], [Name]) VALUES ('a', 'A');`)).toEqual([]);
    });

    it('checks every tuple of a multi-row VALUES', () => {
        const sql = `INSERT INTO "__mj"."EntityField" ("ID", "EntityID", "Sequence") VALUES ('a', 'e', (SELECT 1)), ('b', 'e', 5), ('c', 'e', 6);`;
        expect(scanContent(sql).map((h) => h.value)).toEqual(['5', '6']);
    });
});

describe('changed-files mode reports only lines the PR adds', () => {
    it('flags a literal in a NEW migration and ignores a legacy literal in an untouched region of an edited one', () => {
        const repo = mkdtempSync(join(tmpdir(), 'mj-seq-gate-'));
        const run = (args) => spawnSync('git', args, { cwd: repo, encoding: 'utf8' });
        run(['init', '-q']);
        run(['config', 'user.email', 't@t']); run(['config', 'user.name', 't']);
        mkdirSync(join(repo, 'migrations', 'v6'), { recursive: true });
        const legacy = join(repo, 'migrations', 'v6', 'V202601010000__v6.0.x__Legacy.sql');
        writeFileSync(legacy, `INSERT INTO [__mj].[EntityField] ([ID], [EntityID], [Sequence]) VALUES ('a', 'e', 100025);\n-- tail\n`);
        run(['add', '.']); run(['commit', '-q', '-m', 'base']);
        const base = run(['rev-parse', 'HEAD']).stdout.trim();
        // Edit the legacy file below its literal, and add a new migration with a literal.
        writeFileSync(legacy, `INSERT INTO [__mj].[EntityField] ([ID], [EntityID], [Sequence]) VALUES ('a', 'e', 100025);\n-- tail\n-- unrelated edit\n`);
        writeFileSync(join(repo, 'migrations', 'v6', 'V202609080000__v6.1.x__New.sql'),
            `INSERT INTO [__mj].[EntityField] ([ID], [EntityID], [Sequence]) VALUES ('b', 'e', 16);\n`);
        run(['add', '.']); run(['commit', '-q', '-m', 'change']);
        const r = spawnSync(process.execPath, [SCRIPT, base, 'HEAD'], { cwd: repo, encoding: 'utf8' });
        rmSync(repo, { recursive: true, force: true });
        expect(r.status, r.stdout + r.stderr).toBe(1);
        expect(r.stdout).toContain('V202609080000__v6.1.x__New.sql');
        expect(r.stdout).not.toContain('Legacy.sql');
    });
});

describe('--self-test', () => {
    it('passes', () => {
        const r = spawnSync(process.execPath, [SCRIPT, '--self-test'], { encoding: 'utf8' });
        expect(r.status, r.stdout + r.stderr).toBe(0);
        expect(r.stdout).toContain('all self-tests passed');
    });

    it('still runs when invoked through a symlinked path', () => {
        const dir = mkdtempSync(join(tmpdir(), 'mj-seq-link-'));
        const link = join(dir, 'gate.mjs');
        symlinkSync(SCRIPT, link);
        const r = spawnSync(process.execPath, [link, '--self-test'], { encoding: 'utf8' });
        rmSync(dir, { recursive: true, force: true });
        expect(r.status, r.stdout + r.stderr).toBe(0);
        expect(r.stdout).toContain('all self-tests passed');
    });
});
