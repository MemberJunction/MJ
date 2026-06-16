/**
 * @fileoverview {@link LiveKitRoomController} — the framework-agnostic controller for ONE LiveKit room
 * connection. Wraps the livekit-client `Room` behind an injectable factory seam so the controller (and
 * every UI built on it) unit-tests with an in-memory fake `Room` — no WebRTC, no network, no browser.
 *
 * It normalizes LiveKit's event-rich, mutable `Room`/`Participant` surface into:
 *   - a single observable {@link LiveKitRoomState} snapshot ({@link State$}) the UI renders from, and
 *   - narrow event streams for transient things ({@link Data$}, {@link Errors$}).
 *
 * Media DOM-attach (`track.attach(element)`) stays in the UI layer via {@link LiveKitParticipantView.Raw};
 * the controller never touches the DOM, which is what keeps it framework-agnostic.
 *
 * @module @memberjunction/livekit-room-core
 */

import {
    ConnectionQuality,
    ConnectionState,
    DisconnectReason,
    Participant,
    RemoteParticipant,
    Room,
    RoomEvent,
    Track,
    type RoomOptions,
} from 'livekit-client';
import { BehaviorSubject, Observable } from 'rxjs';
import { LiveKitRoomEventBus } from './events';
import {
    LiveKitConnectionStatus,
    LiveKitDevice,
    LiveKitDisconnectReason,
    LiveKitLocalMediaState,
    LiveKitParticipantRole,
    LiveKitParticipantView,
    LiveKitRoomConnectOptions,
    LiveKitRoomError,
    LiveKitRoomState,
} from './types';

/**
 * Factory seam that constructs the livekit-client `Room`. Production uses the default
 * ({@link defaultRoomFactory}); tests inject a fake that structurally satisfies the subset of `Room` the
 * controller uses, cast via `as unknown as Room`.
 */
export type LiveKitRoomFactory = (options?: RoomOptions) => Room;

/** The default factory — constructs a real livekit-client `Room`. */
export const defaultRoomFactory: LiveKitRoomFactory = (options) => new Room(options);

/** Resolves a participant's {@link LiveKitParticipantRole} from its LiveKit metadata / flags. */
export type LiveKitRoleResolver = (participant: Participant) => LiveKitParticipantRole;

/**
 * Default role resolver: reads a JSON `metadata` string for `{ "mjRole": "agent" | "host" }`, falling
 * back to `'participant'`. The MJ bridge stamps the agent bot's metadata so its tile renders as the agent.
 */
export const defaultRoleResolver: LiveKitRoleResolver = (participant) => {
    const raw = participant.metadata;
    if (raw) {
        try {
            const parsed = JSON.parse(raw) as { mjRole?: string; role?: string };
            const role = (parsed.mjRole ?? parsed.role ?? '').toLowerCase();
            if (role === 'agent' || role === 'host' || role === 'participant') {
                return role;
            }
        } catch {
            // metadata is not JSON — fall through to default
        }
    }
    return 'participant';
};

/** Construction options for the controller (all optional — sensible defaults applied). */
export interface LiveKitRoomControllerOptions {
    /** Override the `Room` factory (tests inject a fake). */
    RoomFactory?: LiveKitRoomFactory;
    /** Override how a participant's role is derived. */
    RoleResolver?: LiveKitRoleResolver;
    /** Supply a shared event bus (e.g. so a host can subscribe before the controller connects). */
    EventBus?: LiveKitRoomEventBus;
}

/**
 * Controls a single LiveKit room: connect/disconnect, local-media toggles, data messages, device
 * switching, and a normalized observable state snapshot. One controller == one room connection.
 */
export class LiveKitRoomController {
    private room: Room | null = null;
    private readonly roomFactory: LiveKitRoomFactory;
    private readonly roleResolver: LiveKitRoleResolver;

    private readonly stateSubject: BehaviorSubject<LiveKitRoomState>;
    private readonly textDecoder = new TextDecoder();
    private readonly textEncoder = new TextEncoder();

    /**
     * The room's cancelable event bus (Before-events + notifications). Subscribe with `Events.On(...)`;
     * the Angular layer re-surfaces these as `@Output()` emitters. See {@link LiveKitRoomEventBus}.
     */
    public readonly Events: LiveKitRoomEventBus;

    constructor(options: LiveKitRoomControllerOptions = {}) {
        this.roomFactory = options.RoomFactory ?? defaultRoomFactory;
        this.roleResolver = options.RoleResolver ?? defaultRoleResolver;
        this.Events = options.EventBus ?? new LiveKitRoomEventBus();
        this.stateSubject = new BehaviorSubject<LiveKitRoomState>(this.initialState());
    }

    // ── Observable surface ────────────────────────────────────────────────────────────

    /** The normalized room-state snapshot. Emits the current value on subscribe, then on every change. */
    public get State$(): Observable<LiveKitRoomState> {
        return this.stateSubject.asObservable();
    }

    /** The current room-state snapshot (synchronous). */
    public get State(): LiveKitRoomState {
        return this.stateSubject.value;
    }

    /** The current connection status (synchronous convenience). */
    public get Status(): LiveKitConnectionStatus {
        return this.stateSubject.value.Status;
    }

    // ── Lifecycle ───────────────────────────────────────────────────────────────────

    /**
     * Connects to a LiveKit room and brings the local participant online with the requested media.
     *
     * @param serverUrl The LiveKit server URL (e.g. `wss://livekit.myorg.com`).
     * @param token The signed access token authorizing this participant to join a specific room.
     * @param options Initial media + display-name options.
     */
    public async Connect(serverUrl: string, token: string, options: LiveKitRoomConnectOptions = {}): Promise<void> {
        const before = this.Events.Emit('beforeConnect', { ServerUrl: serverUrl, Options: options, Cancel: false });
        if (before.Cancel) {
            return;
        }
        if (this.room) {
            await this.Disconnect(false);
        }
        const room = this.roomFactory(before.Options.RoomOptions);
        this.room = room;
        this.wireRoomEvents(room);
        this.patchState({ Status: 'connecting', DisconnectReason: undefined });

        try {
            await room.connect(serverUrl, token, { autoSubscribe: true });
            if (before.Options.DisplayName) {
                await room.localParticipant.setName(before.Options.DisplayName);
            }
            await this.applyInitialMedia(room, before.Options);
            this.rebuildState();
            this.Events.Emit('connected', { State: this.stateSubject.value });
        } catch (err) {
            this.emitError('connect', 'Failed to connect to the room.', err);
            this.patchState({ Status: 'error' });
            throw err;
        }
    }

    /**
     * Disconnects from the room and releases all resources. Safe to call when not connected.
     *
     * @param userInitiated Whether the user requested the leave (raises a cancelable `beforeDisconnect`).
     *   Internal reconnect cycles pass `false` to skip the veto hook. Defaults to `true`.
     * @returns `true` if the disconnect proceeded, `false` if a `beforeDisconnect` handler canceled it.
     */
    public async Disconnect(userInitiated = true): Promise<boolean> {
        if (userInitiated) {
            const before = this.Events.Emit('beforeDisconnect', { UserInitiated: true, Cancel: false });
            if (before.Cancel) {
                return false;
            }
        }
        const room = this.room;
        this.room = null;
        if (room) {
            try {
                await room.disconnect();
            } catch (err) {
                this.emitError('disconnect', 'Error while disconnecting.', err);
            }
        }
        this.patchState({ ...this.initialState(), Status: 'disconnected' });
        return true;
    }

    /** Disposes the controller, tears down the connection, and clears all subscribers. */
    public Dispose(): void {
        void this.Disconnect(false);
        this.stateSubject.complete();
        this.Events.Clear();
    }

    // ── Local media controls ──────────────────────────────────────────────────────────

    /** Enables or disables the local microphone. */
    public async SetMicrophoneEnabled(enabled: boolean): Promise<void> {
        await this.toggleLocalMedia('microphone', enabled);
    }

    /** Enables or disables the local camera. */
    public async SetCameraEnabled(enabled: boolean): Promise<void> {
        await this.toggleLocalMedia('camera', enabled);
    }

    /** Starts or stops local screen sharing. */
    public async SetScreenShareEnabled(enabled: boolean): Promise<void> {
        await this.toggleLocalMedia('screen', enabled);
    }

    /** Toggles the microphone and returns the new state. */
    public async ToggleMicrophone(): Promise<boolean> {
        const next = !this.stateSubject.value.LocalMedia.MicrophoneEnabled;
        await this.SetMicrophoneEnabled(next);
        return next;
    }

    /** Toggles the camera and returns the new state. */
    public async ToggleCamera(): Promise<boolean> {
        const next = !this.stateSubject.value.LocalMedia.CameraEnabled;
        await this.SetCameraEnabled(next);
        return next;
    }

    /** Toggles screen sharing and returns the new state. */
    public async ToggleScreenShare(): Promise<boolean> {
        const next = !this.stateSubject.value.LocalMedia.ScreenShareEnabled;
        await this.SetScreenShareEnabled(next);
        return next;
    }

    // ── Data channel ────────────────────────────────────────────────────────────────

    /**
     * Sends a text message on the LiveKit data channel (reliable publish to all participants).
     *
     * @param text The message text.
     * @param topic Optional topic to publish under (for routing on the receiving side).
     */
    public async SendData(text: string, topic?: string): Promise<void> {
        if (!this.room) {
            return;
        }
        const before = this.Events.Emit('beforeSendData', { Text: text, Topic: topic, Cancel: false });
        if (before.Cancel) {
            return;
        }
        try {
            const payload = this.textEncoder.encode(before.Text);
            await this.room.localParticipant.publishData(payload, { reliable: true, topic: before.Topic });
        } catch (err) {
            this.emitError('data', 'Failed to send data message.', err);
        }
    }

    // ── Devices ─────────────────────────────────────────────────────────────────────

    /**
     * Enumerates available media devices of a given kind.
     *
     * @param kind The device kind to enumerate.
     * @returns The available devices.
     */
    public async ListDevices(kind: LiveKitDevice['Kind']): Promise<LiveKitDevice[]> {
        try {
            const devices = await Room.getLocalDevices(kind);
            return devices.map((d) => ({ DeviceId: d.deviceId, Label: d.label, Kind: kind }));
        } catch (err) {
            this.emitError('device', `Failed to enumerate ${kind} devices.`, err);
            return [];
        }
    }

    /**
     * Switches the active device for a given kind.
     *
     * @param kind The device kind to switch.
     * @param deviceId The `deviceId` to switch to.
     */
    public async SwitchDevice(kind: LiveKitDevice['Kind'], deviceId: string): Promise<void> {
        if (!this.room) {
            return;
        }
        const before = this.Events.Emit('beforeDeviceSwitch', { Kind: kind, DeviceId: deviceId, Cancel: false });
        if (before.Cancel) {
            return;
        }
        try {
            await this.room.switchActiveDevice(kind, before.DeviceId);
        } catch (err) {
            this.emitError('device', `Failed to switch ${kind} device.`, err);
        }
    }

    // ── internals: event wiring ───────────────────────────────────────────────────────

    /** Wires the room's event stream to state rebuilds + transient streams. */
    private wireRoomEvents(room: Room): void {
        const rebuild = (): void => this.rebuildState();
        room
            .on(RoomEvent.Connected, rebuild)
            .on(RoomEvent.ParticipantConnected, (p: RemoteParticipant) => this.handleParticipantJoined(p))
            .on(RoomEvent.ParticipantDisconnected, (p: RemoteParticipant) => this.handleParticipantLeft(p))
            .on(RoomEvent.TrackSubscribed, rebuild)
            .on(RoomEvent.TrackUnsubscribed, rebuild)
            .on(RoomEvent.LocalTrackPublished, rebuild)
            .on(RoomEvent.LocalTrackUnpublished, rebuild)
            .on(RoomEvent.TrackMuted, rebuild)
            .on(RoomEvent.TrackUnmuted, rebuild)
            .on(RoomEvent.ConnectionQualityChanged, rebuild)
            .on(RoomEvent.ActiveSpeakersChanged, (speakers: Participant[]) => this.handleActiveSpeakers(speakers))
            .on(RoomEvent.ConnectionStateChanged, (state: ConnectionState) => this.handleConnectionState(state))
            .on(RoomEvent.Reconnecting, () => {
                this.patchState({ Status: 'reconnecting' });
                this.Events.Emit('reconnecting', {});
            })
            .on(RoomEvent.Reconnected, () => {
                this.rebuildState();
                this.Events.Emit('reconnected', { State: this.stateSubject.value });
            })
            .on(RoomEvent.DataReceived, (payload: Uint8Array, participant?: RemoteParticipant, _kind?: unknown, topic?: string) =>
                this.handleData(payload, participant, topic),
            )
            .on(RoomEvent.Disconnected, (reason?: DisconnectReason) => this.handleDisconnected(reason))
            .on(RoomEvent.MediaDevicesError, (err: Error) => this.emitError('device', err.message, err));
    }

    /** Handles a participant joining — emits `participantJoined` then rebuilds. */
    private handleParticipantJoined(participant: RemoteParticipant): void {
        this.Events.Emit('participantJoined', { Participant: this.buildView(participant) });
        this.rebuildState();
    }

    /** Handles a participant leaving — emits `participantLeft` then rebuilds. */
    private handleParticipantLeft(participant: RemoteParticipant): void {
        this.Events.Emit('participantLeft', { Identity: participant.identity, Participant: this.buildView(participant) });
        this.rebuildState();
    }

    /** Handles the `ActiveSpeakersChanged` event — updates the active-speaker identity list. */
    private handleActiveSpeakers(speakers: Participant[]): void {
        const identities = speakers.map((s) => s.identity);
        const views = speakers.map((s) => this.buildView(s));
        this.patchState({ ActiveSpeakerIdentities: identities });
        this.rebuildState();
        this.Events.Emit('activeSpeakersChanged', { Identities: identities, Speakers: views });
    }

    /** Handles connection-state transitions, mapping to the normalized status. */
    private handleConnectionState(state: ConnectionState): void {
        this.patchState({ Status: this.mapConnectionStatus(state) });
    }

    /** Handles an inbound data-channel message. */
    private handleData(payload: Uint8Array, participant: RemoteParticipant | undefined, topic: string | undefined): void {
        let text = '';
        try {
            text = this.textDecoder.decode(payload);
        } catch {
            text = '';
        }
        this.Events.Emit('dataReceived', {
            Text: text,
            Bytes: payload,
            Topic: topic,
            FromIdentity: participant?.identity,
            FromDisplayName: participant?.name ?? participant?.identity,
            ReceivedAt: Date.now(),
        });
    }

    /** Handles a room disconnect — records the reason and resets to disconnected state. */
    private handleDisconnected(reason: DisconnectReason | undefined): void {
        this.room = null;
        const mapped = this.mapDisconnectReason(reason);
        this.patchState({
            ...this.initialState(),
            Status: 'disconnected',
            DisconnectReason: mapped,
        });
        this.Events.Emit('disconnected', { Reason: mapped });
    }

    // ── internals: state building ─────────────────────────────────────────────────────

    /** Rebuilds the full state snapshot from the live room and emits it. */
    private rebuildState(): void {
        const room = this.room;
        if (!room) {
            return;
        }
        const local = room.localParticipant ? this.buildView(room.localParticipant) : undefined;
        const remote = Array.from(room.remoteParticipants.values()).map((p) => this.buildView(p));
        this.patchState({
            Status: this.mapConnectionStatus(room.state),
            RoomName: room.name,
            Local: local,
            Remote: remote,
            LocalMedia: this.readLocalMedia(room),
        });
    }

    /** Maps a livekit-client participant onto the normalized {@link LiveKitParticipantView}. */
    private buildView(participant: Participant): LiveKitParticipantView {
        return {
            Identity: participant.identity,
            DisplayName: participant.name && participant.name.length > 0 ? participant.name : participant.identity,
            IsLocal: this.room?.localParticipant === participant,
            Role: this.roleResolver(participant),
            IsSpeaking: participant.isSpeaking,
            AudioLevel: participant.audioLevel ?? 0,
            HasAudio: this.hasLiveTrack(participant, Track.Source.Microphone),
            HasVideo: this.hasLiveTrack(participant, Track.Source.Camera),
            IsScreenSharing: this.hasLiveTrack(participant, Track.Source.ScreenShare),
            ConnectionQuality: this.mapConnectionQuality(participant.connectionQuality),
            Raw: participant,
        };
    }

    /** Whether the participant has a published, unmuted track for the given source. */
    private hasLiveTrack(participant: Participant, source: Track.Source): boolean {
        const pub = participant.getTrackPublication(source);
        return pub != null && !pub.isMuted;
    }

    /** Reads the local-media toggle state from the room's local participant. */
    private readLocalMedia(room: Room): LiveKitLocalMediaState {
        const lp = room.localParticipant;
        return {
            MicrophoneEnabled: lp ? lp.isMicrophoneEnabled : false,
            CameraEnabled: lp ? lp.isCameraEnabled : false,
            ScreenShareEnabled: lp ? lp.isScreenShareEnabled : false,
        };
    }

    /** Toggles a local-media kind via the local participant, surfacing failures as device errors. */
    private async toggleLocalMedia(kind: 'microphone' | 'camera' | 'screen', enabled: boolean): Promise<void> {
        if (!this.room) {
            return;
        }
        const before = this.Events.Emit('beforeMediaToggle', { Kind: kind, Enabled: enabled, Cancel: false });
        if (before.Cancel) {
            return;
        }
        const lp = this.room.localParticipant;
        try {
            if (kind === 'microphone') {
                await lp.setMicrophoneEnabled(enabled);
            } else if (kind === 'camera') {
                await lp.setCameraEnabled(enabled);
            } else {
                await lp.setScreenShareEnabled(enabled);
            }
            this.rebuildState();
            this.Events.Emit('localMediaChanged', this.stateSubject.value.LocalMedia);
        } catch (err) {
            this.emitError('device', `Failed to ${enabled ? 'enable' : 'disable'} ${kind}.`, err);
        }
    }

    /** Applies the requested initial media (mic on by default, camera off — voice-first). */
    private async applyInitialMedia(room: Room, options: LiveKitRoomConnectOptions): Promise<void> {
        const wantMic = options.EnableMicrophone ?? true;
        const wantCam = options.EnableCamera ?? false;
        if (wantMic) {
            await room.localParticipant.setMicrophoneEnabled(true);
        }
        if (wantCam) {
            await room.localParticipant.setCameraEnabled(true);
        }
    }

    // ── internals: mapping + emit helpers ──────────────────────────────────────────────

    /** Maps livekit-client `ConnectionState` to the normalized {@link LiveKitConnectionStatus}. */
    private mapConnectionStatus(state: ConnectionState): LiveKitConnectionStatus {
        switch (state) {
            case ConnectionState.Connecting:
                return 'connecting';
            case ConnectionState.Connected:
                return 'connected';
            case ConnectionState.Reconnecting:
            case ConnectionState.SignalReconnecting:
                return 'reconnecting';
            case ConnectionState.Disconnected:
                return 'disconnected';
            default:
                return 'idle';
        }
    }

    /** Maps livekit-client `ConnectionQuality` to the normalized bucket. */
    private mapConnectionQuality(quality: ConnectionQuality): LiveKitParticipantView['ConnectionQuality'] {
        switch (quality) {
            case ConnectionQuality.Excellent:
                return 'excellent';
            case ConnectionQuality.Good:
                return 'good';
            case ConnectionQuality.Poor:
                return 'poor';
            case ConnectionQuality.Lost:
                return 'lost';
            default:
                return 'unknown';
        }
    }

    /** Maps livekit-client `DisconnectReason` to the normalized {@link LiveKitDisconnectReason}. */
    private mapDisconnectReason(reason: DisconnectReason | undefined): LiveKitDisconnectReason {
        switch (reason) {
            case DisconnectReason.CLIENT_INITIATED:
                return 'client-initiated';
            case DisconnectReason.SERVER_SHUTDOWN:
                return 'server-shutdown';
            case DisconnectReason.PARTICIPANT_REMOVED:
                return 'participant-removed';
            case DisconnectReason.ROOM_DELETED:
                return 'room-deleted';
            case DisconnectReason.DUPLICATE_IDENTITY:
                return 'duplicate-identity';
            case DisconnectReason.CONNECTION_TIMEOUT:
                return 'connection-lost';
            default:
                return reason == null ? 'client-initiated' : 'unknown';
        }
    }

    /** Pushes a partial update onto the current state snapshot, emits it, and fires `stateChanged`. */
    private patchState(patch: Partial<LiveKitRoomState>): void {
        const next = { ...this.stateSubject.value, ...patch };
        this.stateSubject.next(next);
        this.Events.Emit('stateChanged', next);
    }

    /** Emits a normalized error via the `error` event. */
    private emitError(kind: LiveKitRoomError['Kind'], message: string, cause?: unknown): void {
        this.Events.Emit('error', { Kind: kind, Message: message, Cause: cause });
    }

    /** The initial / reset room state. */
    private initialState(): LiveKitRoomState {
        return {
            Status: 'idle',
            Remote: [],
            ActiveSpeakerIdentities: [],
            LocalMedia: { MicrophoneEnabled: false, CameraEnabled: false, ScreenShareEnabled: false },
        };
    }
}
