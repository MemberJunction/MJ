import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { RunView } from '@memberjunction/core';
import type { Metadata, UserInfo, RunViewParams, RunViewResult } from '@memberjunction/core';
import { DeletionAuditor } from '../lib/deletion-auditor';
import { SyncEngine } from '../lib/sync-engine';
import type { FlattenedRecord } from '../lib/record-dependency-analyzer';

/**
 * Tests for the batched existence check in the deletion audit. Single-primary-key entities must be
 * resolved with batched IN() queries (one per entity, not one round-trip per record), with results
 * classified into still-existing vs already-deleted. Safe defaults must never silently skip a real
 * delete, and composite-key / unknown entities must fall back to the per-record path.
 */

const SINGLE = 'MJ: Integration Objects';
const COMPOSITE = 'MJ: Composite Keyed Entity';

const metadataStub = {
  Entities: [
    { Name: SINGLE, PrimaryKeys: [{ Name: 'ID' }] },
    { Name: COMPOSITE, PrimaryKeys: [{ Name: 'PartA' }, { Name: 'PartB' }] }
  ]
} as unknown as Metadata;

// checkRecordExistence is private; expose just its signature for focused testing.
interface AuditorInternals {
  checkRecordExistence(
    records: FlattenedRecord[]
  ): Promise<{ existingRecords: FlattenedRecord[]; alreadyDeleted: Map<string, FlattenedRecord> }>;
}

function makeAuditor(): AuditorInternals {
  return new DeletionAuditor(metadataStub, {} as UserInfo) as unknown as AuditorInternals;
}

function makeRecord(
  entityName: string,
  id: string,
  primaryKey?: Record<string, unknown>,
  fields: Record<string, unknown> = {}
): FlattenedRecord {
  return {
    record: { primaryKey, fields },
    entityName,
    depth: 0,
    path: `test/${id}`,
    dependencies: new Set<string>(),
    id,
    originalIndex: 0
  };
}

let runViewCalls: RunViewParams[];
let runViewImpl: (params: RunViewParams) => RunViewResult;

beforeEach(() => {
  runViewCalls = [];
  runViewImpl = () => ({ Success: true, Results: [] } as unknown as RunViewResult);
  vi.spyOn(RunView.prototype, 'RunView').mockImplementation(
    (async (params: RunViewParams) => {
      runViewCalls.push(params);
      return runViewImpl(params);
    }) as typeof RunView.prototype.RunView
  );
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('DeletionAuditor.checkRecordExistence', () => {
  it('issues ONE batched IN() query per single-PK entity with IgnoreMaxRows and a narrow Fields list', async () => {
    const auditor = makeAuditor();
    const records = ['AAA', 'BBB', 'CCC'].map(id => makeRecord(SINGLE, id, { ID: id }));

    await auditor.checkRecordExistence(records);

    expect(runViewCalls).toHaveLength(1);
    expect(runViewCalls[0].EntityName).toBe(SINGLE);
    expect(runViewCalls[0].ExtraFilter).toContain('ID IN (');
    expect(runViewCalls[0].Fields).toEqual(['ID']);
    expect(runViewCalls[0].IgnoreMaxRows).toBe(true);
    expect(runViewCalls[0].ResultType).toBe('simple');
  });

  it('classifies records into still-existing vs already-deleted from the returned keys', async () => {
    const auditor = makeAuditor();
    const records = [
      makeRecord(SINGLE, 'r-exists', { ID: 'EXISTS-1' }),
      makeRecord(SINGLE, 'r-gone', { ID: 'GONE-1' })
    ];
    runViewImpl = () =>
      ({ Success: true, Results: [{ ID: 'EXISTS-1' }] } as unknown as RunViewResult);

    const { existingRecords, alreadyDeleted } = await auditor.checkRecordExistence(records);

    expect(existingRecords.map(r => r.id)).toEqual(['r-exists']);
    expect(alreadyDeleted.has('r-gone')).toBe(true);
    expect(alreadyDeleted.has('r-exists')).toBe(false);
  });

  it('matches keys case-insensitively (SQL Server upper / PostgreSQL lower GUIDs)', async () => {
    const auditor = makeAuditor();
    const records = [makeRecord(SINGLE, 'r1', { ID: 'abc-123' })];
    // DB returns the key uppercased, as SQL Server would.
    runViewImpl = () =>
      ({ Success: true, Results: [{ ID: 'ABC-123' }] } as unknown as RunViewResult);

    const { existingRecords, alreadyDeleted } = await auditor.checkRecordExistence(records);

    expect(existingRecords.map(r => r.id)).toEqual(['r1']);
    expect(alreadyDeleted.size).toBe(0);
  });

  it('treats a record with an undeterminable key as still-existing without querying for it', async () => {
    const auditor = makeAuditor();
    // No ID in primaryKey or fields — key can't be resolved.
    const records = [makeRecord(SINGLE, 'r-nokey', {}, {})];

    const { existingRecords, alreadyDeleted } = await auditor.checkRecordExistence(records);

    expect(existingRecords.map(r => r.id)).toEqual(['r-nokey']);
    expect(alreadyDeleted.size).toBe(0);
    expect(runViewCalls).toHaveLength(0); // nothing resolvable to query
  });

  it('treats records as still-existing (safe default) when the existence query fails', async () => {
    const auditor = makeAuditor();
    const records = [makeRecord(SINGLE, 'r1', { ID: 'X' })];
    runViewImpl = () => ({ Success: false, Results: [] } as unknown as RunViewResult);

    const { existingRecords, alreadyDeleted } = await auditor.checkRecordExistence(records);

    expect(existingRecords.map(r => r.id)).toEqual(['r1']);
    expect(alreadyDeleted.size).toBe(0);
  });

  it('falls back to the per-record path for composite-key entities (no batched query)', async () => {
    const auditor = makeAuditor();
    const loadEntity = vi
      .spyOn(SyncEngine.prototype, 'loadEntity')
      // Truthy => the record still exists in the database.
      .mockResolvedValue({} as unknown as Awaited<ReturnType<SyncEngine['loadEntity']>>);

    const records = [
      makeRecord(COMPOSITE, 'c1', { PartA: '1', PartB: '2' }),
      makeRecord(COMPOSITE, 'c2', { PartA: '3', PartB: '4' })
    ];

    const { existingRecords, alreadyDeleted } = await auditor.checkRecordExistence(records);

    expect(loadEntity).toHaveBeenCalledTimes(2);
    expect(runViewCalls).toHaveLength(0); // composite keys never use the batched IN() path
    expect(existingRecords.map(r => r.id)).toEqual(['c1', 'c2']);
    expect(alreadyDeleted.size).toBe(0);
  });
});
