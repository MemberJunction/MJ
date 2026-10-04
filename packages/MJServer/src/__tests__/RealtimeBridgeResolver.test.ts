// type-graphql decorators on the resolver call Reflect.getMetadata, which only exists when this polyfill
// is loaded first. Vitest does not bring it in automatically — this MUST precede the resolver import.
import 'reflect-metadata';

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { UserInfo } from '@memberjunction/core';

// Mock the server-side LiveKit services so the thin resolver is tested in isolation (no LiveKit creds).
const h = vi.hoisted(() => ({
  mintClientToken: vi.fn(async (room: string, identity: string) => ({
    ServerUrl: 'wss://x.livekit.cloud',
    Token: `jwt-${identity}`,
    Identity: identity,
    RoomName: room,
  })),
  startAgentRoomSession: vi.fn(async () => ({ SessionBridgeID: 'bridge-std', RoomName: 'room-std', ServerUrl: 'wss://x.livekit.cloud' })),
  handoffDeps: { AgentStarter: undefined as undefined | ((req: Record<string, unknown>) => Promise<{ SessionBridgeID: string }>) },
  startRecording: vi.fn(async () => ({ EgressID: 'eg-1', RoomName: 'room-1', Status: 'EGRESS_ACTIVE' })),
  stopRecording: vi.fn(async () => ({ EgressID: 'eg-1', RoomName: 'room-1', Status: 'EGRESS_COMPLETE' })),
}));

// These two are instantiated with `new` by the resolver, so they must be constructible. They were
// `vi.fn(() => ({...}))`, which vitest 3 tolerated as a constructor but vitest 4 rejects with
// "is not a constructor" — classes express the intent and work under both.
vi.mock('@memberjunction/livekit-room-server', () => ({
  LiveKitTokenService: class {
    MintClientToken = h.mintClientToken;
  },
  // SetSessionFactory is exercised by the resolver's module-load binding of the realtime-session factory.
  LiveKitAgentRoomCoordinator: { Instance: { StartAgentRoomSession: h.startAgentRoomSession, SetSessionFactory: vi.fn() } },
  LiveKitUserIdentity: (id: string) => `user-${id}`.toLowerCase(),
  RoomHandoffEngine: { Instance: { Deps: h.handoffDeps } },
  LiveKitEgressService: class {
    StartRoomRecording = h.startRecording;
    StopRecording = h.stopRecording;
  },
}));

// Mock the agent factory so importing the resolver doesn't pull the heavy @memberjunction/ai-agents graph
// into this thin resolver test (the binding only needs the symbol to exist).
vi.mock('@memberjunction/ai-agents', () => ({
  CreateBridgeRealtimeSession: vi.fn(),
  FinalizeBridgeCoAgentRuns: vi.fn(),
  GetRealtimeModelVoices: vi.fn(),
  CreateBridgeRoomTranscriptSink: vi.fn(),
  // SessionManager's constructor defaults to `new RealtimeClientSessionService()` when this resolver
  // doesn't inject one (it never finalizes client-direct co-agent runs itself) — the mock must still
  // export the class so that default construction doesn't throw.
  RealtimeClientSessionService: class {
    FinalizeCoAgentRun = vi.fn(async () => undefined);
  },
}));

// Mock the meeting-recording registration so the thin resolver is tested in isolation (no MJStorage /
// core-entities graph). Its own behavior is covered by meetingRecordingRegistration.test.ts.
vi.mock('../resolvers/meetingRecordingRegistration', () => ({
  RegisterMeetingRecordingFile: vi.fn(async () => ({ Success: true, RecordingFileID: 'file-1', ConversationID: 'conv-1' })),
    get registerMeetingRecordingFile() { return this.RegisterMeetingRecordingFile; },
  CorrelateRecordingStart: vi.fn(async () => true),
    get correlateRecordingStart() { return this.CorrelateRecordingStart; },
}));

import { RealtimeBridgeResolver, MintLiveKitClientTokenInput, LiveKitRecordingInput, StartLiveKitAgentRoomSessionInput } from '../resolvers/RealtimeBridgeResolver';
import type { AppContext } from '../types.js';

/** A resolver subclass that supplies a fake authenticated user (GetUserFromPayload is protected). */
class TestableResolver extends RealtimeBridgeResolver {
  public user: UserInfo | undefined = { ID: 'U1', Name: 'Amith', Email: 'amith@x.com' } as unknown as UserInfo;
  protected override GetUserFromPayload(): UserInfo | undefined {
    return this.user;
  }
}

const ctx = {} as AppContext;

describe('RealtimeBridgeResolver', () => {
  let resolver: TestableResolver;

  beforeEach(() => {
    resolver = new TestableResolver();
  });

  describe('MintLiveKitClientToken', () => {
    it('derives the participant identity from the user and returns the token', async () => {
      const input = Object.assign(new MintLiveKitClientTokenInput(), { RoomName: 'room-1', DisplayName: 'Amith' });
      const result = await resolver.MintLiveKitClientToken(input, ctx);
      expect(result.Success).toBe(true);
      expect(result.Identity).toBe('user-u1'); // lowercased user-${ID}
      expect(result.Token).toBe('jwt-user-u1');
      expect(result.RoomName).toBe('room-1');
      expect(h.mintClientToken).toHaveBeenCalledWith('room-1', 'user-u1', 'Amith');
    });

    it('fails cleanly when there is no authenticated user', async () => {
      resolver.user = undefined;
      const input = Object.assign(new MintLiveKitClientTokenInput(), { RoomName: 'room-1' });
      const result = await resolver.MintLiveKitClientToken(input, ctx);
      expect(result.Success).toBe(false);
      expect(result.ErrorMessage).toMatch(/current user/i);
      expect(result.RoomName).toBe('room-1');
    });
  });

  describe('recording', () => {
    it('starts a recording and maps the result', async () => {
      const input = Object.assign(new LiveKitRecordingInput(), { RoomName: 'room-1', Layout: 'grid' });
      const result = await resolver.StartLiveKitRecording(input, ctx);
      expect(result.Success).toBe(true);
      expect(result.EgressID).toBe('eg-1');
      expect(result.Status).toBe('EGRESS_ACTIVE');
    });

    it('stops a recording, registers the MP4, and returns the RecordingFileID', async () => {
      const result = await resolver.StopLiveKitRecording('eg-1', ctx);
      expect(result.Success).toBe(true);
      expect(result.Status).toBe('EGRESS_COMPLETE');
      // The registration mock returns a file id, which the resolver surfaces on the result.
      expect(result.RecordingFileID).toBe('file-1');
    });

    it('requires an authenticated user to record', async () => {
      resolver.user = undefined;
      const input = Object.assign(new LiveKitRecordingInput(), { RoomName: 'room-1' });
      const result = await resolver.StartLiveKitRecording(input, ctx);
      expect(result.Success).toBe(false);
      expect(result.ErrorMessage).toMatch(/current user/i);
    });
  });
  describe('StartLiveKitAgentRoomSession with handoff', () => {
    const input = (over: Partial<StartLiveKitAgentRoomSessionInput> = {}) =>
      Object.assign(new StartLiveKitAgentRoomSessionInput(), { RoomName: 'room-h', AgentID: 'co-agent', TargetAgentID: 'target-agent', AgentName: 'Sage', AgentSessionID: 'AS1', ...over });

    beforeEach(() => {
      h.startAgentRoomSession.mockClear();
      h.mintClientToken.mockClear();
      h.handoffDeps.AgentStarter = undefined;
    });

    it('starts the agent through the handoff-capable starter when asked, naming the signed-in user as the caller, and returns a token for the same room', async () => {
      const starter = vi.fn(async () => ({ SessionBridgeID: 'bridge-h' }));
      h.handoffDeps.AgentStarter = starter;
      const result = await resolver.StartLiveKitAgentRoomSession(input({ EnableHandoff: true, RealtimeVoice: 'echo' }), ctx);
      expect(result).toMatchObject({ Success: true, SessionBridgeID: 'bridge-h', RoomName: 'room-h', ClientToken: 'jwt-user-u1', Identity: 'user-u1' });
      expect(starter).toHaveBeenCalledWith(
        expect.objectContaining({ RoomName: 'room-h', AgentID: 'target-agent', AgentName: 'Sage', CallerLabel: 'Amith', RealtimeVoice: 'echo' }),
      );
      expect(h.startAgentRoomSession).not.toHaveBeenCalled();
    });

    it('falls back to the standard room start when handoff is requested but the server cannot do it', async () => {
      const result = await resolver.StartLiveKitAgentRoomSession(input({ EnableHandoff: true }), ctx);
      expect(result).toMatchObject({ Success: true, SessionBridgeID: 'bridge-std' });
      expect(h.startAgentRoomSession).toHaveBeenCalledTimes(1);
    });

    it('does not touch the handoff starter unless asked', async () => {
      const starter = vi.fn(async () => ({ SessionBridgeID: 'bridge-h' }));
      h.handoffDeps.AgentStarter = starter;
      await resolver.StartLiveKitAgentRoomSession(input(), ctx);
      expect(starter).not.toHaveBeenCalled();
      expect(h.startAgentRoomSession).toHaveBeenCalledTimes(1);
    });

    it('reports a failure to start the handoff-capable agent instead of silently starting a plain one', async () => {
      h.handoffDeps.AgentStarter = vi.fn(async () => {
        throw new Error('All agent lines are busy right now.');
      });
      const result = await resolver.StartLiveKitAgentRoomSession(input({ EnableHandoff: true }), ctx);
      expect(result.Success).toBe(false);
      expect(result.ErrorMessage).toContain('busy');
      expect(h.startAgentRoomSession).not.toHaveBeenCalled();
    });

    it('requires an authenticated user', async () => {
      resolver.user = undefined;
      const result = await resolver.StartLiveKitAgentRoomSession(input({ EnableHandoff: true }), ctx);
      expect(result.Success).toBe(false);
      expect(result.ErrorMessage).toMatch(/current user/i);
    });
  });
});
