/**
 * #5053: pulling a parent with a declared collection twice, with nothing changed in the database,
 * must leave the file as it was. The second pull gets the first pull's file as the existing record,
 * so every record keeps its `sync.checksum` and `sync.lastModified`, and the parent keeps its
 * `collections`. Entities are small fakes; no database.
 */
import { createHash } from 'node:crypto';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { BaseEntity, EntityInfo, EntityRelationshipInfo, UserInfo } from '@memberjunction/core';
import { RecordProcessor } from '../lib/RecordProcessor';
import type { EntityConfig } from '../config';
import type { RecordData, SyncEngine } from '../lib/sync-engine';

class FakeEntity {
  public data: Record<string, unknown>;
  public ISAChild: FakeEntity | null = null;
  public EntityInfo: EntityInfo;
  public companions: Record<string, unknown> = {};

  constructor(name: string, data: Record<string, unknown>) {
    this.data = { ...data };
    this.EntityInfo = {
      Name: name,
      PrimaryKeys: [{ Name: 'ID' }],
      Fields: Object.keys(data).map((n) => ({ Name: n })),
      AllowMultipleSubtypes: false,
      RelatedEntities: [],
    } as unknown as EntityInfo;
  }

  get PrimaryKey(): Record<string, unknown> {
    return { ID: this.data.ID };
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

/** An order with a declared `OrderLines` collection of two lines. */
function orderWithTwoLines(quantityA = 2): FakeEntity {
  const order = new FakeEntity('Orders', { ID: 'ord-1', Name: 'Order 1' });
  const lines = [
    new FakeEntity('OrderLines', { ID: 'line-b', OrderID: 'ord-1', Quantity: 3 }),
    new FakeEntity('OrderLines', { ID: 'line-a', OrderID: 'ord-1', Quantity: quantityA }),
  ];
  order.companions['OrderLines'] = { LoadMode: 'explicit', IsLoaded: true, Items: lines, Load: async () => undefined };
  (order.EntityInfo as { RelatedEntities: EntityRelationshipInfo[] }).RelatedEntities = [
    {
      RelatedEntity: 'OrderLines',
      RelatedEntityJoinField: 'OrderID',
      RelatedRecordCollection: JSON.stringify({ Name: 'OrderLines' }),
    } as unknown as EntityRelationshipInfo,
  ];
  return order;
}

/** What a pull writes and the next pull reads back: the record as JSON on disk. */
function roundTripThroughFile(record: RecordData): RecordData {
  return JSON.parse(JSON.stringify(record)) as RecordData;
}

describe('pull of a parent with a collection, twice (#5053)', () => {
  const entityConfig: EntityConfig = { entity: 'Orders', filePattern: '**/.*.json' };
  let processor: RecordProcessor;

  beforeEach(() => {
    const checksum = (payload: unknown): string => createHash('sha256').update(JSON.stringify(payload)).digest('hex');
    const mockSync = {
      getEntityInfo: vi.fn().mockImplementation((name: string) => ({
        Name: name,
        PrimaryKeys: [{ Name: 'ID' }],
        Fields: [{ Name: 'ID' }, { Name: 'Name' }, { Name: 'OrderID' }, { Name: 'Quantity' }],
      })),
      calculateChecksum: vi.fn().mockImplementation(checksum),
      calculateChecksumWithFileContent: vi.fn().mockImplementation(async (payload: unknown) => checksum(payload)),
    } as unknown as SyncEngine;
    processor = new RecordProcessor(mockSync, {} as UserInfo);
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  async function pull(existing?: RecordData, quantityA = 2): Promise<RecordData> {
    const order = orderWithTwoLines(quantityA);
    return processor.ProcessRecord(
      order as unknown as BaseEntity,
      { ID: 'ord-1' },
      '/dummy',
      entityConfig,
      false,
      existing === undefined,
      existing
    );
  }

  it('keeps every checksum and lastModified, and the collection, when nothing changed', async () => {
    vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'));
    const first = roundTripThroughFile(await pull());
    expect(first.collections?.OrderLines).toHaveLength(2);

    vi.setSystemTime(new Date('2026-02-01T00:00:00.000Z'));
    const second = roundTripThroughFile(await pull(first));

    expect(second.sync).toEqual(first.sync);
    expect(second.collections?.OrderLines).toHaveLength(2);
    expect(second.collections?.OrderLines.map((line) => line.primaryKey)).toEqual(
      first.collections?.OrderLines.map((line) => line.primaryKey)
    );
    expect(second.collections?.OrderLines.map((line) => line.sync)).toEqual(
      first.collections?.OrderLines.map((line) => line.sync)
    );
    expect(second).toEqual(first);
  });

  it('a child changed in the database moves its own lastModified and the parent checksum, not its sibling', async () => {
    vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'));
    const first = roundTripThroughFile(await pull());

    vi.setSystemTime(new Date('2026-02-01T00:00:00.000Z'));
    const second = roundTripThroughFile(await pull(first, 5));

    const lineSync = (record: RecordData, id: string) =>
      record.collections?.OrderLines.find((line) => line.primaryKey?.ID === id)?.sync;
    expect(lineSync(second, 'line-a')?.lastModified).toBe('2026-02-01T00:00:00.000Z');
    expect(lineSync(second, 'line-b')).toEqual(lineSync(first, 'line-b'));
    expect(second.sync?.checksum).not.toBe(first.sync?.checksum);
  });
});
