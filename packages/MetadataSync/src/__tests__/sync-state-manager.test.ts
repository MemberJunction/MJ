import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs-extra';
import path from 'path';
import os from 'os';
import { SyncStateManager } from '../lib/sync-state-manager';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'sync-state-test-'));
});

afterEach(async () => {
  await fs.remove(tmpDir);
});

const stateFilePath = () => path.join(tmpDir, '.mj-sync-state.json');

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('SyncStateManager', () => {
  // ----- first run / missing file ------------------------------------------

  it('loads gracefully when state file does not exist', async () => {
    const mgr = new SyncStateManager(tmpDir);
    await mgr.load(); // should not throw

    expect(mgr.getLastPullTimestamp('SomeEntity')).toBeUndefined();
    expect(mgr.getLastPushTimestamp('some/dir')).toBeUndefined();
    expect(mgr.hasFileChanged('foo.json', 'abc')).toBe(true);
  });

  // ----- save creates file -------------------------------------------------

  it('creates the state file on save', async () => {
    const mgr = new SyncStateManager(tmpDir);
    await mgr.load();
    await mgr.save();

    expect(await fs.pathExists(stateFilePath())).toBe(true);

    const data = await fs.readJson(stateFilePath());
    expect(data).toHaveProperty('pushTimestamps');
    expect(data).toHaveProperty('pullTimestamps');
    expect(data).toHaveProperty('fileChecksums');
  });

  // ----- pull timestamps ---------------------------------------------------

  it('get/set pull timestamps', async () => {
    const mgr = new SyncStateManager(tmpDir);
    await mgr.load();

    expect(mgr.getLastPullTimestamp('Users')).toBeUndefined();

    const ts = '2026-04-06T12:00:00.000Z';
    mgr.setLastPullTimestamp('Users', ts);
    expect(mgr.getLastPullTimestamp('Users')).toBe(ts);
  });

  // ----- push timestamps ---------------------------------------------------

  it('get/set push timestamps', async () => {
    const mgr = new SyncStateManager(tmpDir);
    await mgr.load();

    expect(mgr.getLastPushTimestamp('entities/users')).toBeUndefined();

    const ts = '2026-04-06T13:00:00.000Z';
    mgr.setLastPushTimestamp('entities/users', ts);
    expect(mgr.getLastPushTimestamp('entities/users')).toBe(ts);
  });

  // ----- file checksums ----------------------------------------------------

  it('hasFileChanged returns true when no stored checksum', () => {
    const mgr = new SyncStateManager(tmpDir);
    // no load — empty state
    expect(mgr.hasFileChanged('some/file.json', 'abc123')).toBe(true);
  });

  it('hasFileChanged returns false when checksum matches', async () => {
    const mgr = new SyncStateManager(tmpDir);
    await mgr.load();

    mgr.setFileChecksum('entities/users/data.json', 'deadbeef');
    expect(mgr.hasFileChanged('entities/users/data.json', 'deadbeef')).toBe(false);
  });

  it('hasFileChanged returns true when checksum differs', async () => {
    const mgr = new SyncStateManager(tmpDir);
    await mgr.load();

    mgr.setFileChecksum('entities/users/data.json', 'deadbeef');
    expect(mgr.hasFileChanged('entities/users/data.json', 'cafebabe')).toBe(true);
  });

  // ----- persistence across load/save cycles -------------------------------

  it('persists state across load/save cycles', async () => {
    const mgr1 = new SyncStateManager(tmpDir);
    await mgr1.load();

    mgr1.setLastPullTimestamp('Roles', '2026-01-01T00:00:00.000Z');
    mgr1.setLastPushTimestamp('roles-dir', '2026-02-01T00:00:00.000Z');
    mgr1.setFileChecksum('roles-dir/data.json', 'aabbcc');
    await mgr1.save();

    // New instance loading the same file
    const mgr2 = new SyncStateManager(tmpDir);
    await mgr2.load();

    expect(mgr2.getLastPullTimestamp('Roles')).toBe('2026-01-01T00:00:00.000Z');
    expect(mgr2.getLastPushTimestamp('roles-dir')).toBe('2026-02-01T00:00:00.000Z');
    expect(mgr2.hasFileChanged('roles-dir/data.json', 'aabbcc')).toBe(false);
    expect(mgr2.hasFileChanged('roles-dir/data.json', 'different')).toBe(true);
  });

  // ----- corrupt state file ------------------------------------------------

  it('handles corrupt state file gracefully', async () => {
    // Write garbage to the state file
    await fs.writeFile(stateFilePath(), '{{not valid json!!!');

    const mgr = new SyncStateManager(tmpDir);
    await mgr.load(); // should not throw

    // Should be empty state
    expect(mgr.getLastPullTimestamp('Users')).toBeUndefined();
    expect(mgr.getLastPushTimestamp('dir')).toBeUndefined();
    expect(mgr.hasFileChanged('x.json', 'y')).toBe(true);
  });

  it('handles partial/malformed state file gracefully', async () => {
    // Write a valid JSON file but with wrong shape
    await fs.writeJson(stateFilePath(), { pushTimestamps: 'not-an-object', extra: true });

    const mgr = new SyncStateManager(tmpDir);
    await mgr.load();

    // pushTimestamps should have been reset to empty since it's not an object
    expect(mgr.getLastPushTimestamp('dir')).toBeUndefined();
    // pullTimestamps and fileChecksums should be empty
    expect(mgr.getLastPullTimestamp('x')).toBeUndefined();
    expect(mgr.hasFileChanged('x.json', 'y')).toBe(true);
  });

  // ----- overwrite on save -------------------------------------------------

  it('save overwrites previous state completely', async () => {
    const mgr1 = new SyncStateManager(tmpDir);
    await mgr1.load();
    mgr1.setFileChecksum('a.json', 'aaa');
    mgr1.setFileChecksum('b.json', 'bbb');
    await mgr1.save();

    const mgr2 = new SyncStateManager(tmpDir);
    await mgr2.load();
    // Only set a new checksum — b.json should still be there from the loaded state
    mgr2.setFileChecksum('c.json', 'ccc');
    await mgr2.save();

    const mgr3 = new SyncStateManager(tmpDir);
    await mgr3.load();
    expect(mgr3.hasFileChanged('a.json', 'aaa')).toBe(false);
    expect(mgr3.hasFileChanged('b.json', 'bbb')).toBe(false);
    expect(mgr3.hasFileChanged('c.json', 'ccc')).toBe(false);
  });
});
