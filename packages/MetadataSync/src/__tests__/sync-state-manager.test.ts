import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import path from 'path';
import crypto from 'crypto';
import fsReal from 'fs-extra';
import realOs from 'os';

// vi.hoisted() runs in the hoisted scope (before imports), so TMP_DIR is
// available when the vi.mock factory evaluates.
const { TMP_DIR } = vi.hoisted(() => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const _os = require('os');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const _fs = require('fs');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const _path = require('path');
  const dir = _fs.mkdtempSync(_path.join(_fs.realpathSync(_os.tmpdir()), 'mj-test-'));
  return { TMP_DIR: dir as string };
});

vi.mock('os', async (importOriginal) => {
  const actual = await importOriginal<typeof import('os')>();
  return {
    ...actual,
    default: {
      ...actual,
      homedir: () => TMP_DIR,
    },
    homedir: () => TMP_DIR,
  };
});

import { SyncStateManager } from '../lib/sync-state-manager';

describe('SyncStateManager', () => {
  const rootDir = '/fake/project/root';
  let mgr: SyncStateManager;

  beforeEach(() => {
    mgr = new SyncStateManager(rootDir);
  });

  afterEach(async () => {
    const stateDir = path.join(TMP_DIR, '.mj', 'sync-state');
    if (await fsReal.pathExists(stateDir)) {
      await fsReal.emptyDir(stateDir);
    }
  });

  // -- State file location ----------------------------------------------------

  it('state file path is derived from rootDir hash', async () => {
    const hash = crypto.createHash('sha256').update(rootDir).digest('hex').slice(0, 12);
    const expectedPath = path.join(TMP_DIR, '.mj', 'sync-state', `${hash}.json`);

    await mgr.save();
    expect(await fsReal.pathExists(expectedPath)).toBe(true);
  });

  it('different root directories produce different state files', async () => {
    const mgr1 = new SyncStateManager('/project/one');
    const mgr2 = new SyncStateManager('/project/two');

    await mgr1.save();
    await mgr2.save();

    const hash1 = crypto.createHash('sha256').update('/project/one').digest('hex').slice(0, 12);
    const hash2 = crypto.createHash('sha256').update('/project/two').digest('hex').slice(0, 12);

    expect(hash1).not.toBe(hash2);

    const stateDir = path.join(TMP_DIR, '.mj', 'sync-state');
    expect(await fsReal.pathExists(path.join(stateDir, `${hash1}.json`))).toBe(true);
    expect(await fsReal.pathExists(path.join(stateDir, `${hash2}.json`))).toBe(true);
  });

  // -- load() -----------------------------------------------------------------

  it('load() on first run (no file) initializes empty state', async () => {
    await mgr.load();

    expect(mgr.getLastPushTimestamp('anything')).toBeUndefined();
    expect(mgr.getLastPullTimestamp('anything')).toBeUndefined();
    expect(mgr.hasFileChanged('any/file', 'abc123')).toBe(true);
  });

  it('load() with corrupt file falls back to empty state', async () => {
    const hash = crypto.createHash('sha256').update(rootDir).digest('hex').slice(0, 12);
    const stateDir = path.join(TMP_DIR, '.mj', 'sync-state');
    await fsReal.ensureDir(stateDir);
    await fsReal.writeFile(path.join(stateDir, `${hash}.json`), 'NOT VALID JSON {{{');

    await mgr.load();

    expect(mgr.getLastPushTimestamp('anything')).toBeUndefined();
    expect(mgr.getLastPullTimestamp('anything')).toBeUndefined();
  });

  // -- Push timestamps --------------------------------------------------------

  it('push timestamp get/set round-trip', () => {
    const ts = '2026-01-15T10:00:00.000Z';
    mgr.setLastPushTimestamp('entities/Users', ts);

    expect(mgr.getLastPushTimestamp('entities/Users')).toBe(ts);
    expect(mgr.getLastPushTimestamp('entities/Roles')).toBeUndefined();
  });

  // -- Pull timestamps --------------------------------------------------------

  it('pull timestamp get/set round-trip', () => {
    const ts = '2026-01-15T12:00:00.000Z';
    mgr.setLastPullTimestamp('Users', ts);

    expect(mgr.getLastPullTimestamp('Users')).toBe(ts);
    expect(mgr.getLastPullTimestamp('Roles')).toBeUndefined();
  });

  // -- File checksums ---------------------------------------------------------

  it('hasFileChanged() returns true when no stored checksum', () => {
    expect(mgr.hasFileChanged('file.json', 'abc123')).toBe(true);
  });

  it('hasFileChanged() returns false when checksum matches', () => {
    mgr.setFileChecksum('file.json', 'abc123');
    expect(mgr.hasFileChanged('file.json', 'abc123')).toBe(false);
  });

  it('hasFileChanged() returns true when checksum differs', () => {
    mgr.setFileChecksum('file.json', 'abc123');
    expect(mgr.hasFileChanged('file.json', 'xyz789')).toBe(true);
  });

  it('setFileChecksum() + hasFileChanged() round-trip', () => {
    const checksum = 'sha256-deadbeef';
    mgr.setFileChecksum('entities/Users/admin.json', checksum);

    expect(mgr.hasFileChanged('entities/Users/admin.json', checksum)).toBe(false);
    expect(mgr.hasFileChanged('entities/Users/admin.json', 'different')).toBe(true);
  });

  // -- save() / load() persistence --------------------------------------------

  it('save() persists state, load() reads it back', async () => {
    mgr.setLastPushTimestamp('entities/Users', '2026-01-01T00:00:00Z');
    mgr.setLastPullTimestamp('Roles', '2026-02-01T00:00:00Z');
    mgr.setFileChecksum('file.json', 'checksum123');

    await mgr.save();

    const mgr2 = new SyncStateManager(rootDir);
    await mgr2.load();

    expect(mgr2.getLastPushTimestamp('entities/Users')).toBe('2026-01-01T00:00:00Z');
    expect(mgr2.getLastPullTimestamp('Roles')).toBe('2026-02-01T00:00:00Z');
    expect(mgr2.hasFileChanged('file.json', 'checksum123')).toBe(false);
  });

  // -- pruneStaleChecksums() --------------------------------------------------

  it('pruneStaleChecksums() removes entries for missing files', async () => {
    const baseDir = path.join(TMP_DIR, 'prune-test');
    await fsReal.ensureDir(baseDir);
    await fsReal.writeFile(path.join(baseDir, 'exists.json'), '{}');

    mgr.setFileChecksum('exists.json', 'aaa');
    mgr.setFileChecksum('gone.json', 'bbb');
    mgr.setFileChecksum('also-gone.json', 'ccc');

    const pruned = await mgr.pruneStaleChecksums(baseDir);

    expect(pruned).toBe(2);
    expect(mgr.hasFileChanged('exists.json', 'aaa')).toBe(false);
    expect(mgr.hasFileChanged('gone.json', 'bbb')).toBe(true);
    expect(mgr.hasFileChanged('also-gone.json', 'ccc')).toBe(true);
  });
});
