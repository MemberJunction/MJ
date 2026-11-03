import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
    findSeeds,
    findConflicts,
    isBaselined,
    listMigrations,
    literalValue,
    loadBaseline,
    scanRepo,
    BASELINE_FILE,
} from '../check-migration-validator-seeds.mjs';

const ENTITY = 'DF238F34-2837-EF11-86D4-6045BDEE16E6';
const RECORD = '6C2142C1-E36C-4C94-AD23-78237FD6397A';

/** A CodeGen-shaped GeneratedCode seed, guarded as CodeGen guards it. */
function seed({ description = 'Must be zero or more.', code = 'public ValidateX() {}', source = '([X]>=(0))', record = RECORD } = {}) {
    const q = (s) => `'${s.replace(/'/g, "''")}'`;
    return `IF NOT EXISTS (SELECT 1 FROM [\${flyway:defaultSchema}].[GeneratedCode] WHERE [LinkedRecordPrimaryKey] = '${record}')
   BEGIN
      INSERT INTO [\${flyway:defaultSchema}].[GeneratedCode] ([ID], [CategoryID], [Source], [Code], [Description], [Name], [LinkedEntityID], [LinkedRecordPrimaryKey])
VALUES ('5dec5454-036d-45ca-a2a1-b096fe1a4e46', (SELECT [ID] FROM [\${flyway:defaultSchema}].[vwGeneratedCodeCategories] WHERE [Name]='CodeGen: Validators'), ${q(source)}, ${q(code)}, ${q(description)}, 'ValidateX', '${ENTITY}', '${record}')
   END;
`;
}

describe('literalValue', () => {
    it('reads plain and N-prefixed literals and unescapes doubled quotes', () => {
        expect(literalValue("'a'")).toBe('a');
        expect(literalValue(" N'it''s' ")).toBe("it's");
        expect(literalValue('GETUTCDATE()')).toBeNull();
    });
});

describe('findSeeds', () => {
    it('reads the key, the CHECK text and the compared columns, keeping commas inside literals', () => {
        const [s] = findSeeds(seed({ description: 'One, two (three)' }));
        expect(s.key).toBe(`${ENTITY}|${RECORD}`.toLowerCase());
        expect(s.check).toBe('([x]>=(0))');
        expect(s.values).toEqual({ Description: 'One, two (three)', Code: 'public ValidateX() {}' });
        expect(s.line).toBe(3);
    });

    it('ignores an insert in a comment and an insert without a linked record', () => {
        const sql = `-- INSERT INTO [__mj].[GeneratedCode] ([LinkedEntityID]) VALUES ('x')\nINSERT INTO [__mj].[GeneratedCode] ([Name]) VALUES ('n');`;
        expect(findSeeds(sql)).toEqual([]);
    });
});

describe('findConflicts', () => {
    it('passes the same key with the same text', () => {
        expect(findConflicts([{ file: 'a.sql', source: seed() }, { file: 'b.sql', source: seed() }])).toEqual([]);
    });

    it('fails the same key with different text, naming the file that applies and the one skipped', () => {
        const conflicts = findConflicts([
            { file: 'a.sql', source: seed() },
            { file: 'b.sql', source: seed({ description: 'Must be non-negative.' }) },
        ]);
        expect(conflicts).toHaveLength(1);
        expect(conflicts[0].applied.file).toBe('a.sql');
        expect(conflicts[0].skipped.file).toBe('b.sql');
        expect(conflicts[0].differing).toEqual(['Description']);
    });

    it('compares keys case-insensitively', () => {
        const conflicts = findConflicts([
            { file: 'a.sql', source: seed() },
            { file: 'b.sql', source: seed({ record: RECORD.toLowerCase(), code: 'public ValidateY() {}' }) },
        ]);
        expect(conflicts.map((c) => c.differing)).toEqual([['Code']]);
    });

    it('treats two CHECK constraints on one key (table-level validators) as different validators', () => {
        const conflicts = findConflicts([
            { file: 'a.sql', source: seed({ source: '([A]>(0))' }) },
            { file: 'b.sql', source: seed({ source: '([B]>(0))', description: 'Other rule.' }) },
        ]);
        expect(conflicts).toEqual([]);
    });
});

describe('baseline', () => {
    const conflict = {
        key: `${ENTITY}|${RECORD}`.toLowerCase(),
        applied: { file: 'migrations/v6/V1__a.sql', line: 1 },
        skipped: { file: 'migrations/v6/V2__b.sql', line: 1 },
        differing: ['Description'],
    };

    it('passes a baselined pair', () => {
        expect(isBaselined(conflict, [{ Key: `${ENTITY}|${RECORD}`, AppliedFile: 'V1__a.sql', SkippedFile: 'V2__b.sql', Reason: 'r' }])).toBe(true);
    });

    it('fails once the baseline entry is removed', () => {
        expect(isBaselined(conflict, [])).toBe(false);
    });

    it('the committed baseline names the released NativeToolCallCount pair', () => {
        const pairs = loadBaseline(BASELINE_FILE);
        expect(pairs.map((p) => p.SkippedFile)).toContain('V202609212241__v6.2.x__Feature_Pipelines.sql');
        expect(pairs.every((p) => typeof p.Reason === 'string' && p.Reason.length > 0)).toBe(true);
    });
});

describe('scanRepo', () => {
    let repo;
    const write = (dir, name, body) => {
        mkdirSync(join(repo, 'migrations', dir), { recursive: true });
        writeFileSync(join(repo, 'migrations', dir, name), body);
    };

    beforeEach(() => {
        repo = mkdtempSync(join(tmpdir(), 'mj-validator-seeds-'));
    });

    afterEach(() => {
        rmSync(repo, { recursive: true, force: true });
    });

    it('reads only versioned files after the newest baseline, across version folders', () => {
        write('v5', 'V202601010000__v5.1.x__Old_A.sql', seed());
        write('v5', 'V202601020000__v5.1.x__Old_B.sql', seed({ description: 'Old wording.' }));
        write('v5', 'B202602010000__v5.2.x__Baseline.sql', seed());
        write('v6', 'V202603010000__v6.0.x__New_A.sql', seed());
        write('v6', 'V202603020000__v6.0.x__New_B.sql', seed({ description: 'New wording.' }));
        const names = listMigrations(repo).map((f) => f.split('/').pop());
        expect(names).toEqual(['V202603010000__v6.0.x__New_A.sql', 'V202603020000__v6.0.x__New_B.sql']);
        const { unlisted } = scanRepo(repo, []);
        expect(unlisted).toHaveLength(1);
        expect(unlisted[0].skipped.file).toBe(join('migrations', 'v6', 'V202603020000__v6.0.x__New_B.sql'));
    });

    it('the repository passes with its committed baseline', () => {
        const root = join(import.meta.dirname ?? new URL('.', import.meta.url).pathname, '..', '..', '..');
        expect(scanRepo(root).unlisted).toEqual([]);
    });
});
