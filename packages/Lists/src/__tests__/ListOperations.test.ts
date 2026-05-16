import { beforeEach, describe, expect, it, vi } from 'vitest';

import { SetDeltaTokenSecret } from '../deltaToken';
import { ListOperations } from '../ListOperations';
import type { ApplyResult, ListDelta, ListSource, ResolvedRecordSet } from '../types';

const TEST_SECRET = 'unit-test-delta-secret';

/**
 * `ListOperations` only touches the database via three private resolvers
 * (`resolveListSource`, `resolveViewSource`, `resolveAdhocSource`) and one
 * mutation helper (`applyDeltaMutations`). For pure-logic tests we stub
 * those private methods on each instance, so the math + warning + token
 * paths can run without RunView or Metadata being wired up.
 */
type ResolverFn = (source: ListSource) => Promise<ResolvedRecordSet>;

function makeOps(resolver: ResolverFn): ListOperations {
  const ops = new ListOperations({ ID: 'user-1' } as unknown as Parameters<typeof ListOperations>[0]);
  vi.spyOn(ops, 'ResolveSource').mockImplementation((src) => resolver(src));
  return ops;
}

function set(entity: string, ids: string[]): ResolvedRecordSet {
  return { EntityName: entity, RecordIds: ids, TotalCount: ids.length };
}

describe('ListOperations', () => {
  beforeEach(() => {
    SetDeltaTokenSecret(TEST_SECRET);
  });

  describe('ComputeDelta', () => {
    it('treats target="new" as full-add with no removals', async () => {
      const ops = makeOps(async () => set('Contacts', ['a', 'b', 'c']));

      const delta = await ops.ComputeDelta('new', { kind: 'view', viewId: 'v1' }, 'Sync');

      expect(delta.TargetListId).toBeNull();
      expect(delta.ToAdd).toEqual(['a', 'b', 'c']);
      expect(delta.ToRemove).toEqual([]);
      expect(delta.Counts).toMatchObject({ Add: 3, Remove: 0, Unchanged: 0 });
      expect(delta.Warnings.some((w) => w.Code === 'WILL_REMOVE_RECORDS')).toBe(false);
      expect(delta.DeltaToken).toMatch(/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);
    });

    it('Additive mode never removes — even when target has extras', async () => {
      const responses: Record<string, ResolvedRecordSet> = {
        view: set('Contacts', ['a', 'b', 'c']),
        list: set('Contacts', ['b', 'x', 'y']),
      };
      const ops = makeOps(async (src) =>
        src.kind === 'view' ? responses.view : responses.list,
      );

      const delta = await ops.ComputeDelta(
        { kind: 'list', listId: 'list-1' },
        { kind: 'view', viewId: 'v1' },
        'Additive',
      );

      expect(delta.ToAdd.sort()).toEqual(['a', 'c']);
      expect(delta.ToRemove).toEqual([]);
      expect(delta.Unchanged).toEqual(['b']);
      expect(delta.Counts).toMatchObject({ Add: 2, Remove: 0, Unchanged: 1 });
      expect(delta.Warnings.some((w) => w.Code === 'WILL_REMOVE_RECORDS')).toBe(false);
    });

    it('Sync mode removes target-only records and warns', async () => {
      const responses: Record<string, ResolvedRecordSet> = {
        view: set('Contacts', ['a', 'b', 'c']),
        list: set('Contacts', ['b', 'x', 'y']),
      };
      const ops = makeOps(async (src) =>
        src.kind === 'view' ? responses.view : responses.list,
      );

      const delta = await ops.ComputeDelta(
        { kind: 'list', listId: 'list-1' },
        { kind: 'view', viewId: 'v1' },
        'Sync',
      );

      expect(delta.ToAdd.sort()).toEqual(['a', 'c']);
      expect(delta.ToRemove.sort()).toEqual(['x', 'y']);
      expect(delta.Unchanged).toEqual(['b']);
      expect(delta.Counts.Remove).toBe(2);
      const dropWarning = delta.Warnings.find((w) => w.Code === 'WILL_REMOVE_RECORDS');
      expect(dropWarning).toBeDefined();
      expect(dropWarning?.Details).toMatchObject({ Count: 2 });
    });

    it('flags entity-mismatch when source and target differ', async () => {
      const ops = makeOps(async (src) =>
        src.kind === 'view' ? set('Contacts', ['a']) : set('Accounts', ['b']),
      );
      const delta = await ops.ComputeDelta(
        { kind: 'list', listId: 'l1' },
        { kind: 'view', viewId: 'v1' },
        'Additive',
      );
      expect(delta.Warnings.some((w) => w.Code === 'ENTITY_MISMATCH')).toBe(true);
    });

    it('flags empty-source when resolver returns nothing', async () => {
      const ops = makeOps(async () => set('Contacts', []));
      const delta = await ops.ComputeDelta('new', { kind: 'view', viewId: 'v1' }, 'Additive');
      expect(delta.Warnings.some((w) => w.Code === 'EMPTY_SOURCE')).toBe(true);
    });

    it('is deterministic given identical inputs (same record sets ⇒ same delta shape)', async () => {
      const responses: Record<string, ResolvedRecordSet> = {
        view: set('Contacts', ['a', 'b', 'c']),
        list: set('Contacts', ['b', 'x']),
      };
      const ops = makeOps(async (src) =>
        src.kind === 'view' ? responses.view : responses.list,
      );

      const a = await ops.ComputeDelta(
        { kind: 'list', listId: 'list-1' },
        { kind: 'view', viewId: 'v1' },
        'Sync',
      );
      const b = await ops.ComputeDelta(
        { kind: 'list', listId: 'list-1' },
        { kind: 'view', viewId: 'v1' },
        'Sync',
      );
      // DeltaTokens differ (timestamp) but bucket contents are identical.
      expect(a.ToAdd.sort()).toEqual(b.ToAdd.sort());
      expect(a.ToRemove.sort()).toEqual(b.ToRemove.sort());
      expect(a.Counts).toEqual(b.Counts);
    });
  });

  describe('ComputeSetOp', () => {
    it('rejects fewer than 2 inputs', async () => {
      const ops = makeOps(async () => set('Contacts', []));
      await expect(
        ops.ComputeSetOp('union', [{ kind: 'view', viewId: 'v1' }]),
      ).rejects.toThrow(/at least 2/);
    });

    it('computes union across 3 inputs (deduplicated)', async () => {
      const sets: Record<string, ResolvedRecordSet> = {
        a: set('Contacts', ['1', '2']),
        b: set('Contacts', ['2', '3']),
        c: set('Contacts', ['3', '4']),
      };
      const ops = makeOps(async (src) => sets[(src as { viewId: string }).viewId]);

      const delta = await ops.ComputeSetOp('union', [
        { kind: 'view', viewId: 'a' },
        { kind: 'view', viewId: 'b' },
        { kind: 'view', viewId: 'c' },
      ]);

      expect(delta.ToAdd.sort()).toEqual(['1', '2', '3', '4']);
    });

    it('computes intersection across 3 inputs', async () => {
      const sets: Record<string, ResolvedRecordSet> = {
        a: set('Contacts', ['1', '2', '3']),
        b: set('Contacts', ['2', '3', '4']),
        c: set('Contacts', ['3', '5']),
      };
      const ops = makeOps(async (src) => sets[(src as { viewId: string }).viewId]);

      const delta = await ops.ComputeSetOp('intersection', [
        { kind: 'view', viewId: 'a' },
        { kind: 'view', viewId: 'b' },
        { kind: 'view', viewId: 'c' },
      ]);

      expect(delta.ToAdd).toEqual(['3']);
    });

    it('computes left-to-right difference', async () => {
      const sets: Record<string, ResolvedRecordSet> = {
        a: set('Contacts', ['1', '2', '3', '4']),
        b: set('Contacts', ['2']),
        c: set('Contacts', ['3']),
      };
      const ops = makeOps(async (src) => sets[(src as { viewId: string }).viewId]);

      const delta = await ops.ComputeSetOp('difference', [
        { kind: 'view', viewId: 'a' },
        { kind: 'view', viewId: 'b' },
        { kind: 'view', viewId: 'c' },
      ]);

      expect(delta.ToAdd.sort()).toEqual(['1', '4']);
    });

    it('warns when inputs span multiple entities', async () => {
      const sets: Record<string, ResolvedRecordSet> = {
        a: set('Contacts', ['1']),
        b: set('Accounts', ['2']),
      };
      const ops = makeOps(async (src) => sets[(src as { viewId: string }).viewId]);

      const delta = await ops.ComputeSetOp('union', [
        { kind: 'view', viewId: 'a' },
        { kind: 'view', viewId: 'b' },
      ]);

      expect(delta.Warnings.some((w) => w.Code === 'ENTITY_MISMATCH')).toBe(true);
    });

    it('projecting into existing target produces drops + WILL_REMOVE_RECORDS warning', async () => {
      const sets: Record<string, ResolvedRecordSet> = {
        a: set('Contacts', ['1', '2']),
        b: set('Contacts', ['3']),
        target: set('Contacts', ['1', '99']),
      };
      const ops = makeOps(async (src) => {
        if (src.kind === 'list') return sets.target;
        return sets[(src as { viewId: string }).viewId];
      });

      const delta = await ops.ComputeSetOp(
        'union',
        [
          { kind: 'view', viewId: 'a' },
          { kind: 'view', viewId: 'b' },
        ],
        { kind: 'list', listId: 'tgt' },
      );

      expect(delta.TargetListId).toBe('tgt');
      expect(delta.ToAdd.sort()).toEqual(['2', '3']);
      expect(delta.ToRemove).toEqual(['99']);
      expect(delta.Warnings.some((w) => w.Code === 'WILL_REMOVE_RECORDS')).toBe(true);
    });
  });

  describe('ApplyDelta', () => {
    it('rejects with INVALID_TOKEN for a garbage token', async () => {
      const ops = makeOps(async () => set('Contacts', []));
      const delta: ListDelta = {
        TargetListId: 'list-1',
        EntityName: 'Contacts',
        ToAdd: [],
        ToRemove: [],
        Unchanged: [],
        Counts: { Add: 0, Remove: 0, Unchanged: 0, SourceTotal: 0, TargetTotal: 0 },
        Warnings: [],
        DeltaToken: 'garbage.token',
      };
      const result = await ops.ApplyDelta(delta, { ConfirmDrops: false, DeltaToken: 'garbage.token' });
      expect(result.Success).toBe(false);
      expect(result.ResultCode).toBe('INVALID_TOKEN');
    });

    it('rejects with DROP_NOT_CONFIRMED when Remove>0 and ConfirmDrops=false', async () => {
      const ops = makeOps(async () => set('Contacts', ['target-record']));
      // Build a real delta so the token verifies — but with Remove>0.
      const delta = await ops.ComputeDelta(
        { kind: 'list', listId: 'list-1' },
        { kind: 'view', viewId: 'v1' },
        'Sync',
      );
      // Force a removal so we hit the guard.
      const forced: ListDelta = {
        ...delta,
        ToRemove: ['target-record'],
        Counts: { ...delta.Counts, Remove: 1 },
      };
      const result = await ops.ApplyDelta(forced, {
        ConfirmDrops: false,
        DeltaToken: delta.DeltaToken,
      });
      expect(result.Success).toBe(false);
      expect(result.ResultCode).toBe('DROP_NOT_CONFIRMED');
    });

    it('rejects with TARGET_NOT_FOUND when delta has no TargetListId', async () => {
      const ops = makeOps(async () => set('Contacts', ['a']));
      const delta = await ops.ComputeDelta('new', { kind: 'view', viewId: 'v1' }, 'Additive');
      const result = await ops.ApplyDelta(delta, {
        ConfirmDrops: false,
        DeltaToken: delta.DeltaToken,
      });
      expect(result.Success).toBe(false);
      expect(result.ResultCode).toBe('TARGET_NOT_FOUND');
    });

    it('rejects with INVALID_TOKEN when token target does not match delta target', async () => {
      // Sign a token for list-A but attach it to a delta claiming list-B.
      const opsA = makeOps(async () => set('Contacts', []));
      const deltaA = await opsA.ComputeDelta(
        { kind: 'list', listId: 'list-A' },
        { kind: 'view', viewId: 'v1' },
        'Additive',
      );
      const swapped: ListDelta = { ...deltaA, TargetListId: 'list-B' };
      const result = await opsA.ApplyDelta(swapped, {
        ConfirmDrops: true,
        DeltaToken: deltaA.DeltaToken,
      });
      expect(result.Success).toBe(false);
      expect(result.ResultCode).toBe('INVALID_TOKEN');
    });

    it('detects target drift and returns STALE_DELTA', async () => {
      // Initial preview: target has {a, b}; source view has {a, c}.
      // After preview, target gains a record {z}.
      const resolverCalls = { current: 0 };
      const ops = makeOps(async (src) => {
        if (src.kind === 'view') return set('Contacts', ['a', 'c']);
        // For list resolution: first call (preview) returns {a, b}; second
        // call (during ApplyDelta verifyTargetNotDrifted) returns {a, b, z}.
        resolverCalls.current++;
        return resolverCalls.current === 1
          ? set('Contacts', ['a', 'b'])
          : set('Contacts', ['a', 'b', 'z']);
      });

      const delta = await ops.ComputeDelta(
        { kind: 'list', listId: 'list-1' },
        { kind: 'view', viewId: 'v1' },
        'Sync',
      );

      const result: ApplyResult = await ops.ApplyDelta(delta, {
        ConfirmDrops: true,
        DeltaToken: delta.DeltaToken,
      });
      expect(result.Success).toBe(false);
      expect(result.ResultCode).toBe('STALE_DELTA');
    });
  });
});
