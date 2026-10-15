import { describe, it, expect, vi, beforeEach } from 'vitest';

// -----------------------------------------------------------------------------
// Capture RunView invocations so each test can assert on the SQL filter and
// inject a fake result. The mock is hoisted via vi.mock so it intercepts the
// import inside RelatedEntityHandler.
//
// Per-test customization happens via the `runViewHandler` closure below, which
// the hoisted mock reads on every call. This avoids re-mocking RunView per test
// (which would break `new RunView()` if a non-constructable arrow function is used).
// -----------------------------------------------------------------------------

interface RunViewInvocation {
  EntityName: string;
  ExtraFilter: string;
  ResultType?: string;
}

interface RunViewResult {
  Success: boolean;
  Results: unknown[];
  ErrorMessage?: string;
}

const runViewInvocations: RunViewInvocation[] = [];
let runViewHandler: (params: RunViewInvocation, callIndex: number) => RunViewResult =
  () => ({ Success: true, Results: [] });

vi.mock('@memberjunction/core', () => {
  return {
    RunView: vi.fn().mockImplementation(function () {
      return {
        RunView: vi.fn().mockImplementation(async (params: RunViewInvocation) => {
          const idx = runViewInvocations.length;
          runViewInvocations.push(params);
          return runViewHandler(params, idx);
        }),
      };
    }),
    BaseEntity: vi.fn(),
    UserInfo: vi.fn(),
    Metadata: vi.fn(),
  };
});

import { RelatedEntityHandler } from '../lib/RelatedEntityHandler';
import type { RelatedEntityConfig } from '../config';

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

/** Minimal stand-in for a BaseEntity that supports the GetAll() / direct-prop access patterns the handler uses. */
function makeRecord(fields: Record<string, unknown>): Record<string, unknown> {
  return {
    ...fields,
    GetAll() { return { ...fields }; },
  };
}

const baseRelationConfig: RelatedEntityConfig = {
  entity: 'OrderItems',
  foreignKey: 'OrderID',
};

function makeHandler(): RelatedEntityHandler {
  // batchQueryRelatedEntities only uses contextUser as an opaque pass-through
  // to RunView and never reads syncEngine. Empty objects are sufficient.
  return new RelatedEntityHandler(
    {} as never,
    {} as never,
  );
}

// -----------------------------------------------------------------------------
// Tests
// -----------------------------------------------------------------------------

describe('RelatedEntityHandler.batchQueryRelatedEntities', () => {
  beforeEach(() => {
    runViewInvocations.length = 0;
    runViewHandler = () => ({ Success: true, Results: [] });
  });

  it('returns empty Map and issues no query when parentPrimaryKeys is empty', async () => {
    const handler = makeHandler();
    const result = await handler.batchQueryRelatedEntities([], baseRelationConfig);

    expect(result.size).toBe(0);
    expect(runViewInvocations).toHaveLength(0);
  });

  it('issues a single IN-clause query for multiple parents and groups results by FK', async () => {
    runViewHandler = () => ({
      Success: true,
      Results: [
        makeRecord({ ID: 'item-1', OrderID: 'p1' }),
        makeRecord({ ID: 'item-2', OrderID: 'p1' }),
        makeRecord({ ID: 'item-3', OrderID: 'p2' }),
      ],
    });

    const handler = makeHandler();
    const result = await handler.batchQueryRelatedEntities(
      ['p1', 'p2', 'p3'],
      baseRelationConfig,
    );

    expect(runViewInvocations).toHaveLength(1);
    expect(runViewInvocations[0].EntityName).toBe('OrderItems');
    expect(runViewInvocations[0].ExtraFilter).toBe(
      "OrderID IN ('p1', 'p2', 'p3')",
    );
    expect(runViewInvocations[0].ResultType).toBe('entity_object');

    expect(result.size).toBe(2);
    expect(result.get('p1')).toHaveLength(2);
    expect(result.get('p2')).toHaveLength(1);
    expect(result.get('p3')).toBeUndefined(); // no related records, no entry
  });

  it('escapes single quotes in parent IDs to prevent SQL injection', async () => {
    const handler = makeHandler();
    await handler.batchQueryRelatedEntities(
      ["o'malley", "rob'ert", 'plain'],
      baseRelationConfig,
    );

    expect(runViewInvocations).toHaveLength(1);
    expect(runViewInvocations[0].ExtraFilter).toBe(
      "OrderID IN ('o''malley', 'rob''ert', 'plain')",
    );
  });

  it('appends optional filter with AND', async () => {
    const handler = makeHandler();
    await handler.batchQueryRelatedEntities(
      ['p1'],
      { ...baseRelationConfig, filter: "Status = 'Active'" },
    );

    expect(runViewInvocations).toHaveLength(1);
    expect(runViewInvocations[0].ExtraFilter).toBe(
      "OrderID IN ('p1') AND (Status = 'Active')",
    );
  });

  it('chunks at 1000 parent IDs (boundary check at 1001)', async () => {
    const ids = Array.from({ length: 1001 }, (_, i) => `p${i}`);
    const handler = makeHandler();
    await handler.batchQueryRelatedEntities(ids, baseRelationConfig);

    expect(runViewInvocations).toHaveLength(2);
    // First chunk: ids 0..999 (1000 parents)
    expect(runViewInvocations[0].ExtraFilter).toContain("'p0'");
    expect(runViewInvocations[0].ExtraFilter).toContain("'p999'");
    expect(runViewInvocations[0].ExtraFilter).not.toContain("'p1000'");
    // Second chunk: id 1000 (just one)
    expect(runViewInvocations[1].ExtraFilter).toBe("OrderID IN ('p1000')");
  });

  it('chunks at exactly 1000 parents into a single query', async () => {
    const ids = Array.from({ length: 1000 }, (_, i) => `p${i}`);
    const handler = makeHandler();
    await handler.batchQueryRelatedEntities(ids, baseRelationConfig);

    expect(runViewInvocations).toHaveLength(1);
  });

  it('chunks at 2500 parents into 3 queries (1000 + 1000 + 500)', async () => {
    const ids = Array.from({ length: 2500 }, (_, i) => `p${i}`);
    const handler = makeHandler();
    await handler.batchQueryRelatedEntities(ids, baseRelationConfig);

    expect(runViewInvocations).toHaveLength(3);
    // Validate chunk boundaries by counting commas in each filter
    const idCount = (filter: string) => filter.split(',').length;
    expect(idCount(runViewInvocations[0].ExtraFilter)).toBe(1000);
    expect(idCount(runViewInvocations[1].ExtraFilter)).toBe(1000);
    expect(idCount(runViewInvocations[2].ExtraFilter)).toBe(500);
  });

  it('aggregates results across chunks into a single Map', async () => {
    runViewHandler = (_params, idx) =>
      idx === 0
        ? { Success: true, Results: [makeRecord({ ID: 'a', OrderID: 'p0' })] }
        : { Success: true, Results: [makeRecord({ ID: 'b', OrderID: 'p1000' })] };

    const ids = Array.from({ length: 1500 }, (_, i) => `p${i}`);
    const handler = makeHandler();
    const result = await handler.batchQueryRelatedEntities(ids, baseRelationConfig);

    expect(runViewInvocations).toHaveLength(2);
    expect(result.size).toBe(2);
    expect(result.get('p0')).toHaveLength(1);
    expect(result.get('p1000')).toHaveLength(1);
  });

  it('returns empty Map gracefully when RunView reports failure', async () => {
    runViewHandler = () => ({
      Success: false,
      Results: [],
      ErrorMessage: 'simulated failure',
    });

    const handler = makeHandler();
    const result = await handler.batchQueryRelatedEntities(['p1'], baseRelationConfig);

    expect(runViewInvocations).toHaveLength(1);
    expect(result.size).toBe(0); // graceful — caller falls back to per-record loading
  });

  it('skips records whose foreignKey value is null/undefined', async () => {
    runViewHandler = () => ({
      Success: true,
      Results: [
        makeRecord({ ID: 'item-1', OrderID: 'p1' }),
        makeRecord({ ID: 'item-2', OrderID: null }),
        makeRecord({ ID: 'item-3', OrderID: undefined }),
        makeRecord({ ID: 'item-4', OrderID: 'p1' }),
      ],
    });

    const handler = makeHandler();
    const result = await handler.batchQueryRelatedEntities(['p1'], baseRelationConfig);

    // Only the 2 records with a real OrderID are grouped
    expect(result.size).toBe(1);
    expect(result.get('p1')).toHaveLength(2);
  });

  it('coerces numeric foreignKey values to string keys', async () => {
    runViewHandler = () => ({
      Success: true,
      Results: [
        makeRecord({ ID: 'item-1', OrderID: 42 }),
        makeRecord({ ID: 'item-2', OrderID: 42 }),
      ],
    });

    const handler = makeHandler();
    const result = await handler.batchQueryRelatedEntities(['42'], baseRelationConfig);

    expect(result.size).toBe(1);
    expect(result.get('42')).toHaveLength(2);
  });
});
