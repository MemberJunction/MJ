/**
 * Server-side writes must drop the client's RunView dedup-linger entries.
 *
 * The linger cache (ProviderBase.DedupLingerMs, 5s) replays an identical RunView answered in the
 * last 5s, and only a BaseEntity save/delete event raised in THIS process invalidated it. A Remote
 * Operation, an Action, an agent run — any mutation that wrote server-side — left the client serving
 * pre-operation rows for up to 5s (found by the BizApps Voting wire tests). The GraphQL transport
 * now invalidates after every mutation; queries leave the cache alone.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('graphql-request', async () => {
    const wire = await import('./support/graphQLWire');
    return { gql: wire.FakeGql, GraphQLClient: wire.FakeGraphQLClient };
});

import { IsGraphQLMutation } from '../graphQLOperationKind';
import { FakeGraphQLResponseError, GraphQLWire } from './support/graphQLWire';
import { CreateWireTestProvider, ResetGraphQLProviderSingleton, WireTestGraphQLProvider } from './support/wireTestHarness';

describe('IsGraphQLMutation', () => {
    it.each([
        ['mutation Save($input: X!) { Save(input: $input) { ID } }', true],
        ['  \n mutation { Ping }', true],
        ['# leading comment\nmutation ExecuteRemoteOperation($k: String!) { X }', true],
        ['fragment F on T { a }\nmutation M { m { ...F } }', true],
        ['mutation@dir { m }', true],
        ['query RunViewQuery ($input: RunDynamicViewInput!) { R(input: $input) { Success } }', false],
        ['{ Ping { Pong } }', false],
        ['# mutation in a comment\nquery Q { a }', false],
        ['subscription S { s }', false],
        ['query mutationHistory { mutationHistory { ID } }', false],
        ['', false],
    ])('%j -> %s', (doc, expected) => {
        expect(IsGraphQLMutation(doc)).toBe(expected);
    });

    it('treats null/undefined as not a mutation', () => {
        expect(IsGraphQLMutation(null)).toBe(false);
        expect(IsGraphQLMutation(undefined)).toBe(false);
    });
});

describe('GraphQLDataProvider drops RunView dedup-linger entries after mutations', () => {
    let provider: WireTestGraphQLProvider;

    beforeEach(() => {
        GraphQLWire.Reset();
        provider = CreateWireTestProvider();
    });

    afterEach(() => {
        ResetGraphQLProviderSingleton();
    });

    it('a mutation invalidates', async () => {
        const spy = vi.spyOn(provider, 'InvalidateRunViewDedupCache');
        GraphQLWire.EnqueueResponse({ RunAction: { Success: true } });
        await provider.ExecuteGQL('mutation RunAction($input: RunActionInput!) { RunAction(input: $input) { Success } }', { input: {} });
        expect(spy).toHaveBeenCalledTimes(1);
        expect(spy).toHaveBeenCalledWith();
    });

    it('a failed mutation still invalidates (it may have written part-way)', async () => {
        const spy = vi.spyOn(provider, 'InvalidateRunViewDedupCache');
        GraphQLWire.EnqueueError(new FakeGraphQLResponseError('nope', 'INTERNAL'));
        await expect(provider.ExecuteGQL('mutation M { m }', {})).rejects.toBeDefined();
        expect(spy).toHaveBeenCalledTimes(1);
    });

    it('a query does not invalidate', async () => {
        const spy = vi.spyOn(provider, 'InvalidateRunViewDedupCache');
        GraphQLWire.EnqueueResponse({ Ping: { Pong: true } });
        await provider.ExecuteGQL('query Ping { Ping { Pong } }', {});
        expect(spy).not.toHaveBeenCalled();
    });

    it('a Remote Operation routed over the wire invalidates', async () => {
        const spy = vi.spyOn(provider, 'InvalidateRunViewDedupCache');
        GraphQLWire.EnqueueResponse({
            ExecuteRemoteOperation: { success: true, resultCode: 'OK', outputJSON: '{"closed":true}', handle: null, errorMessage: null },
        });
        const result = await provider.RouteOperation<{ BallotID: string }, { closed: boolean }>('Ballots.Close', { BallotID: 'b-1' });
        expect(result.Success).toBe(true);
        expect(result.Output).toEqual({ closed: true });
        expect(GraphQLWire.LastRequest.document).toContain('mutation ExecuteRemoteOperation');
        expect(spy).toHaveBeenCalled();
    });
});
