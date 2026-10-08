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
  getRoomTurnState: vi.fn((room: string): unknown => (room === 'busy-room' ? { RoomId: room, Agents: [] } : null)),
  setTurnToolBinder: vi.fn(),
  setAgentVisionResolver: vi.fn(),
  getBridgeRuntime: vi.fn(),
  stopRecording: vi.fn(async () => ({ EgressID: 'eg-1', RoomName: 'room-1', Status: 'EGRESS_COMPLETE' })),
  setAgentVision: vi.fn(async (): Promise<{ Success: boolean; NotInRoom?: boolean; ErrorMessage?: string }> => ({ Success: true })),
  writeConsentAudit: vi.fn(async () => undefined),
  getRoomForEgress: vi.fn(async (_id: string): Promise<string | undefined> => 'room-1'),
  stopAgentRoomSession: vi.fn(async () => true),
  stopAllAgentsInRoom: vi.fn(async () => 1),
  getRoomForBridge: vi.fn((_id: string): string | undefined => 'room-1'),
}));

// These two are instantiated with `new` by the resolver, so they must be constructible. They were
// `vi.fn(() => ({...}))`, which vitest 3 tolerated as a constructor but vitest 4 rejects with
// "is not a constructor" — classes express the intent and work under both.
vi.mock('@memberjunction/livekit-room-server', () => ({
  LiveKitTokenService: class {
    MintClientToken = h.mintClientToken;
  },
  // SetSessionFactory is exercised by the resolver's module-load binding of the realtime-session factory.
  LiveKitAgentRoomCoordinator: {
    Instance: {
      StartAgentRoomSession: h.startAgentRoomSession,
      SetSessionFactory: vi.fn(),
      SetTurnToolBinder: h.setTurnToolBinder,
      SetAgentVisionResolver: h.setAgentVisionResolver,
      GetRoomTurnState: h.getRoomTurnState,
      StopAgentRoomSession: h.stopAgentRoomSession,
      StopAllAgentsInRoom: h.stopAllAgentsInRoom,
      GetRoomForBridge: h.getRoomForBridge,
    },
  },
  LiveKitUserIdentity: (id: string) => `user-${id}`.toLowerCase(),
  RoomHandoffEngine: { Instance: { Deps: h.handoffDeps } },
  LiveKitEgressService: class {
    StartRoomRecording = h.startRecording;
    StopRecording = h.stopRecording;
    GetRoomForEgress = h.getRoomForEgress;
  },
  RoomAuthorizationService: (() => {
    let testAuthorizer: ((roomName: string, user: unknown, provider?: unknown) => Promise<{ Authorized: boolean; Reason?: string }>) | undefined = undefined;
    return {
      Instance: {
        AuthorizeRoomAccess: vi.fn(async (roomName: string, user: unknown, provider?: unknown) => {
          if (testAuthorizer) {
            return await testAuthorizer(roomName, user, provider);
          }
          return { Authorized: true };
        }),
        SetAuthorizerForTesting: vi.fn((fn?: (roomName: string, user: unknown, provider?: unknown) => Promise<{ Authorized: boolean; Reason?: string }>) => {
          testAuthorizer = fn;
        }),
      },
    };
  })(),
  LiveKitParticipantService: class {
    SetAgentVision = h.setAgentVision;
  },
}));

// Mock the consent audit writer so the thin resolver is tested in isolation. Its own behavior is covered by
// agentVisionConsentAudit.test.ts.
vi.mock('../resolvers/agentVisionConsentAudit', () => ({
  WriteAgentVisionConsentAudit: h.writeConsentAudit,
}));

// Mock the agent factory so importing the resolver doesn't pull the heavy @memberjunction/ai-agents graph
// into this thin resolver test (the binding only needs the symbol to exist).
vi.mock('@memberjunction/ai-agents', () => ({
  CreateBridgeRealtimeSession: vi.fn(),
  FinalizeBridgeCoAgentRuns: vi.fn(),
  GetRealtimeModelVoices: vi.fn(),
  CreateBridgeRoomTranscriptSink: vi.fn(),
  GetBridgeRealtimeRuntime: h.getBridgeRuntime,
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

import { RealtimeBridgeResolver, MintLiveKitClientTokenInput, LiveKitRecordingInput, SetLiveKitAgentVisionInput, StartLiveKitAgentRoomSessionInput } from '../resolvers/RealtimeBridgeResolver';
import { RoomAuthorizationService } from '@memberjunction/livekit-room-server';
import type { AppContext } from '../types.js';

/** A resolver subclass that supplies a fake authenticated user (GetUserFromPayload is protected). */
class TestableResolver extends RealtimeBridgeResolver {
  public user: UserInfo | undefined = { ID: 'U1', Name: 'Amith', Email: 'amith@x.com' } as unknown as UserInfo;
  protected override GetUserFromPayload(): UserInfo | undefined {
    return this.user;
  }
}

const ctx = {} as AppContext;

// The resolver module installs the binder once, as it loads. `restoreMocks` clears call history before each test,
// so take it now rather than reading `mock.calls` inside a test.
type TurnToolBinderFn = (session: object, handler: object) => void;
const installedTurnToolBinder = h.setTurnToolBinder.mock.calls[0]?.[0] as TurnToolBinderFn | undefined;
type AgentVisionResolverFn = (session: object) => boolean;
const installedAgentVisionResolver = h.setAgentVisionResolver.mock.calls[0]?.[0] as AgentVisionResolverFn | undefined;

describe('RealtimeBridgeResolver', () => {
  let resolver: TestableResolver;

  beforeEach(() => {
    resolver = new TestableResolver();
    h.setAgentVision.mockClear();
    h.writeConsentAudit.mockClear();
    RoomAuthorizationService.Instance.SetAuthorizerForTesting(async () => ({ Authorized: true }));
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

  describe('GetLiveKitRoomTurnState', () => {
    it('serves a room\'s snapshot as JSON for the typed client to parse', async () => {
      const result = await resolver.GetLiveKitRoomTurnState('busy-room', ctx);
      expect(result.Success).toBe(true);
      expect(JSON.parse(result.StateJSON as string)).toEqual({ RoomId: 'busy-room', Agents: [] });
    });

    it('reports success with no state when the room holds no agents', async () => {
      const result = await resolver.GetLiveKitRoomTurnState('empty-room', ctx);
      expect(result).toEqual({ Success: true, StateJSON: undefined });
    });

    it('requires an authenticated user', async () => {
      resolver.user = undefined;
      const result = await resolver.GetLiveKitRoomTurnState('busy-room', ctx);
      expect(result.Success).toBe(false);
      expect(result.ErrorMessage).toMatch(/current user/i);
    });

    it('turns a failure into a structured error instead of throwing', async () => {
      h.getRoomTurnState.mockImplementationOnce(() => {
        throw new Error('boom');
      });
      const result = await resolver.GetLiveKitRoomTurnState('busy-room', ctx);
      expect(result).toMatchObject({ Success: false, ErrorMessage: 'boom' });
    });
  });

  describe('turn-taking tool binding', () => {
    it('installs the engine\'s tool handler as the model session runtime\'s local tool handler', () => {
      const binder = installedTurnToolBinder!;
      const setLocalToolHandler = vi.fn();
      h.getBridgeRuntime.mockReturnValueOnce({ SetLocalToolHandler: setLocalToolHandler });
      const session = {};
      const handler = {};
      binder(session, handler);
      expect(h.getBridgeRuntime).toHaveBeenCalledWith(session);
      expect(setLocalToolHandler).toHaveBeenCalledWith(handler);
    });

    it('does not throw when the session has no bridge runtime', () => {
      const binder = installedTurnToolBinder!;
      h.getBridgeRuntime.mockReturnValueOnce(undefined);
      expect(() => binder({}, {})).not.toThrow();
    });
  });

  describe('agent vision binding', () => {
    it("says an agent watches meetings exactly when its session runtime says so", () => {
      const resolve = installedAgentVisionResolver!;
      const session = {};
      h.getBridgeRuntime.mockReturnValueOnce({ WatchesMeetingVideo: true });
      expect(resolve(session)).toBe(true);
      expect(h.getBridgeRuntime).toHaveBeenCalledWith(session);
      h.getBridgeRuntime.mockReturnValueOnce({ WatchesMeetingVideo: false });
      expect(resolve(session)).toBe(false);
    });

    it('says no for a session with no bridge runtime', () => {
      h.getBridgeRuntime.mockReturnValueOnce(undefined);
      expect(installedAgentVisionResolver!({})).toBe(false);
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

    it('refuses to stop a recording when user is unauthorized for the room', async () => {
      RoomAuthorizationService.Instance.SetAuthorizerForTesting(async () => ({
        Authorized: false,
        Reason: 'Not allowed to access this room',
      }));
      const result = await resolver.StopLiveKitRecording('eg-1', ctx);
      expect(result.Success).toBe(false);
      expect(result.ErrorMessage).toMatch(/Not allowed to access this room/);
    });

    it('refuses to stop a recording when room cannot be determined for egress ID', async () => {
      h.getRoomForEgress.mockResolvedValueOnce(undefined);
      const result = await resolver.StopLiveKitRecording('unknown-egress', ctx);
      expect(result.Success).toBe(false);
      expect(result.ErrorMessage).toMatch(/Unable to determine room/);
    });

    it('requires an authenticated user to record', async () => {
      resolver.user = undefined;
      const input = Object.assign(new LiveKitRecordingInput(), { RoomName: 'room-1' });
      const result = await resolver.StartLiveKitRecording(input, ctx);
      expect(result.Success).toBe(false);
      expect(result.ErrorMessage).toMatch(/current user/i);
    });
  });

  describe('SetLiveKitAgentVision', () => {
    const choose = (allow: boolean) => Object.assign(new SetLiveKitAgentVisionInput(), { RoomName: 'room-1', Allow: allow });

    it("records the signed-in user's own choice, as their participant identity, and audits it", async () => {
      const result = await resolver.SetLiveKitAgentVision(choose(true), ctx);
      expect(result).toEqual({ Success: true });
      expect(h.setAgentVision).toHaveBeenCalledWith('room-1', 'user-u1', true);
      expect(h.writeConsentAudit).toHaveBeenCalledWith(
        { User: resolver.user, RoomName: 'room-1', Allow: true, Applied: true, ErrorMessage: undefined },
        null,
      );
    });

    it('passes a withdrawal through as it is', async () => {
      await resolver.SetLiveKitAgentVision(choose(false), ctx);
      expect(h.setAgentVision).toHaveBeenCalledWith('room-1', 'user-u1', false);
    });

    it('says when the user is not in the room, and audits the refusal', async () => {
      h.setAgentVision.mockResolvedValueOnce({ Success: false, NotInRoom: true, ErrorMessage: 'user-u1 is not in room room-1.' });
      const result = await resolver.SetLiveKitAgentVision(choose(true), ctx);
      expect(result).toEqual({ Success: false, ErrorMessage: 'You are not in this room.' });
      expect(h.writeConsentAudit).toHaveBeenCalledWith(expect.objectContaining({ Applied: false, ErrorMessage: 'user-u1 is not in room room-1.' }), null);
    });

    it("passes LiveKit's other refusals on", async () => {
      h.setAgentVision.mockResolvedValueOnce({ Success: false, ErrorMessage: 'LiveKit is not configured on this server.' });
      const result = await resolver.SetLiveKitAgentVision(choose(true), ctx);
      expect(result).toEqual({ Success: false, ErrorMessage: 'LiveKit is not configured on this server.' });
    });

    it('does nothing without an authenticated user', async () => {
      resolver.user = undefined;
      const result = await resolver.SetLiveKitAgentVision(choose(true), ctx);
      expect(result.Success).toBe(false);
      expect(result.ErrorMessage).toMatch(/current user/i);
      expect(h.setAgentVision).not.toHaveBeenCalled();
      expect(h.writeConsentAudit).not.toHaveBeenCalled();
    });

    it('refuses, and audits the refusal, when the user may not enter the room', async () => {
      RoomAuthorizationService.Instance.SetAuthorizerForTesting(async () => ({ Authorized: false, Reason: 'User is not authorized for this room.' }));
      const result = await resolver.SetLiveKitAgentVision(choose(true), ctx);
      expect(result).toEqual({ Success: false, ErrorMessage: 'User is not authorized for this room.' });
      expect(h.setAgentVision).not.toHaveBeenCalled();
      expect(h.writeConsentAudit).toHaveBeenCalledWith(
        expect.objectContaining({ Allow: true, Applied: false, ErrorMessage: 'User is not authorized for this room.' }),
        null,
      );
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

  describe('Per-room authorization enforcement', () => {
    beforeEach(() => {
      vi.clearAllMocks();
      RoomAuthorizationService.Instance.SetAuthorizerForTesting(async () => ({
        Authorized: false,
        Reason: 'User is not authorized for this room.',
      }));
    });

    it('MintLiveKitClientToken rejects unauthorized room access', async () => {
      const input = Object.assign(new MintLiveKitClientTokenInput(), { RoomName: 'private-room' });
      const result = await resolver.MintLiveKitClientToken(input, ctx);
      expect(result.Success).toBe(false);
      expect(result.ErrorMessage).toBe('User is not authorized for this room.');
      expect(h.mintClientToken).not.toHaveBeenCalled();
    });

    it('StartLiveKitAgentRoomSession rejects unauthorized room access', async () => {
      const input = Object.assign(new StartLiveKitAgentRoomSessionInput(), {
        RoomName: 'private-room',
        AgentID: 'agent-1',
      });
      const result = await resolver.StartLiveKitAgentRoomSession(input, ctx);
      expect(result.Success).toBe(false);
      expect(result.ErrorMessage).toBe('User is not authorized for this room.');
      expect(h.startAgentRoomSession).not.toHaveBeenCalled();
    });

    it('StopLiveKitAgentRoomSession rejects unauthorized room access', async () => {
      h.getRoomForBridge.mockReturnValueOnce('private-room');
      const result = await resolver.StopLiveKitAgentRoomSession('bridge-1', ctx);
      expect(result).toBe(false);
      expect(h.stopAgentRoomSession).not.toHaveBeenCalled();
    });

    it('StopLiveKitAgentRoomSession proceeds when room access is authorized', async () => {
      RoomAuthorizationService.Instance.SetAuthorizerForTesting(async () => ({ Authorized: true }));
      h.getRoomForBridge.mockReturnValueOnce('private-room');
      const result = await resolver.StopLiveKitAgentRoomSession('bridge-1', ctx);
      expect(result).toBe(true);
      expect(h.stopAgentRoomSession).toHaveBeenCalledWith('bridge-1', 'Explicit', resolver.user, null);
    });

    it('EndLiveKitRoom rejects unauthorized room access', async () => {
      const result = await resolver.EndLiveKitRoom('private-room', ctx);
      expect(result).toBe(false);
      expect(h.stopAllAgentsInRoom).not.toHaveBeenCalled();
    });

    it('EndLiveKitRoom proceeds when room access is authorized', async () => {
      RoomAuthorizationService.Instance.SetAuthorizerForTesting(async () => ({ Authorized: true }));
      const result = await resolver.EndLiveKitRoom('private-room', ctx);
      expect(result).toBe(true);
      expect(h.stopAllAgentsInRoom).toHaveBeenCalledWith('private-room', 'Explicit', resolver.user, null);
    });

    it('GetLiveKitRoomTurnState rejects unauthorized room access', async () => {
      const result = await resolver.GetLiveKitRoomTurnState('private-room', ctx);
      expect(result.Success).toBe(false);
      expect(result.ErrorMessage).toBe('User is not authorized for this room.');
    });

    it('InviteUsersToLiveKitRoom rejects unauthorized room access', async () => {
      const result = await resolver.InviteUsersToLiveKitRoom('private-room', ['user-2'], ctx);
      expect(result).toBe(false);
    });

    it('StartLiveKitRecording rejects unauthorized room access', async () => {
      const input = Object.assign(new LiveKitRecordingInput(), { RoomName: 'private-room' });
      const result = await resolver.StartLiveKitRecording(input, ctx);
      expect(result.Success).toBe(false);
      expect(result.ErrorMessage).toBe('User is not authorized for this room.');
      expect(h.startRecording).not.toHaveBeenCalled();
    });
  });
});
