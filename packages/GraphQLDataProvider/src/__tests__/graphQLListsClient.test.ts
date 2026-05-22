import { describe, expect, it, vi } from 'vitest';

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
