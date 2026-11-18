import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs-extra';
import os from 'os';
import path from 'path';
import type { UserInfo } from '@memberjunction/core';
import type { EntityConfig } from '../config';
import { SyncEngine, type RecordData } from '../lib/sync-engine';
import { RecordProcessor } from '../lib/RecordProcessor';
import { PushService } from '../services/PushService';

/**
 * #4530: the checksum pull writes into a record's `sync` block must equal the checksum
 * push computes for that same record, or the first push after a pull marks every record
 * dirty and rewrites it.
 */
describe('pull/push sync checksum parity (#4530)', () => {
  const entityDir = '/dummy';
  const entityConfig: EntityConfig = { entity: 'MJ: Resource Types', filePattern: '**/.*.json' };
  let syncEngine: SyncEngine;
  let processor: RecordProcessor;
  let pushService: PushService;

  beforeEach(() => {
    const user = {} as UserInfo;
    syncEngine = new SyncEngine(user);
    processor = new RecordProcessor(syncEngine, user);
    pushService = new PushService(syncEngine, user);
  });

  /** Runs pull's sync-metadata step over the record's parts, as ProcessRecord does. */
  async function pullSync(record: RecordData, existing?: RecordData) {
    return processor['calculateSyncMetadata'](
      record.fields,
      entityDir,
      entityConfig,
      existing,
      false,
      record.collections,
      record.embeds,
      record.extension
    );
  }

  /** Runs push's checksum over the record as it reads it back from disk. */
  async function pushChecksum(record: RecordData): Promise<string> {
    const payload = pushService['buildRecordChecksumPayload'](record, { ...record.fields });
    return syncEngine.CalculateChecksumWithFileContent(payload, entityDir);
  }

  it('matches for a record with no composition axes', async () => {
    const record: RecordData = {
      fields: { Name: 'Custom', DisplayName: 'Custom Resource', Icon: 'fa-solid fa-cube', SkipEmbeddings: false },
      primaryKey: { ID: 'DB542786-AA10-431B-85B0-7B08CFD5B968' },
    };

    const pulled = await pullSync(record);

    expect(await pushChecksum({ ...record, sync: pulled })).toBe(pulled.checksum);
  });

  it('matches for a record with collections, embeds and extension', async () => {
    const record: RecordData = {
      fields: { Name: 'Order 1', Status: 'Open' },
      primaryKey: { ID: 'ord-1' },
      collections: { Lines: [{ fields: { Quantity: 2 }, primaryKey: { ID: 'line-1' } }] },
      embeds: { ShipToAddressID: { fields: { City: 'Springfield' } } },
      extension: { entity: 'Event Orders', fields: { EventDate: '2026-09-08' } },
    };

    const pulled = await pullSync(record);

    expect(await pushChecksum({ ...record, sync: pulled })).toBe(pulled.checksum);
  });

  it('treats empty composition axes as absent on both sides', async () => {
    const fields = { Name: 'Custom' };
    const withEmptyAxes: RecordData = { fields, collections: {}, embeds: {}, extension: {} as RecordData['extension'] };

    const pulled = await pullSync(withEmptyAxes);

    expect(await pushChecksum({ ...withEmptyAxes, sync: pulled })).toBe(pulled.checksum);
    expect(await pushChecksum({ fields, sync: pulled })).toBe(pulled.checksum);
  });

  describe('records with @file references', () => {
    let fileDir: string;

    beforeEach(async () => {
      fileDir = await fs.mkdtemp(path.join(os.tmpdir(), 'mj-parity-'));
      await fs.outputFile(path.join(fileDir, 'regression/scripts/t001-login-smoke.json'), '{\n  "Steps": []\n}');
      await fs.outputFile(path.join(fileDir, 'context/app-context.md'), '# App context');
    });

    afterEach(async () => {
      await fs.remove(fileDir);
    });

    async function checksumsFor(fields: Record<string, unknown>, config: EntityConfig) {
      const pulled = await processor['calculateSyncMetadata'](fields, fileDir, config, undefined, false);
      const payload = pushService['buildRecordChecksumPayload']({ fields }, { ...fields });
      return { pulled: pulled.checksum, pushed: await syncEngine.CalculateChecksumWithFileContent(payload, fileDir) };
    }

    it('matches when a nested field holds the reference', async () => {
      const config: EntityConfig = {
        entity: 'MJ: Tests',
        filePattern: '**/.*.json',
        pull: {
          externalizeFields: [{ field: 'Configuration.ReplayScript', pattern: '@file:regression/scripts/{Name}.json' }],
        },
      };
      const fields = {
        Name: 'T001 - Login Smoke',
        Configuration: { maxSteps: 35, ReplayScript: '@file:regression/scripts/t001-login-smoke.json' },
      };

      const { pulled, pushed } = await checksumsFor(fields, config);

      expect(pulled).toBe(pushed);
    });

    it('matches when the folder has no externalizeFields', async () => {
      const config: EntityConfig = { entity: 'MJ: Test Suites', filePattern: '**/.*.json' };
      const fields = { Name: 'Suite', Configuration: { applicationContext: '@file:context/app-context.md' } };

      const { pulled, pushed } = await checksumsFor(fields, config);

      expect(pulled).toBe(pushed);
    });
  });

  it('keeps lastModified when pull runs over a file push just wrote', async () => {
    const record: RecordData = { fields: { Name: 'Custom', Icon: 'fa-solid fa-cube' } };
    const pushWritten: RecordData = {
      ...record,
      sync: { lastModified: '2026-01-01T00:00:00.000Z', checksum: await pushChecksum(record) },
    };

    const pulled = await pullSync(record, pushWritten);

    expect(pulled).toEqual(pushWritten.sync);
  });
});
