import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { TruthSuite } from '../../registry/load';

const root = TruthSuite.Root();
const migration = readFileSync(path.join(root, 'migrations', 'V202610130001__pstruth_tables.sql'), 'utf8');
const marker = '-- CODEGEN OUTPUT BELOW';

describe('pstruth migration', () => {
  it('starts with exactly the DDL the generator prints', () => {
    const generated = execFileSync('node', [path.join(root, 'scripts', 'gen-pstruth-ddl.mjs')], { encoding: 'utf8' });
    const handWritten = migration.includes(marker) ? migration.slice(0, migration.indexOf(marker)).trimEnd() : migration.trimEnd();
    expect(handWritten).toBe(generated.trimEnd());
  });
  it('declares one table set per dataset', () => {
    for (const w of ['W1', 'W2', 'W3', 'W4', 'W5', 'W6', 'W7', 'W8']) {
      expect(migration).toContain(`CREATE TABLE pstruth.${w}_Person (`);
      expect(migration).toContain(`CREATE TABLE pstruth.${w}_MembershipYear (`);
    }
    expect(migration).toContain('CREATE TABLE pstruth.W9_EventRegistration (');
    for (const s of ['C2', 'C4', 'D1c', 'D1r', 'D2', 'N1c', 'N1r', 'R1', 'R2p', 'R3', 'T1p', 'T2p', 'T3', 'T3lag', 'T4', 'R2real', 'T1real']) {
      expect(migration).toContain(`CREATE TABLE pstruth.Scn_${s} (`);
    }
    for (const s of ['T1p', 'T3', 'T4', 'T1real']) {
      expect(migration).toContain(`CREATE TABLE pstruth.SeriesFrame_${s} (`);
      expect(migration).toContain(`CREATE TABLE pstruth.SeriesTrain_${s} (`);
    }
    expect(migration).toContain('CREATE TABLE pstruth.PersonYear (');
  });
  it('computes every appended EntityField Sequence at apply time', () => {
    const codegen = migration.includes(marker) ? migration.slice(migration.indexOf(marker)) : '';
    const inserts = codegen.split(/\n(?=INSERT INTO|IF NOT EXISTS)/).filter((b) => /EntityField\]?\s*\(/.test(b) && /\bSequence\b/.test(b));
    for (const block of inserts) {
      expect(block).toMatch(/SELECT COALESCE\(MAX\(\[Sequence\]\), 0\) \+ 1 FROM \[[^\]]+\]\.\[EntityField\]/);
    }
  });
});
