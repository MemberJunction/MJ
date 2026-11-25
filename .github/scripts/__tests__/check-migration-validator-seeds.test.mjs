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
    ENTITIES_ENTITY_ID,
} from '../check-migration-validator-seeds.mjs';

/** `MJ: Entity Fields`: a field validator links to it. */
const ENTITY = 'DF238F34-2837-EF11-86D4-6045BDEE16E6';
const RECORD = '6C2142C1-E36C-4C94-AD23-78237FD6397A';
/** `MJ: Entities`, upper-cased as migrations write it: a table-level validator links to it. */
const ENTITIES = ENTITIES_ENTITY_ID.toUpperCase();

/** A CodeGen-shaped GeneratedCode seed, guarded as CodeGen guards it. */
function seed({
    description = 'Must be zero or more.',
    code = 'public ValidateX() {}',
    source = '([X]>=(0))',
    record = RECORD,
    entity = ENTITY,
    name = 'ValidateX',
} = {}) {
    const q = (s) => `'${s.replace(/'/g, "''")}'`;
    return `IF NOT EXISTS (SELECT 1 FROM [\${flyway:defaultSchema}].[GeneratedCode] WHERE [LinkedRecordPrimaryKey] = '${record}')
   BEGIN
      INSERT INTO [\${flyway:defaultSchema}].[GeneratedCode] ([ID], [CategoryID], [Source], [Code], [Description], [Name], [LinkedEntityID], [LinkedRecordPrimaryKey])
VALUES ('5dec5454-036d-45ca-a2a1-b096fe1a4e46', (SELECT [ID] FROM [\${flyway:defaultSchema}].[vwGeneratedCodeCategories] WHERE [Name]='CodeGen: Validators'), ${q(source)}, ${q(code)}, ${q(description)}, ${q(name)}, '${entity}', '${record}')
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
    it('reads the key and the compared columns, keeping commas inside literals', () => {
        const [s] = findSeeds(seed({ description: 'One, two (three)' }));
        expect(s.key).toBe(`${ENTITY}|${RECORD}`.toLowerCase());
        expect(s.values).toEqual({ Description: 'One, two (three)', Code: 'public ValidateX() {}', Source: '([x]>=(0))' });
        expect(s.line).toBe(3);
    });

    it('adds the validator Name to the key of a table-level validator only, as CodeGen\'s guard does', () => {
        expect(findSeeds(seed({ entity: ENTITIES, name: 'ValidateAAfterB' }))[0].key).toBe(`${ENTITIES}|${RECORD}|validateaafterb`.toLowerCase());
        expect(findSeeds(seed({ name: 'ValidateAAfterB' }))[0].key).toBe(`${ENTITY}|${RECORD}`.toLowerCase());
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

    it('fails two seeds of one field generated from different CHECK text, since the guard ignores Source', () => {
        const conflicts = findConflicts([
            { file: 'a.sql', source: seed({ source: '[X] >= 0' }) },
            { file: 'b.sql', source: seed({ source: '([X]>=(0))' }) },
        ]);
        expect(conflicts.map((c) => c.differing)).toEqual([['Source']]);
    });

    it('passes CHECK text that differs only in runs of whitespace or case, and CRLF line endings', () => {
        const crlf = seed({ code: 'public ValidateX() {\n  return;\n}', source: '([X] >= (0))' });
        const conflicts = findConflicts([
            { file: 'a.sql', source: crlf },
            { file: 'b.sql', source: seed({ code: 'public ValidateX() {\r\n  return;\r\n}', source: '([x]  >=\n (0)) ' }) },
        ]);
        expect(conflicts).toEqual([]);
    });

    it('keys table-level validators by Name: different names never collide, the same name with different text fails', () => {
        const a = seed({ entity: ENTITIES, name: 'ValidateA', source: '([A]>(0))' });
        const b = seed({ entity: ENTITIES, name: 'ValidateB', source: '([B]>(0))', description: 'Other rule.' });
        expect(findConflicts([{ file: 'a.sql', source: a }, { file: 'b.sql', source: b }])).toEqual([]);
        const a2 = seed({ entity: ENTITIES, name: 'ValidateA', source: '([A]>(1))' });
        expect(findConflicts([{ file: 'a.sql', source: a }, { file: 'b.sql', source: a2 }]).map((c) => c.differing)).toEqual([['Source']]);
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

    it('fails a third seed under a baselined key: the entry covers only the pair it names', () => {
        write('v6', 'V202603010000__v6.0.x__A.sql', seed());
        write('v6', 'V202603020000__v6.0.x__B.sql', seed({ description: 'B wording.' }));
        write('v6', 'V202603030000__v6.0.x__C.sql', seed({ description: 'C wording.' }));
        const baseline = [{ Key: `${ENTITY}|${RECORD}`, AppliedFile: 'V202603010000__v6.0.x__A.sql', SkippedFile: 'V202603020000__v6.0.x__B.sql', Reason: 'r' }];
        const { all, unlisted } = scanRepo(repo, baseline);
        expect(all).toHaveLength(2);
        expect(unlisted.map((c) => c.skipped.file)).toEqual([join('migrations', 'v6', 'V202603030000__v6.0.x__C.sql')]);
    });

    it('the repository passes with its committed baseline', () => {
        const root = join(import.meta.dirname ?? new URL('.', import.meta.url).pathname, '..', '..', '..');
        expect(scanRepo(root).unlisted).toEqual([]);
    });
});
