import { describe, it, expect, vi, afterEach } from 'vitest';
import { BehaviorSubject, type Observable } from 'rxjs';
import type {
  CapturedDisplaySurface,
  DisplayCapture,
  DisplayCaptureOptions,
  DisplayCaptureResult,
  ILocalMediaController,
  IRealtimeAudioMeter,
  LocalMediaKind,
  LocalMediaResult,
  LocalMediaState,
  LocalTrackState,
  MediaDevice,
  MediaParticipant,
} from '@memberjunction/ai-realtime-client/media';
import {
  LIVEKIT_PREVIEW_LOCAL_IDENTITY,
  LIVEKIT_PREVIEW_PEOPLE,
  LIVEKIT_PREVIEW_ROOM_NAME,
  LiveKitPreviewRoomController,
  type LiveKitPreviewRoomOptions,
} from '../livekit-preview-room-controller';
import { ToMediaParticipant } from '../media-adapters';
import type { LiveKitRoomConnectOptions, LiveKitRoomError } from '../types';

/** A stand-in for a `MediaStream`: the preview only hands it on. */
const stream = (id: string): MediaStream => ({ id }) as unknown as MediaStream;

const DEVICES: MediaDevice[] = [
  { DeviceID: 'mic-1', Kind: 'microphone', Label: 'Microphone 1', GroupID: 'g1' },
  { DeviceID: 'mic-2', Kind: 'microphone', Label: 'Microphone 2', GroupID: 'g2' },
  { DeviceID: 'cam-1', Kind: 'camera', Label: 'Camera 1', GroupID: 'g1' },
  { DeviceID: 'cam-2', Kind: 'camera', Label: 'Camera 2', GroupID: 'g3' },
];

/** A camera and microphone the test drives; `Log` is shared across every controller a room makes. */
class FakeMedia implements ILocalMediaController {
  public readonly Failing = new Set<LocalMediaKind>();
  public Disposed = false;
  public readonly Streams: Record<LocalMediaKind, MediaStream> = { camera: stream('camera'), microphone: stream('microphone') };
  private readonly state = new BehaviorSubject<LocalMediaState>({ Camera: { Status: 'off' }, Microphone: { Status: 'off' }, Devices: [] });

  constructor(private readonly log: string[]) {}

  public get State(): LocalMediaState {
    return this.state.value;
  }
  public get State$(): Observable<LocalMediaState> {
    return this.state.asObservable();
  }
  public GetStream(kind: LocalMediaKind): MediaStream | null {
    return this.track(kind).Status === 'on' ? this.Streams[kind] : null;
  }
  public async RefreshDevices(): Promise<MediaDevice[]> {
    this.state.next({ ...this.state.value, Devices: DEVICES });
    return DEVICES;
  }
  public async Start(kind: LocalMediaKind, deviceId?: string): Promise<LocalMediaResult> {
    this.log.push(`start ${kind} ${deviceId ?? 'default'}`);
    if (this.Failing.has(kind)) {
      this.setTrack(kind, { Status: 'failed', Failure: 'denied', Message: 'Not allowed.' });
      return { Status: 'failed', Reason: 'denied', Message: 'Not allowed.' };
    }
    this.setTrack(kind, { Status: 'on', DeviceID: deviceId ?? `${kind}-default` });
    return { Status: 'started', Stream: this.Streams[kind] };
  }
  public async SwitchDevice(kind: LocalMediaKind, deviceId: string): Promise<LocalMediaResult> {
    this.log.push(`switch ${kind} ${deviceId}`);
    this.setTrack(kind, { Status: 'on', DeviceID: deviceId });
    return { Status: 'started', Stream: this.Streams[kind] };
  }
  public Stop(kind: LocalMediaKind): void {
    this.log.push(`stop ${kind}`);
    this.setTrack(kind, { Status: 'off' });
  }
  public Dispose(): void {
    this.log.push('release devices');
    this.Disposed = true;
  }
  private track(kind: LocalMediaKind): LocalTrackState {
    return kind === 'camera' ? this.state.value.Camera : this.state.value.Microphone;
  }
  private setTrack(kind: LocalMediaKind, track: LocalTrackState): void {
    this.state.next(kind === 'camera' ? { ...this.state.value, Camera: track } : { ...this.state.value, Microphone: track });
  }
}

/** A share the browser started; the test ends it as the browser's "Stop sharing" would. */
class FakeShare implements DisplayCapture {
  public readonly Stream = stream('screen');
  public readonly Track = { id: 'screen-track' } as unknown as MediaStreamTrack;
  public readonly Label = 'Window';
  public Stopped = false;
  private readonly handlers: (() => void)[] = [];

  constructor(public readonly Surface: CapturedDisplaySurface = 'window') {}

  public OnEnded(handler: () => void): () => void {
    this.handlers.push(handler);
    return () => this.handlers.splice(this.handlers.indexOf(handler), 1);
  }
  public Stop(): void {
    this.Stopped = true;
  }
  /** Ends the share from the browser's side. */
  public EndInBrowser(): void {
    [...this.handlers].forEach((h) => h());
  }
}

/** What a test may set on the room; the fixture supplies the media, the meter and the share picker. */
type TestOptions = Omit<LiveKitPreviewRoomOptions, 'LocalMedia' | 'MeterFor' | 'RequestScreenShare'>;

/** A room on fake media (`failing` kinds never start), a fake meter, and a share picker that answers with `picks` in turn. */
function setUp(options: TestOptions = {}, failing: LocalMediaKind[] = []) {
  const log: string[] = [];
  const made: FakeMedia[] = [];
  const picks: (DisplayCaptureResult | Promise<DisplayCaptureResult>)[] = [];
  const asked: DisplayCaptureOptions[] = [];
  const meter: IRealtimeAudioMeter = { Level: () => 0.4, Bins: () => [], Close: () => undefined };
  const room = new LiveKitPreviewRoomController({
    ...options,
    LocalMedia: () => {
      const media = new FakeMedia(log);
      failing.forEach((kind) => media.Failing.add(kind));
      made.push(media);
      return media;
    },
    MeterFor: () => meter,
    RequestScreenShare: async (o) => {
      asked.push(o);
      return (await picks.shift()) ?? { Status: 'cancelled' };
    },
  });
  const errors: LiveKitRoomError[] = [];
  room.Events.On('error', (e) => errors.push(e));
  return { room, log, made, picks, asked, errors };
}

/** A joined room. */
async function joined(connect: LiveKitRoomConnectOptions = {}, options: TestOptions = {}) {
  const fixture = setUp(options);
  await fixture.room.Connect('preview://local', 'unused', connect);
  return fixture;
}

/** You, as the room's tiles get you. */
function you(room: LiveKitPreviewRoomController): MediaParticipant {
  const local = room.State.Local;
  if (!local) {
    throw new Error('Not in the room.');
  }
  return ToMediaParticipant(local);
}

afterEach(() => {
  vi.useRealTimers();
});

describe('LiveKitPreviewRoomController: a meeting room with no server', () => {
  it('joins with your microphone on and your camera off, and shows the people, the first one speaking', async () => {
    const { room, log } = setUp();
    const connected = vi.fn();
    room.Events.On('connected', connected);
    await room.Connect('preview://local', 'unused');

    const state = room.State;
    expect(state).toMatchObject({ Status: 'connected', RoomName: LIVEKIT_PREVIEW_ROOM_NAME });
    expect(state.Local).toMatchObject({ Identity: LIVEKIT_PREVIEW_LOCAL_IDENTITY, DisplayName: 'You', IsLocal: true, HasAudio: true, HasVideo: false });
    expect(state.Remote.map((p) => [p.Identity, p.Role, p.IsSpeaking])).toEqual(
      LIVEKIT_PREVIEW_PEOPLE.map((p, i) => [p.Identity, p.Role, i === 0])
    );
    expect(state.ActiveSpeakerIdentities).toEqual([LIVEKIT_PREVIEW_PEOPLE[0].Identity]);
    expect(state.LocalMedia).toEqual({ MicrophoneEnabled: true, CameraEnabled: false, ScreenShareEnabled: false });
    expect(log).toEqual(['start microphone default']);
    expect(connected).toHaveBeenCalledWith({ State: state });
  });

  it('starts with the name, media and devices the options give, and shows your camera and level on your tile', async () => {
    const { room, log, made } = await joined({
      DisplayName: 'Grace',
      EnableMicrophone: true,
      EnableCamera: true,
      MicrophoneDeviceId: 'mic-2',
      CameraDeviceId: 'cam-2',
    });
    expect(log).toEqual(['start microphone mic-2', 'start camera cam-2']);
    expect(room.State.Local).toMatchObject({ DisplayName: 'Grace', HasVideo: true });
    const tile = you(room);
    expect(tile.Video.camera).toEqual({ Kind: 'stream', Stream: made[0].Streams.camera });
    expect(tile.GetAudioLevel?.()).toBe(0.4);
  });

  it('starts with nothing on when the options say so', async () => {
    const { room, log } = await joined({ EnableMicrophone: false, EnableCamera: false });
    expect(log).toEqual([]);
    expect(room.State.LocalMedia).toEqual({ MicrophoneEnabled: false, CameraEnabled: false, ScreenShareEnabled: false });
  });

  it('lets a beforeConnect handler cancel joining, before any device opens', async () => {
    const { room, made } = setUp();
    room.Events.On('beforeConnect', (e) => (e.Cancel = true));
    await room.Connect('preview://local', 'unused');
    expect(room.Status).toBe('idle');
    expect(made).toHaveLength(0);
  });

  it('joins with a microphone that fails to start shown off, and reports it as a device error', async () => {
    const { room, errors } = setUp({}, ['microphone']);
    await room.Connect('preview://local', 'unused');
    expect(room.Status).toBe('connected');
    expect(room.State.LocalMedia.MicrophoneEnabled).toBe(false);
    expect(room.State.Local?.HasAudio).toBe(false);
    expect(errors).toEqual([{ Kind: 'device', Message: 'Failed to enable microphone.', Cause: 'Not allowed.' }]);
  });
});

describe('LiveKitPreviewRoomController: the people take turns', () => {
  it('passes the turn every TurnMs, with a level on the speaker only, and wraps around', async () => {
    vi.useFakeTimers();
    const people = LIVEKIT_PREVIEW_PEOPLE.slice(0, 2);
    const { room } = await joined({}, { People: people, TurnMs: 1000 });
    const changes: string[][] = [];
    room.Events.On('activeSpeakersChanged', (e) => changes.push(e.Identities));

    vi.advanceTimersByTime(1000);
    expect(room.State.ActiveSpeakerIdentities).toEqual([people[1].Identity]);
    const [first, second] = room.State.Remote.map((p) => ToMediaParticipant(p));
    expect(first.IsSpeaking).toBe(false);
    expect(first.GetAudioLevel?.()).toBe(0);
    expect(second.IsSpeaking).toBe(true);
    expect(second.GetAudioLevel?.()).toBeGreaterThan(0.1);

    vi.advanceTimersByTime(1000);
    expect(changes).toEqual([[people[1].Identity], [people[0].Identity]]);
  });

  it('has nobody speaking, and no turns, without people', async () => {
    vi.useFakeTimers();
    const { room } = await joined({}, { People: [] });
    const states = vi.fn();
    room.Events.On('stateChanged', states);
    vi.advanceTimersByTime(60_000);
    expect(room.State.Remote).toEqual([]);
    expect(room.State.ActiveSpeakerIdentities).toEqual([]);
    expect(states).not.toHaveBeenCalled();
  });

  it('stops the turns when you leave', async () => {
    vi.useFakeTimers();
    const { room } = await joined({}, { TurnMs: 1000 });
    await room.Disconnect();
    expect(vi.getTimerCount()).toBe(0);
    const states = vi.fn();
    room.Events.On('stateChanged', states);
    vi.advanceTimersByTime(5000);
    expect(states).not.toHaveBeenCalled();
  });
});

describe('LiveKitPreviewRoomController: your camera and microphone', () => {
  it('turns them on and off, between beforeMediaToggle and localMediaChanged; the toggles resolve the new state', async () => {
    const { room, log, made } = await joined();
    const seen: string[] = [];
    room.Events.On('beforeMediaToggle', (e) => seen.push(`before ${e.Kind} ${e.Enabled}`));
    room.Events.On('localMediaChanged', (m) => seen.push(`changed camera ${m.CameraEnabled} microphone ${m.MicrophoneEnabled}`));

    expect(await room.ToggleCamera()).toBe(true);
    expect(you(room).Video.camera).toEqual({ Kind: 'stream', Stream: made[0].Streams.camera });
    expect(await room.ToggleMicrophone()).toBe(false);
    await room.SetCameraEnabled(false);

    expect(seen).toEqual([
      'before camera true',
      'changed camera true microphone true',
      'before microphone false',
      'changed camera true microphone false',
      'before camera false',
      'changed camera false microphone false',
    ]);
    expect(log.slice(1)).toEqual(['start camera default', 'stop microphone', 'stop camera']);
    expect(room.State.Local?.HasVideo).toBe(false);
    expect(you(room).Video.camera).toBeUndefined();
  });

  it('lets a beforeMediaToggle handler cancel a toggle', async () => {
    const { room, log } = await joined();
    room.Events.On('beforeMediaToggle', (e) => (e.Cancel = true));
    await room.SetCameraEnabled(true);
    expect(log).toEqual(['start microphone default']);
    expect(room.State.LocalMedia.CameraEnabled).toBe(false);
  });

  it('reports a camera that fails to start as a device error, and leaves it off', async () => {
    const { room, made, errors } = await joined();
    made[0].Failing.add('camera');
    await room.SetCameraEnabled(true);
    expect(room.State.LocalMedia.CameraEnabled).toBe(false);
    expect(errors).toEqual([{ Kind: 'device', Message: 'Failed to enable camera.', Cause: 'Not allowed.' }]);
  });

  it('lists your microphones and cameras, and no speakers; reports the ones in use', async () => {
    const { room } = await joined({ EnableCamera: true, CameraDeviceId: 'cam-2' });
    expect(await room.ListDevices('audioinput')).toEqual([
      { DeviceId: 'mic-1', Label: 'Microphone 1', Kind: 'audioinput' },
      { DeviceId: 'mic-2', Label: 'Microphone 2', Kind: 'audioinput' },
    ]);
    expect((await room.ListDevices('videoinput')).map((d) => d.DeviceId)).toEqual(['cam-1', 'cam-2']);
    expect(await room.ListDevices('audiooutput')).toEqual([]);
    expect(room.GetActiveDeviceId('videoinput')).toBe('cam-2');
    expect(room.GetActiveDeviceId('audioinput')).toBe('microphone-default');
    expect(room.GetActiveDeviceId('audiooutput')).toBeNull();
  });

  it('moves a live kind to another device; a beforeDeviceSwitch handler can change or cancel it', async () => {
    const { room, log } = await joined();
    await room.SwitchDevice('audioinput', 'mic-2');
    let cancel = false;
    room.Events.On('beforeDeviceSwitch', (e) => {
      e.Cancel = cancel;
      e.DeviceId = 'mic-1';
    });
    await room.SwitchDevice('audioinput', 'mic-2');
    cancel = true;
    await room.SwitchDevice('audioinput', 'mic-2');
    expect(log.slice(1)).toEqual(['switch microphone mic-2', 'switch microphone mic-1']);
    expect(room.GetActiveDeviceId('audioinput')).toBe('mic-1');
  });

  it('has no devices outside the room', async () => {
    const { room } = setUp();
    expect(await room.ListDevices('audioinput')).toEqual([]);
    expect(room.GetActiveDeviceId('audioinput')).toBeNull();
  });
});

describe('LiveKitPreviewRoomController: your screen share', () => {
  it("shares through the browser's picker and shows it on your tile; the browser ending it ends it in the room", async () => {
    const { room, picks, asked } = await joined();
    const share = new FakeShare('tab');
    picks.push({ Status: 'started', Capture: share });
    const changed = vi.fn();
    room.Events.On('localMediaChanged', changed);

    await room.SetScreenShareEnabled(true, 'tab');
    expect(asked).toEqual([{ PreferredSurface: 'tab' }]);
    expect(room.State.LocalMedia).toMatchObject({ ScreenShareEnabled: true, ScreenShareSurface: 'tab' });
    expect(room.State.Local?.IsScreenSharing).toBe(true);
    expect(you(room).Video.screen).toEqual({ Kind: 'stream', Stream: share.Stream });

    share.EndInBrowser();
    expect(room.State.LocalMedia.ScreenShareEnabled).toBe(false);
    expect(room.State.Local?.IsScreenSharing).toBe(false);
    expect(changed).toHaveBeenCalledTimes(2);
  });

  it('stops a share you end in the room', async () => {
    const { room, picks } = await joined();
    const share = new FakeShare();
    picks.push({ Status: 'started', Capture: share });
    expect(await room.ToggleScreenShare()).toBe(true);
    expect(await room.ToggleScreenShare()).toBe(false);
    expect(share.Stopped).toBe(true);
    expect(room.State.LocalMedia.ScreenShareEnabled).toBe(false);
  });

  it('leaves you not sharing when the picker is cancelled, and reports a failed one as a device error', async () => {
    const { room, picks, errors } = await joined();
    await room.SetScreenShareEnabled(true);
    picks.push({ Status: 'failed', Reason: 'denied', Message: 'Blocked by policy.' });
    await room.SetScreenShareEnabled(true);
    expect(room.State.LocalMedia.ScreenShareEnabled).toBe(false);
    expect(errors).toEqual([{ Kind: 'device', Message: 'Failed to enable screen.', Cause: 'Blocked by policy.' }]);
  });

  it('stops a share that starts after you left', async () => {
    const { room, picks } = await joined();
    const share = new FakeShare();
    let pick: (result: DisplayCaptureResult) => void = () => undefined;
    picks.push(new Promise<DisplayCaptureResult>((resolve) => (pick = resolve)));
    const sharing = room.SetScreenShareEnabled(true);
    await room.Disconnect();
    pick({ Status: 'started', Capture: share });
    await sharing;
    expect(share.Stopped).toBe(true);
    expect(room.State.LocalMedia.ScreenShareEnabled).toBe(false);
  });

  it('changing what you share stops the share and asks the picker again', async () => {
    const { room, picks, asked } = await joined();
    const first = new FakeShare('screen');
    const second = new FakeShare('window');
    picks.push({ Status: 'started', Capture: first }, { Status: 'started', Capture: second });
    await room.SetScreenShareEnabled(true);
    await room.ChangeScreenShare('window');
    expect(first.Stopped).toBe(true);
    expect(asked).toEqual([{}, { PreferredSurface: 'window' }]);
    expect(room.State.LocalMedia.ScreenShareSurface).toBe('window');
  });
});

describe('LiveKitPreviewRoomController: leaving', () => {
  it('frees your devices and your share, and reports a client-initiated disconnect', async () => {
    const { room, picks, made } = await joined();
    const share = new FakeShare();
    picks.push({ Status: 'started', Capture: share });
    await room.SetScreenShareEnabled(true);
    const disconnected = vi.fn();
    room.Events.On('disconnected', disconnected);

    expect(await room.Disconnect()).toBe(true);
    expect(made[0].Disposed).toBe(true);
    expect(share.Stopped).toBe(true);
    expect(room.State).toMatchObject({ Status: 'disconnected', DisconnectReason: 'client-initiated', Remote: [] });
    expect(room.State.Local).toBeUndefined();
    expect(disconnected).toHaveBeenCalledWith({ Reason: 'client-initiated' });
  });

  it('lets a beforeDisconnect handler keep you in the room', async () => {
    const { room, made } = await joined();
    room.Events.On('beforeDisconnect', (e) => (e.Cancel = true));
    expect(await room.Disconnect()).toBe(false);
    expect(room.Status).toBe('connected');
    expect(made[0].Disposed).toBe(false);
  });

  it('opens your devices afresh when you join again', async () => {
    const { room, made } = await joined();
    await room.Disconnect();
    await room.Connect('preview://local', 'unused');
    expect(made).toHaveLength(2);
    expect(room.Status).toBe('connected');
  });

  it('frees the devices, and does not open the room, when you leave while they start', async () => {
    const { room, made } = setUp();
    const connected = vi.fn();
    room.Events.On('connected', connected);
    const joining = room.Connect('preview://local', 'unused');
    await room.Disconnect();
    await joining;
    expect(made[0].Disposed).toBe(true);
    expect(room.Status).toBe('disconnected');
    expect(connected).not.toHaveBeenCalled();
  });

  it('Dispose frees your devices and completes the state', async () => {
    const { room, made } = await joined();
    const complete = vi.fn();
    room.State$.subscribe({ complete });
    room.Dispose();
    expect(made[0].Disposed).toBe(true);
    expect(complete).toHaveBeenCalled();
  });
});

describe('LiveKitPreviewRoomController: what it does not simulate', () => {
  it('raises beforeSendData for a message, and nothing comes back', async () => {
    const { room } = await joined();
    const before = vi.fn();
    const received = vi.fn();
    room.Events.On('beforeSendData', before);
    room.Events.On('dataReceived', received);
    await room.SendData('hello', 'lk-chat');
    expect(before).toHaveBeenCalledWith({ Text: 'hello', Topic: 'lk-chat', Cancel: false });
    expect(received).not.toHaveBeenCalled();
  });

  it('has no noise filter or background effects', async () => {
    const { room } = await joined();
    expect(await room.SetNoiseFilterEnabled(true)).toBe(false);
    expect(await room.SetBackgroundEffect({ Kind: 'blur' })).toBe(false);
    expect(room.State).toMatchObject({ NoiseFilterEnabled: false, BackgroundEffect: { Kind: 'none' }, AudioPlaybackBlocked: false });
  });
});
