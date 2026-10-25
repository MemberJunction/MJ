/**
 * RecordProcessor on pull: `@env:` references in collections, embeds and the extension of an
 * existing record are kept. Entities are small fakes; no database.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs-extra';
import os from 'os';
import path from 'path';
import type { EntityInfo, EntityRelationshipInfo, UserInfo } from '@memberjunction/core';
import { RecordProcessor } from '../lib/RecordProcessor';
import { UnsetPrimaryKeyVariableError } from '../lib/existing-record-index';
import type { EntityConfig } from '../config';
import type { RecordData, SyncEngine } from '../lib/sync-engine';

const SECRET = 'super-secret-123';
const VAR = 'MJ_PULL_AXES_ENV_TEST';
const VAR2 = 'MJ_PULL_AXES_ENV_TEST_2';
const SECRET2 = 'other-secret-456';

class FakeEntity {
  public data: Record<string, unknown>;
  public ISAChild: FakeEntity | null = null;
  public EntityInfo: EntityInfo;
  public companions: Record<string, unknown> = {};

  constructor(name: string, data: Record<string, unknown>, fields?: Array<{ Name: string; RelatedEntity?: string }>) {
    this.data = { ...data };
    this.EntityInfo = {
      Name: name,
      PrimaryKeys: [{ Name: 'ID' }],
      Fields: fields ?? Object.keys(data).map((n) => ({ Name: n })),
      AllowMultipleSubtypes: false,
    } as unknown as EntityInfo;
  }

  Get(fieldName: string): unknown {
    return this.data[fieldName];
  }

  GetAll(): Record<string, unknown> {
    return { ...this.data };
  }

  GetCompanion(name: string): unknown {
    return this.companions[name] ?? null;
  }
}

interface AxesAccess {
  processCollections: (
    record: FakeEntity,
    targetDir: string,
    entityConfig: EntityConfig,
    collections: Record<string, RecordData[]>,
    currentDepth: number,
    ancestryPath: Set<string>,
    verbose?: boolean,
    existingRecordData?: RecordData
  ) => Promise<void>;
  processEmbeds: (
    record: FakeEntity,
    targetDir: string,
    entityConfig: EntityConfig,
    embeds: Record<string, RecordData>,
    currentDepth: number,
    ancestryPath: Set<string>,
    verbose?: boolean,
    existingRecordData?: RecordData
  ) => Promise<void>;
  processExtension: (
    record: FakeEntity,
    primaryKey: Record<string, unknown>,
    targetDir: string,
    entityConfig: EntityConfig,
    verbose?: boolean,
    existingRecordData?: RecordData
  ) => Promise<RecordData['extension'] | undefined>;
}

describe('RecordProcessor pull — @env: in composition axes', () => {
  let processor: RecordProcessor;
  let access: AxesAccess;
  let warnings: string[];

  beforeEach(() => {
    const mockSync = {
      getEntityInfo: vi.fn().mockImplementation((name: string) => ({
        Name: name,
        PrimaryKeys: [{ Name: 'ID' }],
        Fields: [{ Name: 'ID' }, { Name: 'Name' }],
      })),
      calculateChecksum: vi.fn().mockReturnValue('cs-1'),
      calculateChecksumWithFileContent: vi.fn().mockResolvedValue('cs-1'),
    } as unknown as SyncEngine;
    processor = new RecordProcessor(mockSync, {} as UserInfo);
    warnings = [];
    processor.WarningSink = (m) => warnings.push(m);
    access = processor as unknown as AxesAccess;
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  function ownerWithLines(items: FakeEntity[], owner: FakeEntity = new FakeEntity('Orders', { ID: 'ord-1' })): FakeEntity {
    owner.companions['OrderLines'] = { LoadMode: 'explicit', IsLoaded: true, Items: items, Load: async () => undefined };
    (owner.EntityInfo as { RelatedEntities: EntityRelationshipInfo[] }).RelatedEntities = [
      {
        RelatedEntity: 'OrderLines',
        RelatedEntityJoinField: 'OrderID',
        RelatedRecordCollection: JSON.stringify({ Name: 'OrderLines' }),
      } as unknown as EntityRelationshipInfo,
    ];
    return owner;
  }

  it('keeps an @env: field of an existing collection child', async () => {
    vi.stubEnv(VAR, SECRET);
    const owner = ownerWithLines([
      new FakeEntity('OrderLines', { ID: 'line-a', Name: SECRET }),
      new FakeEntity('OrderLines', { ID: 'line-b', Name: 'plain' }),
    ]);
    const existing: RecordData = {
      fields: {},
      collections: { OrderLines: [{ fields: { Name: `@env:${VAR}` }, primaryKey: { ID: 'line-a' } }] },
    };
    const collections: Record<string, RecordData[]> = {};

    await access.processCollections(owner, '/dummy', { entity: 'Orders' }, collections, 0, new Set(), false, existing);

    expect(collections.OrderLines.map((c) => c.fields.Name)).toEqual([`@env:${VAR}`, 'plain']);
    expect(JSON.stringify(collections)).not.toContain(SECRET);
  });

  it('keeps an @env: primary key of a collection child', async () => {
    vi.stubEnv(VAR, 'line-a');
    const owner = ownerWithLines([new FakeEntity('OrderLines', { ID: 'line-a', Name: 'x' })]);
    const existing: RecordData = {
      fields: {},
      collections: { OrderLines: [{ fields: { Name: 'x' }, primaryKey: { ID: `@env:${VAR}` } }] },
    };
    const collections: Record<string, RecordData[]> = {};

    await access.processCollections(owner, '/dummy', { entity: 'Orders' }, collections, 0, new Set(), false, existing);

    expect(collections.OrderLines[0].primaryKey).toEqual({ ID: `@env:${VAR}` });
  });

  it('fails when a collection child key variable is not set', async () => {
    const owner = ownerWithLines([new FakeEntity('OrderLines', { ID: 'line-a', Name: 'x' })]);
    const existing: RecordData = {
      fields: {},
      collections: { OrderLines: [{ fields: { Name: 'x' }, primaryKey: { ID: `@env:${VAR}` } }] },
    };

    await expect(
      access.processCollections(owner, '/dummy', { entity: 'Orders' }, {}, 0, new Set(), false, existing)
    ).rejects.toBeInstanceOf(UnsetPrimaryKeyVariableError);
  });

  function ownerWithAddress(street: unknown, extra: Record<string, unknown> = {}): FakeEntity {
    const owner = new FakeEntity('Orders', { ID: 'ord-1', AddressID: 'addr-1' }, [
      { Name: 'ID' },
      { Name: 'AddressID', RelatedEntity: 'Addresses' },
    ]);
    (owner as unknown as Record<string, unknown>)['AddressID_Object'] = new FakeEntity('Addresses', { ID: 'addr-1', Street: street, ...extra });
    return owner;
  }

  it('keeps an @env: field of an embed and warns on drift without values', async () => {
    vi.stubEnv(VAR, 'value-in-env');
    const owner = ownerWithAddress(SECRET);
    const existing: RecordData = { fields: {}, embeds: { AddressID: { fields: { Street: `@env:${VAR}` } } } };
    const embeds: Record<string, RecordData> = {};

    await access.processEmbeds(owner, '/dummy', { entity: 'Orders' }, embeds, 0, new Set(), false, existing);

    expect(embeds.AddressID.fields.Street).toBe(`@env:${VAR}`);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain('Addresses {"ID":"addr-1"} field Street');
    expect(warnings[0]).not.toContain(SECRET);
    expect(warnings[0]).not.toContain('value-in-env');
  });

  it('keeps an @env: primary key of an embed and names the embed by that key', async () => {
    vi.stubEnv(VAR, 'addr-1');
    vi.stubEnv(VAR2, 'street-in-env');
    const existing: RecordData = {
      fields: {},
      embeds: { AddressID: { fields: { Street: `@env:${VAR2}` }, primaryKey: { ID: `@env:${VAR}` } } },
    };
    const embeds: Record<string, RecordData> = {};

    await access.processEmbeds(ownerWithAddress('Main'), '/dummy', { entity: 'Orders' }, embeds, 0, new Set(), false, existing);

    expect(embeds.AddressID.primaryKey).toEqual({ ID: `@env:${VAR}` });
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain(`Addresses {"ID":"@env:${VAR}"} field Street`);
    expect(warnings[0]).not.toContain('addr-1');
    expect(warnings[0]).not.toContain('street-in-env');
  });

  it('fails when an embed key variable is not set', async () => {
    const existing: RecordData = { fields: {}, embeds: { AddressID: { fields: { Street: 'Main' }, primaryKey: { ID: `@env:${VAR}` } } } };

    await expect(
      access.processEmbeds(ownerWithAddress('Main'), '/dummy', { entity: 'Orders' }, {}, 0, new Set(), false, existing)
    ).rejects.toBeInstanceOf(UnsetPrimaryKeyVariableError);
  });

  it('keeps an @env: field of the extension', async () => {
    vi.stubEnv(VAR, SECRET);
    const line = new FakeEntity('Order Lines', { ID: 'line-1', Quantity: 2 });
    line.ISAChild = new FakeEntity('Event Order Lines', { ID: 'line-1', Token: SECRET, RegDate: '2026-09-08' });
    const existing: RecordData = { fields: {}, extension: { fields: { Token: `@env:${VAR}` } } };

    const extension = await access.processExtension(line, { ID: 'line-1' }, '/dummy', { entity: 'Order Lines' }, false, existing);

    expect((extension as { fields: Record<string, unknown> }).fields).toEqual({ Token: `@env:${VAR}`, RegDate: '2026-09-08' });
    expect(warnings).toEqual([]);
  });

  it('names the extension by the parent key as the file has it on drift', async () => {
    vi.stubEnv(VAR, 'token-in-env');
    vi.stubEnv(VAR2, 'line-key-1');
    const line = new FakeEntity('Order Lines', { ID: 'line-key-1' });
    line.ISAChild = new FakeEntity('Event Order Lines', { ID: 'line-key-1', Token: SECRET });
    const existing: RecordData = {
      fields: {},
      primaryKey: { ID: `@env:${VAR2}` },
      extension: { fields: { Token: `@env:${VAR}` } },
    };

    await access.processExtension(line, { ID: 'line-key-1' }, '/dummy', { entity: 'Order Lines' }, false, existing);

    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain(`{"ID":"@env:${VAR2}"}`);
    expect(warnings[0]).not.toContain('line-key-1');
    expect(warnings[0]).not.toContain(SECRET);
    expect(warnings[0]).not.toContain('token-in-env');
  });

  it('reads the extension in its map form', async () => {
    vi.stubEnv(VAR, SECRET);
    const line = new FakeEntity('Order Lines', { ID: 'line-1' });
    line.ISAChild = new FakeEntity('Event Order Lines', { ID: 'line-1', Token: SECRET });
    const existing: RecordData = { fields: {}, extension: { 'Event Order Lines': { fields: { Token: `@env:${VAR}` } } } };

    const extension = await access.processExtension(line, { ID: 'line-1' }, '/dummy', { entity: 'Order Lines' }, false, existing);

    expect((extension as { fields: Record<string, unknown> }).fields.Token).toBe(`@env:${VAR}`);
  });
  describe('nested JSON and side files', () => {
    let tempDir: string;
    let output: string[];

    beforeEach(async () => {
      tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'pull-axes-env-'));
      output = [];
      vi.spyOn(console, 'log').mockImplementation((...args: unknown[]) => void output.push(args.map(String).join(' ')));
      vi.spyOn(console, 'warn').mockImplementation((...args: unknown[]) => void output.push(args.map(String).join(' ')));
    });

    afterEach(async () => {
      vi.restoreAllMocks();
      await fs.remove(tempDir);
    });

    async function filesHold(text: string): Promise<boolean> {
      for (const name of await fs.readdir(tempDir)) {
        if ((await fs.readFile(path.join(tempDir, name), 'utf8')).includes(text)) {
          return true;
        }
      }
      return false;
    }

    it('keeps a nested @env: leaf in a JSON field of an embed', async () => {
      vi.stubEnv(VAR, SECRET);
      const owner = ownerWithAddress('Main', { Settings: { token: SECRET, mode: 'b' } });
      const existing: RecordData = {
        fields: {},
        embeds: { AddressID: { fields: { Street: 'Main', Settings: { token: `@env:${VAR}`, mode: 'a' } } } },
      };
      const embeds: Record<string, RecordData> = {};

      await access.processEmbeds(owner, tempDir, { entity: 'Orders' }, embeds, 0, new Set(), true, existing);

      expect(embeds.AddressID.fields.Settings).toEqual({ token: `@env:${VAR}`, mode: 'b' });
      expect(JSON.stringify(embeds)).not.toContain(SECRET);
      expect([...warnings, ...output].join('\n')).not.toContain(SECRET);
      expect(await filesHold(SECRET)).toBe(false);
    });

    it('keeps @env: leaves in a @file: JSON side file of the extension', async () => {
      vi.stubEnv(VAR, SECRET);
      await fs.writeJson(path.join(tempDir, 'line.config.json'), { token: `@env:${VAR}`, level: 1 });
      const line = new FakeEntity('Order Lines', { ID: 'line-1' });
      line.ISAChild = new FakeEntity('Event Order Lines', { ID: 'line-1', Config: JSON.stringify({ token: SECRET, level: 2 }) });
      const existing: RecordData = { fields: {}, extension: { fields: { Config: '@file:line.config.json' } } };

      const extension = await access.processExtension(line, { ID: 'line-1' }, tempDir, { entity: 'Order Lines' }, true, existing);

      expect((extension as { fields: Record<string, unknown> }).fields.Config).toBe('@file:line.config.json');
      expect(await fs.readJson(path.join(tempDir, 'line.config.json'))).toEqual({ token: `@env:${VAR}`, level: 2 });
      expect(JSON.stringify(extension)).not.toContain(SECRET);
      expect([...warnings, ...output].join('\n')).not.toContain(SECRET);
      expect(await filesHold(SECRET)).toBe(false);
    });

    it('keeps each collection child its own reference when the file order differs and a child is gone', async () => {
      vi.stubEnv(VAR, SECRET);
      vi.stubEnv(VAR2, SECRET2);
      const owner = ownerWithLines([
        new FakeEntity('OrderLines', { ID: 'line-c', Name: SECRET2 }),
        new FakeEntity('OrderLines', { ID: 'line-a', Name: 'plain-a' }),
      ]);
      const existing: RecordData = {
        fields: {},
        collections: {
          OrderLines: [
            { fields: { Name: `@env:${VAR}` }, primaryKey: { ID: 'line-b' } },
            { fields: { Name: `@env:${VAR2}` }, primaryKey: { ID: 'line-c' } },
            { fields: { Name: 'plain-a' }, primaryKey: { ID: 'line-a' } },
          ],
        },
      };
      const collections: Record<string, RecordData[]> = {};

      await access.processCollections(owner, tempDir, { entity: 'Orders' }, collections, 0, new Set(), false, existing);

      expect(collections.OrderLines.map((c) => [c.primaryKey?.ID, c.fields.Name])).toEqual([
        ['line-a', 'plain-a'],
        ['line-c', `@env:${VAR2}`],
      ]);
      expect(JSON.stringify(collections)).not.toContain(SECRET);
      expect(JSON.stringify(collections)).not.toContain(SECRET2);
    });

    it('keeps @env: in a collection child, an embed and the extension through ProcessRecord', async () => {
      vi.stubEnv(VAR, SECRET);
      const owner = ownerWithLines([new FakeEntity('OrderLines', { ID: 'line-a', Name: SECRET })], ownerWithAddress(SECRET));
      owner.ISAChild = new FakeEntity('Event Orders', { ID: 'ord-1', AddressID: 'addr-1', Token: SECRET });
      const existing: RecordData = {
        fields: { AddressID: 'addr-1' },
        primaryKey: { ID: 'ord-1' },
        collections: { OrderLines: [{ fields: { Name: `@env:${VAR}` }, primaryKey: { ID: 'line-a' } }] },
        embeds: { AddressID: { fields: { Street: `@env:${VAR}` } } },
        extension: { fields: { Token: `@env:${VAR}` } },
      };

      const result = await processor.ProcessRecord(
        owner as unknown as Parameters<RecordProcessor['ProcessRecord']>[0],
        { ID: 'ord-1' },
        tempDir,
        { entity: 'Orders' },
        true,
        false,
        existing
      );

      expect(result.collections?.OrderLines[0].fields.Name).toBe(`@env:${VAR}`);
      expect(result.embeds?.AddressID.fields.Street).toBe(`@env:${VAR}`);
      expect((result.extension as { fields: Record<string, unknown> }).fields.Token).toBe(`@env:${VAR}`);
      expect(JSON.stringify(result)).not.toContain(SECRET);
      expect([...warnings, ...output].join('\n')).not.toContain(SECRET);
      expect(await filesHold(SECRET)).toBe(false);
    });
  });
});
