import { describe, expect, it, vi } from 'vitest';
import { Kind, parse, type FragmentDefinitionNode } from 'graphql';

import { GraphQLListsClient } from '../graphQLListsClient';

/**
 * The client is a thin transport adapter — we test its behaviour via a
 * stub `GraphQLDataProvider` that records the GraphQL variables it
 * receives. That gives us coverage of:
 *   - the `ListSource` → flat-GraphQL-input serialization,
 *   - the `ListDelta` / `ApplyResult` parsing from the wire-format reply.
 */

interface RecordedCall {
  query: string;
  variables: Record<string, unknown>;
  /** Reply to send back as the GraphQL response payload. */
  reply: Record<string, unknown>;
}

function makeProvider(reply: Record<string, unknown>) {
  const calls: RecordedCall[] = [];
  const provider = {
    ExecuteGQL: vi.fn(async (query: string, variables: Record<string, unknown>) => {
      calls.push({ query, variables, reply });
      return reply;
    }),
  };
  return { provider, calls };
}

describe('GraphQLListsClient', () => {
  describe('PreviewListDelta', () => {
    it('serializes a list source and parses a ListDelta reply', async () => {
      const { provider, calls } = makeProvider({
        PreviewListDelta: {
          TargetListId: 'list-1',
          EntityName: 'Contacts',
          ToAdd: ['a'],
          ToRemove: [],
          Unchanged: ['b'],
          Counts: { Add: 1, Remove: 0, Unchanged: 1, SourceTotal: 2, TargetTotal: 1 },
          Warnings: [],
          DeltaToken: 'tok.sig',
        },
      });

      // Cast: stub only implements the surface area the client uses.
      const client = new GraphQLListsClient(provider as unknown as never);
      const delta = await client.PreviewListDelta({
        Target: 'list-1',
        Source: { kind: 'list', listId: 'src-1' },
        Mode: 'Additive',
      });

      expect(delta.EntityName).toBe('Contacts');
      expect(delta.ToAdd).toEqual(['a']);
      expect(delta.DeltaToken).toBe('tok.sig');
      expect(calls).toHaveLength(1);
      expect(calls[0].variables).toMatchObject({
        input: {
          Target: 'list-1',
          Source: { Kind: 'list', ListID: 'src-1' },
          Mode: 'Additive',
        },
      });
    });

    it('serializes a view source', async () => {
      const { calls, provider } = makeProvider({
        PreviewListDelta: emptyDeltaReply(),
      });
      const client = new GraphQLListsClient(provider as unknown as never);
      await client.PreviewListDelta({
        Target: 'new',
        Source: { kind: 'view', viewId: 'view-1' },
        Mode: 'Sync',
      });
      expect(calls[0].variables).toMatchObject({
        input: {
          Target: 'new',
          Source: { Kind: 'view', ViewID: 'view-1' },
          Mode: 'Sync',
        },
      });
    });

    it('serializes an adhoc source', async () => {
      const { calls, provider } = makeProvider({
        PreviewListDelta: emptyDeltaReply(),
      });
      const client = new GraphQLListsClient(provider as unknown as never);
      await client.PreviewListDelta({
        Target: 'new',
        Source: { kind: 'adhoc', entityName: 'Contacts', extraFilter: "X='Y'" },
        Mode: 'Additive',
      });
      expect(calls[0].variables).toMatchObject({
        input: {
          Source: { Kind: 'adhoc', EntityName: 'Contacts', ExtraFilter: "X='Y'" },
        },
      });
    });

    it('parses warning DetailsJSON back to a structured Details object', async () => {
      const { provider } = makeProvider({
        PreviewListDelta: {
          ...emptyDeltaReply(),
          Warnings: [
            {
              Code: 'WILL_REMOVE_RECORDS',
              Message: '3 will be removed',
              DetailsJSON: JSON.stringify({ Count: 3 }),
            },
          ],
        },
      });
      const client = new GraphQLListsClient(provider as unknown as never);
      const delta = await client.PreviewListDelta({
        Target: 'list-1',
        Source: { kind: 'list', listId: 's' },
        Mode: 'Sync',
      });
      expect(delta.Warnings[0].Code).toBe('WILL_REMOVE_RECORDS');
      expect(delta.Warnings[0].Details).toEqual({ Count: 3 });
    });

    it('throws when the server returns null', async () => {
      const { provider } = makeProvider({ PreviewListDelta: null });
      const client = new GraphQLListsClient(provider as unknown as never);
      await expect(
        client.PreviewListDelta({
          Target: 'list-1',
          Source: { kind: 'list', listId: 's' },
          Mode: 'Additive',
        }),
      ).rejects.toThrow(/empty\/invalid ListDelta/);
    });
  });

  describe('ApplyListDelta', () => {
    it('flattens the delta into the wire input and parses the result', async () => {
      const { provider, calls } = makeProvider({
        ApplyListDelta: {
          Success: true,
          ResultCode: 'SUCCESS',
          Message: 'ok',
          TargetListId: 'list-1',
          AddedCount: 5,
          RemovedCount: 1,
          FailedCount: 0,
        },
      });
      const client = new GraphQLListsClient(provider as unknown as never);
      const result = await client.ApplyListDelta({
        Delta: {
          TargetListId: 'list-1',
          EntityName: 'Contacts',
          ToAdd: ['a', 'b'],
          ToRemove: ['c'],
          Unchanged: ['d'],
          Counts: { Add: 2, Remove: 1, Unchanged: 1, SourceTotal: 3, TargetTotal: 2 },
          Warnings: [],
          DeltaToken: 'tok',
        },
        ConfirmDrops: true,
      });
      expect(result.Success).toBe(true);
      expect(result.Counts).toEqual({ Added: 5, Removed: 1, Failed: 0 });
      const sent = calls[0].variables.input as Record<string, unknown>;
      expect(sent).toMatchObject({
        TargetListId: 'list-1',
        AddCount: 2,
        RemoveCount: 1,
        UnchangedCount: 1,
        DeltaToken: 'tok',
        ConfirmDrops: true,
      });
    });

    it('returns undefined Counts when server omits the count fields', async () => {
      const { provider } = makeProvider({
        ApplyListDelta: { Success: false, ResultCode: 'INVALID_TOKEN', Message: 'no' },
      });
      const client = new GraphQLListsClient(provider as unknown as never);
      const result = await client.ApplyListDelta({
        Delta: makeMinimalDelta(),
        ConfirmDrops: false,
      });
      expect(result.Counts).toBeUndefined();
      expect(result.ResultCode).toBe('INVALID_TOKEN');
    });
  });

  describe('RefreshFromSource', () => {
    it('sends a null mode when none is given, so the list\'s own RefreshMode applies', async () => {
      const { provider, calls } = makeProvider({
        RefreshListFromSource: { Success: true, ResultCode: 'SUCCESS', Message: 'ok', AddedCount: 3, RemovedCount: 0, FailedCount: 0 },
      });
      const client = new GraphQLListsClient(provider as unknown as never);
      const result = await client.RefreshFromSource({ ListId: 'list-1', ConfirmDrops: false });
      expect(calls[0].variables).toEqual({ listId: 'list-1', mode: null, confirmDrops: false });
      expect(result.Counts).toEqual({ Added: 3, Removed: 0, Failed: 0 });
    });

    it('parses the source change of a SOURCE_CHANGED reply, with its date', async () => {
      const { provider, calls } = makeProvider({
        RefreshListFromSource: {
          Success: false, ResultCode: 'SOURCE_CHANGED', Message: 'changed', TargetListId: 'list-1',
          SourceChange: {
            SourceKind: 'view', SourceID: 'v-1', SourceName: 'Active members', ChangedAt: '2026-11-12T10:00:00.000Z',
            LinkedFingerprint: 'fp-old', CurrentFingerprint: 'fp-new',
          },
        },
      });
      const client = new GraphQLListsClient(provider as unknown as never);
      const result = await client.RefreshFromSource({ ListId: 'list-1', Mode: 'Sync', ConfirmDrops: true });
      expect(calls[0].query).toContain('SourceChange');
      expect(calls[0].variables.mode).toBe('Sync');
      expect(result.ResultCode).toBe('SOURCE_CHANGED');
      expect(result.SourceChange).toEqual({
        SourceKind: 'view', SourceID: 'v-1', SourceName: 'Active members', ChangedAt: new Date('2026-11-12T10:00:00.000Z'),
        LinkedFingerprint: 'fp-old', CurrentFingerprint: 'fp-new',
      });
    });
  });

  describe('PreviewRefresh / ApplyRefresh', () => {
    const wireDelta = {
      TargetListId: 'list-1', EntityName: 'Contacts', ToAdd: ['a'], ToRemove: ['c'], Unchanged: ['b'],
      Counts: { Add: 1, Remove: 1, Unchanged: 1, SourceTotal: 2, TargetTotal: 2 }, Warnings: [], DeltaToken: 'tok',
    };

    it('sends the preview options and parses the delta', async () => {
      const { provider, calls } = makeProvider({
        PreviewListRefresh: { Success: true, ResultCode: 'SUCCESS', Message: 'ok', Delta: wireDelta, SourceChange: null },
      });
      const client = new GraphQLListsClient(provider as unknown as never);
      const preview = await client.PreviewRefresh('list-1', { Mode: 'Sync', AcceptCurrentSource: true, Parameters: { Region: 'West' } });
      expect(calls[0].variables).toEqual({ listId: 'list-1', mode: 'Sync', acceptCurrentSource: true, parametersJSON: '{"Region":"West"}' });
      expect(preview.Delta?.ToRemove).toEqual(['c']);
      expect(preview.SourceChange).toBeUndefined();
    });

    it('defaults to the list\'s mode and the approved source', async () => {
      const { provider, calls } = makeProvider({
        PreviewListRefresh: {
          Success: false, ResultCode: 'SOURCE_CHANGED', Message: 'changed', Delta: null,
          SourceChange: { SourceKind: 'query', SourceID: 'q', SourceName: 'Q', ChangedAt: null, LinkedFingerprint: 'a', CurrentFingerprint: 'b' },
        },
      });
      const client = new GraphQLListsClient(provider as unknown as never);
      const preview = await client.PreviewRefresh('list-1');
      expect(calls[0].variables).toEqual({ listId: 'list-1', mode: null, acceptCurrentSource: false, parametersJSON: null });
      expect(preview.Delta).toBeUndefined();
      expect(preview.SourceChange?.ChangedAt).toBeNull();
    });

    it('applies a previewed delta through ApplyListRefresh', async () => {
      const { provider, calls } = makeProvider({
        ApplyListRefresh: { Success: true, ResultCode: 'SUCCESS', Message: 'ok', AddedCount: 1, RemovedCount: 1, FailedCount: 0 },
      });
      const client = new GraphQLListsClient(provider as unknown as never);
      const result = await client.ApplyRefresh({ Delta: { ...wireDelta, Warnings: [] }, ConfirmDrops: true });
      expect(calls[0].query).toContain('ApplyListRefresh(');
      expect(calls[0].variables.input).toMatchObject({ TargetListId: 'list-1', ToRemove: ['c'], DeltaToken: 'tok', ConfirmDrops: true });
      expect(result.Counts).toEqual({ Added: 1, Removed: 1, Failed: 0 });
    });
  });

  describe('ApproveSource', () => {
    it('sends the parameter values as JSON', async () => {
      const { provider, calls } = makeProvider({
        ApproveListSource: { Success: true, ResultCode: 'SUCCESS', Message: 'ok' },
      });
      const client = new GraphQLListsClient(provider as unknown as never);
      const result = await client.ApproveSource({ ListId: 'list-1', ConfirmDrops: true, Parameters: { Since: '2026-01-01' } });
      expect(calls[0].query).toContain('ApproveListSource(');
      expect(calls[0].variables).toEqual({ listId: 'list-1', confirmDrops: true, parametersJSON: '{"Since":"2026-01-01"}' });
      expect(result.Success).toBe(true);
      expect(result.SourceChange).toBeUndefined();
    });

    it('sends null parameters when none are given', async () => {
      const { provider, calls } = makeProvider({
        ApproveListSource: { Success: false, ResultCode: 'PERMISSION_DENIED', Message: 'owner only' },
      });
      const client = new GraphQLListsClient(provider as unknown as never);
      const result = await client.ApproveSource({ ListId: 'list-1', ConfirmDrops: false });
      expect(calls[0].variables.parametersJSON).toBeNull();
      expect(result.ResultCode).toBe('PERMISSION_DENIED');
    });
  });

  describe('ComposeLists', () => {
    it('serializes inputs + optional target', async () => {
      const { calls, provider } = makeProvider({ ComposeLists: emptyDeltaReply() });
      const client = new GraphQLListsClient(provider as unknown as never);
      await client.ComposeLists({
        Op: 'intersection',
        Inputs: [
          { kind: 'view', viewId: 'v1' },
          { kind: 'list', listId: 'l1' },
        ],
        Target: { kind: 'list', listId: 'target' },
      });
      expect(calls[0].variables).toMatchObject({
        input: {
          Op: 'intersection',
          Inputs: [
            { Kind: 'view', ViewID: 'v1' },
            { Kind: 'list', ListID: 'l1' },
          ],
          Target: { Kind: 'list', ListID: 'target' },
        },
      });
    });

    it('sends null Target when omitted', async () => {
      const { calls, provider } = makeProvider({ ComposeLists: emptyDeltaReply() });
      const client = new GraphQLListsClient(provider as unknown as never);
      await client.ComposeLists({
        Op: 'union',
        Inputs: [
          { kind: 'view', viewId: 'v1' },
          { kind: 'view', viewId: 'v2' },
        ],
      });
      expect((calls[0].variables.input as Record<string, unknown>).Target).toBeNull();
    });
  });
});

function emptyDeltaReply() {
  return {
    TargetListId: null,
    EntityName: 'Contacts',
    ToAdd: [],
    ToRemove: [],
    Unchanged: [],
    Counts: { Add: 0, Remove: 0, Unchanged: 0, SourceTotal: 0, TargetTotal: 0 },
    Warnings: [],
    DeltaToken: 'tok',
  };
}

function makeMinimalDelta() {
  return {
    TargetListId: 'list-1',
    EntityName: 'Contacts',
    ToAdd: [] as string[],
    ToRemove: [] as string[],
    Unchanged: [] as string[],
    Counts: { Add: 0, Remove: 0, Unchanged: 0, SourceTotal: 0, TargetTotal: 0 },
    Warnings: [],
    DeltaToken: 'tok',
  };
}

describe('GraphQLListsClient.CreateListFromQuery', () => {
  const reply = {
    CreateListFromQuery: {
      Success: true,
      ResultCode: 'SUCCESS',
      Message: 'Materialized list with 2 member(s)',
      CreatedListId: 'list-1',
      AddedCount: 2,
      RemovedCount: 0,
      FailedCount: 0,
      Errors: [],
      SourceQueryID: 'q-1',
      SourceQueryName: 'Active members',
      SavedNewQuery: true,
      Refreshes: true,
      StaticReason: null,
    },
  };

  it('spreads only fragments declared on CreateListFromQueryResult, its own GraphQL type', async () => {
    const { provider, calls } = makeProvider(reply);
    await new GraphQLListsClient(provider as never).CreateListFromQuery({ ListName: 'L', SQL: 'SELECT 1', RefreshMode: 'Additive' });

    const fragments = parse(calls[0].query).definitions.filter((d): d is FragmentDefinitionNode => d.kind === Kind.FRAGMENT_DEFINITION);
    const resultFragment = fragments.find((f) => f.name.value === 'CreateListFromQueryResultFields');
    expect(resultFragment?.typeCondition.name.value).toBe('CreateListFromQueryResult');
    expect(fragments.map((f) => f.typeCondition.name.value)).not.toContain('ApplyListResultType');
  });

  it('sends Parameters as JSON and reads the query it linked', async () => {
    const { provider, calls } = makeProvider(reply);

    const result = await new GraphQLListsClient(provider as never).CreateListFromQuery({
      ListName: 'L', QueryID: 'q-1', Parameters: { Year: 2026 }, RefreshMode: 'Sync', AutoRefresh: true,
    });

    expect(calls[0].variables.input).toMatchObject({ ListName: 'L', QueryID: 'q-1', ParametersJSON: '{"Year":2026}', RefreshMode: 'Sync', AutoRefresh: true });
    expect(result).toMatchObject({ Success: true, CreatedListId: 'list-1', SourceQueryID: 'q-1', SavedNewQuery: true, Refreshes: true });
    expect(result.StaticReason).toBeUndefined();
  });
});

describe('GraphQLListsClient bulk member operations', () => {
  const ok = { Success: true, ResultCode: 'SUCCESS', Message: 'ok', TargetListId: 'list-1', AddedCount: 2, RemovedCount: 0, FailedCount: 0 };

  /** The name of the first field selected by the operation, i.e. the mutation called. */
  function mutationName(query: string): string {
    const op = parse(query).definitions.find((d) => d.kind === Kind.OPERATION_DEFINITION);
    if (!op || op.kind !== Kind.OPERATION_DEFINITION) throw new Error('no operation');
    expect(op.operation).toBe('mutation');
    const first = op.selectionSet.selections[0];
    return first.kind === Kind.FIELD ? first.name.value : '';
  }

  it('AddRecordsToList sends the list and record IDs and parses the counts', async () => {
    const { provider, calls } = makeProvider({ AddRecordsToList: ok });
    const result = await new GraphQLListsClient(provider as never).AddRecordsToList('list-1', ['a', 'b']);

    expect(mutationName(calls[0].query)).toBe('AddRecordsToList');
    expect(calls[0].variables).toEqual({ listId: 'list-1', recordIds: ['a', 'b'] });
    expect(result).toMatchObject({ Success: true, TargetListId: 'list-1', Counts: { Added: 2, Removed: 0, Failed: 0 } });
  });

  it('AddRecordsToList sends the status and order options when given', async () => {
    const { provider, calls } = makeProvider({ AddRecordsToList: ok });
    await new GraphQLListsClient(provider as never).AddRecordsToList('list-1', ['a', 'b'], { Status: 'Active', SequenceFromOrder: true });

    expect(calls[0].variables).toEqual({ listId: 'list-1', recordIds: ['a', 'b'], status: 'Active', sequenceFromOrder: true });
    expect(calls[0].query).toContain('status: $status');
    expect(calls[0].query).toContain('sequenceFromOrder: $sequenceFromOrder');
  });

  it('RemoveRecordsFromList sends the list and record IDs', async () => {
    const { provider, calls } = makeProvider({ RemoveRecordsFromList: { ...ok, AddedCount: 0, RemovedCount: 2 } });
    const result = await new GraphQLListsClient(provider as never).RemoveRecordsFromList('list-1', ['a', 'b']);

    expect(mutationName(calls[0].query)).toBe('RemoveRecordsFromList');
    expect(calls[0].variables).toEqual({ listId: 'list-1', recordIds: ['a', 'b'] });
    expect(result.Counts?.Removed).toBe(2);
  });

  it('DuplicateList sends a null name when none is given and reads the new list ID', async () => {
    const { provider, calls } = makeProvider({ DuplicateList: { ...ok, CreatedListId: 'list-2', TargetListId: 'list-2' } });
    const result = await new GraphQLListsClient(provider as never).DuplicateList('list-1');

    expect(mutationName(calls[0].query)).toBe('DuplicateList');
    expect(calls[0].variables).toEqual({ listId: 'list-1', listName: null });
    expect(result.CreatedListId).toBe('list-2');
  });

  it('DuplicateList sends the given name', async () => {
    const { provider, calls } = makeProvider({ DuplicateList: ok });
    await new GraphQLListsClient(provider as never).DuplicateList('list-1', 'Renamed');
    expect(calls[0].variables).toEqual({ listId: 'list-1', listName: 'Renamed' });
  });

  it('CopyRecordsToList sends source, target, records and the move flag', async () => {
    const { provider, calls } = makeProvider({ CopyRecordsToList: { ...ok, RemovedCount: 2 } });
    const result = await new GraphQLListsClient(provider as never).CopyRecordsToList({
      SourceListId: 'list-1', TargetListId: 'list-2', RecordIds: ['a', 'b'], RemoveFromSource: true,
    });

    expect(mutationName(calls[0].query)).toBe('CopyRecordsToList');
    expect(calls[0].variables).toEqual({ sourceListId: 'list-1', targetListId: 'list-2', recordIds: ['a', 'b'], removeFromSource: true });
    expect(result.Counts).toEqual({ Added: 2, Removed: 2, Failed: 0 });
  });

  it('SetRecordStatus calls SetListRecordStatus and reads UpdatedCount into Counts.Updated', async () => {
    const { provider, calls } = makeProvider({
      SetListRecordStatus: { ...ok, AddedCount: 0, UpdatedCount: 2 },
    });
    const result = await new GraphQLListsClient(provider as never).SetRecordStatus('list-1', ['a', 'b'], 'Complete');

    expect(mutationName(calls[0].query)).toBe('SetListRecordStatus');
    expect(calls[0].query).toContain('UpdatedCount');
    expect(calls[0].variables).toEqual({ listId: 'list-1', recordIds: ['a', 'b'], status: 'Complete' });
    expect(result.Counts).toEqual({ Added: 0, Removed: 0, Failed: 0, Updated: 2 });
  });

  it('CreateListFromRecords sends the entity, records and options', async () => {
    const { provider, calls } = makeProvider({ CreateListFromRecords: { ...ok, CreatedListId: 'list-9' } });
    const result = await new GraphQLListsClient(provider as never).CreateListFromRecords({
      EntityName: 'Contacts', RecordIds: ['a'], ListName: 'New', Description: 'd', CategoryId: 'cat-1',
    });

    expect(mutationName(calls[0].query)).toBe('CreateListFromRecords');
    expect(calls[0].variables).toEqual({
      entityName: 'Contacts', recordIds: ['a'], options: { ListName: 'New', Description: 'd', CategoryId: 'cat-1' },
    });
    expect(result.CreatedListId).toBe('list-9');
  });
});
