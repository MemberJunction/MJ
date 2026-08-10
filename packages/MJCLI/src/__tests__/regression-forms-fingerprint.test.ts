import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  computeFormsFingerprint,
  formsFingerprintStatus,
  readFormsFingerprint,
  writeFormsFingerprint,
  GENERATED_FORMS_DIR,
} from '../lib/regression/docker-helpers.js';

/** Lay down the three schema inputs the fingerprint hashes. */
function makeSchemaFixture(
  root: string,
  opts: { migration?: string; demo?: string; version?: string } = {},
): void {
  mkdirSync(path.join(root, 'migrations'), { recursive: true });
  writeFileSync(path.join(root, 'migrations', 'V1__init.sql'), opts.migration ?? 'CREATE TABLE X (ID INT);');
  mkdirSync(path.join(root, 'Demos', 'AssociationDB'), { recursive: true });
  writeFileSync(path.join(root, 'Demos', 'AssociationDB', 'seed.sql'), opts.demo ?? 'INSERT INTO X VALUES (1);');
  writeFileSync(path.join(root, 'package.json'), JSON.stringify({ version: opts.version ?? '5.48.0' }));
}

describe('computeFormsFingerprint', () => {
  let root: string;

  beforeEach(() => {
    root = mkdtempSync(path.join(tmpdir(), 'mj-fp-'));
    makeSchemaFixture(root);
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it('is a stable 16-char hex hash and deterministic for identical inputs', () => {
    const a = computeFormsFingerprint(root);
    const b = computeFormsFingerprint(root);
    expect(a).toBe(b);
    expect(a).toMatch(/^[0-9a-f]{16}$/);
  });

  it('changes when a migration file changes', () => {
    const before = computeFormsFingerprint(root);
    writeFileSync(path.join(root, 'migrations', 'V2__add.sql'), 'ALTER TABLE X ADD Y INT;');
    expect(computeFormsFingerprint(root)).not.toBe(before);
  });

  it('changes when AssociationDB content changes', () => {
    const before = computeFormsFingerprint(root);
    writeFileSync(path.join(root, 'Demos', 'AssociationDB', 'seed.sql'), 'INSERT INTO X VALUES (2);');
    expect(computeFormsFingerprint(root)).not.toBe(before);
  });

  it('changes when the MJ build version changes (CodeGen-behavior proxy)', () => {
    const before = computeFormsFingerprint(root);
    writeFileSync(path.join(root, 'package.json'), JSON.stringify({ version: '5.49.0' }));
    expect(computeFormsFingerprint(root)).not.toBe(before);
  });

  it('ignores files whose extension is not a hashed input type', () => {
    const before = computeFormsFingerprint(root);
    writeFileSync(path.join(root, 'migrations', 'notes.txt'), 'not a schema input');
    expect(computeFormsFingerprint(root)).toBe(before);
  });

  it('is independent of file-creation order (path-sorted walk)', () => {
    // Two roots with the same files written in opposite order must hash equal.
    const other = mkdtempSync(path.join(tmpdir(), 'mj-fp-'));
    try {
      mkdirSync(path.join(other, 'migrations'), { recursive: true });
      writeFileSync(path.join(other, 'migrations', 'V2__add.sql'), 'ALTER TABLE X ADD Y INT;');
      writeFileSync(path.join(other, 'migrations', 'V1__init.sql'), 'CREATE TABLE X (ID INT);');
      mkdirSync(path.join(other, 'Demos', 'AssociationDB'), { recursive: true });
      writeFileSync(path.join(other, 'Demos', 'AssociationDB', 'seed.sql'), 'INSERT INTO X VALUES (1);');
      writeFileSync(path.join(other, 'package.json'), JSON.stringify({ version: '5.48.0' }));
      // Match `root` by adding V2 there too.
      writeFileSync(path.join(root, 'migrations', 'V2__add.sql'), 'ALTER TABLE X ADD Y INT;');
      expect(computeFormsFingerprint(other)).toBe(computeFormsFingerprint(root));
    } finally {
      rmSync(other, { recursive: true, force: true });
    }
  });
});

describe('formsFingerprintStatus + read/write (cwd-relative)', () => {
  let root: string;
  let origCwd: string;

  beforeEach(() => {
    origCwd = process.cwd();
    root = mkdtempSync(path.join(tmpdir(), 'mj-fp-cwd-'));
    makeSchemaFixture(root);
    process.chdir(root);
  });

  afterEach(() => {
    process.chdir(origCwd);
    rmSync(root, { recursive: true, force: true });
  });

  it('reports not-fresh with a "missing" reason when the forms dir is absent', () => {
    const s = formsFingerprintStatus();
    expect(s.fresh).toBe(false);
    expect(s.reason).toContain('missing');
    expect(s.recorded).toBeNull();
  });

  it('reports not-fresh with a "no fingerprint" reason when forms exist but are unstamped', () => {
    mkdirSync(path.resolve(GENERATED_FORMS_DIR), { recursive: true });
    const s = formsFingerprintStatus();
    expect(s.fresh).toBe(false);
    expect(s.reason).toContain('no fingerprint');
  });

  it('round-trips write/read and reports fresh when the fingerprint matches', () => {
    mkdirSync(path.resolve(GENERATED_FORMS_DIR), { recursive: true });
    const current = computeFormsFingerprint();
    writeFormsFingerprint(current);
    expect(readFormsFingerprint()).toBe(current);
    const s = formsFingerprintStatus();
    expect(s.fresh).toBe(true);
    expect(s.reason).toBe('');
  });

  it('reports not-fresh with a "stale" reason (and both hashes) on a fingerprint mismatch', () => {
    mkdirSync(path.resolve(GENERATED_FORMS_DIR), { recursive: true });
    writeFormsFingerprint('deadbeefdeadbeef');
    const s = formsFingerprintStatus();
    expect(s.fresh).toBe(false);
    expect(s.reason).toContain('stale');
    expect(s.recorded).toBe('deadbeefdeadbeef');
    expect(s.reason).toContain(s.current);
  });
});
