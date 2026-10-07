import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ChangeDetectorRef } from '@angular/core';
import { By } from '@angular/platform-browser';
import { renderComponentFixture, clearOverlayContainers } from '@memberjunction/ng-test-utils';
import type { IMetadataProvider } from '@memberjunction/core';
import { UserInfoEngine } from '@memberjunction/core-entities';
import { LiveKitRoomComponent, LIVEKIT_ROOM_CONTROLLER_FACTORY } from '@memberjunction/ng-livekit-room';
import type { LiveKitParticipantView, LiveKitRoomController, LiveKitRoomState } from '@memberjunction/livekit-room-core';
import {
  ParsePipRects,
  ParsePlacementMoves,
  SerializePipRects,
  SerializePlacementMoves,
  type MediaPipRect,
} from '@memberjunction/ai-realtime-client/media';
import { MJLiveKitRoomComponent, LIVEKIT_PIP_PREF_KEY, LIVEKIT_PLACEMENT_PREF_KEY } from './mj-livekit-room.component';

/** A participant without media: the room lays them out, and nothing is attached. */
function person(identity: string, over: { Local?: boolean; Agent?: boolean } = {}): LiveKitParticipantView {
  return {
    Identity: identity,
    DisplayName: identity,
    IsLocal: over.Local ?? false,
    Role: over.Agent ? 'agent' : 'participant',
    IsSpeaking: false,
    AudioLevel: 0,
    HasAudio: true,
    HasVideo: false,
    IsScreenSharing: false,
    ConnectionQuality: 'good',
    Raw: { audioLevel: 0, getTrackPublication: () => undefined },
  } as unknown as LiveKitParticipantView;
}

/** A connected room with the user, Ada, Bo and the agent, and a controller that does nothing. */
function fakeController(): LiveKitRoomController {
  const state = {
    Status: 'connected',
    Local: person('you', { Local: true }),
    Remote: [person('ada'), person('bo'), person('sage', { Agent: true })],
    ActiveSpeakerIdentities: [],
    LocalMedia: { MicrophoneEnabled: false, CameraEnabled: false, ScreenShareEnabled: false },
    AudioPlaybackBlocked: false,
    NoiseFilterEnabled: false,
    BackgroundEffect: { Kind: 'none' },
    E2EEEnabled: false,
  } as unknown as LiveKitRoomState;
  return {
    State: state,
    Events: { On: () => () => undefined },
    ToggleMicrophone: vi.fn(),
    ToggleCamera: vi.fn(),
    ToggleScreenShare: vi.fn(),
    SetScreenShareEnabled: vi.fn(() => Promise.resolve()),
    ChangeScreenShare: vi.fn(() => Promise.resolve()),
    Connect: vi.fn(() => Promise.resolve()),
    Disconnect: vi.fn(() => Promise.resolve()),
    Dispose: vi.fn(),
    StartAudio: vi.fn(() => Promise.resolve()),
    SwitchDevice: vi.fn(() => Promise.resolve()),
    SetNoiseFilterEnabled: vi.fn(),
    SetBackgroundEffect: vi.fn(),
    SendData: vi.fn(() => Promise.resolve()),
    ListDevices: vi.fn(() => Promise.resolve([])),
    GetActiveDeviceId: vi.fn(() => null),
  } as unknown as LiveKitRoomController;
}

const BOX: MediaPipRect = { X: 0.6, Y: 0.6, W: 0.3, H: 0.25 };

/**
 * DOM spec for the MJ binding's saved layout: it gives the generic room the user's saved moves and boxes, and saves
 * them, per user under the meeting room's keys, as the user changes them. The room is the real one, driven by a fake
 * controller; the user's settings are a stand-in for `UserInfoEngine`.
 */
describe('MJLiveKitRoomComponent: the saved layout (DOM)', () => {
  let saved: Map<string, string>;
  let writes: [string, string][];

  /** Puts the user's settings in a stand-in for a settings engine. */
  const stubSettings = (engine: UserInfoEngine) => {
    vi.spyOn(engine, 'GetSetting').mockImplementation((key: string) => saved.get(key));
    vi.spyOn(engine, 'SetSettingDebounced').mockImplementation((key: string, value: string) => {
      writes.push([key, value]);
    });
  };

  beforeEach(() => {
    saved = new Map();
    writes = [];
    stubSettings(UserInfoEngine.Instance);
  });
  afterEach(() => {
    vi.restoreAllMocks();
    clearOverlayContainers();
  });

  /** The binding with its room shown, as once its token is resolved. */
  const render = (inputs: Record<string, unknown> = {}) => {
    const f = renderComponentFixture(MJLiveKitRoomComponent, {
      providers: [{ provide: LIVEKIT_ROOM_CONTROLLER_FACTORY, useValue: fakeController }],
      inputs: { AutoStart: false, Mode: 'join', Layout: 'spotlight', ShowPreJoin: false, ...inputs },
    });
    f.componentInstance.ServerUrl = 'wss://example.test';
    f.componentInstance.Token = 'token';
    f.componentRef.injector.get(ChangeDetectorRef).markForCheck();
    f.detectChanges();
    return f;
  };
  const roomOf = (f: ReturnType<typeof render>) => f.debugElement.query(By.directive(LiveKitRoomComponent)).componentInstance as LiveKitRoomComponent;
  const lastWrite = (key: string) => [...writes].reverse().find(([k]) => k === key)?.[1];

  it("gives the room the user's saved moves and boxes", () => {
    saved.set(LIVEKIT_PLACEMENT_PREF_KEY, SerializePlacementMoves([{ SurfaceKey: 'participant:ada', Placement: 'stage' }]));
    saved.set(LIVEKIT_PIP_PREF_KEY, SerializePipRects(new Map([['bo', BOX]])));
    const room = roomOf(render());
    expect(room.PinnedIdentity).toBe('ada');
    expect(room.PipRects.get('bo')).toEqual(BOX);
  });

  it("saves the room's moves under the meeting room's key when the user moves a tile", () => {
    const f = render();
    roomOf(f).MoveTile('bo', 'pip');
    expect(ParsePlacementMoves(lastWrite(LIVEKIT_PLACEMENT_PREF_KEY))).toEqual([{ SurfaceKey: 'participant:bo', Placement: 'pip' }]);
    expect(f.componentInstance.TileMoves).toEqual([{ SurfaceKey: 'participant:bo', Placement: 'pip' }]);
  });

  it("saves the boxes under the meeting room's key when the user moves one", () => {
    const f = render();
    roomOf(f).OnPipRectChange({ Key: 'bo', Rect: BOX });
    expect([...ParsePipRects(lastWrite(LIVEKIT_PIP_PREF_KEY))]).toEqual([['bo', BOX]]);
  });

  it('saves an empty layout when the user resets it', () => {
    saved.set(LIVEKIT_PLACEMENT_PREF_KEY, SerializePlacementMoves([{ SurfaceKey: 'participant:ada', Placement: 'pip' }]));
    saved.set(LIVEKIT_PIP_PREF_KEY, SerializePipRects(new Map([['ada', BOX]])));
    roomOf(render()).OnResetLayout();
    expect(ParsePlacementMoves(lastWrite(LIVEKIT_PLACEMENT_PREF_KEY))).toEqual([]);
    expect(ParsePipRects(lastWrite(LIVEKIT_PIP_PREF_KEY)).size).toBe(0);
  });

  /**
   * A provider's own settings engine. `UserInfoEngine.GetProviderInstance` is stubbed: called for a connection it has not
   * seen, it currently constructs the engine class again, which hands back the global engine and resets it.
   */
  const providerEngine = (loaded: boolean, savedForProvider: Map<string, string>, providerWrites: string[]) => {
    const engine = {
      Loaded: loaded,
      GetSetting: vi.fn((key: string) => savedForProvider.get(key)),
      SetSettingDebounced: vi.fn((key: string) => {
        providerWrites.push(key);
      }),
    } as unknown as UserInfoEngine;
    const lookup = vi.spyOn(UserInfoEngine, 'GetProviderInstance').mockReturnValue(engine);
    return { engine, lookup };
  };
  const PROVIDER = { InstanceConnectionString: 'test://mj-livekit-room' } as unknown as IMetadataProvider;

  it("reads and saves through the given provider's settings once they have loaded", () => {
    const forProvider = new Map([[LIVEKIT_PLACEMENT_PREF_KEY, SerializePlacementMoves([{ SurfaceKey: 'participant:sage', Placement: 'pip' }])]]);
    const providerWrites: string[] = [];
    const { lookup } = providerEngine(true, forProvider, providerWrites);
    const f = render({ Provider: PROVIDER });
    expect(lookup).toHaveBeenCalledWith(PROVIDER, UserInfoEngine);
    expect(f.componentInstance.TileMoves).toEqual([{ SurfaceKey: 'participant:sage', Placement: 'pip' }]);
    roomOf(f).MoveTile('ada', 'pip');
    expect(providerWrites).toEqual([LIVEKIT_PLACEMENT_PREF_KEY]);
    expect(writes).toEqual([]);
  });

  it("uses the global settings while the provider's have not loaded", () => {
    const providerWrites: string[] = [];
    const { engine } = providerEngine(false, new Map(), providerWrites);
    saved.set(LIVEKIT_PLACEMENT_PREF_KEY, SerializePlacementMoves([{ SurfaceKey: 'participant:bo', Placement: 'pip' }]));
    const f = render({ Provider: PROVIDER });
    expect(f.componentInstance.TileMoves).toEqual([{ SurfaceKey: 'participant:bo', Placement: 'pip' }]);
    expect(engine.GetSetting).not.toHaveBeenCalled();
  });
});
