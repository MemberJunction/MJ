/**
 * Network diagnostic observations carry approximate request and response sizes on the
 * graphql-request path, not placeholders. Only graphql-request is faked (./support/graphQLWire.ts).
 */
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';

vi.mock('graphql-request', async () => {
    const wire = await import('./support/graphQLWire');
    return { gql: wire.FakeGql, GraphQLClient: wire.FakeGraphQLClient };
});

import { NetworkDiagnosticObservation, RegisterNetworkDiagnosticObserver } from '../graphQLDataProvider';
import { GraphQLWire } from './support/graphQLWire';
import { CreateWireTestProvider, ResetGraphQLProviderSingleton } from './support/wireTestHarness';

const QUERY = 'query Ping($a: Int) { Ping(a: $a) { Pong } }';

describe('GraphQLDataProvider network observation sizes', () => {
    const observations: NetworkDiagnosticObservation[] = [];
    let unregister: () => void;

    beforeEach(() => {
        GraphQLWire.Reset();
        observations.length = 0;
        unregister = RegisterNetworkDiagnosticObserver((obs) => observations.push(obs));
    });

    afterEach(() => {
        unregister();
        ResetGraphQLProviderSingleton();
    });

    it('reports the JSON size of the response and of the query plus variables', async () => {
        const provider = CreateWireTestProvider();
        const variables = { a: 1, name: 'x'.repeat(40) };
        const response = { Ping: { Pong: 'p'.repeat(100) } };
        GraphQLWire.EnqueueResponse(response);

        await provider.ExecuteGQL(QUERY, variables);

        expect(observations).toHaveLength(1);
        expect(observations[0].responseBytes).toBe(JSON.stringify(response).length);
        expect(observations[0].requestBytes).toBe(QUERY.length + JSON.stringify(variables).length);
    });
});
