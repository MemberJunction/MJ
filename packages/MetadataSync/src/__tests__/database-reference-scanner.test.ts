import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { RunView } from '@memberjunction/core';
import type { Metadata, UserInfo, RunViewParams, RunViewResult } from '@memberjunction/core';
import { DatabaseReferenceScanner } from '../lib/database-reference-scanner';
import type { FlattenedRecord } from '../lib/record-dependency-analyzer';
import type { ReverseFKInfo } from '../lib/entity-foreign-key-helper';

/**
 * Tests for the batched FK reference scan. The scanner must issue ONE query per
 * (target entity, FK field) using an IN() filter — not one query per record — and
 * must still attribute each found DB row back to the exact record being deleted.
 *
 * Regression guard for the deletion-audit hang: deleting a re-seeded connector's
 * Integration Objects previously fired thousands of serial RunView round trips.
 *
 * Adapted from PR #2898's test suite onto this branch's scanner, which additionally
 * passes `IgnoreMaxRows: true` (so a batched query isn't silently truncated by the
 * referencing entity's UserViewMaxRows cap) and chunks at 1000 rather than 500.
 */

const TARGET = 'MJ: Integration Objects';
const REFERENCING = 'MJ: Integration Object Fields';
const FK_FIELD = 'IntegrationObjectID';

// The scanner only reads `.Entities[].Name` and `.PrimaryKeys[].Name` off the metadata.
const metadataStub = {
  Entities: [
    { Name: TARGET, PrimaryKeys: [{ Name: 'ID' }] },
    { Name: REFERENCING, PrimaryKeys: [{ Name: 'ID' }] }
  ]
} as unknown as Metadata;

const reverseFKMap = new Map<string, ReverseFKInfo[]>([
  [TARGET, [{ entityName: REFERENCING, fieldName: FK_FIELD, relatedFieldName: 'ID' }]]
]);

function makeDeleteRecord(id: string): FlattenedRecord {
  return {
    record: { primaryKey: { ID: id }, fields: {} },
    entityName: TARGET,
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

describe('DatabaseReferenceScanner.scanForReferences', () => {
  it('issues ONE batched IN() query per (entity, FK field), not one per record', async () => {
    const scanner = new DatabaseReferenceScanner(metadataStub, {} as UserInfo);
    const records = ['AAAA', 'BBBB', 'CCCC'].map(makeDeleteRecord);

    await scanner.scanForReferences(records, reverseFKMap, []);

    expect(runViewCalls).toHaveLength(1);
    expect(runViewCalls[0].EntityName).toBe(REFERENCING);
    expect(runViewCalls[0].ExtraFilter).toContain(`${FK_FIELD} IN (`);
    for (const id of ['AAAA', 'BBBB', 'CCCC']) {
      expect(runViewCalls[0].ExtraFilter).toContain(`'${id}'`);
    }
  });

  it('passes IgnoreMaxRows: true so the batched query is not truncated by UserViewMaxRows', async () => {
    // Regression guard: a single IntegrationObjectID IN (...) scan against the large
    // Integration Object Fields table matches far more rows than the entity's row cap.
    // Without IgnoreMaxRows the result would be silently truncated and references missed.
    const scanner = new DatabaseReferenceScanner(metadataStub, {} as UserInfo);

    await scanner.scanForReferences([makeDeleteRecord('AAAA')], reverseFKMap, []);

    expect(runViewCalls).toHaveLength(1);
    expect(runViewCalls[0].IgnoreMaxRows).toBe(true);
  });

  it('attributes each found DB row back to the correct deleted record (case-insensitive FK match)', async () => {
    const scanner = new DatabaseReferenceScanner(metadataStub, {} as UserInfo);
    const records = ['aaaa-1111', 'bbbb-2222'].map(makeDeleteRecord);

    // DB row whose FK points (in uppercase) at the lower-cased 'bbbb-2222' delete target.
    runViewImpl = () =>
      ({
        Success: true,
        Results: [{ ID: 'field-1', [FK_FIELD]: 'BBBB-2222' }]
      } as unknown as RunViewResult);

    const refs = await scanner.scanForReferences(records, reverseFKMap, []);

    expect(refs).toHaveLength(1);
    expect(refs[0].entityName).toBe(REFERENCING);
    expect(refs[0].referencingField).toBe(FK_FIELD);
    expect(refs[0].referencedEntity).toBe(TARGET);
    // The referencing DB record's own PK
    expect(refs[0].primaryKey.KeyValuePairs[0].Value).toBe('field-1');
    // Attributed back to the 'bbbb-2222' delete target despite the case difference
    expect(refs[0].referencedKey.KeyValuePairs[0].Value.toLowerCase()).toBe('bbbb-2222');
  });

  it('still records a reference when the FK value cannot be mapped back (synthesizes the referenced key)', async () => {
    // The WHERE fk IN (...) clause guarantees a returned row's FK is one of the queried
    // values, so this is a defensive path. This branch keeps the reference (synthesizing
    // referencedKey from the raw FK) rather than dropping it — a delete-safety audit must
    // not silently lose a real FK blocker. (PR #2898 dropped it; this branch keeps it.)
    const scanner = new DatabaseReferenceScanner(metadataStub, {} as UserInfo);
    const records = ['keep-me'].map(makeDeleteRecord);

    runViewImpl = () =>
      ({
        Success: true,
        Results: [{ ID: 'field-x', [FK_FIELD]: 'unrelated-guid' }]
      } as unknown as RunViewResult);

    const refs = await scanner.scanForReferences(records, reverseFKMap, []);

    expect(refs).toHaveLength(1);
    expect(refs[0].primaryKey.KeyValuePairs[0].Value).toBe('field-x');
    // referencedKey synthesized from the raw (unmatched) FK value
    expect(refs[0].referencedKey.KeyValuePairs[0].Value).toBe('unrelated-guid');
  });

  it('chunks large delete sets across multiple queries (chunk size 1000)', async () => {
    const scanner = new DatabaseReferenceScanner(metadataStub, {} as UserInfo);
    const records = Array.from({ length: 1001 }, (_, i) => makeDeleteRecord(`id-${i}`));

    await scanner.scanForReferences(records, reverseFKMap, []);

    // 1001 ids -> ceil(1001 / 1000) = 2 batched queries
    expect(runViewCalls).toHaveLength(2);
  });

  it('issues no queries when the deleted entity has no referencing entities', async () => {
    const scanner = new DatabaseReferenceScanner(metadataStub, {} as UserInfo);

    await scanner.scanForReferences([makeDeleteRecord('X')], new Map(), []);

    expect(runViewCalls).toHaveLength(0);
  });
});
