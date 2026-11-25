import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { TruthSuite } from '../../truth-suite';

const root = TruthSuite.Root();
const migration = readFileSync(path.join(root, 'migrations', 'V202610130001__pstruth_tables.sql'), 'utf8');

describe('pstruth migration', () => {
  it('is exactly the DDL the generator prints (CodeGen runs at provision, so nothing is appended)', () => {
    const generated = execFileSync('node', [path.join(root, 'scripts', 'gen-pstruth-ddl.mjs')], { encoding: 'utf8' });
    expect(migration.trimEnd()).toBe(generated.trimEnd());
  });
  it('declares one table set per dataset', () => {
    for (const w of ['W1', 'W2', 'W3', 'W4', 'W5', 'W6', 'W7', 'W8']) {
      expect(migration).toContain(`CREATE TABLE pstruth.${w}_Person (`);
      expect(migration).toContain(`CREATE TABLE pstruth.${w}_MembershipYear (`);
    }
    expect(migration).toContain('CREATE TABLE pstruth.W9_EventRegistration (');
    for (const s of ['C2', 'C4', 'D1c', 'D1r', 'D2', 'N1c', 'N1r', 'R1', 'R2p', 'R3', 'T1p', 'T2p', 'T3', 'T3lag', 'T4']) {
      expect(migration).toContain(`CREATE TABLE pstruth.Scn_${s} (`);
    }
    for (const s of ['T1p', 'T3', 'T4']) {
      expect(migration).toContain(`CREATE TABLE pstruth.SeriesFrame_${s} (`);
      expect(migration).toContain(`CREATE TABLE pstruth.SeriesTrain_${s} (`);
    }
    for (const dropped of ['Scn_R2real', 'Scn_T1real', 'SeriesFrame_T1real', 'SeriesTrain_T1real', 'PersonYear']) {
      expect(migration).not.toContain(`CREATE TABLE pstruth.${dropped} (`);
    }
  });
  it('gives T4\'s tables the previous-month column LagTarget (D4-181)', () => {
    expect(migration).toContain('CREATE TABLE pstruth.Scn_T4 ([ID] UNIQUEIDENTIFIER NOT NULL PRIMARY KEY, [EntityKey] NVARCHAR(50) NULL, [T] DATE NULL, [LagTarget] FLOAT, [Target] FLOAT NULL, [TruthScore] FLOAT NULL);');
    for (const t of ['SeriesFrame_T4', 'SeriesTrain_T4']) expect(migration).toMatch(new RegExp(`CREATE TABLE pstruth\\.${t} \\([^;]*\\[LagTarget\\] FLOAT`));
  });
});
