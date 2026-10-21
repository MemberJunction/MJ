import { describe, it, expect, beforeEach, vi, type Mock } from 'vitest';
import { ConnectionQuality, ConnectionState, DisconnectReason, RoomEvent, Track, type Room, type RoomOptions, type TrackPublishOptions } from 'livekit-client';
import type { CapturedDisplaySurface, DisplayCapture, DisplayCaptureOptions, DisplayCaptureResult } from '@memberjunction/ai-realtime-client/media';
import type { LiveKitEventHandler } from '../events';
import { DEFAULT_SPEECH_ROOM_OPTIONS, LiveKitRoomController } from '../livekit-room-controller';
import type { LiveKitDevice, LiveKitRoomError } from '../types';
import { REALTIME_AGENT_AVATAR_ATTRIBUTE, REALTIME_AGENT_CAN_SEE_ATTRIBUTE, REALTIME_AGENT_WATCHES_ATTRIBUTE } from '@memberjunction/ai';

/** A publication reduced to what the controller reads: whether it is muted, and a screen share's track settings. */
interface FakePublication {
  isMuted: boolean;
  track?: { mediaStreamTrack: { getSettings(): MediaTrackSettings } };
}

/** A shared video track: what it shows, the constraints applied to it, and whether it has ended. */
class FakeShareTrack {
  public readonly kind = 'video';
  public readyState: MediaStreamTrackState = 'live';
  /** Every constraint set applied with `applyConstraints`. */
  public readonly Constraints: MediaTrackConstraints[] = [];
  /** When set, `applyConstraints` rejects, as a browser that cannot honour them does. */
  public RefuseConstraints = false;
  constructor(public DisplaySurface: string) {}
  public getSettings(): MediaTrackSettings {
    return { displaySurface: this.DisplaySurface };
  }
  public async applyConstraints(constraints: MediaTrackConstraints): Promise<void> {
    if (this.RefuseConstraints) {
      throw new Error('Overconstrained');
    }
    this.Constraints.push(constraints);
  }
}

/**
 * A share the picker started. Like `/media`'s capture, it ends once, whether the browser ends it ("Stop sharing", the
 * test's {@link EndInBrowser}) or the page stops it, and then tells each handler; a handler added later hears at once.
 */
class FakeCapture implements DisplayCapture {
  public readonly Stream = { id: 'screen-stream' } as unknown as MediaStream;
  public readonly Shared: FakeShareTrack;
  public readonly Label = 'Shared surface';
  public Stopped = false;
  private readonly handlers = new Set<() => void>();

  constructor(displaySurface = 'window', public readonly PanelLabel?: string) {
    this.Shared = new FakeShareTrack(displaySurface);
  }
  public get Track(): MediaStreamTrack {
    return this.Shared as unknown as MediaStreamTrack;
  }
  public get Surface(): CapturedDisplaySurface {
    const surfaces: Record<string, CapturedDisplaySurface> = { monitor: 'screen', window: 'window', browser: 'tab' };
    return surfaces[this.Shared.DisplaySurface] ?? 'unknown';
  }
  public OnEnded(handler: () => void): () => void {
    if (this.Shared.readyState === 'ended') {
      handler();
      return () => undefined;
    }
    this.handlers.add(handler);
    return () => this.handlers.delete(handler);
  }
  public Stop(): void {
    this.Stopped = true;
    this.end();
  }
  /** The browser's "Stop sharing". */
  public EndInBrowser(): void {
    this.end();
  }
  private end(): void {
    if (this.Shared.readyState === 'ended') {
      return;
    }
    this.Shared.readyState = 'ended';
    [...this.handlers].forEach((h) => h());
  }
}

/** The browser's share picker: what it was asked, and what it answers (in turn; closed when nothing is queued). */
class FakePicker {
  public readonly Asked: DisplayCaptureOptions[] = [];
  public readonly Answers: Array<DisplayCaptureResult | Promise<DisplayCaptureResult>> = [];
  public readonly Request = async (options: DisplayCaptureOptions): Promise<DisplayCaptureResult> => {
    this.Asked.push(options);
    return (await this.Answers.shift()) ?? { Status: 'cancelled' };
  };
  /** Queues a share that starts, and returns its capture. */
  public Starts(displaySurface = 'window', panelLabel?: string): FakeCapture {
    const capture = new FakeCapture(displaySurface, panelLabel);
    this.Answers.push({ Status: 'started', Capture: capture });
    return capture;
  }
}

/**
 * A structural fake of the subset of livekit-client `Participant` the controller uses. Cast to the real
 * type via `as unknown as Participant` at the injection boundary.
 */
class FakeParticipant {
  public name: string;
  public metadata: string | undefined;
  public isSpeaking = false;
  public audioLevel = 0;
  public connectionQuality = ConnectionQuality.Good;
  public isMicrophoneEnabled = false;
  public isCameraEnabled = false;
  public isScreenShareEnabled = false;
  /** The participant's LiveKit attributes, as the server set them. */
  public attributes: Record<string, string> = {};
  /** Every track published with `publishTrack`, with its options, in order. */
  public readonly Published: Array<{ Track: MediaStreamTrack; Options?: TrackPublishOptions }> = [];
  /** Every track unpublished, in order. */
  public readonly Unpublished: MediaStreamTrack[] = [];
  /** When set, `publishTrack` rejects with it. */
  public PublishError: Error | null = null;
  /** When set, `publishTrack` waits for it, as a publish does for the server. */
  public PublishWait: Promise<void> | null = null;
  /**
   * The devices that fail, by kind: turning one on or off rejects with its error. Turning one on also reports it first,
   * as livekit-client does when the browser refuses the device (`MediaDevicesError`, with the device kind).
   */
  public readonly ToggleErrors = new Map<LiveKitDevice['Kind'], Error>();
  /** When set, turning the microphone or camera on waits for it first, as for the browser's permission prompt. */
  public StartWait: Promise<void> | null = null;
  private readonly pubs = new Map<Track.Source, FakePublication>();

  constructor(
    public identity: string,
    name?: string,
    metadata?: string,
    private readonly reportDeviceError: (err: Error, kind: LiveKitDevice['Kind']) => void = () => undefined,
  ) {
    this.name = name ?? '';
    this.metadata = metadata;
  }

  public getTrackPublication(source: Track.Source): FakePublication | undefined {
    return this.pubs.get(source);
  }
  public async setName(name: string): Promise<void> {
    this.name = name;
  }
  public async setMicrophoneEnabled(enabled: boolean): Promise<void> {
    await this.toggle(enabled, 'audioinput');
    this.isMicrophoneEnabled = enabled;
    this.setPub(Track.Source.Microphone, enabled);
  }
  public async setCameraEnabled(enabled: boolean): Promise<void> {
    await this.toggle(enabled, 'videoinput');
    this.isCameraEnabled = enabled;
    this.setPub(Track.Source.Camera, enabled);
  }
  /** Waits for {@link StartWait} when turning a device on, then throws the kind's {@link ToggleErrors} entry, if any. */
  private async toggle(enabled: boolean, kind: LiveKitDevice['Kind']): Promise<void> {
    if (enabled) {
      await this.StartWait;
    }
    const error = this.ToggleErrors.get(kind);
    if (!error) {
      return;
    }
    if (enabled) {
      this.reportDeviceError(error, kind);
    }
    throw error;
  }
  /** Publishes a track; one with the screen-share source is the participant's screen share, as in LiveKit. */
  public async publishTrack(track: MediaStreamTrack, options?: TrackPublishOptions): Promise<void> {
    if (this.PublishError) {
      throw this.PublishError;
    }
    await this.PublishWait;
    this.Published.push({ Track: track, Options: options });
    if (options?.source === Track.Source.ScreenShare) {
      this.isScreenShareEnabled = true;
      this.pubs.set(Track.Source.ScreenShare, { isMuted: false, track: { mediaStreamTrack: track } });
    }
  }
  /** Unpublishes a track; LiveKit also does this itself when a screen-share track ends in the browser. */
  public async unpublishTrack(track: MediaStreamTrack): Promise<void> {
    this.Unpublished.push(track);
    if (this.pubs.get(Track.Source.ScreenShare)?.track?.mediaStreamTrack === track) {
      this.isScreenShareEnabled = false;
      this.pubs.delete(Track.Source.ScreenShare);
    }
  }
  public publishData = vi.fn(async (_payload: Uint8Array, _opts?: unknown): Promise<void> => undefined);

  private setPub(source: Track.Source, enabled: boolean): void {
    if (enabled) {
      this.pubs.set(source, { isMuted: false });
    } else {
      this.pubs.delete(source);
    }
  }
}

/** A structural fake of livekit-client `Room`. */
class FakeRoom {
  public name = 'test-room';
  public state: ConnectionState = ConnectionState.Disconnected;
  public localParticipant = new FakeParticipant('local-me', 'Me', undefined, (err, kind) => this.emit(RoomEvent.MediaDevicesError, err, kind));
  public remoteParticipants = new Map<string, FakeParticipant>();
  public canPlaybackAudio = true;
  public startAudio = vi.fn(async (): Promise<void> => {
    this.canPlaybackAudio = true;
  });
  public setE2EEEnabled = vi.fn(async (): Promise<void> => undefined);
  /** When set, connecting rejects with it, as when the server can't be reached. */
  public ConnectError: Error | null = null;
  private readonly handlers = new Map<RoomEvent, ((...args: unknown[]) => void)[]>();

  public on(event: RoomEvent, cb: (...args: unknown[]) => void): this {
    const list = this.handlers.get(event) ?? [];
    list.push(cb);
    this.handlers.set(event, list);
    return this;
  }
  public emit(event: RoomEvent, ...args: unknown[]): void {
    (this.handlers.get(event) ?? []).forEach((cb) => cb(...args));
  }
  public async connect(_url: string, _token: string): Promise<void> {
    if (this.ConnectError) {
      throw this.ConnectError;
    }
    this.state = ConnectionState.Connected;
    this.emit(RoomEvent.Connected);
  }
  public async disconnect(): Promise<void> {
    this.state = ConnectionState.Disconnected;
    this.emit(RoomEvent.Disconnected, DisconnectReason.CLIENT_INITIATED);
  }
  public switchActiveDevice = vi.fn(async (): Promise<boolean> => true);
}

let capturedRoomOptions: RoomOptions | undefined;

function makeController(room: FakeRoom, picker: FakePicker = new FakePicker()): LiveKitRoomController {
  return new LiveKitRoomController({
    RoomFactory: (options) => {
      capturedRoomOptions = options;
      return room as unknown as Room;
    },
    RequestScreenShare: picker.Request,
  });
}

describe('LiveKitRoomController', () => {
  let room: FakeRoom;
  let controller: LiveKitRoomController;
  let picker: FakePicker;

  beforeEach(() => {
    capturedRoomOptions = undefined;
    room = new FakeRoom();
    picker = new FakePicker();
    controller = makeController(room, picker);
  });

  describe('Connect', () => {
    it('connects, enables the microphone by default, and emits connected', async () => {
      const connected = vi.fn();
      controller.Events.On('connected', connected);

      await controller.Connect('wss://x', 'token', { DisplayName: 'Amith' });

      expect(controller.Status).toBe('connected');
      expect(controller.State.RoomName).toBe('test-room');
      expect(controller.State.Local?.DisplayName).toBe('Amith');
      expect(controller.State.LocalMedia.MicrophoneEnabled).toBe(true);
      expect(connected).toHaveBeenCalledOnce();
    });

    it('applies DEFAULT_SPEECH_ROOM_OPTIONS by default', async () => {
      await controller.Connect('wss://x', 'token');
      expect(capturedRoomOptions).toMatchObject({
        publishDefaults: { dtx: false, red: true },
        audioCaptureDefaults: { voiceIsolation: false, echoCancellation: true },
      });
    });

    it('allows RoomOptions overrides', async () => {
      await controller.Connect('wss://x', 'token', {
        RoomOptions: {
          publishDefaults: { dtx: true },
        },
      });
      expect(capturedRoomOptions).toMatchObject({
        publishDefaults: { dtx: true, red: true },
        audioCaptureDefaults: { voiceIsolation: false, echoCancellation: true },
      });
    });

    it('honors a canceling beforeConnect handler and never connects', async () => {
      controller.Events.On('beforeConnect', (e) => {
        e.Cancel = true;
      });
      await controller.Connect('wss://x', 'token');
      expect(controller.Status).toBe('idle');
    });

    it('lets a beforeConnect handler mutate options', async () => {
      controller.Events.On('beforeConnect', (e) => {
        e.Options.DisplayName = 'Rewritten';
      });
      await controller.Connect('wss://x', 'token', { DisplayName: 'Original' });
      expect(controller.State.Local?.DisplayName).toBe('Rewritten');
    });

    describe('a device that fails while joining', () => {
      /** The errors the room reports. */
      let errors: LiveKitRoomError[];
      /** Hears the room say it connected. */
      let connected: Mock<LiveKitEventHandler<'connected'>>;
      /** The browser's answer when the user (or the system) blocks the microphone for the site. */
      const denied = Object.assign(new Error('Permission denied'), { name: 'NotAllowedError' });

      beforeEach(() => {
        errors = [];
        connected = vi.fn<LiveKitEventHandler<'connected'>>();
        controller.Events.On('error', (e) => errors.push(e));
        controller.Events.On('connected', connected);
      });

      it("joins with the microphone off when the browser refuses it, reporting it after LiveKit's own report", async () => {
        room.localParticipant.ToggleErrors.set('audioinput', denied);
        await controller.Connect('wss://x', 'token');
        expect(controller.Status).toBe('connected');
        expect(controller.State.LocalMedia.MicrophoneEnabled).toBe(false);
        expect(connected).toHaveBeenCalledOnce();
        expect(errors).toEqual([
          { Kind: 'device', Message: 'Permission denied', Cause: denied, Device: { Media: 'microphone' } },
          { Kind: 'device', Message: 'Failed to enable microphone.', Cause: denied, Device: { Media: 'microphone', Change: 'on' } },
        ]);
      });

      it('still turns on the camera when the microphone is refused', async () => {
        room.localParticipant.ToggleErrors.set('audioinput', denied);
        await controller.Connect('wss://x', 'token', { EnableCamera: true });
        expect(controller.State.LocalMedia).toMatchObject({ MicrophoneEnabled: false, CameraEnabled: true });
        expect(connected).toHaveBeenCalledOnce();
      });

      it('keeps the microphone on when the camera fails, and names the camera', async () => {
        const busy = new Error('Could not start video source');
        room.localParticipant.ToggleErrors.set('videoinput', busy);
        await controller.Connect('wss://x', 'token', { EnableCamera: true });
        expect(controller.Status).toBe('connected');
        expect(controller.State.LocalMedia).toMatchObject({ MicrophoneEnabled: true, CameraEnabled: false });
        expect(errors.at(-1)).toEqual({ Kind: 'device', Message: 'Failed to enable camera.', Cause: busy, Device: { Media: 'camera', Change: 'on' } });
        expect(connected).toHaveBeenCalledOnce();
      });

      it('still fails the join when the connection fails, and turns no device on', async () => {
        const unreachable = new Error('could not establish signal connection');
        room.ConnectError = unreachable;
        await expect(controller.Connect('wss://x', 'token', { EnableCamera: true })).rejects.toBe(unreachable);
        expect(controller.Status).toBe('error');
        expect(errors).toEqual([{ Kind: 'connect', Message: 'Failed to connect to the room.', Cause: unreachable }]);
        expect(connected).not.toHaveBeenCalled();
        expect(room.localParticipant).toMatchObject({ isMicrophoneEnabled: false, isCameraEnabled: false });
      });

      it('goes no further when the user leaves while the browser asks for the microphone', async () => {
        let answer: () => void = () => undefined;
        room.localParticipant.StartWait = new Promise<void>((resolve) => (answer = resolve));
        room.localParticipant.ToggleErrors.set('audioinput', denied);
        const joining = controller.Connect('wss://x', 'token', { EnableCamera: true });
        await new Promise((resolve) => setTimeout(resolve, 0));
        expect(controller.Status).toBe('connected');

        await controller.Disconnect();
        answer();
        await joining;

        expect(controller.Status).toBe('disconnected');
        expect(connected).not.toHaveBeenCalled();
        expect(errors.filter((e) => e.Kind !== 'device')).toEqual([]);
        expect(room.localParticipant.isCameraEnabled).toBe(false);
      });
    });
  });

  describe('local media', () => {
    beforeEach(async () => {
      await controller.Connect('wss://x', 'token');
    });

    it('toggles the camera and emits localMediaChanged', async () => {
      const changed = vi.fn();
      controller.Events.On('localMediaChanged', changed);
      const next = await controller.ToggleCamera();
      expect(next).toBe(true);
      expect(controller.State.LocalMedia.CameraEnabled).toBe(true);
      expect(changed).toHaveBeenCalled();
    });

    it('cancels a media toggle when beforeMediaToggle is canceled', async () => {
      controller.Events.On('beforeMediaToggle', (e) => {
        if (e.Kind === 'screen') {
          e.Cancel = true;
        }
      });
      await controller.SetScreenShareEnabled(true);
      expect(picker.Asked).toEqual([]);
      expect(controller.State.LocalMedia.ScreenShareEnabled).toBe(false);
    });
  });

  describe('device errors name the device and what the user asked of it', () => {
    /** The errors the room reports. */
    let errors: LiveKitRoomError[];

    beforeEach(async () => {
      await controller.Connect('wss://x', 'token');
      errors = [];
      controller.Events.On('error', (e) => errors.push(e));
    });

    it("reports a camera that fails to turn on after LiveKit's own report, which names the camera alone", async () => {
      const refused = new Error('Could not start video source');
      room.localParticipant.ToggleErrors.set('videoinput', refused);
      await controller.SetCameraEnabled(true);
      expect(errors).toEqual([
        { Kind: 'device', Message: 'Could not start video source', Cause: refused, Device: { Media: 'camera' } },
        { Kind: 'device', Message: 'Failed to enable camera.', Cause: refused, Device: { Media: 'camera', Change: 'on' } },
      ]);
      expect(controller.State.LocalMedia.CameraEnabled).toBe(false);
    });

    it('reports a microphone that fails to turn off', async () => {
      const failed = new Error('Track is busy');
      room.localParticipant.ToggleErrors.set('audioinput', failed);
      await controller.SetMicrophoneEnabled(false);
      expect(errors).toEqual([{ Kind: 'device', Message: 'Failed to disable microphone.', Cause: failed, Device: { Media: 'microphone', Change: 'off' } }]);
    });

    it('reports a device switch that fails, by the kind of device', async () => {
      const missing = new Error('Requested device not found');
      room.switchActiveDevice.mockRejectedValueOnce(missing);
      await controller.SwitchDevice('audiooutput', 'speaker-2');
      expect(errors).toEqual([{ Kind: 'device', Message: 'Failed to switch audiooutput device.', Cause: missing, Device: { Media: 'speaker', Change: 'switch' } }]);
    });

    it("reports the room's sound failing to start as the speaker turning on", async () => {
      const blocked = new Error('play() was blocked');
      room.startAudio.mockRejectedValueOnce(blocked);
      await controller.StartAudio();
      expect(errors).toEqual([{ Kind: 'device', Message: 'Failed to start audio playback.', Cause: blocked, Device: { Media: 'speaker', Change: 'on' } }]);
    });

    it('names no device on a failure LiveKit reports without one', () => {
      const lost = new Error('Device lost');
      room.emit(RoomEvent.MediaDevicesError, lost);
      expect(errors).toEqual([{ Kind: 'device', Message: 'Device lost', Cause: lost }]);
    });
  });

  describe('the screen share, through /media display capture', () => {
    /** The errors the room reports. */
    let errors: LiveKitRoomError[];

    beforeEach(async () => {
      await controller.Connect('wss://x', 'token');
      errors = [];
      controller.Events.On('error', (e) => errors.push(e));
    });

    it("asks the browser's picker for the picked kind of surface first, and publishes the share as this participant's screen share", async () => {
      const capture = picker.Starts('window');
      await controller.SetScreenShareEnabled(true, 'window');
      expect(picker.Asked).toEqual([{ PreferredSurface: 'window' }]);
      expect(room.localParticipant.Published).toEqual([{ Track: capture.Track, Options: { source: Track.Source.ScreenShare } }]);
      expect(controller.State.LocalMedia).toMatchObject({ ScreenShareEnabled: true, ScreenShareSurface: 'window' });
      expect(controller.State.Local?.IsScreenSharing).toBe(true);
    });

    it('toggles a share with no preference', async () => {
      picker.Starts();
      expect(await controller.ToggleScreenShare()).toBe(true);
      expect(picker.Asked).toEqual([{}]);
      expect(controller.State.LocalMedia.ScreenShareEnabled).toBe(true);
    });

    it("caps the shared track at 1080p and 30 fps, as LiveKit's own capture does, and shares at full size when the browser refuses", async () => {
      const capture = picker.Starts();
      await controller.SetScreenShareEnabled(true);
      expect(capture.Shared.Constraints).toEqual([{ width: { max: 1920 }, height: { max: 1080 }, frameRate: { max: 30 } }]);

      await controller.SetScreenShareEnabled(false);
      const refused = picker.Starts();
      refused.Shared.RefuseConstraints = true;
      await controller.SetScreenShareEnabled(true);
      expect(room.localParticipant.Published.map((p) => p.Track)).toEqual([capture.Track, refused.Track]);
      expect(errors).toEqual([]);
    });

    it('shares one panel of the page alone, and names it while it is shared', async () => {
      const panel = { tagName: 'SECTION' } as unknown as Element;
      picker.Starts('browser', 'Whiteboard');
      await controller.SetScreenShareEnabled(true, { Panel: panel, PanelLabel: 'Whiteboard' });
      expect(picker.Asked).toEqual([{ Panel: panel, PanelLabel: 'Whiteboard' }]);
      expect(controller.State.LocalMedia).toMatchObject({ ScreenShareEnabled: true, ScreenShareSurface: 'tab', ScreenSharePanelLabel: 'Whiteboard' });

      await controller.SetScreenShareEnabled(false);
      expect(controller.State.LocalMedia).toEqual({ MicrophoneEnabled: true, CameraEnabled: false, ScreenShareEnabled: false, AgentVisionOn: false });
    });

    it('stops a share by unpublishing it and releasing the capture', async () => {
      const capture = picker.Starts('browser');
      const changed = vi.fn();
      await controller.SetScreenShareEnabled(true);
      controller.Events.On('localMediaChanged', changed);
      expect(await controller.ToggleScreenShare()).toBe(false);
      expect(room.localParticipant.Unpublished).toEqual([capture.Track]);
      expect(capture.Stopped).toBe(true);
      expect(controller.State.LocalMedia.ScreenShareEnabled).toBe(false);
      expect(controller.State.LocalMedia.ScreenShareSurface).toBeUndefined();
      expect(changed).toHaveBeenCalledOnce();
    });

    it("follows the browser's Stop sharing: LiveKit unpublishes the ended track, and the room stops showing the share", async () => {
      const capture = picker.Starts('window', 'Whiteboard');
      await controller.SetScreenShareEnabled(true, { PanelLabel: 'Whiteboard' });
      const changed = vi.fn();
      controller.Events.On('localMediaChanged', changed);

      capture.EndInBrowser();
      expect(controller.State.LocalMedia.ScreenSharePanelLabel).toBeUndefined();
      expect(changed).toHaveBeenCalledOnce();
      await room.localParticipant.unpublishTrack(capture.Track);
      room.emit(RoomEvent.LocalTrackUnpublished);
      expect(controller.State.LocalMedia.ScreenShareEnabled).toBe(false);
      expect(room.localParticipant.Unpublished).toEqual([capture.Track]);
    });

    it('drops the panel\'s name with the published share, whether LiveKit or the capture hears the browser first', async () => {
      const capture = picker.Starts('browser', 'Whiteboard');
      await controller.SetScreenShareEnabled(true, { PanelLabel: 'Whiteboard' });
      await room.localParticipant.unpublishTrack(capture.Track);
      room.emit(RoomEvent.LocalTrackUnpublished);
      expect(controller.State.LocalMedia).toEqual({ MicrophoneEnabled: true, CameraEnabled: false, ScreenShareEnabled: false, AgentVisionOn: false });
      capture.EndInBrowser();
      expect(controller.State.LocalMedia.ScreenSharePanelLabel).toBeUndefined();
    });

    it('changes a running share by stopping it and asking again, with the picked kind first', async () => {
      const first = picker.Starts();
      const second = picker.Starts('browser');
      await controller.SetScreenShareEnabled(true);
      await controller.ChangeScreenShare('tab');
      expect(picker.Asked).toEqual([{}, { PreferredSurface: 'tab' }]);
      expect(first.Stopped).toBe(true);
      expect(room.localParticipant.Unpublished).toEqual([first.Track]);
      expect(room.localParticipant.Published.map((p) => p.Track)).toEqual([first.Track, second.Track]);
      expect(controller.State.LocalMedia.ScreenShareSurface).toBe('tab');
    });

    it('starts a share when asked to change one that is not running', async () => {
      picker.Starts();
      await controller.ChangeScreenShare();
      expect(picker.Asked).toEqual([{}]);
      expect(controller.State.LocalMedia.ScreenShareEnabled).toBe(true);
    });

    it('shares nothing, and reports nothing, when the user closes the picker', async () => {
      await controller.SetScreenShareEnabled(true);
      expect(room.localParticipant.Published).toEqual([]);
      expect(controller.State.LocalMedia.ScreenShareEnabled).toBe(false);
      expect(errors).toEqual([]);
    });

    it("reports a share the browser refuses as a device error with the picker's reason", async () => {
      picker.Answers.push({ Status: 'failed', Reason: 'panel-wrong-surface', Message: "To share only the panel, choose this tab in the browser's picker." });
      await controller.SetScreenShareEnabled(true, { PanelLabel: 'Whiteboard' });
      expect(errors).toEqual([
        {
          Kind: 'device',
          Message: 'Failed to enable screen.',
          Cause: new Error("To share only the panel, choose this tab in the browser's picker."),
          Device: { Media: 'screen', Change: 'on' },
        },
      ]);
      expect(controller.State.LocalMedia.ScreenShareEnabled).toBe(false);
    });

    it('releases a capture LiveKit could not publish, and reports it', async () => {
      const capture = picker.Starts();
      room.localParticipant.PublishError = new Error('Not connected');
      await controller.SetScreenShareEnabled(true);
      expect(capture.Stopped).toBe(true);
      expect(errors).toEqual([{ Kind: 'device', Message: 'Failed to enable screen.', Cause: new Error('Not connected'), Device: { Media: 'screen', Change: 'on' } }]);
      room.localParticipant.PublishError = null;
      picker.Starts();
      await controller.SetScreenShareEnabled(true);
      expect(controller.State.LocalMedia.ScreenShareEnabled).toBe(true);
    });

    it('asks the picker once while a share starts or runs', async () => {
      picker.Starts();
      await Promise.all([controller.SetScreenShareEnabled(true), controller.SetScreenShareEnabled(true)]);
      await controller.SetScreenShareEnabled(true);
      expect(picker.Asked).toHaveLength(1);
      expect(room.localParticipant.Published).toHaveLength(1);
    });

    it('never publishes a share stopped while the picker was open', async () => {
      let answer: (result: DisplayCaptureResult) => void = () => undefined;
      picker.Answers.push(new Promise<DisplayCaptureResult>((resolve) => (answer = resolve)));
      const starting = controller.SetScreenShareEnabled(true);
      await controller.SetScreenShareEnabled(false);
      const capture = new FakeCapture();
      answer({ Status: 'started', Capture: capture });
      await starting;
      expect(capture.Stopped).toBe(true);
      expect(room.localParticipant.Published).toEqual([]);
      expect(controller.State.LocalMedia.ScreenShareEnabled).toBe(false);
    });

    /** Makes the next publish wait until the returned function is called. */
    const holdPublish = (): (() => void) => {
      let release: () => void = () => undefined;
      room.localParticipant.PublishWait = new Promise<void>((resolve) => (release = resolve));
      return release;
    };

    it('withdraws a share stopped while its track was publishing', async () => {
      const capture = picker.Starts();
      const release = holdPublish();
      const starting = controller.SetScreenShareEnabled(true);
      await vi.waitFor(() => expect(capture.Shared.Constraints).toHaveLength(1));
      await controller.SetScreenShareEnabled(false);
      release();
      await starting;
      expect(room.localParticipant.Published.map((p) => p.Track)).toEqual([capture.Track]);
      expect(room.localParticipant.Unpublished).toEqual([capture.Track]);
      expect(capture.Stopped).toBe(true);
      expect(controller.State.LocalMedia.ScreenShareEnabled).toBe(false);
    });

    it('withdraws a share the browser ended while its track was publishing, which LiveKit never saw end', async () => {
      const capture = picker.Starts('browser', 'Whiteboard');
      const release = holdPublish();
      const starting = controller.SetScreenShareEnabled(true, { PanelLabel: 'Whiteboard' });
      await vi.waitFor(() => expect(capture.Shared.Constraints).toHaveLength(1));
      capture.EndInBrowser();
      release();
      await starting;
      expect(room.localParticipant.Unpublished).toEqual([capture.Track]);
      expect(controller.State.LocalMedia).toEqual({ MicrophoneEnabled: true, CameraEnabled: false, ScreenShareEnabled: false, AgentVisionOn: false });
      picker.Starts();
      await controller.SetScreenShareEnabled(true);
      expect(controller.State.LocalMedia.ScreenShareEnabled).toBe(true);
    });

    it('releases the share when the user leaves, and a share whose picker was still open', async () => {
      const capture = picker.Starts();
      await controller.SetScreenShareEnabled(true);
      await controller.Disconnect();
      expect(capture.Stopped).toBe(true);

      await controller.Connect('wss://x', 'token');
      let answer: (result: DisplayCaptureResult) => void = () => undefined;
      picker.Answers.push(new Promise<DisplayCaptureResult>((resolve) => (answer = resolve)));
      const starting = controller.SetScreenShareEnabled(true);
      await controller.Disconnect();
      const late = new FakeCapture();
      answer({ Status: 'started', Capture: late });
      await starting;
      expect(late.Stopped).toBe(true);
      expect(room.localParticipant.Published.map((p) => p.Track)).toEqual([capture.Track]);
    });
  });

  describe('data channel', () => {
    beforeEach(async () => {
      await controller.Connect('wss://x', 'token');
    });

    it('sends data, allows beforeSendData to rewrite the text, and resolves true once it went out', async () => {
      controller.Events.On('beforeSendData', (e) => {
        e.Text = `[prefixed] ${e.Text}`;
      });
      expect(await controller.SendData('hello')).toBe(true);
      const decoded = new TextDecoder().decode(room.localParticipant.publishData.mock.calls[0][0]);
      expect(decoded).toBe('[prefixed] hello');
    });

    it('does not send when beforeSendData is canceled, and resolves false', async () => {
      controller.Events.On('beforeSendData', (e) => {
        e.Cancel = true;
      });
      expect(await controller.SendData('blocked')).toBe(false);
      expect(room.localParticipant.publishData).not.toHaveBeenCalled();
    });

    it('resolves false when the publish fails, and reports it as a data error', async () => {
      const errors: LiveKitRoomError[] = [];
      controller.Events.On('error', (e) => errors.push(e));
      const failed = new Error('publishing rejected as engine not connected within timeout');
      room.localParticipant.publishData.mockRejectedValueOnce(failed);
      expect(await controller.SendData('hello', 'lk-chat')).toBe(false);
      expect(errors).toEqual([{ Kind: 'data', Message: 'Failed to send data message.', Cause: failed }]);
    });

    it('resolves false outside a room, sending nothing', async () => {
      const outside = makeController(new FakeRoom(), new FakePicker());
      expect(await outside.SendData('hello')).toBe(false);
      await controller.Disconnect();
      expect(await controller.SendData('hello')).toBe(false);
      expect(room.localParticipant.publishData).not.toHaveBeenCalled();
    });

    it('surfaces inbound data as a dataReceived event', async () => {
      const received = vi.fn();
      controller.Events.On('dataReceived', received);
      const sender = new FakeParticipant('remote-1', 'Sender');
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      room.emit(RoomEvent.DataReceived, new TextEncoder().encode('ping'), sender as any, undefined, 'chat');
      expect(received).toHaveBeenCalledOnce();
      const evt = received.mock.calls[0][0];
      expect(evt.Text).toBe('ping');
      expect(evt.Topic).toBe('chat');
      expect(evt.FromIdentity).toBe('remote-1');
    });
  });

  describe('participants & speakers', () => {
    beforeEach(async () => {
      await controller.Connect('wss://x', 'token');
    });

    it('emits participantJoined and includes the participant in remote state', async () => {
      const joined = vi.fn();
      controller.Events.On('participantJoined', joined);
      const remote = new FakeParticipant('remote-2', 'Guest');
      room.remoteParticipants.set('remote-2', remote);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      room.emit(RoomEvent.ParticipantConnected, remote as any);
      expect(joined).toHaveBeenCalledOnce();
      expect(controller.State.Remote.map((r) => r.Identity)).toContain('remote-2');
    });

    it('resolves the agent role from participant metadata', async () => {
      const agent = new FakeParticipant('agent-bot', 'Sage', JSON.stringify({ mjRole: 'agent' }));
      room.remoteParticipants.set('agent-bot', agent);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      room.emit(RoomEvent.ParticipantConnected, agent as any);
      const view = controller.State.Remote.find((r) => r.Identity === 'agent-bot');
      expect(view?.Role).toBe('agent');
    });

    it('emits activeSpeakersChanged with identities', async () => {
      const speakers = vi.fn();
      controller.Events.On('activeSpeakersChanged', speakers);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      room.emit(RoomEvent.ActiveSpeakersChanged, [room.localParticipant as any]);
      expect(speakers).toHaveBeenCalledOnce();
      expect(controller.State.ActiveSpeakerIdentities).toContain('local-me');
    });
  });

  describe('what an agent sees', () => {
    /** Adds a remote participant with the given attributes, as LiveKit reports a join. */
    const join = (identity: string, attributes: Record<string, string>, metadata?: string) => {
      const p = new FakeParticipant(identity, identity, metadata);
      p.attributes = attributes;
      room.remoteParticipants.set(identity, p);
      room.emit(RoomEvent.ParticipantConnected, p);
      return p;
    };
    const viewOf = (identity: string) => controller.State.Remote.find((r) => r.Identity === identity);

    beforeEach(async () => {
      await controller.Connect('wss://x', 'token');
    });

    it("marks a person the agent can see: they allowed it and an agent watches; only 'true' allows it", () => {
      join('ada', { [REALTIME_AGENT_CAN_SEE_ATTRIBUTE]: 'true' });
      join('bo', { [REALTIME_AGENT_CAN_SEE_ATTRIBUTE]: 'false' });
      join('agent-1', { [REALTIME_AGENT_WATCHES_ATTRIBUTE]: 'true' }, JSON.stringify({ mjRole: 'agent' }));
      expect(controller.State.AgentWatching).toBe(true);
      expect(viewOf('ada')?.AgentCanSee).toBe(true);
      expect(viewOf('bo')?.AgentCanSee).toBe(false);
    });

    it("shows nobody as seen while no agent watches, whatever they allowed; only 'true' means it watches", () => {
      join('ada', { [REALTIME_AGENT_CAN_SEE_ATTRIBUTE]: 'true' });
      join('agent-1', { [REALTIME_AGENT_WATCHES_ATTRIBUTE]: 'false' }, JSON.stringify({ mjRole: 'agent' }));
      expect(controller.State.AgentWatching).toBe(false);
      expect(viewOf('ada')?.AgentCanSee).toBe(false);
    });

    it("reads the local person's own choice, whether or not an agent watches", () => {
      room.localParticipant.attributes = { [REALTIME_AGENT_CAN_SEE_ATTRIBUTE]: 'true' };
      join('bo', {});
      expect(controller.State.LocalMedia.AgentVisionOn).toBe(true);
      expect(controller.State.Local?.AgentCanSee).toBe(false);
      join('agent-1', { [REALTIME_AGENT_WATCHES_ATTRIBUTE]: 'true' });
      expect(controller.State.Local?.AgentCanSee).toBe(true);
    });

    it('follows attribute changes as the server makes them', () => {
      const ada = join('ada', {});
      const agent = join('agent-1', { [REALTIME_AGENT_WATCHES_ATTRIBUTE]: 'true' });
      ada.attributes = { [REALTIME_AGENT_CAN_SEE_ATTRIBUTE]: 'true' };
      room.emit(RoomEvent.ParticipantAttributesChanged, { [REALTIME_AGENT_CAN_SEE_ATTRIBUTE]: 'true' }, ada);
      expect(viewOf('ada')?.AgentCanSee).toBe(true);
      agent.attributes = {};
      room.emit(RoomEvent.ParticipantAttributesChanged, { [REALTIME_AGENT_WATCHES_ATTRIBUTE]: '' }, agent);
      expect(controller.State.AgentWatching).toBe(false);
      expect(viewOf('ada')?.AgentCanSee).toBe(false);
    });
  });

  describe("an agent's avatar", () => {
    const AGENT = JSON.stringify({ mjRole: 'agent' });
    /** Adds a remote participant with the given attributes, as LiveKit reports a join. */
    const join = (identity: string, attributes: Record<string, string>, metadata?: string) => {
      const p = new FakeParticipant(identity, identity, metadata);
      p.attributes = attributes;
      room.remoteParticipants.set(identity, p);
      room.emit(RoomEvent.ParticipantConnected, p);
      return p;
    };
    const viewOf = (identity: string) => controller.State.Remote.find((r) => r.Identity === identity);

    beforeEach(async () => {
      await controller.Connect('wss://x', 'token');
    });

    it("marks an agent whose bot says audio only, with the bot's reason", () => {
      join('sage', { [REALTIME_AGENT_AVATAR_ATTRIBUTE]: 'audio-only:bridged' }, AGENT);
      expect(viewOf('sage')?.AvatarAudioOnly).toEqual({ Reason: 'bridged' });
    });

    it('marks it without a reason when the reason is one the room does not know', () => {
      join('sage', { [REALTIME_AGENT_AVATAR_ATTRIBUTE]: 'audio-only:some-newer-reason' }, AGENT);
      expect(viewOf('sage')?.AvatarAudioOnly).toEqual({});
    });

    it("reads the bot's own failures as reasons", () => {
      join('sage', { [REALTIME_AGENT_AVATAR_ATTRIBUTE]: 'audio-only:decoder-missing' }, AGENT);
      expect(viewOf('sage')?.AvatarAudioOnly).toEqual({ Reason: 'decoder-missing' });
    });

    it('marks no agent whose avatar shows or that asked for none', () => {
      join('sage', { [REALTIME_AGENT_AVATAR_ATTRIBUTE]: 'on' }, AGENT);
      join('rowan', {}, AGENT);
      expect(viewOf('sage')).not.toHaveProperty('AvatarAudioOnly');
      expect(viewOf('rowan')).not.toHaveProperty('AvatarAudioOnly');
    });

    it('marks nobody who is not an agent, whatever their attributes say', () => {
      join('ada', { [REALTIME_AGENT_AVATAR_ATTRIBUTE]: 'audio-only:bridged' });
      expect(viewOf('ada')).not.toHaveProperty('AvatarAudioOnly');
    });

    it('follows the bot as it changes the attribute', () => {
      const sage = join('sage', { [REALTIME_AGENT_AVATAR_ATTRIBUTE]: 'on' }, AGENT);
      sage.attributes = { [REALTIME_AGENT_AVATAR_ATTRIBUTE]: 'audio-only:bridged' };
      room.emit(RoomEvent.ParticipantAttributesChanged, sage.attributes, sage);
      expect(viewOf('sage')?.AvatarAudioOnly).toEqual({ Reason: 'bridged' });
    });
  });

  describe('audio playback', () => {
    beforeEach(async () => {
      await controller.Connect('wss://x', 'token');
    });

    it('reflects an autoplay block and clears it via StartAudio', async () => {
      const changed = vi.fn();
      controller.Events.On('audioPlaybackChanged', changed);

      room.canPlaybackAudio = false;
      room.emit(RoomEvent.AudioPlaybackStatusChanged);
      expect(controller.State.AudioPlaybackBlocked).toBe(true);
      expect(changed).toHaveBeenCalledWith({ CanPlayback: false });

      await controller.StartAudio();
      expect(room.startAudio).toHaveBeenCalledOnce();
      expect(controller.State.AudioPlaybackBlocked).toBe(false);
    });
  });

  describe('cloud effects (graceful when unavailable)', () => {
    beforeEach(async () => {
      await controller.Connect('wss://x', 'token');
    });

    it('SetNoiseFilterEnabled returns false when there is no processable local track', async () => {
      const ok = await controller.SetNoiseFilterEnabled(true);
      expect(ok).toBe(false);
      expect(controller.State.NoiseFilterEnabled).toBe(false);
    });

    it('SetBackgroundEffect returns false when there is no camera track', async () => {
      const ok = await controller.SetBackgroundEffect({ Kind: 'blur', Radius: 8 });
      expect(ok).toBe(false);
    });
  });

  describe('E2EE', () => {
    it('enables end-to-end encryption when a passphrase + worker are supplied', async () => {
      const worker = {} as unknown as Worker;
      await controller.Connect('wss://x', 'token', { E2EE: { Passphrase: 'shared-secret', Worker: worker } });
      expect(room.setE2EEEnabled).toHaveBeenCalledWith(true);
      expect(controller.State.E2EEEnabled).toBe(true);
    });
  });

  describe('Disconnect', () => {
    it('cancels via beforeDisconnect and stays connected', async () => {
      await controller.Connect('wss://x', 'token');
      controller.Events.On('beforeDisconnect', (e) => {
        e.Cancel = true;
      });
      const proceeded = await controller.Disconnect();
      expect(proceeded).toBe(false);
      expect(controller.Status).toBe('connected');
    });

    it('disconnects and emits disconnected', async () => {
      await controller.Connect('wss://x', 'token');
      const disconnected = vi.fn();
      controller.Events.On('disconnected', disconnected);
      const proceeded = await controller.Disconnect();
      expect(proceeded).toBe(true);
      expect(controller.Status).toBe('disconnected');
      expect(disconnected).toHaveBeenCalled();
    });

    it('maps null/undefined disconnect reason to connection-lost', async () => {
      await controller.Connect('wss://x', 'token');
      let reason: string | undefined;
      controller.Events.On('disconnected', (e) => {
        reason = e.Reason;
      });
      room.emit(RoomEvent.Disconnected, undefined);
      expect(reason).toBe('connection-lost');
    });

    it('maps CLIENT_INITIATED disconnect reason to client-initiated', async () => {
      await controller.Connect('wss://x', 'token');
      let reason: string | undefined;
      controller.Events.On('disconnected', (e) => {
        reason = e.Reason;
      });
      room.emit(RoomEvent.Disconnected, DisconnectReason.CLIENT_INITIATED);
      expect(reason).toBe('client-initiated');
    });

    it('maps terminal disconnect reasons correctly', async () => {
      await controller.Connect('wss://x', 'token');
      const reasons: string[] = [];
      controller.Events.On('disconnected', (e) => {
        if (e.Reason) reasons.push(e.Reason);
      });
      room.emit(RoomEvent.Disconnected, DisconnectReason.ROOM_DELETED);
      expect(reasons[0]).toBe('room-deleted');
    });
  });

  describe('the state after leaving (#5391)', () => {
    /** Adds a remote participant, as LiveKit reports a join. */
    const join = (identity: string): void => {
      const p = new FakeParticipant(identity, identity);
      room.remoteParticipants.set(identity, p);
      room.emit(RoomEvent.ParticipantConnected, p);
    };

    /**
     * The server ends the connection, as LiveKit reports it: the tracks are unpublished first (the controller still
     * rebuilds its state from the room), then the connection state changes, then the disconnect.
     */
    const endFromServer = (reason: DisconnectReason): void => {
      room.remoteParticipants.clear();
      room.emit(RoomEvent.LocalTrackUnpublished);
      room.state = ConnectionState.Disconnected;
      room.emit(RoomEvent.ConnectionStateChanged, ConnectionState.Disconnected);
      room.emit(RoomEvent.Disconnected, reason);
    };

    it('holds no local participant, no room name and nobody else after the user leaves', async () => {
      await controller.Connect('wss://x', 'token', { DisplayName: 'Ada' });
      join('bo');
      expect(controller.State).toMatchObject({ RoomName: 'test-room', Local: { Identity: 'local-me' } });

      await controller.Disconnect();

      expect(controller.State.Status).toBe('disconnected');
      expect(controller.State.Local).toBeUndefined();
      expect(controller.State.RoomName).toBeUndefined();
      expect(controller.State.Remote).toEqual([]);
    });

    it('holds neither after the server ends the connection', async () => {
      await controller.Connect('wss://x', 'token');
      join('bo');

      endFromServer(DisconnectReason.ROOM_DELETED);

      expect(controller.State).toMatchObject({ Status: 'disconnected', DisconnectReason: 'room-deleted', Remote: [] });
      expect(controller.State.Local).toBeUndefined();
      expect(controller.State.RoomName).toBeUndefined();
    });

    it('names no room while joining again, then sets both from the room joined', async () => {
      const next = new FakeRoom();
      next.name = 'next-room';
      next.localParticipant = new FakeParticipant('local-again', 'Me again');
      const rooms = [room, next];
      controller = new LiveKitRoomController({ RoomFactory: () => rooms.shift() as unknown as Room, RequestScreenShare: picker.Request });
      await controller.Connect('wss://x', 'token');
      await controller.Disconnect();
      const connecting: Array<{ RoomName?: string; Local?: string }> = [];
      controller.Events.On('stateChanged', (s) => {
        if (s.Status === 'connecting') {
          connecting.push({ RoomName: s.RoomName, Local: s.Local?.Identity });
        }
      });
      const connected = vi.fn();
      controller.Events.On('connected', connected);

      await controller.Connect('wss://x', 'token-2');

      expect(connecting).toEqual([{ RoomName: undefined, Local: undefined }]);
      expect(controller.State).toMatchObject({ Status: 'connected', RoomName: 'next-room', Local: { Identity: 'local-again' } });
      expect(connected.mock.calls[0][0].State).toMatchObject({ RoomName: 'next-room', Local: { Identity: 'local-again' } });
    });

    it('lets a beforeDisconnect handler read what the user is leaving, and keeps the reason LiveKit gave', async () => {
      await controller.Connect('wss://x', 'token', { DisplayName: 'Ada' });
      let leaving: { RoomName?: string; Local?: string } = {};
      controller.Events.On('beforeDisconnect', () => {
        leaving = { RoomName: controller.State.RoomName, Local: controller.State.Local?.DisplayName };
      });

      await controller.Disconnect();

      expect(leaving).toEqual({ RoomName: 'test-room', Local: 'Ada' });
      expect(controller.State.DisconnectReason).toBe('client-initiated');
    });

    it('keeps both when a beforeDisconnect handler cancels the leave', async () => {
      await controller.Connect('wss://x', 'token', { DisplayName: 'Ada' });
      controller.Events.On('beforeDisconnect', (e) => {
        e.Cancel = true;
      });

      await controller.Disconnect();

      expect(controller.State).toMatchObject({ Status: 'connected', RoomName: 'test-room', Local: { DisplayName: 'Ada' } });
    });
  });
});
