/**
 * @fileoverview {@link LiveKitPreviewRoomController}: a meeting room that needs no LiveKit server, for trying the room
 * UI. Your camera, microphone and screen share are real; everyone else is simulated, and nothing is sent anywhere.
 *
 * - **You.** Your camera and microphone run on the shared `MediaPreview` (as a lobby's do), on the camera-and-microphone
 *   controller the host provides. Your tile shows your camera and your microphone's level. Sharing your screen opens
 *   the browser's picker, as in a real room.
 * - **Everyone else.** The people in the options (by default an agent and three participants) are in the room from the
 *   start, without cameras, and take turns speaking, so the speaking ring, the active speaker and the meters move.
 * - **Not simulated.** Nobody else sends chat or whiteboard messages, joins or leaves, or shares a screen; noise
 *   filtering and background effects are unavailable.
 *
 * It implements {@link ILiveKitRoomController}, so `mj-livekit-room` runs on it unchanged, provided through
 * `LIVEKIT_ROOM_CONTROLLER_FACTORY`.
 *
 * @module @memberjunction/livekit-room-core
 */

import { Participant } from 'livekit-client';
import { BehaviorSubject, skip, type Observable, type Subscription } from 'rxjs';
import {
  LocalMediaController,
  MediaPreview,
  RequestDisplayCapture,
  type DisplayCapture,
  type DisplayCaptureOptions,
  type DisplayCaptureResult,
  type DisplayCaptureSurface,
  type ILocalMediaController,
  type LocalMediaKind,
  type MediaPreviewOptions,
  type MediaPreviewState,
  type MediaVideoSource,
} from '@memberjunction/ai-realtime-client/media';
import { LiveKitRoomEventBus } from './events';
import type { ILiveKitRoomController } from './livekit-room-controller';
import { ToMediaDeviceKind } from './media-adapters';
import type {
  LiveKitBackgroundEffect,
  LiveKitConnectionStatus,
  LiveKitDevice,
  LiveKitLocalMediaState,
  LiveKitParticipantRole,
  LiveKitParticipantView,
  LiveKitRoomConnectOptions,
  LiveKitRoomError,
  LiveKitRoomState,
} from './types';

/** A simulated person in a preview room. */
export interface LiveKitPreviewPerson {
  /** Stable identity in the room. */
  Identity: string;
  /** The name on their tile. */
  DisplayName: string;
  /** `'agent'` shows as the room's AI agent. */
  Role: LiveKitParticipantRole;
}

/** The people in a preview room unless the options name others: an agent and three participants. */
export const LIVEKIT_PREVIEW_PEOPLE: readonly LiveKitPreviewPerson[] = [
  { Identity: 'preview-sage', DisplayName: 'Sage', Role: 'agent' },
  { Identity: 'preview-ada', DisplayName: 'Ada', Role: 'participant' },
  { Identity: 'preview-bo', DisplayName: 'Bo', Role: 'participant' },
  { Identity: 'preview-cy', DisplayName: 'Cy', Role: 'participant' },
];

/** The preview room's name, as the room's header shows it. */
export const LIVEKIT_PREVIEW_ROOM_NAME = 'Preview room';

/** Your identity in a preview room. */
export const LIVEKIT_PREVIEW_LOCAL_IDENTITY = 'preview-you';

/** How a preview room runs. All optional. */
export interface LiveKitPreviewRoomOptions {
  /** Makes the camera-and-microphone controller each join runs on. Defaults to the browser's `LocalMediaController`. */
  LocalMedia?: () => ILocalMediaController;
  /** The simulated people. Defaults to {@link LIVEKIT_PREVIEW_PEOPLE}. */
  People?: readonly LiveKitPreviewPerson[];
  /** How long each person speaks before the next one starts, in milliseconds. Defaults to 4000. */
  TurnMs?: number;
  /** Opens the browser's share picker. Defaults to `RequestDisplayCapture`; a test passes its own. */
  RequestScreenShare?: (options: DisplayCaptureOptions) => Promise<DisplayCaptureResult>;
  /** Meters your microphone. Defaults to `MediaPreview`'s meter; a test passes its own. */
  MeterFor?: MediaPreviewOptions['MeterFor'];
  /** A shared event bus (e.g. so a host can subscribe before connecting). */
  EventBus?: LiveKitRoomEventBus;
}

/** Your screen share, while it runs. */
interface PreviewShare {
  Capture: DisplayCapture;
  /** The same object for the whole share, so a tile never reattaches it. */
  Source: MediaVideoSource;
  StopWatching: (() => void) | null;
}

/** One join: your media, the simulated people, and whose turn it is. */
interface PreviewSession {
  Media: MediaPreview;
  MediaWatch: Subscription | null;
  DisplayName: string;
  /** Bare LiveKit participants, for the views' `Raw`: you, then one per person. */
  Local: Participant;
  Others: Participant[];
  /** The index of the person speaking, or -1 when nobody is. */
  Speaker: number;
  Turns: ReturnType<typeof setInterval> | null;
  Share: PreviewShare | null;
}

const DEFAULT_TURN_MS = 4000;

/** A meeting room with no server: see the file header. */
export class LiveKitPreviewRoomController implements ILiveKitRoomController {
  /** The room's cancelable event bus, as on the LiveKit controller. */
  public readonly Events: LiveKitRoomEventBus;

  private readonly state = new BehaviorSubject<LiveKitRoomState>(initialState());
  private readonly localMedia: () => ILocalMediaController;
  private readonly people: readonly LiveKitPreviewPerson[];
  private readonly turnMs: number;
  private readonly requestShare: (options: DisplayCaptureOptions) => Promise<DisplayCaptureResult>;
  private readonly meterFor: MediaPreviewOptions['MeterFor'];
  private session: PreviewSession | null = null;

  constructor(options: LiveKitPreviewRoomOptions = {}) {
    this.localMedia = options.LocalMedia ?? (() => new LocalMediaController());
    this.people = options.People ?? LIVEKIT_PREVIEW_PEOPLE;
    this.turnMs = options.TurnMs ?? DEFAULT_TURN_MS;
    this.requestShare = options.RequestScreenShare ?? RequestDisplayCapture;
    this.meterFor = options.MeterFor;
    this.Events = options.EventBus ?? new LiveKitRoomEventBus();
  }

  /** The room-state snapshot: the current value on subscribe, then every change. */
  public get State$(): Observable<LiveKitRoomState> {
    return this.state.asObservable();
  }

  /** The current room-state snapshot. */
  public get State(): LiveKitRoomState {
    return this.state.value;
  }

  /** The current connection status. */
  public get Status(): LiveKitConnectionStatus {
    return this.state.value.Status;
  }

  // ── Joining and leaving ─────────────────────────────────────────────────────────

  /**
   * Joins the preview room: starts your microphone and camera as the options say, on the devices they name, then
   * shows the simulated people, the first one speaking.
   *
   * @param serverUrl Reported to `beforeConnect` handlers; nothing connects to it.
   * @param _token Ignored: there is no server to present it to.
   * @param options Your name, the media you start with, and the devices.
   */
  public async Connect(serverUrl: string, _token: string, options: LiveKitRoomConnectOptions = {}): Promise<void> {
    const before = this.Events.Emit('beforeConnect', { ServerUrl: serverUrl, Options: options, Cancel: false });
    if (before.Cancel) {
      return;
    }
    if (this.session) {
      await this.Disconnect(false);
    }
    this.patchState({ Status: 'connecting', DisconnectReason: undefined });
    const session = this.openSession(before.Options);
    this.session = session;
    await this.startMedia(session, before.Options);
    if (this.session !== session) {
      return; // left while the devices were starting
    }
    this.beginSession(session);
    this.Events.Emit('connected', { State: this.State });
  }

  /**
   * Leaves the room and frees your devices. A user-initiated leave raises a cancelable `beforeDisconnect` first.
   *
   * @returns `false` when a `beforeDisconnect` handler canceled it.
   */
  public async Disconnect(userInitiated = true): Promise<boolean> {
    if (userInitiated && this.Events.Emit('beforeDisconnect', { UserInitiated: true, Cancel: false }).Cancel) {
      return false;
    }
    const session = this.session;
    this.session = null;
    if (session) {
      closeSession(session);
    }
    this.patchState({ ...initialState(), Status: 'disconnected', DisconnectReason: session ? 'client-initiated' : undefined });
    if (session) {
      this.Events.Emit('disconnected', { Reason: 'client-initiated' });
    }
    return true;
  }

  /** Leaves the room, frees your devices, completes {@link State$} and clears the event bus. */
  public Dispose(): void {
    void this.Disconnect(false);
    this.state.complete();
    this.Events.Clear();
  }

  // ── Your microphone, camera and screen ──────────────────────────────────────────

  /** Turns your microphone on or off. */
  public async SetMicrophoneEnabled(enabled: boolean): Promise<void> {
    await this.toggleLocalMedia('microphone', enabled);
  }

  /** Turns your camera on or off. */
  public async SetCameraEnabled(enabled: boolean): Promise<void> {
    await this.toggleLocalMedia('camera', enabled);
  }

  /** Starts or stops sharing your screen; `preferredSurface` is what the browser's picker offers first. */
  public async SetScreenShareEnabled(enabled: boolean, preferredSurface?: DisplayCaptureSurface): Promise<void> {
    await this.toggleLocalMedia('screen', enabled, preferredSurface);
  }

  /** Toggles your microphone and resolves the new state. */
  public async ToggleMicrophone(): Promise<boolean> {
    const next = !this.State.LocalMedia.MicrophoneEnabled;
    await this.SetMicrophoneEnabled(next);
    return next;
  }

  /** Toggles your camera and resolves the new state. */
  public async ToggleCamera(): Promise<boolean> {
    const next = !this.State.LocalMedia.CameraEnabled;
    await this.SetCameraEnabled(next);
    return next;
  }

  /** Toggles sharing your screen and resolves the new state. */
  public async ToggleScreenShare(): Promise<boolean> {
    const next = !this.State.LocalMedia.ScreenShareEnabled;
    await this.SetScreenShareEnabled(next);
    return next;
  }

  /** Shares something else: stops the current share, then opens the browser's picker again. */
  public async ChangeScreenShare(preferredSurface?: DisplayCaptureSurface): Promise<void> {
    if (this.State.LocalMedia.ScreenShareEnabled) {
      await this.SetScreenShareEnabled(false);
    }
    await this.SetScreenShareEnabled(true, preferredSurface);
  }

  // ── What the preview does not simulate ──────────────────────────────────────────

  /** Raises the cancelable `beforeSendData`; nobody else is in the room to receive the message. */
  public async SendData(text: string, topic?: string): Promise<void> {
    if (this.session) {
      this.Events.Emit('beforeSendData', { Text: text, Topic: topic, Cancel: false });
    }
  }

  /** Nothing to do: the simulated people make no sound, so the browser never blocks it. */
  public async StartAudio(): Promise<void> {
    return;
  }

  /** Not available in the preview room. */
  public async SetNoiseFilterEnabled(_enabled: boolean): Promise<boolean> {
    return false;
  }

  /** Not available in the preview room. */
  public async SetBackgroundEffect(_effect: LiveKitBackgroundEffect): Promise<boolean> {
    return false;
  }

  // ── Devices ─────────────────────────────────────────────────────────────────────

  /** Your microphones or cameras, while you are in the room. There are no speakers to pick: nothing plays. */
  public async ListDevices(kind: LiveKitDevice['Kind']): Promise<LiveKitDevice[]> {
    const mediaKind = ToMediaDeviceKind(kind);
    const devices = this.session?.Media.State.Devices ?? [];
    return devices.filter((d) => d.Kind === mediaKind).map((d) => ({ DeviceId: d.DeviceID, Label: d.Label, Kind: kind }));
  }

  /** The microphone or camera in use (or chosen), or `null` for speakers and outside the room. */
  public GetActiveDeviceId(kind: LiveKitDevice['Kind']): string | null {
    const choices = this.session?.Media.State.Choices;
    if (!choices) {
      return null;
    }
    const mediaKind = ToMediaDeviceKind(kind);
    return mediaKind === 'camera' ? choices.CameraDeviceID : mediaKind === 'microphone' ? choices.MicrophoneDeviceID : null;
  }

  /** Moves your microphone or camera to another device; raises the cancelable `beforeDeviceSwitch` first. */
  public async SwitchDevice(kind: LiveKitDevice['Kind'], deviceId: string): Promise<void> {
    const session = this.session;
    if (!session) {
      return;
    }
    const before = this.Events.Emit('beforeDeviceSwitch', { Kind: kind, DeviceId: deviceId, Cancel: false });
    if (before.Cancel) {
      return;
    }
    await session.Media.SelectDevice({ Kind: ToMediaDeviceKind(kind), DeviceID: before.DeviceId });
  }

  // ── internals: the session ──────────────────────────────────────────────────────

  /** A new session: your media (not started yet) and a bare participant for you and each person. */
  private openSession(options: LiveKitRoomConnectOptions): PreviewSession {
    const media = new MediaPreview(this.localMedia(), {
      MicrophoneOn: options.EnableMicrophone ?? true,
      CameraOn: options.EnableCamera ?? false,
      MeterFor: this.meterFor,
    });
    const displayName = options.DisplayName ?? 'You';
    return {
      Media: media,
      MediaWatch: null,
      DisplayName: displayName,
      Local: new Participant(`PA_${LIVEKIT_PREVIEW_LOCAL_IDENTITY}`, LIVEKIT_PREVIEW_LOCAL_IDENTITY, displayName),
      Others: this.people.map((p) => new Participant(`PA_${p.Identity}`, p.Identity, p.DisplayName)),
      Speaker: this.people.length > 0 ? 0 : -1,
      Turns: null,
      Share: null,
    };
  }

  /** Starts your microphone and camera, on the devices the options name. */
  private async startMedia(session: PreviewSession, options: LiveKitRoomConnectOptions): Promise<void> {
    if (options.MicrophoneDeviceId) {
      await session.Media.SelectDevice({ Kind: 'microphone', DeviceID: options.MicrophoneDeviceId });
    }
    if (options.CameraDeviceId) {
      await session.Media.SelectDevice({ Kind: 'camera', DeviceID: options.CameraDeviceId });
    }
    await session.Media.Start();
  }

  /** Shows the room, reports a kind that failed to start, follows your media from here on, and starts the turns. */
  private beginSession(session: PreviewSession): void {
    this.rebuildState();
    this.reportFailure(session, 'microphone');
    this.reportFailure(session, 'camera');
    session.MediaWatch = session.Media.State$.pipe(skip(1)).subscribe(() => this.rebuildState());
    if (this.people.length > 0) {
      session.Turns = setInterval(() => this.nextTurn(session), this.turnMs);
    }
  }

  /** Passes the turn to the next person. */
  private nextTurn(session: PreviewSession): void {
    if (this.session !== session) {
      return;
    }
    session.Speaker = (session.Speaker + 1) % this.people.length;
    this.rebuildState();
    const speakers = this.State.Remote.filter((p) => p.IsSpeaking);
    this.Events.Emit('activeSpeakersChanged', { Identities: speakers.map((p) => p.Identity), Speakers: speakers });
  }

  /** Turns a kind on or off, raising the cancelable `beforeMediaToggle` first and `localMediaChanged` after. */
  private async toggleLocalMedia(kind: 'microphone' | 'camera' | 'screen', enabled: boolean, surface?: DisplayCaptureSurface): Promise<void> {
    const session = this.session;
    if (!session) {
      return;
    }
    if (this.Events.Emit('beforeMediaToggle', { Kind: kind, Enabled: enabled, Cancel: false }).Cancel) {
      return;
    }
    if (kind === 'screen') {
      await this.setSharing(session, enabled, surface);
    } else {
      await this.setCapturing(session, kind, enabled);
    }
    if (this.session === session) {
      this.rebuildState();
      this.Events.Emit('localMediaChanged', this.State.LocalMedia);
    }
  }

  /** Turns your microphone or camera on or off; a start that fails is reported as a device error. */
  private async setCapturing(session: PreviewSession, kind: LocalMediaKind, on: boolean): Promise<void> {
    if (kind === 'camera') {
      await session.Media.SetCameraOn(on);
    } else {
      await session.Media.SetMicrophoneOn(on);
    }
    if (on) {
      this.reportFailure(session, kind);
    }
  }

  /** Starts sharing through the browser's picker, or stops. Cancelling the picker leaves you not sharing. */
  private async setSharing(session: PreviewSession, on: boolean, surface?: DisplayCaptureSurface): Promise<void> {
    if (!on) {
      stopSharing(session);
      return;
    }
    if (session.Share) {
      return;
    }
    const result = await this.requestShare(surface ? { PreferredSurface: surface } : {});
    if (result.Status === 'failed') {
      this.emitError('device', 'Failed to enable screen.', result.Message);
    } else if (result.Status === 'started') {
      this.keepShare(session, result.Capture);
    }
  }

  /** Keeps a share that started, and follows it ending in the browser ("Stop sharing"). */
  private keepShare(session: PreviewSession, capture: DisplayCapture): void {
    if (this.session !== session) {
      capture.Stop(); // left while the picker was open
      return;
    }
    const share: PreviewShare = { Capture: capture, Source: { Kind: 'stream', Stream: capture.Stream }, StopWatching: null };
    session.Share = share;
    share.StopWatching = capture.OnEnded(() => this.onShareEnded(session, share));
  }

  /** The browser ended your share: the room stops showing it. */
  private onShareEnded(session: PreviewSession, share: PreviewShare): void {
    if (session.Share !== share) {
      return;
    }
    session.Share = null;
    if (this.session === session) {
      this.rebuildState();
      this.Events.Emit('localMediaChanged', this.State.LocalMedia);
    }
  }

  /** Reports a kind whose capture failed as a device error. */
  private reportFailure(session: PreviewSession, kind: LocalMediaKind): void {
    const track = kind === 'camera' ? session.Media.State.Camera : session.Media.State.Microphone;
    if (track.Status === 'failed') {
      this.emitError('device', `Failed to enable ${kind}.`, track.Message);
    }
  }

  // ── internals: state ────────────────────────────────────────────────────────────

  /** Rebuilds the room's state from the session and emits it. */
  private rebuildState(): void {
    const session = this.session;
    if (!session) {
      return;
    }
    const media = session.Media.State;
    const remote = this.people.map((person, index) => personView(session, person, index));
    this.patchState({
      Status: 'connected',
      RoomName: LIVEKIT_PREVIEW_ROOM_NAME,
      Local: localView(session, media),
      Remote: remote,
      ActiveSpeakerIdentities: remote.filter((p) => p.IsSpeaking).map((p) => p.Identity),
      LocalMedia: localMediaState(session, media),
    });
  }

  /** Pushes a partial update onto the state, emits it, and fires `stateChanged`. */
  private patchState(patch: Partial<LiveKitRoomState>): void {
    const next = { ...this.state.value, ...patch };
    this.state.next(next);
    this.Events.Emit('stateChanged', next);
  }

  /** Emits a room error. */
  private emitError(kind: LiveKitRoomError['Kind'], message: string, cause?: string): void {
    this.Events.Emit('error', { Kind: kind, Message: message, Cause: cause });
  }
}

/** Your view: your camera and share from the browser, and your microphone's level. */
function localView(session: PreviewSession, media: MediaPreviewState): LiveKitParticipantView {
  const camera = media.CameraSource;
  const screen = session.Share?.Source ?? null;
  return {
    Identity: LIVEKIT_PREVIEW_LOCAL_IDENTITY,
    DisplayName: session.DisplayName,
    IsLocal: true,
    Role: 'participant',
    IsSpeaking: false,
    AudioLevel: 0,
    HasAudio: media.Microphone.Status === 'on',
    HasVideo: camera !== null,
    IsScreenSharing: screen !== null,
    ConnectionQuality: 'excellent',
    Raw: session.Local,
    Media: {
      Video: { ...(camera ? { camera } : {}), ...(screen ? { screen } : {}) },
      GetAudioLevel: session.Media.ReadMicrophoneLevel,
    },
  };
}

/** A simulated person's view: no camera, and a speaking level while it is their turn. */
function personView(session: PreviewSession, person: LiveKitPreviewPerson, index: number): LiveKitParticipantView {
  const speaking = index === session.Speaker;
  return {
    Identity: person.Identity,
    DisplayName: person.DisplayName,
    IsLocal: false,
    Role: person.Role,
    IsSpeaking: speaking,
    AudioLevel: speaking ? speechLevel(Date.now()) : 0,
    HasAudio: true,
    HasVideo: false,
    IsScreenSharing: false,
    ConnectionQuality: 'excellent',
    Raw: session.Others[index],
    Media: { GetAudioLevel: speaking ? () => speechLevel(Date.now()) : () => 0 },
  };
}

/** What you are publishing, as the room's controls show it. */
function localMediaState(session: PreviewSession, media: MediaPreviewState): LiveKitLocalMediaState {
  const share = session.Share;
  return {
    MicrophoneEnabled: media.Microphone.Status === 'on',
    CameraEnabled: media.Camera.Status === 'on',
    ScreenShareEnabled: share !== null,
    ...(share ? { ScreenShareSurface: share.Capture.Surface } : {}),
  };
}

/** A level that rises and falls like speech, 0.15 to 0.65. */
function speechLevel(now: number): number {
  return 0.15 + 0.35 * Math.abs(Math.sin(now / 170)) + 0.15 * Math.abs(Math.sin(now / 53));
}

/** Stops your share, without reporting it as ended by the browser. */
function stopSharing(session: PreviewSession): void {
  const share = session.Share;
  if (!share) {
    return;
  }
  session.Share = null;
  share.StopWatching?.();
  share.Capture.Stop();
}

/** Stops the turns and your share, and frees your devices. */
function closeSession(session: PreviewSession): void {
  if (session.Turns) {
    clearInterval(session.Turns);
  }
  stopSharing(session);
  session.MediaWatch?.unsubscribe();
  session.Media.Dispose();
}

/** The state before joining and after leaving: nobody in the room. */
function initialState(): LiveKitRoomState {
  return {
    Status: 'idle',
    RoomName: undefined,
    Local: undefined,
    Remote: [],
    ActiveSpeakerIdentities: [],
    LocalMedia: { MicrophoneEnabled: false, CameraEnabled: false, ScreenShareEnabled: false },
    AudioPlaybackBlocked: false,
    NoiseFilterEnabled: false,
    BackgroundEffect: { Kind: 'none' },
    E2EEEnabled: false,
  };
}
