/**
 * Tests for the pure boundary converters in ListOperationsResolver.
 *
 * The resolver itself depends on type-graphql + AppContext, which would
 * require a full test harness. The converters are standalone functions
 * doing the GraphQL ↔ @memberjunction/lists translation — they have no
 * side effects and are the most likely site of drift if either side's
 * shape changes, so they're the right test target.
 */

// type-graphql decorators (`@Field`, `@InputType`, etc.) call
// `Reflect.getMetadata`, which only exists when this polyfill is loaded
// first. Vitest doesn't bring it in automatically — `import` ordering
// matters: this line MUST come before any import that pulls in the
// resolver file.
import 'reflect-metadata';

import { describe, expect, it } from 'vitest';

import type { ApplyResult, ListDelta } from '@memberjunction/lists';

import {
  ApplyDeltaInput,
  ListSourceInput,
  fromCoreApplyResult,
  fromCoreDelta,
  fromCoreWarning,
  rebuildDeltaFromInput,
  toCoreSource,
} from '../resolvers/ListOperationsResolver.js';

describe('ListOperationsResolver — boundary converters', () => {
  describe('toCoreSource', () => {
    it('maps a list-kind input to a core ListSource', () => {
      const input = Object.assign(new ListSourceInput(), { Kind: 'list', ListID: 'list-1' });
      const result = toCoreSource(input);
      expect(result).toEqual({ kind: 'list', listId: 'list-1' });
    });

    it('maps a view-kind input to a core ListSource', () => {
      const input = Object.assign(new ListSourceInput(), { Kind: 'view', ViewID: 'view-1' });
      expect(toCoreSource(input)).toEqual({ kind: 'view', viewId: 'view-1' });
    });

    it('maps an adhoc-kind input to a core ListSource', () => {
      const input = Object.assign(new ListSourceInput(), {
        Kind: 'adhoc',
        EntityName: 'Contacts',
        ExtraFilter: "Status='Active'",
      });
      expect(toCoreSource(input)).toEqual({
        kind: 'adhoc',
        entityName: 'Contacts',
        extraFilter: "Status='Active'",
      });
    });

    it('throws when list-kind input has no ListID', () => {
      const input = Object.assign(new ListSourceInput(), { Kind: 'list' });
      expect(() => toCoreSource(input)).toThrow(/ListID is required/);
    });

    it('throws when view-kind input has no ViewID', () => {
      const input = Object.assign(new ListSourceInput(), { Kind: 'view' });
      expect(() => toCoreSource(input)).toThrow(/ViewID is required/);
    });

    it('throws when adhoc-kind input lacks EntityName or ExtraFilter', () => {
      const input = Object.assign(new ListSourceInput(), { Kind: 'adhoc', EntityName: 'X' });
      expect(() => toCoreSource(input)).toThrow(/EntityName and ExtraFilter/);
    });

    it('throws on an unknown discriminator', () => {
      const input = Object.assign(new ListSourceInput(), { Kind: 'mystery' as never });
      expect(() => toCoreSource(input)).toThrow(/Unknown ListSourceInput\.Kind/);
    });
  });

  describe('fromCoreDelta', () => {
    it('mirrors all fields and stringifies warning details', () => {
      const delta: ListDelta = {
        TargetListId: 'list-1',
        EntityName: 'Contacts',
        ToAdd: ['a', 'b'],
        ToRemove: ['c'],
        Unchanged: ['d', 'e'],
        Counts: { Add: 2, Remove: 1, Unchanged: 2, SourceTotal: 4, TargetTotal: 3 },
        Warnings: [
          { Code: 'WILL_REMOVE_RECORDS', Message: '1 record will be removed', Details: { Count: 1 } },
        ],
        DeltaToken: 'abc.def',
      };
      const output = fromCoreDelta(delta);
      expect(output).toMatchObject({
        TargetListId: 'list-1',
        EntityName: 'Contacts',
        ToAdd: ['a', 'b'],
        ToRemove: ['c'],
        Unchanged: ['d', 'e'],
        DeltaToken: 'abc.def',
      });
      expect(output.Counts).toEqual(delta.Counts);
      expect(output.Warnings[0]).toMatchObject({
        Code: 'WILL_REMOVE_RECORDS',
        Message: '1 record will be removed',
      });
      const parsed = JSON.parse(output.Warnings[0].DetailsJSON!);
      expect(parsed).toEqual({ Count: 1 });
    });
  });

  describe('fromCoreWarning', () => {
    it('leaves DetailsJSON undefined when no details supplied', () => {
      const output = fromCoreWarning({ Code: 'EMPTY_SOURCE', Message: 'No records' });
      expect(output.DetailsJSON).toBeUndefined();
    });
  });

  describe('fromCoreApplyResult', () => {
    it('flattens Counts into AddedCount / RemovedCount / FailedCount', () => {
      const result: ApplyResult = {
        Success: true,
        ResultCode: 'SUCCESS',
        Message: 'OK',
        TargetListId: 'list-1',
        CreatedListId: 'list-1',
        Counts: { Added: 5, Removed: 2, Failed: 0 },
      };
      const output = fromCoreApplyResult(result);
      expect(output).toMatchObject({
        Success: true,
        ResultCode: 'SUCCESS',
        AddedCount: 5,
        RemovedCount: 2,
        FailedCount: 0,
        CreatedListId: 'list-1',
        TargetListId: 'list-1',
      });
    });

    it('preserves Errors array when present', () => {
      const result: ApplyResult = {
        Success: false,
        ResultCode: 'PARTIAL_SUCCESS',
        Message: 'partial',
        Errors: ['failed record a'],
      };
      expect(fromCoreApplyResult(result).Errors).toEqual(['failed record a']);
    });
  });

  describe('rebuildDeltaFromInput', () => {
    it('reconstructs a core ListDelta from a flat ApplyDeltaInput', () => {
      const input = Object.assign(new ApplyDeltaInput(), {
        TargetListId: 'list-1',
        EntityName: 'Contacts',
        ToAdd: ['a'],
        ToRemove: ['b'],
        Unchanged: ['c'],
        AddCount: 1,
        RemoveCount: 1,
        UnchangedCount: 1,
        SourceTotal: 2,
        TargetTotal: 2,
        DeltaToken: 'tok',
        ConfirmDrops: true,
      });
      const out = rebuildDeltaFromInput(input);
      expect(out).toMatchObject({
        TargetListId: 'list-1',
        EntityName: 'Contacts',
        ToAdd: ['a'],
        ToRemove: ['b'],
        Unchanged: ['c'],
        DeltaToken: 'tok',
      });
      expect(out.Counts).toEqual({ Add: 1, Remove: 1, Unchanged: 1, SourceTotal: 2, TargetTotal: 2 });
      // Warnings are dropped on rebuild (they don't survive the wire round-trip in either direction)
      expect(out.Warnings).toEqual([]);
    });
  });
});
