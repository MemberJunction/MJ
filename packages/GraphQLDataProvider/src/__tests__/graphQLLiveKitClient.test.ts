import { describe, expect, it, vi } from 'vitest';
import { GraphQLLiveKitClient } from '../graphQLLiveKitClient';
import type { GraphQLDataProvider } from '../graphQLDataProvider';

/**
 * The LiveKit client is a thin transport adapter — tested via a stub `GraphQLDataProvider` that records
 * the GraphQL variables and returns a canned reply, covering: variable shaping, reply parsing, and the
 * error-normalization fallback (the client never throws; it returns `{ Success: false, ... }`).
 */
function makeProvider(reply: Record<string, unknown> | (() => never)) {
  const calls: { query: string; variables: Record<string, unknown> }[] = [];
  const provider = {
    ExecuteGQL: vi.fn(async (query: string, variables: Record<string, unknown>) => {
      calls.push({ query, variables });
      if (typeof reply === 'function') {
        reply();
      }
      return reply;
    }),
  } as unknown as GraphQLDataProvider;
  return { provider, calls };
}

describe('GraphQLLiveKitClient', () => {
  describe('MintClientToken', () => {
    it('passes the input and returns the parsed token result', async () => {
      const { provider, calls } = makeProvider({
        MintLiveKitClientToken: { Success: true, ServerUrl: 'wss://x', Token: 'jwt', Identity: 'user-1', RoomName: 'r1' },
      });
      const client = new GraphQLLiveKitClient(provider);
      const result = await client.MintClientToken({ RoomName: 'r1', DisplayName: 'Amith' });

      expect(calls[0].variables).toEqual({ input: { RoomName: 'r1', DisplayName: 'Amith' } });
      expect(result.Success).toBe(true);
      expect(result.Token).toBe('jwt');
      expect(result.RoomName).toBe('r1');
    });

    it('normalizes a thrown transport error into a failure result (never throws)', async () => {
      const { provider } = makeProvider(() => {
        throw new Error('network down');
      });
      const client = new GraphQLLiveKitClient(provider);
      const result = await client.MintClientToken({ RoomName: 'r1' });
      expect(result.Success).toBe(false);
      expect(result.ErrorMessage).toMatch(/network down/);
      expect(result.RoomName).toBe('r1');
    });
  });

  describe('StartAgentRoomSession', () => {
    it('returns the session result with the client token', async () => {
      const { provider } = makeProvider({
        StartLiveKitAgentRoomSession: {
          Success: true,
          SessionBridgeID: 'b1',
          RoomName: 'mj-1',
          ServerUrl: 'wss://x',
          ClientToken: 'jwt',
          Identity: 'user-1',
        },
      });
      const client = new GraphQLLiveKitClient(provider);
      const result = await client.StartAgentRoomSession({ AgentID: 'a1', AgentName: 'Sage' });
      expect(result.Success).toBe(true);
      expect(result.SessionBridgeID).toBe('b1');
      expect(result.ClientToken).toBe('jwt');
    });
  });

  describe('recording', () => {
    it('starts a recording and returns the egress id', async () => {
      const { provider, calls } = makeProvider({
        StartLiveKitRecording: { Success: true, EgressID: 'eg-1', Status: 'ACTIVE' },
      });
      const client = new GraphQLLiveKitClient(provider);
      const result = await client.StartRecording('r1', 'speaker-dark');
      expect(calls[0].variables).toEqual({ input: { RoomName: 'r1', Layout: 'speaker-dark' } });
      expect(result.Success).toBe(true);
      expect(result.EgressID).toBe('eg-1');
    });

    it('stops a recording by egress id', async () => {
      const { provider, calls } = makeProvider({
        StopLiveKitRecording: { Success: true, EgressID: 'eg-1', Status: 'COMPLETE' },
      });
      const client = new GraphQLLiveKitClient(provider);
      const result = await client.StopRecording('eg-1');
      expect(calls[0].variables).toEqual({ egressID: 'eg-1' });
      expect(result.Success).toBe(true);
      expect(result.Status).toBe('COMPLETE');
    });

    it('normalizes recording errors, preserving the egress id', async () => {
      const { provider } = makeProvider(() => {
        throw new Error('egress unavailable');
      });
      const client = new GraphQLLiveKitClient(provider);
      const result = await client.StopRecording('eg-9');
      expect(result.Success).toBe(false);
      expect(result.EgressID).toBe('eg-9');
      expect(result.ErrorMessage).toMatch(/egress unavailable/);
    });
  });
});
