import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { BehaviorSubject, of, type Observable } from 'rxjs';
import { ChangeDetectorRef } from '@angular/core';
import { By } from '@angular/platform-browser';
import { renderComponentFixture, clearOverlayContainers } from '@memberjunction/ng-test-utils';
import type { IMetadataProvider } from '@memberjunction/core';
import { UserInfoEngine } from '@memberjunction/core-entities';
import { GraphQLLiveKitClient } from '@memberjunction/graphql-dataprovider';
import { LiveKitRoomComponent, LIVEKIT_ROOM_CONTROLLER_FACTORY } from '@memberjunction/ng-livekit-room';
import { LOCAL_MEDIA_CONTROLLER_FACTORY } from '@memberjunction/ng-realtime-media';
import {
  LIVEKIT_PREVIEW_PEOPLE,
  LiveKitPreviewRoomController,
  LiveKitRoomEventBus,
  type ILiveKitRoomController,
  type LiveKitParticipantView,
  type LiveKitRoomState,
} from '@memberjunction/livekit-room-core';
import {
  ParsePipRects,
  ParsePlacementMoves,
  SerializePipRects,
  SerializePlacementMoves,
  type ILocalMediaController,
  type LocalMediaKind,
  type LocalMediaResult,
  type LocalMediaState,
  type LocalTrackState,
  type MediaDevice,
  type MediaPipRect,
} from '@memberjunction/ai-realtime-client/media';
import {
  MJLiveKitRoomComponent,
  LIVEKIT_PIP_PREF_KEY,
  LIVEKIT_PLACEMENT_PREF_KEY,
  LIVEKIT_PREVIEW_PLACEMENT_PREF_KEY,
} from './mj-livekit-room.component';

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
function fakeController(over: Partial<LiveKitRoomState> = {}): ILiveKitRoomController {
  const state: LiveKitRoomState = {
    Status: 'connected',
    Local: person('you', { Local: true }),
    Remote: [person('ada'), person('bo'), person('sage', { Agent: true })],
    ActiveSpeakerIdentities: [],
    LocalMedia: { MicrophoneEnabled: false, CameraEnabled: false, ScreenShareEnabled: false },
    AudioPlaybackBlocked: false,
    NoiseFilterEnabled: false,
    BackgroundEffect: { Kind: 'none' },
    E2EEEnabled: false,
    ...over,
  };
  return {
    Events: new LiveKitRoomEventBus(),
    State$: of(state),
    State: state,
    Status: state.Status,
    ToggleMicrophone: vi.fn(() => Promise.resolve(true)),
    ToggleCamera: vi.fn(() => Promise.resolve(true)),
    ToggleScreenShare: vi.fn(() => Promise.resolve(true)),
    SetMicrophoneEnabled: vi.fn(() => Promise.resolve()),
    SetCameraEnabled: vi.fn(() => Promise.resolve()),
    SetScreenShareEnabled: vi.fn(() => Promise.resolve()),
    ChangeScreenShare: vi.fn(() => Promise.resolve()),
    Connect: vi.fn(() => Promise.resolve()),
    Disconnect: vi.fn(() => Promise.resolve(true)),
    Dispose: vi.fn(),
    StartAudio: vi.fn(() => Promise.resolve()),
    SwitchDevice: vi.fn(() => Promise.resolve()),
    SetNoiseFilterEnabled: vi.fn(() => Promise.resolve(true)),
    SetBackgroundEffect: vi.fn(() => Promise.resolve(true)),
    SendData: vi.fn(() => Promise.resolve()),
    ListDevices: vi.fn(() => Promise.resolve([])),
    GetActiveDeviceId: vi.fn(() => null),
  };
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
      providers: [{ provide: LIVEKIT_ROOM_CONTROLLER_FACTORY, useValue: () => fakeController() }],
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

/** A camera and microphone that start at once and record whether they were released. */
class FakeMedia implements ILocalMediaController {
  public Released = false;
  private readonly state = new BehaviorSubject<LocalMediaState>({ Camera: { Status: 'off' }, Microphone: { Status: 'off' }, Devices: [] });
  public get State(): LocalMediaState {
    return this.state.value;
  }
  public get State$(): Observable<LocalMediaState> {
    return this.state.asObservable();
  }
  public GetStream(): MediaStream | null {
    return null;
  }
  public async RefreshDevices(): Promise<MediaDevice[]> {
    return [];
  }
  public async Start(kind: LocalMediaKind): Promise<LocalMediaResult> {
    this.set(kind, { Status: 'on' });
    // A stand-in stream without audio tracks: nothing to meter or play.
    return { Status: 'started', Stream: { id: kind, getTracks: () => [], getAudioTracks: () => [] } as unknown as MediaStream };
  }
  public async SwitchDevice(kind: LocalMediaKind): Promise<LocalMediaResult> {
    return this.Start(kind);
  }
  public Stop(kind: LocalMediaKind): void {
    this.set(kind, { Status: 'off' });
  }
  public Dispose(): void {
    this.Released = true;
  }
  private set(kind: LocalMediaKind, track: LocalTrackState): void {
    this.state.next(kind === 'camera' ? { ...this.state.value, Camera: track } : { ...this.state.value, Microphone: track });
  }
}

/**
 * DOM spec for preview mode: the binding opens the real room on the preview controller (your camera and microphone,
 * here a fake, and simulated people) with nothing minted, and keeps the preview's layout apart from meetings'.
 */
describe('MJLiveKitRoomComponent: the preview room (DOM)', () => {
  let saved: Map<string, string>;
  let writes: string[];
  let media: FakeMedia[];

  beforeEach(() => {
    saved = new Map();
    writes = [];
    media = [];
    vi.spyOn(UserInfoEngine.Instance, 'GetSetting').mockImplementation((key: string) => saved.get(key));
    vi.spyOn(UserInfoEngine.Instance, 'SetSettingDebounced').mockImplementation((key: string) => {
      writes.push(key);
    });
    // jsdom does not play media: a stream source's <video> calls play(), and pause() when it lets go.
    vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined);
    vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => undefined);
  });
  afterEach(() => {
    vi.restoreAllMocks();
    clearOverlayContainers();
  });

  /** The binding in preview mode, started as on init, with fake devices; rendered once the preview has joined. */
  const render = async (inputs: Record<string, unknown> = {}) => {
    const f = renderComponentFixture(MJLiveKitRoomComponent, {
      providers: [
        {
          provide: LOCAL_MEDIA_CONTROLLER_FACTORY,
          useValue: () => {
            const made = new FakeMedia();
            media.push(made);
            return made;
          },
        },
      ],
      inputs: { Mode: 'preview', ShowPreJoin: false, EnableRecording: true, ...inputs },
    });
    for (let i = 0; i < 6; i++) {
      await new Promise((resolve) => setTimeout(resolve, 0));
      f.detectChanges();
    }
    return f;
  };
  const roomOf = (f: Awaited<ReturnType<typeof render>>) => f.debugElement.query(By.directive(LiveKitRoomComponent)).componentInstance as LiveKitRoomComponent;

  it('opens the room on the preview controller with nothing minted: you, with the simulated people', async () => {
    const mint = vi.spyOn(GraphQLLiveKitClient.prototype, 'MintClientToken');
    const session = vi.spyOn(GraphQLLiveKitClient.prototype, 'StartAgentRoomSession');
    const room = roomOf(await render({ DisplayName: 'Grace' }));
    expect(room.Controller).toBeInstanceOf(LiveKitPreviewRoomController);
    expect(room.State.Status).toBe('connected');
    expect(room.State.Local?.DisplayName).toBe('Grace');
    expect(room.State.Remote.map((p) => p.DisplayName)).toEqual(LIVEKIT_PREVIEW_PEOPLE.map((p) => p.DisplayName));
    expect(media).toHaveLength(1);
    expect(mint).not.toHaveBeenCalled();
    expect(session).not.toHaveBeenCalled();
  });

  it('joins as the signed-in user when no name is given', async () => {
    vi.spyOn(UserInfoEngine, 'GetProviderInstance').mockReturnValue(UserInfoEngine.Instance);
    const provider = { CurrentUser: { Name: 'Grace Hopper' }, InstanceConnectionString: 'test://preview' } as unknown as IMetadataProvider;
    const room = roomOf(await render({ Provider: provider }));
    expect(room.State.Local?.DisplayName).toBe('Grace Hopper');
  });

  it('offers no recording, which needs a server', async () => {
    expect(roomOf(await render()).ShowRecordingControl).toBe(false);
  });

  it("keeps the preview's layout under its own keys, apart from meetings'", async () => {
    saved.set(LIVEKIT_PLACEMENT_PREF_KEY, SerializePlacementMoves([{ SurfaceKey: 'participant:ada', Placement: 'stage' }]));
    saved.set(LIVEKIT_PREVIEW_PLACEMENT_PREF_KEY, SerializePlacementMoves([{ SurfaceKey: 'participant:preview-bo', Placement: 'pip' }]));
    const f = await render();
    expect(f.componentInstance.TileMoves).toEqual([{ SurfaceKey: 'participant:preview-bo', Placement: 'pip' }]);
    roomOf(f).MoveTile('preview-ada', 'pip');
    expect(writes).toEqual([LIVEKIT_PREVIEW_PLACEMENT_PREF_KEY]);
  });

  it('frees your devices when it goes away', async () => {
    const f = await render();
    f.destroy();
    expect(media[0].Released).toBe(true);
  });

  it('lets you choose what the agent sees, and the preview room records it at once, without asking MJAPI', async () => {
    const set = vi.spyOn(GraphQLLiveKitClient.prototype, 'SetAgentVision').mockResolvedValue({ Success: true });
    const f = await render();
    f.componentInstance.ResolvedRoomName = 'preview-room';
    const button = (title: string) => f.nativeElement.querySelector(`button[title="${title}"]`) as HTMLButtonElement | null;
    button('Let the agent see your camera and screen')?.click();
    f.detectChanges();
    expect(roomOf(f).State.LocalMedia.AgentVisionOn).toBe(true);
    button('Stop letting the agent see your camera and screen')?.click();
    f.detectChanges();
    expect(roomOf(f).State.LocalMedia.AgentVisionOn).toBe(false);
    expect(button('Let the agent see your camera and screen')).not.toBeNull();
    expect(set).not.toHaveBeenCalled();
  });

  it('offers no switch when the host turns it off', async () => {
    const f = await render({ EnableAgentVisionControl: false });
    expect(f.nativeElement.querySelector('button[title="Let the agent see your camera and screen"]')).toBeNull();
  });
});

/**
 * DOM spec for the agent-vision switch in a meeting: the binding asks MJAPI to record the user's choice for the room,
 * and when MJAPI can't, says why in a notice over the room, which stays open. The room is the real one, on a fake
 * controller whose agent watches; MJAPI is a stand-in for `GraphQLLiveKitClient.SetAgentVision`.
 */
describe('MJLiveKitRoomComponent: what the agent sees, in a meeting (DOM)', () => {
  const LET = 'button[title="Let the agent see your camera and screen"]';

  beforeEach(() => {
    vi.spyOn(UserInfoEngine.Instance, 'GetSetting').mockReturnValue(undefined);
    vi.spyOn(UserInfoEngine.Instance, 'SetSettingDebounced').mockImplementation(() => undefined);
  });
  afterEach(() => {
    vi.restoreAllMocks();
    clearOverlayContainers();
  });

  /** The binding in a meeting whose agent watches, with its room shown. */
  const render = (over: Partial<LiveKitRoomState> = {}) => {
    const f = renderComponentFixture(MJLiveKitRoomComponent, {
      providers: [{ provide: LIVEKIT_ROOM_CONTROLLER_FACTORY, useValue: () => fakeController({ AgentWatching: true, ...over }) }],
      inputs: { AutoStart: false, Mode: 'join', ShowPreJoin: false },
    });
    f.componentInstance.ServerUrl = 'wss://example.test';
    f.componentInstance.Token = 'token';
    f.componentInstance.ResolvedRoomName = 'room-1';
    f.componentRef.injector.get(ChangeDetectorRef).markForCheck();
    f.detectChanges();
    return f;
  };
  /** Clicks the switch, then lets MJAPI's answer arrive. */
  const flip = async (f: ReturnType<typeof render>, button = LET) => {
    (f.nativeElement.querySelector(button) as HTMLButtonElement).click();
    for (let i = 0; i < 3; i++) {
      await new Promise((resolve) => setTimeout(resolve, 0));
      f.detectChanges();
    }
  };
  const notice = (f: ReturnType<typeof render>) => f.nativeElement.querySelector('mj-alert') as HTMLElement | null;

  it("asks MJAPI to record the user's choice for this room, and says nothing when it does", async () => {
    const set = vi.spyOn(GraphQLLiveKitClient.prototype, 'SetAgentVision').mockResolvedValue({ Success: true });
    const f = render();
    await flip(f);
    expect(set).toHaveBeenCalledWith('room-1', true);
    expect(notice(f)).toBeNull();
  });

  it('asks MJAPI to withdraw it when the user turns the switch off', async () => {
    const set = vi.spyOn(GraphQLLiveKitClient.prototype, 'SetAgentVision').mockResolvedValue({ Success: true });
    const f = render({ LocalMedia: { MicrophoneEnabled: false, CameraEnabled: false, ScreenShareEnabled: false, AgentVisionOn: true } });
    await flip(f, 'button[title="Stop letting the agent see your camera and screen"]');
    expect(set).toHaveBeenCalledWith('room-1', false);
  });

  it("says why when MJAPI can't, emits the error, and keeps the room open", async () => {
    vi.spyOn(GraphQLLiveKitClient.prototype, 'SetAgentVision').mockResolvedValue({ Success: false, ErrorMessage: 'You are not in this room.' });
    const f = render();
    const errors: string[] = [];
    f.componentInstance.ErrorOccurred.subscribe((e: { Kind: string; Message: string }) => errors.push(`${e.Kind}: ${e.Message}`));
    await flip(f);
    expect(notice(f)?.textContent).toContain("Couldn't change what the agent sees: You are not in this room.");
    expect(errors).toEqual(["agent-vision: Couldn't change what the agent sees: You are not in this room."]);
    expect(f.nativeElement.querySelector('mj-livekit-room')).not.toBeNull();
  });

  it('lets the user dismiss the notice, and clears it when they choose again', async () => {
    const set = vi.spyOn(GraphQLLiveKitClient.prototype, 'SetAgentVision').mockResolvedValue({ Success: false, ErrorMessage: 'LiveKit is unreachable.' });
    const f = render();
    await flip(f);
    (notice(f)?.querySelector('button[aria-label="Dismiss"]') as HTMLButtonElement).click();
    f.detectChanges();
    expect(notice(f)).toBeNull();
    await flip(f);
    expect(notice(f)).not.toBeNull();
    set.mockResolvedValue({ Success: true });
    await flip(f);
    expect(notice(f)).toBeNull();
  });

  it('asks nothing until the room has a name', async () => {
    const set = vi.spyOn(GraphQLLiveKitClient.prototype, 'SetAgentVision').mockResolvedValue({ Success: true });
    const f = render();
    f.componentInstance.ResolvedRoomName = null;
    await flip(f);
    expect(set).not.toHaveBeenCalled();
  });
});
