import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ConnectionQuality, ConnectionState, DisconnectReason, RoomEvent, Track, type ScreenShareCaptureOptions } from 'livekit-client';
import { LiveKitRoomController } from '../livekit-room-controller';
import { LIVEKIT_AGENT_CAN_SEE_ATTRIBUTE, LIVEKIT_AGENT_WATCHES_ATTRIBUTE } from '../types';

/** A publication reduced to what the controller reads: whether it is muted, and a screen share's track settings. */
interface FakePublication {
  isMuted: boolean;
  track?: { mediaStreamTrack: { getSettings(): MediaTrackSettings } };
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
  /** What a screen share started now reports as its `displaySurface`. */
  public screenSurface: string | undefined = 'window';
  private readonly pubs = new Map<Track.Source, FakePublication>();

  constructor(
    public identity: string,
    name?: string,
    metadata?: string,
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
    this.isMicrophoneEnabled = enabled;
    this.setPub(Track.Source.Microphone, enabled);
  }
  public async setCameraEnabled(enabled: boolean): Promise<void> {
    this.isCameraEnabled = enabled;
    this.setPub(Track.Source.Camera, enabled);
  }
  /** The options each `setScreenShareEnabled` call received. */
  public readonly screenShareOptions: Array<ScreenShareCaptureOptions | undefined> = [];
  public async setScreenShareEnabled(enabled: boolean, options?: ScreenShareCaptureOptions): Promise<void> {
    this.screenShareOptions.push(options);
    this.isScreenShareEnabled = enabled;
    this.setPub(Track.Source.ScreenShare, enabled);
  }
  public publishData = vi.fn(async (_payload: Uint8Array, _opts?: unknown): Promise<void> => undefined);

  private setPub(source: Track.Source, enabled: boolean): void {
    if (enabled) {
      const displaySurface = this.screenSurface;
      const track = source === Track.Source.ScreenShare ? { mediaStreamTrack: { getSettings: () => (displaySurface ? { displaySurface } : {}) } } : undefined;
      this.pubs.set(source, { isMuted: false, track });
    } else {
      this.pubs.delete(source);
    }
  }
}

/** A structural fake of livekit-client `Room`. */
class FakeRoom {
  public name = 'test-room';
  public state: ConnectionState = ConnectionState.Disconnected;
  public localParticipant = new FakeParticipant('local-me', 'Me');
  public remoteParticipants = new Map<string, FakeParticipant>();
  public canPlaybackAudio = true;
  public startAudio = vi.fn(async (): Promise<void> => {
    this.canPlaybackAudio = true;
  });
  public setE2EEEnabled = vi.fn(async (): Promise<void> => undefined);
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
    this.state = ConnectionState.Connected;
    this.emit(RoomEvent.Connected);
  }
  public async disconnect(): Promise<void> {
    this.state = ConnectionState.Disconnected;
    this.emit(RoomEvent.Disconnected, DisconnectReason.CLIENT_INITIATED);
  }
  public switchActiveDevice = vi.fn(async (): Promise<boolean> => true);
}

function makeController(room: FakeRoom): LiveKitRoomController {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return new LiveKitRoomController({ RoomFactory: () => room as any });
}

describe('LiveKitRoomController', () => {
  let room: FakeRoom;
  let controller: LiveKitRoomController;

  beforeEach(() => {
    room = new FakeRoom();
    controller = makeController(room);
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

    it('starts a screen share with the picked kind of surface offered first', async () => {
      await controller.SetScreenShareEnabled(true, 'window');
      expect(room.localParticipant.screenShareOptions).toEqual([{ video: { displaySurface: 'window' } }]);
      expect(controller.State.LocalMedia.ScreenShareEnabled).toBe(true);
    });

    it('toggles a screen share with no preference', async () => {
      await controller.ToggleScreenShare();
      expect(room.localParticipant.screenShareOptions).toEqual([undefined]);
      expect(controller.State.LocalMedia.ScreenShareEnabled).toBe(true);
    });

    it('reports what is shared while sharing, and nothing after', async () => {
      room.localParticipant.screenSurface = 'browser';
      await controller.SetScreenShareEnabled(true);
      expect(controller.State.LocalMedia.ScreenShareSurface).toBe('tab');
      await controller.SetScreenShareEnabled(false);
      expect(controller.State.LocalMedia.ScreenShareSurface).toBeUndefined();
    });

    it('changes a running share by stopping it and asking again, with the picked kind first', async () => {
      await controller.SetScreenShareEnabled(true);
      await controller.ChangeScreenShare('tab');
      expect(room.localParticipant.screenShareOptions).toEqual([undefined, undefined, { video: { displaySurface: 'browser' } }]);
      expect(controller.State.LocalMedia.ScreenShareEnabled).toBe(true);
    });

    it('starts a share when asked to change one that is not running', async () => {
      await controller.ChangeScreenShare();
      expect(room.localParticipant.screenShareOptions).toEqual([undefined]);
      expect(controller.State.LocalMedia.ScreenShareEnabled).toBe(true);
    });

    it('cancels a media toggle when beforeMediaToggle is canceled', async () => {
      controller.Events.On('beforeMediaToggle', (e) => {
        if (e.Kind === 'screen') {
          e.Cancel = true;
        }
      });
      await controller.SetScreenShareEnabled(true);
      expect(controller.State.LocalMedia.ScreenShareEnabled).toBe(false);
    });
  });

  describe('data channel', () => {
    beforeEach(async () => {
      await controller.Connect('wss://x', 'token');
    });

    it('sends data and allows beforeSendData to rewrite the text', async () => {
      controller.Events.On('beforeSendData', (e) => {
        e.Text = `[prefixed] ${e.Text}`;
      });
      await controller.SendData('hello');
      const decoded = new TextDecoder().decode(room.localParticipant.publishData.mock.calls[0][0]);
      expect(decoded).toBe('[prefixed] hello');
    });

    it('does not send when beforeSendData is canceled', async () => {
      controller.Events.On('beforeSendData', (e) => {
        e.Cancel = true;
      });
      await controller.SendData('blocked');
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
      join('ada', { [LIVEKIT_AGENT_CAN_SEE_ATTRIBUTE]: 'true' });
      join('bo', { [LIVEKIT_AGENT_CAN_SEE_ATTRIBUTE]: 'false' });
      join('agent-1', { [LIVEKIT_AGENT_WATCHES_ATTRIBUTE]: 'true' }, JSON.stringify({ mjRole: 'agent' }));
      expect(controller.State.AgentWatching).toBe(true);
      expect(viewOf('ada')?.AgentCanSee).toBe(true);
      expect(viewOf('bo')?.AgentCanSee).toBe(false);
    });

    it("shows nobody as seen while no agent watches, whatever they allowed; only 'true' means it watches", () => {
      join('ada', { [LIVEKIT_AGENT_CAN_SEE_ATTRIBUTE]: 'true' });
      join('agent-1', { [LIVEKIT_AGENT_WATCHES_ATTRIBUTE]: 'false' }, JSON.stringify({ mjRole: 'agent' }));
      expect(controller.State.AgentWatching).toBe(false);
      expect(viewOf('ada')?.AgentCanSee).toBe(false);
    });

    it("reads the local person's own choice, whether or not an agent watches", () => {
      room.localParticipant.attributes = { [LIVEKIT_AGENT_CAN_SEE_ATTRIBUTE]: 'true' };
      join('bo', {});
      expect(controller.State.LocalMedia.AgentVisionOn).toBe(true);
      expect(controller.State.Local?.AgentCanSee).toBe(false);
      join('agent-1', { [LIVEKIT_AGENT_WATCHES_ATTRIBUTE]: 'true' });
      expect(controller.State.Local?.AgentCanSee).toBe(true);
    });

    it('follows attribute changes as the server makes them', () => {
      const ada = join('ada', {});
      const agent = join('agent-1', { [LIVEKIT_AGENT_WATCHES_ATTRIBUTE]: 'true' });
      ada.attributes = { [LIVEKIT_AGENT_CAN_SEE_ATTRIBUTE]: 'true' };
      room.emit(RoomEvent.ParticipantAttributesChanged, { [LIVEKIT_AGENT_CAN_SEE_ATTRIBUTE]: 'true' }, ada);
      expect(viewOf('ada')?.AgentCanSee).toBe(true);
      agent.attributes = {};
      room.emit(RoomEvent.ParticipantAttributesChanged, { [LIVEKIT_AGENT_WATCHES_ATTRIBUTE]: '' }, agent);
      expect(controller.State.AgentWatching).toBe(false);
      expect(viewOf('ada')?.AgentCanSee).toBe(false);
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
  });
});
