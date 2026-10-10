import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { BehaviorSubject, of, type Observable } from 'rxjs';
import { ChangeDetectorRef, ErrorHandler, type Provider } from '@angular/core';
import { By } from '@angular/platform-browser';
import { renderComponentFixture, clearOverlayContainers } from '@memberjunction/ng-test-utils';
import type { IMetadataProvider } from '@memberjunction/core';
import { UserInfoEngine } from '@memberjunction/core-entities';
import { GraphQLLiveKitClient, type RealtimeModelVoices } from '@memberjunction/graphql-dataprovider';
import { LiveKitRoomComponent, LIVEKIT_ROOM_CONTROLLER_FACTORY } from '@memberjunction/ng-livekit-room';
import { LOCAL_MEDIA_CONTROLLER_FACTORY } from '@memberjunction/ng-realtime-media';
import {
  LIVEKIT_PREVIEW_PEOPLE,
  LiveKitPreviewRoomController,
  LiveKitRoomEventBus,
  type ILiveKitRoomController,
  type LiveKitAvatarAudioOnly,
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
  LIVEKIT_PREVIEW_SELF_VIEW_HIDDEN_PREF_KEY,
  LIVEKIT_SELF_VIEW_HIDDEN_PREF_KEY,
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
  const render = (inputs: Record<string, unknown> = {}, providers: Provider[] = []) => {
    const f = renderComponentFixture(MJLiveKitRoomComponent, {
      providers: [{ provide: LIVEKIT_ROOM_CONTROLLER_FACTORY, useValue: () => fakeController() }, ...providers],
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

  describe("the self-view's Hide", () => {
    let reported: unknown[];
    beforeEach(() => {
      reported = [];
    });
    // Cleans up first, so a failure here leaves no stub behind for the next test.
    afterEach(() => {
      vi.restoreAllMocks();
      clearOverlayContainers();
      expect(reported).toEqual([]);
    });

    /** The binding, with any error Angular handles while it runs kept for the check after each test. */
    const renderReporting = () => render({}, [{ provide: ErrorHandler, useValue: { handleError: (error: unknown) => reported.push(error) } }]);
    const selfView = (f: ReturnType<typeof render>) => f.nativeElement.querySelector('mj-self-view');
    const chip = (f: ReturnType<typeof render>) => f.nativeElement.querySelector('.lk-room__self-hidden') as HTMLElement | null;
    const click = (f: ReturnType<typeof render>, selector: string) => {
      (f.nativeElement.querySelector(selector) as HTMLButtonElement).click();
      f.detectChanges();
    };

    it('keeps it under fixed keys, so a saved hide is found again after an upgrade', () => {
      expect(LIVEKIT_SELF_VIEW_HIDDEN_PREF_KEY).toBe('mj.livekit.selfView.hidden.v1');
      expect(LIVEKIT_PREVIEW_SELF_VIEW_HIDDEN_PREF_KEY).toBe('mj.livekit.preview.selfView.hidden.v1');
    });

    it('starts with the self-view hidden when the user hid it before', () => {
      saved.set(LIVEKIT_SELF_VIEW_HIDDEN_PREF_KEY, 'true');
      const f = renderReporting();
      expect(roomOf(f).SelfViewHidden).toBe(true);
      expect(selfView(f)).toBeNull();
      expect(chip(f)?.textContent).toContain('Self-view hidden');
    });

    it("saves the hide under the meeting room's key, and Show clears it", () => {
      const f = renderReporting();
      click(f, 'mj-self-view button.self__hide');
      expect(lastWrite(LIVEKIT_SELF_VIEW_HIDDEN_PREF_KEY)).toBe('true');
      expect(f.componentInstance.SelfViewHidden).toBe(true);
      expect(selfView(f)).toBeNull();

      click(f, '.lk-room__self-hidden button');
      expect(lastWrite(LIVEKIT_SELF_VIEW_HIDDEN_PREF_KEY)).toBe('false');
      expect(f.componentInstance.SelfViewHidden).toBe(false);
      expect(selfView(f)).not.toBeNull();
      expect(chip(f)).toBeNull();
    });

    it('shows a saved hide again on Reset layout, and saves that with the empty layout', () => {
      saved.set(LIVEKIT_SELF_VIEW_HIDDEN_PREF_KEY, 'true');
      const f = renderReporting();
      expect(selfView(f)).toBeNull();
      roomOf(f).OnResetLayout();
      f.detectChanges();
      expect(writes.map(([key]) => key)).toEqual([LIVEKIT_PLACEMENT_PREF_KEY, LIVEKIT_PIP_PREF_KEY, LIVEKIT_SELF_VIEW_HIDDEN_PREF_KEY]);
      expect(lastWrite(LIVEKIT_SELF_VIEW_HIDDEN_PREF_KEY)).toBe('false');
      expect(f.componentInstance.SelfViewHidden).toBe(false);
      expect(selfView(f)).not.toBeNull();
      expect(chip(f)).toBeNull();
    });

    it.each([
      ['nothing is saved', undefined],
      ['false is saved', 'false'],
      ['something other than a boolean is saved', 'yes'],
      ['the saved value is malformed', '{"Hidden":true'],
    ])('shows the self-view when %s', (_case, raw) => {
      if (raw !== undefined) {
        saved.set(LIVEKIT_SELF_VIEW_HIDDEN_PREF_KEY, raw);
      }
      const f = renderReporting();
      expect(roomOf(f).SelfViewHidden).toBe(false);
      expect(selfView(f)).not.toBeNull();
      expect(chip(f)).toBeNull();
    });

    it('keeps the self-view hidden for this session when saving fails', () => {
      vi.spyOn(UserInfoEngine.Instance, 'SetSettingDebounced').mockImplementation(() => {
        throw new Error('offline');
      });
      const f = renderReporting();
      click(f, 'mj-self-view button.self__hide');
      expect(f.componentInstance.SelfViewHidden).toBe(true);
      expect(roomOf(f).SelfViewHidden).toBe(true);
      expect(selfView(f)).toBeNull();
      expect(chip(f)).not.toBeNull();
    });
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

  it("keeps the preview's self-view Hide under its own key, apart from meetings'", async () => {
    saved.set(LIVEKIT_SELF_VIEW_HIDDEN_PREF_KEY, 'true');
    const f = await render();
    expect(roomOf(f).SelfViewHidden).toBe(false);
    roomOf(f).OnHideSelfView();
    expect(writes).toEqual([LIVEKIT_PREVIEW_SELF_VIEW_HIDDEN_PREF_KEY]);
  });

  it('starts the preview with the self-view hidden when the user hid it there before', async () => {
    saved.set(LIVEKIT_PREVIEW_SELF_VIEW_HIDDEN_PREF_KEY, 'true');
    const f = await render();
    expect(roomOf(f).SelfViewHidden).toBe(true);
    expect(f.nativeElement.querySelector('mj-self-view')).toBeNull();
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

/**
 * DOM spec for the "Add an agent" voice list: one option per persona, so two personas sharing a voice id (Puck, and Ben:
 * Puck's voice with a face) are two options, only the picked one shows picked, and either sends the voice id.
 */
describe('MJLiveKitRoomComponent: the add-agent voice list (DOM)', () => {
  const MODELS: RealtimeModelVoices[] = [
    {
      ModelID: 'model-a',
      ModelName: 'Live Voice Model',
      Voices: [
        { ID: 'Puck', Name: 'Puck', PersonaID: 'p-puck' },
        { ID: 'Puck', Name: 'Ben', PersonaID: 'p-ben', AvatarID: 'Ben' },
        { ID: 'Kore', Name: 'Kore' },
      ],
    },
  ];
  beforeEach(() => {
    vi.spyOn(UserInfoEngine.Instance, 'GetSetting').mockReturnValue(undefined);
    vi.spyOn(UserInfoEngine.Instance, 'SetSettingDebounced').mockImplementation(() => undefined);
  });
  afterEach(() => {
    vi.restoreAllMocks();
    clearOverlayContainers();
  });

  /** The binding in an agent room with the agents panel open and a voice model chosen for the next agent. */
  const render = () => {
    const f = renderComponentFixture(MJLiveKitRoomComponent, {
      providers: [{ provide: LIVEKIT_ROOM_CONTROLLER_FACTORY, useValue: () => fakeController() }],
      inputs: {
        AutoStart: false,
        Mode: 'agent',
        ShowPreJoin: false,
        CanPickModelVoice: true,
        AvailableModels: MODELS,
        AvailableAgents: [{ ID: 'agent-2', Name: 'Writing Coach' }],
      },
    });
    f.componentInstance.ServerUrl = 'wss://example.test';
    f.componentInstance.Token = 'token';
    f.componentInstance.ResolvedRoomName = 'room-1';
    f.componentInstance.ShowAgentsPanel = true;
    f.componentInstance.AddModelId = 'model-a';
    f.componentRef.injector.get(ChangeDetectorRef).markForCheck();
    f.detectChanges();
    return f;
  };
  const voiceSelect = (f: ReturnType<typeof render>) => f.nativeElement.querySelector('select[title="Voice (dev override)"]') as HTMLSelectElement;
  /** Picks the option at `index` (0 is "Default voice") the way the browser does. */
  const pick = (f: ReturnType<typeof render>, index: number) => {
    const select = voiceSelect(f);
    select.selectedIndex = index;
    select.dispatchEvent(new Event('change'));
    f.componentRef.injector.get(ChangeDetectorRef).markForCheck();
    f.detectChanges();
  };
  const picked = (f: ReturnType<typeof render>) =>
    Array.from(voiceSelect(f).options).filter((o) => o.selected).map((o) => o.textContent?.trim());
  /** Closes and reopens the agents panel, which draws the voice list again from the picker's state. */
  const redrawPanel = (f: ReturnType<typeof render>) => {
    for (const open of [false, true]) {
      f.componentInstance.ShowAgentsPanel = open;
      f.componentRef.injector.get(ChangeDetectorRef).markForCheck();
      f.detectChanges();
    }
  };

  it('lists two personas that share a voice id as two options, with no duplicate keys', () => {
    const warn = vi.spyOn(console, 'warn');
    const f = render();
    expect(Array.from(voiceSelect(f).options).map((o) => o.textContent?.trim())).toEqual(['Default voice', 'Puck', 'Ben', 'Kore']);
    // Angular checks the keys when it updates a drawn list, not when it first draws one: check the list again.
    f.componentRef.injector.get(ChangeDetectorRef).markForCheck();
    f.detectChanges();
    expect(warn.mock.calls.some((call) => String(call[0]).includes('NG0955'))).toBe(false);
  });

  it('shows only the picked option as picked, and either one sends the voice id', () => {
    const f = render();
    pick(f, 2);
    expect(picked(f)).toEqual(['Ben']);
    expect(f.componentInstance.AddVoice).toBe('Puck');

    pick(f, 1);
    expect(picked(f)).toEqual(['Puck']);
    expect(f.componentInstance.AddVoice).toBe('Puck');

    // Drawn again (the panel closed and reopened), the list still shows the picked persona, not every match of its id.
    redrawPanel(f);
    expect(picked(f)).toEqual(['Puck']);

    pick(f, 0);
    expect(f.componentInstance.AddVoice).toBeNull();
    expect(f.componentInstance.AddVoiceOption).toBeNull();
  });
});

/**
 * DOM spec for the notice that an agent's avatar can't be shown: over the room, where the agent-vision notice goes, one
 * per agent whose bot says audio only, once per join, for everyone in the room. The room is the real one, on a fake
 * controller whose state the test changes through the controller's events, as LiveKit's controller does.
 */
describe("MJLiveKitRoomComponent: an agent's avatar that can't be shown (DOM)", () => {
  beforeEach(() => {
    vi.spyOn(UserInfoEngine.Instance, 'GetSetting').mockReturnValue(undefined);
    vi.spyOn(UserInfoEngine.Instance, 'SetSettingDebounced').mockImplementation(() => undefined);
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    clearOverlayContainers();
  });

  /** An agent named for its identity, audio only when given a reason (or `{}` for none it names). */
  const agent = (identity: string, audioOnly?: LiveKitAvatarAudioOnly): LiveKitParticipantView => ({
    ...person(identity, { Agent: true }),
    DisplayName: identity[0].toUpperCase() + identity.slice(1),
    ...(audioOnly ? { AvatarAudioOnly: audioOnly } : {}),
  });

  /** The binding in a meeting with its room shown; `state` reports the room's people as the room's state changes. */
  const render = () => {
    const controller = fakeController({ Remote: [] });
    const f = renderComponentFixture(MJLiveKitRoomComponent, {
      providers: [{ provide: LIVEKIT_ROOM_CONTROLLER_FACTORY, useValue: () => controller }],
      inputs: { AutoStart: false, Mode: 'join', ShowPreJoin: false },
    });
    f.componentInstance.ServerUrl = 'wss://example.test';
    f.componentInstance.Token = 'token';
    f.componentRef.injector.get(ChangeDetectorRef).markForCheck();
    f.detectChanges();
    const state = (remote: LiveKitParticipantView[]) => {
      controller.Events.Emit('stateChanged', { ...controller.State, Remote: remote });
      f.detectChanges();
    };
    const emit = (event: 'disconnected' | 'reconnected') => {
      if (event === 'disconnected') {
        controller.Events.Emit('disconnected', { Reason: 'client-initiated' });
      } else {
        controller.Events.Emit('reconnected', { State: controller.State });
      }
      f.detectChanges();
    };
    return { f, state, emit };
  };
  const notices = (f: ReturnType<typeof render>['f']) =>
    Array.from(f.nativeElement.querySelectorAll('mj-alert.mj-lk-notice--avatar') as NodeListOf<HTMLElement>);
  const texts = (f: ReturnType<typeof render>['f']) => notices(f).map((n) => n.textContent?.trim());
  const SAGE_BRIDGED = "Audio only for Sage: the avatar can't be shown in this meeting";
  const SAGE_FAILED = "Audio only for Sage: the avatar couldn't be shown in this meeting";

  it("shows everyone joining a meeting why an agent is audio only, as an info notice that announces itself", () => {
    const { f, state } = render();
    state([person('ada'), agent('sage', { Reason: 'bridged' })]);
    expect(texts(f)).toEqual([SAGE_BRIDGED]);
    const [notice] = notices(f);
    expect(notice.classList.contains('mj-alert--info')).toBe(true);
    expect(notice.getAttribute('role')).toBe('status');
    expect(notice.querySelector('.mj-alert__icon')?.classList.contains('fa-video-slash')).toBe(true);
    expect(notice.closest('.mj-lk-notices')).not.toBeNull();
  });

  it('shows it when an agent turns audio only during the meeting', () => {
    const { f, state } = render();
    state([agent('sage')]);
    expect(texts(f)).toEqual([]);
    state([agent('sage', {})]);
    expect(texts(f)).toEqual([SAGE_FAILED]);
  });

  it("names the agent on a call reason's line too", () => {
    const { f, state } = render();
    state([agent('sage', { Reason: 'endpoint' })]);
    expect(texts(f)).toEqual(["Audio only for Sage: this voice model can't show an avatar"]);
  });

  it('shows nothing for an agent whose avatar shows, nor for a person', () => {
    const { f, state } = render();
    state([agent('sage'), { ...person('ada'), AvatarAudioOnly: { Reason: 'bridged' } }]);
    expect(notices(f)).toEqual([]);
  });

  it('shows one per agent, stacked under the notice about what the agent sees', () => {
    const { f, state } = render();
    f.componentInstance.AgentVisionNotice = "Couldn't change what the agent sees: LiveKit is unreachable.";
    state([agent('sage', { Reason: 'bridged' }), agent('rowan', {})]);
    const stack = Array.from(f.nativeElement.querySelectorAll('.mj-lk-notices > mj-alert') as NodeListOf<HTMLElement>);
    expect(stack.map((a) => a.textContent?.trim())).toEqual([
      "Couldn't change what the agent sees: LiveKit is unreachable.",
      SAGE_BRIDGED,
      "Audio only for Rowan: the avatar couldn't be shown in this meeting",
    ]);
  });

  it('shows it once per join: not again on later states, after a dismissal or across a reconnect', () => {
    const { f, state, emit } = render();
    state([agent('sage', { Reason: 'bridged' })]);
    (notices(f)[0].querySelector('button[aria-label="Dismiss"]') as HTMLButtonElement).click();
    f.detectChanges();
    expect(notices(f)).toEqual([]);
    state([agent('sage', {})]);
    emit('reconnected');
    state([agent('sage', { Reason: 'bridged' })]);
    expect(notices(f)).toEqual([]);
  });

  it('shows it again after "Try again", which joins anew', async () => {
    vi.spyOn(GraphQLLiveKitClient.prototype, 'MintClientToken').mockResolvedValue({ Success: true, ServerUrl: 'wss://example.test', Token: 'token-2', Identity: 'ada', RoomName: 'room-1' });
    const { f, state } = render();
    state([agent('sage', { Reason: 'bridged' })]);
    (notices(f)[0].querySelector('button[aria-label="Dismiss"]') as HTMLButtonElement).click();
    f.componentInstance.RoomName = 'room-1';
    await f.componentInstance.Start();
    f.detectChanges();
    state([agent('sage', { Reason: 'bridged' })]);
    expect(texts(f)).toEqual([SAGE_BRIDGED]);
  });

  it('goes when the room disconnects, and shows again when the user joins anew', () => {
    const { f, state, emit } = render();
    state([agent('sage', { Reason: 'bridged' })]);
    emit('disconnected');
    expect(notices(f)).toEqual([]);
    state([agent('sage', { Reason: 'bridged' })]);
    expect(texts(f)).toEqual([SAGE_BRIDGED]);
  });

  it("uses the host's own words as written when it gives some (AvatarNoticeLabels), naming the agent for {Agent}", () => {
    const { f, state } = render();
    f.componentInstance.AvatarNoticeLabels = { bridged: 'Acme Meet shows {Agent} as audio only here', host: "Audio only: Acme Meet can't show the avatar" };
    state([agent('sage', { Reason: 'bridged' }), agent('rowan', {}), agent('ivy', { Reason: 'host' })]);
    expect(texts(f)).toEqual([
      'Acme Meet shows Sage as audio only here',
      "Audio only for Rowan: the avatar couldn't be shown in this meeting",
      "Audio only: Acme Meet can't show the avatar",
    ]);
  });

  it("words a reason the room doesn't know in the host's own line for it (unknown), and only that reason", () => {
    const { f, state } = render();
    f.componentInstance.AvatarNoticeLabels = { unknown: 'Acme Meet shows {Agent} as audio only', bridged: 'Acme Meet shows {Agent} as audio only here' };
    state([agent('sage', { Reason: 'bridged' }), agent('rowan', {}), agent('ivy', { Reason: 'endpoint' })]);
    expect(texts(f)).toEqual([
      'Acme Meet shows Sage as audio only here',
      'Acme Meet shows Rowan as audio only',
      "Audio only for Ivy: this voice model can't show an avatar",
    ]);
  });

  it('hides itself after ten seconds', () => {
    vi.useFakeTimers();
    const { f, state } = render();
    state([agent('sage', { Reason: 'bridged' })]);
    vi.advanceTimersByTime(9_999);
    f.detectChanges();
    expect(texts(f)).toEqual([SAGE_BRIDGED]);
    vi.advanceTimersByTime(1);
    f.detectChanges();
    expect(notices(f)).toEqual([]);
  });
});
