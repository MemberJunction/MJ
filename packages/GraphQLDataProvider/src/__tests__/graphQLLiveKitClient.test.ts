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

  describe('SetAgentVision', () => {
    it("sends the room and the user's choice, and returns the server's answer", async () => {
      const { provider, calls } = makeProvider({ SetLiveKitAgentVision: { Success: false, ErrorMessage: 'You are not in this room.' } });
      const result = await new GraphQLLiveKitClient(provider).SetAgentVision('r1', true);

      expect(calls[0].variables).toEqual({ input: { RoomName: 'r1', Allow: true } });
      expect(calls[0].query).toContain('SetLiveKitAgentVision(input: $input)');
      expect(result).toEqual({ Success: false, ErrorMessage: 'You are not in this room.' });
    });

    it('sends a withdrawal as it is', async () => {
      const { provider, calls } = makeProvider({ SetLiveKitAgentVision: { Success: true } });
      const result = await new GraphQLLiveKitClient(provider).SetAgentVision('r1', false);

      expect(calls[0].variables).toEqual({ input: { RoomName: 'r1', Allow: false } });
      expect(result.Success).toBe(true);
    });

    it('turns a missing reply or a transport error into a failure (never throws)', async () => {
      const empty = await new GraphQLLiveKitClient(makeProvider({}).provider).SetAgentVision('r1', true);
      const thrown = await new GraphQLLiveKitClient(
        makeProvider(() => {
          throw new Error('network down');
        }).provider,
      ).SetAgentVision('r1', true);

      expect(empty).toEqual({ Success: false, ErrorMessage: 'Invalid response from server' });
      expect(thrown).toEqual({ Success: false, ErrorMessage: 'network down' });
    });
  });

  describe('GetRealtimeModelVoices', () => {
    it("selects each voice's persona, avatar and preview image, and returns them as the server sent them", async () => {
      const models = [
        {
          ModelID: 'm1',
          ModelName: 'Live Voice Model',
          Voices: [
            { ID: 'Puck', Name: 'Puck', PersonaID: 'p-puck', AvatarID: null, PreviewImageURL: null },
            { ID: 'Puck', Name: 'Avery', PersonaID: 'p-avery', AvatarID: 'Avery', PreviewImageURL: 'https://img.example.test/avery.png' },
            { ID: 'Kore', Name: 'Kore', PersonaID: null, AvatarID: null, PreviewImageURL: null },
          ],
        },
      ];
      const { provider, calls } = makeProvider({ GetRealtimeModelVoices: models });
      const result = await new GraphQLLiveKitClient(provider).GetRealtimeModelVoices();

      const voiceFields = /\bVoices\s*{([^}]*)}/.exec(calls[0].query)?.[1].split(/\s+/).filter(Boolean);
      expect(voiceFields).toEqual(['ID', 'Name', 'PersonaID', 'AvatarID', 'PreviewImageURL']);
      expect(result).toEqual(models);
    });

    it('resolves to an empty list when the query fails, so the picker offers no overrides', async () => {
      const { provider } = makeProvider(() => {
        throw new Error('network down');
      });
      expect(await new GraphQLLiveKitClient(provider).GetRealtimeModelVoices()).toEqual([]);
    });
  });

  describe('GetRoomTurnState', () => {
    const state = {
      RoomId: 'r1',
      AgentSessionIds: ['a1', 'a2'],
      FacilitatorAgentSessionId: null,
      FloorHolderAgentSessionId: 'a1',
      FloorHeldSinceMs: 1000,
      HumanSpeaking: false,
      PendingHandoffToAgentSessionId: null,
      ConsecutiveAgentTurns: 2,
      MaxConsecutiveAgentTurns: 8,
      LoopCapReached: false,
      BackchannelCount: 3,
      RecentEvents: [{ Seq: 1, AtMs: 1000, Type: 'FloorGranted', AgentSessionId: 'a1', Reason: 'FloorFree' }],
      Agents: [{ AgentSessionID: 'a1', SessionBridgeID: 'b1', Names: ['Sage'], TurnMode: 'Passive', Addressing: 'ModelSide', FullDuplex: true }],
    };

    it('queries by room name and parses the JSON state', async () => {
      const { provider, calls } = makeProvider({ GetLiveKitRoomTurnState: { Success: true, StateJSON: JSON.stringify(state) } });
      const result = await new GraphQLLiveKitClient(provider).GetRoomTurnState('r1');

      expect(calls[0].variables).toEqual({ roomName: 'r1' });
      expect(result.Success).toBe(true);
      expect(result.State?.FloorHolderAgentSessionId).toBe('a1');
      expect(result.State?.RecentEvents[0].Type).toBe('FloorGranted');
      expect(result.State?.Agents[0].Addressing).toBe('ModelSide');
    });

    it('returns a null state when the room holds no agents', async () => {
      const { provider } = makeProvider({ GetLiveKitRoomTurnState: { Success: true, StateJSON: null } });
      const result = await new GraphQLLiveKitClient(provider).GetRoomTurnState('r1');
      expect(result).toEqual({ Success: true, ErrorMessage: undefined, State: null });
    });

    it('reports a server-side failure without state', async () => {
      const { provider } = makeProvider({ GetLiveKitRoomTurnState: { Success: false, ErrorMessage: 'nope', StateJSON: JSON.stringify(state) } });
      const result = await new GraphQLLiveKitClient(provider).GetRoomTurnState('r1');
      expect(result).toEqual({ Success: false, ErrorMessage: 'nope', State: null });
    });

    it('normalizes a transport error or unparseable state into a failure (never throws)', async () => {
      const down = makeProvider(() => {
        throw new Error('network down');
      });
      expect((await new GraphQLLiveKitClient(down.provider).GetRoomTurnState('r1')).ErrorMessage).toMatch(/network down/);

      const garbled = makeProvider({ GetLiveKitRoomTurnState: { Success: true, StateJSON: '{not json' } });
      const result = await new GraphQLLiveKitClient(garbled.provider).GetRoomTurnState('r1');
      expect(result.Success).toBe(false);
      expect(result.State).toBeNull();
    });

    it('rejects an empty reply', async () => {
      const { provider } = makeProvider({});
      const result = await new GraphQLLiveKitClient(provider).GetRoomTurnState('r1');
      expect(result.Success).toBe(false);
    });
  });
});
