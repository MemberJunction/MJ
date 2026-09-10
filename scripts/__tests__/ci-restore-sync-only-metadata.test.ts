import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { stripSync, isSyncOnlyChange, restoreSyncOnlyMetadata } from '../ci-restore-sync-only-metadata.mjs';

/**
 * The drift gate's contract, stated as tests: the setup push's `sync` write-back may be
 * discarded, and NOTHING else may be. The minted-primaryKey case is the one that matters —
 * an earlier version of this script reverted metadata/ wholesale and would have let a record
 * with no hand-run `uuidgen` ID (metadata/CLAUDE.md rule 1) merge green.
 */
describe('ci-restore-sync-only-metadata', () => {
  let repo: string;

  const git = (...args: string[]) => execFileSync('git', args, { cwd: repo, encoding: 'utf8' });
  const metadataFile = () => path.join(repo, 'metadata/ai-models/.ai-models.json');
  const write = (obj: unknown) => fs.writeFileSync(metadataFile(), JSON.stringify(obj, null, 2));

  /** What the drift step itself runs, so the tests assert on the real gate condition. */
  const gateIsClean = () =>
    git('status', '--porcelain', '--', 'packages/', 'metadata/', 'migrations/').trim() === '';

  const RECORD = { fields: { Name: 'X' }, primaryKey: { ID: 'AAAA-1111' }, sync: { checksum: 'old' } };

  beforeEach(() => {
    repo = fs.mkdtempSync(path.join(os.tmpdir(), 'mj-restore-sync-'));
    fs.mkdirSync(path.join(repo, 'metadata/ai-models'), { recursive: true });
    fs.mkdirSync(path.join(repo, 'packages'), { recursive: true });
    git('init', '-q', '.');
    git('config', 'user.email', 'test@test');
    git('config', 'user.name', 'test');
    write([RECORD]);
    fs.writeFileSync(path.join(repo, 'packages/generated.ts'), 'gen\n');
    git('add', '-A');
    git('commit', '-qm', 'base');
  });

  afterEach(() => fs.rmSync(repo, { recursive: true, force: true }));

  describe('stripSync', () => {
    it('drops sync keys at every depth and leaves everything else', () => {
      expect(stripSync({ a: 1, sync: { x: 1 }, nested: [{ sync: {}, keep: 2 }] })).toEqual({
        a: 1,
        nested: [{ keep: 2 }],
      });
    });
  });

  describe('isSyncOnlyChange', () => {
    it('is true when only the sync block moved', () => {
      expect(isSyncOnlyChange('{"a":1,"sync":{"c":"new"}}', '{"a":1,"sync":{"c":"old"}}')).toBe(true);
    });

    it('is false when a real field moved', () => {
      expect(isSyncOnlyChange('{"a":2,"sync":{"c":"new"}}', '{"a":1,"sync":{"c":"old"}}')).toBe(false);
    });

    it('throws rather than guessing when a side is unparseable', () => {
      expect(() => isSyncOnlyChange('NOT JSON {{{', '{"a":1}')).toThrow();
    });
  });

  it('restores a file whose only delta is refreshed sync blocks, and the gate goes clean', () => {
    write([{ ...RECORD, sync: { checksum: 'NEW' } }]);
    expect(gateIsClean()).toBe(false);

    const { restored, kept } = restoreSyncOnlyMetadata({ cwd: repo });

    expect(restored).toEqual(['metadata/ai-models/.ai-models.json']);
    expect(kept).toEqual([]);
    expect(gateIsClean()).toBe(true);
  });

  it('does NOT restore a minted primaryKey — the rule-1 violation still reds the gate', () => {
    write([
      { ...RECORD, sync: { checksum: 'NEW' } },
      // A record pushed without a primaryKey; the DB minted one and sync push wrote it back.
      { fields: { Name: 'BrandNew' }, primaryKey: { ID: 'RANDOM-MINTED-9999' }, sync: { checksum: 'NEW' } },
    ]);

    const { restored, kept } = restoreSyncOnlyMetadata({ cwd: repo });

    expect(restored).toEqual([]);
    expect(kept).toHaveLength(1);
    expect(kept[0].reason).toBe('differs beyond sync blocks');
    expect(gateIsClean()).toBe(false);
  });

  it('does NOT restore a real field mutation hiding behind sync churn', () => {
    write([{ ...RECORD, fields: { Name: 'RENAMED' }, sync: { checksum: 'NEW' } }]);

    const { restored, kept } = restoreSyncOnlyMetadata({ cwd: repo });

    expect(restored).toEqual([]);
    expect(kept[0].reason).toBe('differs beyond sync blocks');
    expect(gateIsClean()).toBe(false);
  });

  it('never silently reverts a file it cannot parse', () => {
    fs.writeFileSync(metadataFile(), 'NOT JSON {{{');

    const { restored, kept } = restoreSyncOnlyMetadata({ cwd: repo });

    expect(restored).toEqual([]);
    expect(kept[0].reason).toMatch(/could not compare/);
    expect(gateIsClean()).toBe(false);
  });

  it('leaves a new untracked metadata file for the gate to catch', () => {
    fs.mkdirSync(path.join(repo, 'metadata/entities/decisions'), { recursive: true });
    fs.writeFileSync(path.join(repo, 'metadata/entities/decisions/d.json'), '{}');

    const { restored } = restoreSyncOnlyMetadata({ cwd: repo });

    expect(restored).toEqual([]);
    expect(gateIsClean()).toBe(false);
  });

  it('does not touch drift outside metadata/', () => {
    fs.writeFileSync(path.join(repo, 'packages/generated.ts'), 'gen-CHANGED\n');

    const { restored } = restoreSyncOnlyMetadata({ cwd: repo });

    expect(restored).toEqual([]);
    expect(gateIsClean()).toBe(false);
  });
});
