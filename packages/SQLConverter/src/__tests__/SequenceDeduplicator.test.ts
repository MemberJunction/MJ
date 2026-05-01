import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { deduplicateEntityFieldSequences } from '../rules/SequenceDeduplicator.js';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

/** Helper: create a minimal PG migration file with EntityField INSERTs */
function makeEntityFieldInsert(entityId: string, sequence: number, fieldName: string): string {
  return `DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '00000000-0000-0000-0000-000000000001'
    ) THEN
        INSERT INTO __mj."EntityField"
        (
        "ID",
        "EntityID",
        "Sequence",
        "Name",
        "DisplayName",
        "Description",
        "Type",
        "Length",
        "Precision",
        "Scale",
        "AllowsNull",
        "DefaultValue",
        "AutoIncrement",
        "AllowUpdateAPI",
        "IsVirtual",
        "RelatedEntityID",
        "RelatedEntityFieldName",
        "IsNameField",
        "IncludeInUserSearchAPI",
        "IncludeRelatedEntityNameFieldInBaseView",
        "DefaultInView",
        "IsPrimaryKey",
        "IsUnique",
        "RelatedEntityDisplayType",
        "__mj_CreatedAt",
        "__mj_UpdatedAt"
        )
        VALUES
        (
        '00000000-0000-0000-0000-000000000001',
        '${entityId}',
        ${sequence},
        '${fieldName}',
        '${fieldName}',
        NULL,
        'UUID',
        16,
        0,
        0,
        0,
        '',
        0,
        1,
        0,
        NULL,
        NULL,
        0,
        0,
        0,
        0,
        0,
        0,
        'Search',
        NOW(),
        NOW()
        )
    END IF;
END $$;
`;
}

describe('SequenceDeduplicator', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'seq-dedup-test-'));
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('should detect no collisions when sequences are unique', () => {
    writeFileSync(join(tmpDir, 'V001__file1.pg.sql'),
      makeEntityFieldInsert('AAA', 100001, 'Field1'));
    writeFileSync(join(tmpDir, 'V002__file2.pg.sql'),
      makeEntityFieldInsert('AAA', 100002, 'Field2'));

    const result = deduplicateEntityFieldSequences(tmpDir, true);
    expect(result.totalCollisions).toBe(0);
    expect(result.fixes).toHaveLength(0);
    expect(result.totalInserts).toBe(2);
    expect(result.filesScanned).toBe(2);
  });

  it('should detect collision when two files insert same (EntityID, Sequence)', () => {
    writeFileSync(join(tmpDir, 'V001__file1.pg.sql'),
      makeEntityFieldInsert('AAA', 100048, 'Field1'));
    writeFileSync(join(tmpDir, 'V002__file2.pg.sql'),
      makeEntityFieldInsert('AAA', 100048, 'Field2'));

    const result = deduplicateEntityFieldSequences(tmpDir, true);
    expect(result.totalCollisions).toBe(1);
    expect(result.fixes).toHaveLength(1);
    expect(result.fixes[0].originalSequence).toBe(100048);
    expect(result.fixes[0].newSequence).toBe(100049);
    expect(result.fixes[0].file).toContain('V002');
  });

  it('should NOT detect collision when same sequence is on different entities', () => {
    writeFileSync(join(tmpDir, 'V001__file1.pg.sql'),
      makeEntityFieldInsert('AAA', 100048, 'Field1'));
    writeFileSync(join(tmpDir, 'V002__file2.pg.sql'),
      makeEntityFieldInsert('BBB', 100048, 'Field2'));

    const result = deduplicateEntityFieldSequences(tmpDir, true);
    expect(result.totalCollisions).toBe(0);
  });

  it('should handle multiple collisions on same entity across files', () => {
    // File1 takes 100048, 100049, 100050
    const file1 =
      makeEntityFieldInsert('AAA', 100048, 'F1') +
      makeEntityFieldInsert('AAA', 100049, 'F2') +
      makeEntityFieldInsert('AAA', 100050, 'F3');
    // File2 also tries 100048
    const file2 = makeEntityFieldInsert('AAA', 100048, 'F4');

    writeFileSync(join(tmpDir, 'V001__file1.pg.sql'), file1);
    writeFileSync(join(tmpDir, 'V002__file2.pg.sql'), file2);

    const result = deduplicateEntityFieldSequences(tmpDir, true);
    expect(result.totalCollisions).toBe(1);
    expect(result.fixes[0].newSequence).toBe(100051); // next after 100050
  });

  it('should apply fixes to files when not in dry-run mode', () => {
    writeFileSync(join(tmpDir, 'V001__file1.pg.sql'),
      makeEntityFieldInsert('AAA', 100048, 'Field1'));
    writeFileSync(join(tmpDir, 'V002__file2.pg.sql'),
      makeEntityFieldInsert('AAA', 100048, 'Field2'));

    // Apply
    const result = deduplicateEntityFieldSequences(tmpDir, false);
    expect(result.totalCollisions).toBe(1);

    // Verify file was modified
    const content = readFileSync(join(tmpDir, 'V002__file2.pg.sql'), 'utf-8');
    expect(content).toContain('100049');
    expect(content).toContain('auto-bumped from 100048');
    expect(content).not.toMatch(/^        100048,$/m);
  });

  it('should leave file untouched in dry-run mode', () => {
    const originalContent = makeEntityFieldInsert('AAA', 100048, 'Field2');
    writeFileSync(join(tmpDir, 'V001__file1.pg.sql'),
      makeEntityFieldInsert('AAA', 100048, 'Field1'));
    writeFileSync(join(tmpDir, 'V002__file2.pg.sql'), originalContent);

    deduplicateEntityFieldSequences(tmpDir, true);

    const content = readFileSync(join(tmpDir, 'V002__file2.pg.sql'), 'utf-8');
    expect(content).toBe(originalContent);
  });

  it('should produce zero collisions on second run after fix', () => {
    writeFileSync(join(tmpDir, 'V001__file1.pg.sql'),
      makeEntityFieldInsert('AAA', 100048, 'Field1'));
    writeFileSync(join(tmpDir, 'V002__file2.pg.sql'),
      makeEntityFieldInsert('AAA', 100048, 'Field2'));

    // First run: fix
    deduplicateEntityFieldSequences(tmpDir, false);

    // Second run: verify clean
    const result = deduplicateEntityFieldSequences(tmpDir, true);
    expect(result.totalCollisions).toBe(0);
  });

  it('should handle EntityID comparison case-insensitively', () => {
    writeFileSync(join(tmpDir, 'V001__file1.pg.sql'),
      makeEntityFieldInsert('F3C49FE2-B5D9-40D4-8562-6596261772A0', 100048, 'Field1'));
    writeFileSync(join(tmpDir, 'V002__file2.pg.sql'),
      makeEntityFieldInsert('f3c49fe2-b5d9-40d4-8562-6596261772a0', 100048, 'Field2'));

    const result = deduplicateEntityFieldSequences(tmpDir, true);
    expect(result.totalCollisions).toBe(1);
  });

  it('should process files in sorted order (earlier file wins)', () => {
    writeFileSync(join(tmpDir, 'V002__later.pg.sql'),
      makeEntityFieldInsert('AAA', 100048, 'LaterField'));
    writeFileSync(join(tmpDir, 'V001__earlier.pg.sql'),
      makeEntityFieldInsert('AAA', 100048, 'EarlierField'));

    const result = deduplicateEntityFieldSequences(tmpDir, true);
    expect(result.totalCollisions).toBe(1);
    // Later file (V002) should be the one bumped
    expect(result.fixes[0].file).toContain('V002');
  });
});
