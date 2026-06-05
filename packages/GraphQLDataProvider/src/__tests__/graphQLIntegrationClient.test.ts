import { describe, expect, it, vi } from 'vitest';

import { GraphQLIntegrationClient } from '../graphQLIntegrationClient';

/**
 * The integration client is a thin transport adapter — we test its behaviour
 * via a stub `GraphQLDataProvider` that records the GraphQL query + variables
 * it receives.
 *
 * CancelSync regression: the resolver (IntegrationDiscoveryResolver
 * `IntegrationCancelSync`) declares `@Arg("companyIntegrationID")` and the
 * engine (`IntegrationEngine.CancelSync`) keys cancellation by
 * companyIntegrationID. The client previously sent a `runID` variable/arg,
 * which fails GraphQL validation against that schema and could never stop a
 * sync. These tests lock the client onto the canonical `companyIntegrationID`
 * contract.
 */

interface RecordedCall {
  query: string;
  variables: Record<string, unknown>;
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

describe('GraphQLIntegrationClient', () => {
  describe('CancelSync', () => {
    it('sends the canonical companyIntegrationID variable + arg the resolver expects', async () => {
      const { provider, calls } = makeProvider({
        IntegrationCancelSync: { Success: true, Message: 'Sync cancellation signalled' },
      });
      // Cast: stub only implements the surface area the client uses.
      const client = new GraphQLIntegrationClient(provider as unknown as never);

      const result = await client.CancelSync('ci-123');

      expect(result.Success).toBe(true);
      expect(result.Message).toBe('Sync cancellation signalled');
      expect(calls).toHaveLength(1);

      // Variable payload must use companyIntegrationID — NOT runID.
      expect(calls[0].variables).toEqual({ companyIntegrationID: 'ci-123' });
      expect(calls[0].variables).not.toHaveProperty('runID');

      // The mutation document must declare + pass companyIntegrationID, never runID.
      const query = calls[0].query;
      expect(query).toContain('$companyIntegrationID: String!');
      expect(query).toContain('IntegrationCancelSync(companyIntegrationID: $companyIntegrationID)');
      expect(query).not.toContain('runID');
    });

    it('falls back to a failure result when the server returns no payload', async () => {
      const { provider } = makeProvider({});
      const client = new GraphQLIntegrationClient(provider as unknown as never);

      const result = await client.CancelSync('ci-456');

      expect(result.Success).toBe(false);
      expect(result.Message).toBe('No response');
    });

    it('catches transport errors and returns them as a failure result', async () => {
      const provider = {
        ExecuteGQL: vi.fn(async () => {
          throw new Error('network down');
        }),
      };
      const client = new GraphQLIntegrationClient(provider as unknown as never);

      const result = await client.CancelSync('ci-789');

      expect(result.Success).toBe(false);
      expect(result.Message).toBe('network down');
    });
  });
});
