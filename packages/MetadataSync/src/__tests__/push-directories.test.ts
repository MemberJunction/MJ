import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs-extra';
import os from 'os';
import path from 'path';
import type { UserInfo } from '@memberjunction/core';
import type { SyncConfig } from '../config';
import type { SyncEngine } from '../lib/sync-engine';
import { FindSyncRootDir, SelectPushDirectories } from '../lib/push-directories';
import { PushService } from '../services/PushService';

describe('push folder selection', () => {
  let root: string;

  beforeEach(async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), 'mj-push-dirs-'));
    await fs.writeJson(path.join(root, '.mj-sync.json'), { version: '1.0.0', directoryOrder: ['b', 'a'] });
  });

  afterEach(async () => {
    await fs.remove(root);
  });

  async function entityFolder(name: string, extra: Record<string, unknown> = {}): Promise<string> {
    const dir = path.join(root, name);
    await fs.ensureDir(dir);
    await fs.writeJson(path.join(dir, '.mj-sync.json'), { entity: `Entity ${name}`, ...extra });
    return dir;
  }

  describe('SelectPushDirectories', () => {
    it('returns the entity folders of the root in directoryOrder', async () => {
      const a = await entityFolder('a');
      const b = await entityFolder('b');

      const syncConfig: SyncConfig = { version: '1.0.0', directoryOrder: ['b', 'a'] };

      const result = SelectPushDirectories(root, false, syncConfig);

      expect(result).toEqual({ Included: [b, a], Skipped: [] });
    });

    it('returns one entity folder when --dir points at it', async () => {
      const a = await entityFolder('a');
      await entityFolder('b');

      expect(SelectPushDirectories(a, true, null).Included).toEqual([a]);
    });

    it('treats --dir pointing at the root like no --dir', async () => {
      const a = await entityFolder('a');
      const b = await entityFolder('b');

      expect(SelectPushDirectories(root, true, null).Included).toEqual([b, a]);
    });

    it('skips a folder whose pushWhen variable is not true', async () => {
      const a = await entityFolder('a');
      const b = await entityFolder('b', { pushWhen: '@env:MJ_DIRS_GATE' });

      const result = SelectPushDirectories(root, false, null, undefined, undefined, { MJ_DIRS_GATE: 'no' });

      expect(result.Included).toEqual([a]);
      expect(result.Skipped).toEqual([{ Directory: b, Reason: 'MJ_DIRS_GATE is not true' }]);
    });

    it('returns no folders, without throwing, when pushWhen skips every folder', async () => {
      await entityFolder('a', { pushWhen: '@env:MJ_DIRS_GATE' });

      expect(SelectPushDirectories(root, false, null, undefined, undefined, {}).Included).toEqual([]);
    });

    it('throws when there is no entity folder at all', () => {
      expect(() => SelectPushDirectories(root, false, null)).toThrow('No entity directories found');
    });
  });

  describe('FindSyncRootDir', () => {
    it('returns the parent root for an entity folder', async () => {
      const a = await entityFolder('a');

      expect(FindSyncRootDir(a)).toBe(root);
    });

    it('returns the root for an entity folder inside another entity folder', async () => {
      const a = await entityFolder('a');
      const runtime = path.join(a, 'runtime');
      await fs.ensureDir(runtime);
      await fs.writeJson(path.join(runtime, '.mj-sync.json'), { entity: 'Entity runtime' });

      expect(FindSyncRootDir(runtime)).toBe(root);
    });

    it('returns the folder itself when a parent folder has no config', async () => {
      const e = path.join(root, 'group', 'e');
      await fs.ensureDir(e);
      await fs.writeJson(path.join(e, '.mj-sync.json'), { entity: 'Entity e' });

      expect(FindSyncRootDir(e)).toBe(e);
    });

    it('returns the folder itself when it is a root', () => {
      expect(FindSyncRootDir(root)).toBe(root);
    });

    it('returns the folder itself when no parent has a root config', async () => {
      const lone = await fs.mkdtemp(path.join(os.tmpdir(), 'mj-push-lone-'));
      await fs.writeJson(path.join(lone, '.mj-sync.json'), { entity: 'Lone' });
      try {
        expect(FindSyncRootDir(lone)).toBe(lone);
      } finally {
        await fs.remove(lone);
      }
    });
  });

  describe('PushService.Push', () => {
    it('finishes with zero counts when pushWhen skips every folder', async () => {
      const a = await entityFolder('a', { pushWhen: '@env:MJ_DIRS_UNSET_GATE' });
      const syncEngine = { setMetadataEngine: () => undefined, getProvider: () => undefined } as unknown as SyncEngine;
      const service = new PushService(syncEngine, {} as UserInfo);
      const logs: string[] = [];

      const result = await service.Push({ dir: root, dryRun: true }, { onLog: (message) => logs.push(message) });

      expect(result).toMatchObject({ created: 0, updated: 0, unchanged: 0, deleted: 0, skipped: 0, errors: 0 });
      expect(result.SkippedDirectories).toEqual([{ Directory: a, Reason: 'MJ_DIRS_UNSET_GATE is not set' }]);
      expect(logs).toContain('⏭️  Skipped folder a: MJ_DIRS_UNSET_GATE is not set');
    });
  });
});
