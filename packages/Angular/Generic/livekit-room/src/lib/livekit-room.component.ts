import {
    ChangeDetectionStrategy,
    ChangeDetectorRef,
    Component,
    EventEmitter,
    Input,
    NgZone,
    OnChanges,
    OnDestroy,
    OnInit,
    Output,
    SimpleChanges,
    inject,
} from '@angular/core';
import {
    LiveKitRoomController,
    type LiveKitActiveSpeakersEvent,
    type LiveKitBeforeConnectEvent,
    type LiveKitBeforeDeviceSwitchEvent,
    type LiveKitBeforeDisconnectEvent,
    type LiveKitBeforeMediaToggleEvent,
    type LiveKitBeforeSendDataEvent,
    type LiveKitDataMessage,
    type LiveKitDisconnectedEvent,
    type LiveKitLocalMediaState,
    type LiveKitParticipantJoinedEvent,
    type LiveKitParticipantLeftEvent,
    type LiveKitParticipantView,
    type LiveKitRoomError,
    type LiveKitRoomState,
} from '@memberjunction/livekit-room-core';
import { LiveKitParticipantTileComponent } from './components/livekit-participant-tile.component';
import { LiveKitControlBarComponent } from './components/livekit-control-bar.component';
import { LiveKitChatPanelComponent } from './components/livekit-chat-panel.component';
import { LiveKitDeviceMenuComponent } from './components/livekit-device-menu.component';
import { LiveKitParticipantsPanelComponent } from './components/livekit-participants-panel.component';
import { LiveKitConnectionOverlayComponent } from './components/livekit-connection-overlay.component';
import { LIVEKIT_CHAT_TOPIC, type LiveKitChatMessage, type LiveKitDeviceLists, type LiveKitDeviceSelection } from './models';

/** Which side panel is open in the room, if any. */
type LiveKitSidePanel = 'none' | 'chat' | 'participants';

/** The room layout mode. */
export type LiveKitRoomLayout = 'grid' | 'spotlight' | 'audio-only';

/**
 * `mj-livekit-room` — a full-featured, framework-portable LiveKit room UI. Owns a
 * {@link LiveKitRoomController}, renders a participant grid/spotlight, control bar, chat, device picker,
 * and participants roster, and re-surfaces the core's cancelable event model as `@Output()`s.
 *
 * Every feature is gated by an `@Input` so a host can compose exactly the experience it wants (voice-only
 * widget, full conferencing surface, embedded co-agent panel, …) without forking the component.
 *
 * Public class members are PascalCase (MJ convention); private/protected members are camelCase.
 */
@Component({
    selector: 'mj-livekit-room',
    standalone: true,
    changeDetection: ChangeDetectionStrategy.OnPush,
    imports: [
        LiveKitParticipantTileComponent,
        LiveKitControlBarComponent,
        LiveKitChatPanelComponent,
        LiveKitDeviceMenuComponent,
        LiveKitParticipantsPanelComponent,
        LiveKitConnectionOverlayComponent,
    ],
    templateUrl: './livekit-room.component.html',
    styleUrls: ['./livekit-room.component.css'],
})
export class LiveKitRoomComponent implements OnInit, OnChanges, OnDestroy {
    private readonly zone = inject(NgZone);
    private readonly cdr = inject(ChangeDetectorRef);
    private readonly controller = new LiveKitRoomController();
    private unsubscribers: Array<() => void> = [];
    private serverUrl: string | null = null;
    private token: string | null = null;
    private initialized = false;

    // ── Connection inputs ───────────────────────────────────────────────────────────
    /** The LiveKit server URL (e.g. `wss://livekit.myorg.com`). */
    @Input()
    public set ServerUrl(value: string | null) {
        this.serverUrl = value;
        this.maybeAutoConnect();
    }
    public get ServerUrl(): string | null {
        return this.serverUrl;
    }

    /** The signed access token authorizing this participant to join the room. */
    @Input()
    public set Token(value: string | null) {
        this.token = value;
        this.maybeAutoConnect();
    }
    public get Token(): string | null {
        return this.token;
    }

    /** The display name to publish for the local participant. */
    @Input() public DisplayName: string | null = null;
    /** Connect automatically once {@link ServerUrl} + {@link Token} are present. */
    @Input() public AutoConnect = true;
    /** Start with the microphone enabled. */
    @Input() public StartWithMicrophone = true;
    /** Start with the camera enabled. */
    @Input() public StartWithCamera = false;

    // ── Layout & chrome gates ──────────────────────────────────────────────────────
    /** The stage layout mode. */
    @Input() public Layout: LiveKitRoomLayout = 'grid';
    /** Show the header bar. */
    @Input() public ShowHeader = true;
    /** The header title. */
    @Input() public Title: string | null = null;
    /** Show the participant count in the header. */
    @Input() public ShowParticipantCount = true;
    /** Show the local participant's self-view tile. */
    @Input() public ShowSelfView = true;
    /** Render the connecting/reconnecting/error overlay. */
    @Input() public ShowConnectionOverlay = true;
    /** Show per-tile audio meters. */
    @Input() public ShowAudioMeters = true;
    /** Highlight active speakers with a ring. */
    @Input() public ShowActiveSpeakerHighlight = true;
    /** Show per-tile connection-quality indicators. */
    @Input() public ShowConnectionQuality = true;
    /** Show participant name badges on tiles. */
    @Input() public ShowNameBadges = true;
    /** Optional avatar URL for the agent participant (matched by `agent` role). */
    @Input() public AgentAvatarUrl: string | null = null;

    // ── Control & feature gates ───────────────────────────────────────────────────
    /** Show the control bar at all. */
    @Input() public ShowControlBar = true;
    /** Allow toggling the microphone. */
    @Input() public EnableMicrophoneControl = true;
    /** Allow toggling the camera. */
    @Input() public EnableCameraControl = true;
    /** Allow screen sharing. */
    @Input() public EnableScreenShareControl = true;
    /** Allow opening the device-settings menu. */
    @Input() public EnableDeviceSettings = true;
    /** Allow leaving the room from the control bar. */
    @Input() public EnableLeaveControl = true;
    /** Enable the data-channel chat feature (toggle + panel). */
    @Input() public ShowChat = true;
    /** Enable the participants roster panel (toggle + panel). */
    @Input() public ShowParticipantsPanel = true;

    // ── Behavior ──────────────────────────────────────────────────────────────────
    /** Open the chat panel by default on connect. */
    @Input() public ChatOpenByDefault = false;

    // ── Cancelable Before-event outputs (set `$event.Cancel = true` to veto) ─────────
    /** Fired before connecting. Cancelable. */
    @Output() public BeforeConnect = new EventEmitter<LiveKitBeforeConnectEvent>();
    /** Fired before disconnecting/leaving. Cancelable (e.g. confirm "leave call?"). */
    @Output() public BeforeDisconnect = new EventEmitter<LiveKitBeforeDisconnectEvent>();
    /** Fired before a local-media track is toggled. Cancelable. */
    @Output() public BeforeMediaToggle = new EventEmitter<LiveKitBeforeMediaToggleEvent>();
    /** Fired before a data-channel message is sent. Cancelable; `Text` is mutable. */
    @Output() public BeforeSendData = new EventEmitter<LiveKitBeforeSendDataEvent>();
    /** Fired before the active device is switched. Cancelable. */
    @Output() public BeforeDeviceSwitch = new EventEmitter<LiveKitBeforeDeviceSwitchEvent>();

    // ── Notification outputs ──────────────────────────────────────────────────────
    /** Fired when the room connects. */
    @Output() public Connected = new EventEmitter<LiveKitRoomState>();
    /** Fired when the room disconnects. */
    @Output() public Disconnected = new EventEmitter<LiveKitDisconnectedEvent>();
    /** Fired when reconnection begins. */
    @Output() public Reconnecting = new EventEmitter<void>();
    /** Fired when reconnection succeeds. */
    @Output() public Reconnected = new EventEmitter<LiveKitRoomState>();
    /** Fired when a participant joins. */
    @Output() public ParticipantJoined = new EventEmitter<LiveKitParticipantJoinedEvent>();
    /** Fired when a participant leaves. */
    @Output() public ParticipantLeft = new EventEmitter<LiveKitParticipantLeftEvent>();
    /** Fired when the active-speaker set changes. */
    @Output() public ActiveSpeakersChanged = new EventEmitter<LiveKitActiveSpeakersEvent>();
    /** Fired for every inbound data-channel message (all topics). */
    @Output() public DataReceived = new EventEmitter<LiveKitDataMessage>();
    /** Fired when the local-media toggle state changes. */
    @Output() public LocalMediaChanged = new EventEmitter<LiveKitLocalMediaState>();
    /** Fired on every normalized room state change. */
    @Output() public StateChanged = new EventEmitter<LiveKitRoomState>();
    /** Fired when a room error occurs. */
    @Output() public ErrorOccurred = new EventEmitter<LiveKitRoomError>();
    /** Fired when a chat message (chat-topic data) is received or sent locally. */
    @Output() public ChatMessage = new EventEmitter<LiveKitChatMessage>();

    // ── View state (template-bound) ─────────────────────────────────────────────────
    /** The current normalized room state snapshot. */
    public State: LiveKitRoomState = this.controller.State;
    /** The accumulated chat messages. */
    public ChatMessages: LiveKitChatMessage[] = [];
    /** The unread chat count (since the chat panel was last open). */
    public UnreadChatCount = 0;
    /** Which side panel is currently open. */
    public SidePanel: LiveKitSidePanel = 'none';
    /** Whether the device menu popover is open. */
    public DeviceMenuOpen = false;
    /** The device lists for the device menu. */
    public Devices: LiveKitDeviceLists = { Microphones: [], Cameras: [], Speakers: [] };
    /** The last room error message, surfaced in the overlay. */
    public LastErrorMessage: string | null = null;

    /** The underlying controller — exposed for advanced/imperative host scenarios. */
    public get Controller(): LiveKitRoomController {
        return this.controller;
    }

    public ngOnInit(): void {
        this.initialized = true;
        this.wireControllerEvents();
        this.maybeAutoConnect();
        if (this.ChatOpenByDefault && this.ShowChat) {
            this.SidePanel = 'chat';
        }
    }

    public ngOnChanges(_changes: SimpleChanges): void {
        // Inputs are read directly in the template / on demand; setters handle auto-connect triggers.
    }

    public ngOnDestroy(): void {
        this.unsubscribers.forEach((u) => u());
        this.unsubscribers = [];
        this.controller.Dispose();
    }

    // ── Imperative API ────────────────────────────────────────────────────────────

    /** Connects to the room using the current inputs. Safe to call repeatedly. */
    public async Connect(): Promise<void> {
        if (!this.serverUrl || !this.token) {
            return;
        }
        if (this.State.Status === 'connected' || this.State.Status === 'connecting') {
            return;
        }
        await this.controller.Connect(this.serverUrl, this.token, {
            DisplayName: this.DisplayName ?? undefined,
            EnableMicrophone: this.StartWithMicrophone,
            EnableCamera: this.StartWithCamera,
        });
    }

    /** Leaves the room. */
    public async Leave(): Promise<void> {
        await this.controller.Disconnect(true);
    }

    // ── Control-bar intent handlers ─────────────────────────────────────────────────

    /** Toggles the microphone. */
    public onToggleMicrophone(): void {
        void this.controller.ToggleMicrophone();
    }
    /** Toggles the camera. */
    public onToggleCamera(): void {
        void this.controller.ToggleCamera();
    }
    /** Toggles screen sharing. */
    public onToggleScreenShare(): void {
        void this.controller.ToggleScreenShare();
    }
    /** Toggles the chat panel and clears the unread count when opening. */
    public onToggleChat(): void {
        this.SidePanel = this.SidePanel === 'chat' ? 'none' : 'chat';
        if (this.SidePanel === 'chat') {
            this.UnreadChatCount = 0;
        }
    }
    /** Toggles the participants panel. */
    public onToggleParticipants(): void {
        this.SidePanel = this.SidePanel === 'participants' ? 'none' : 'participants';
    }
    /** Opens the device menu and (re)loads device lists. */
    public async onOpenDeviceSettings(): Promise<void> {
        this.DeviceMenuOpen = !this.DeviceMenuOpen;
        if (this.DeviceMenuOpen) {
            await this.loadDevices();
        }
    }
    /** Closes the device menu. */
    public onCloseDeviceMenu(): void {
        this.DeviceMenuOpen = false;
    }
    /** Switches a device. */
    public onDeviceSelected(selection: LiveKitDeviceSelection): void {
        void this.controller.SwitchDevice(selection.Kind, selection.DeviceId);
    }
    /** Sends a chat message on the chat topic and optimistically renders it locally. */
    public onSendChat(text: string): void {
        void this.controller.SendData(text, LIVEKIT_CHAT_TOPIC);
        this.addChatMessage({
            Sender: this.DisplayName ?? 'You',
            SenderIdentity: this.State.Local?.Identity,
            Text: text,
            Timestamp: Date.now(),
            IsLocal: true,
        });
    }

    // ── Layout helpers (template-bound) ─────────────────────────────────────────────

    /** The participants to render on the stage (local optionally included). */
    public get DisplayParticipants(): LiveKitParticipantView[] {
        const list: LiveKitParticipantView[] = [];
        if (this.State.Local && this.ShowSelfView) {
            list.push(this.State.Local);
        }
        list.push(...this.State.Remote);
        return list;
    }

    /** All participants (local + remote) for the roster panel. */
    public get AllParticipants(): LiveKitParticipantView[] {
        return this.State.Local ? [this.State.Local, ...this.State.Remote] : [...this.State.Remote];
    }

    /** The participant featured in spotlight layout (active speaker → agent → first remote → local). */
    public get SpotlightParticipant(): LiveKitParticipantView | null {
        const speakingId = this.State.ActiveSpeakerIdentities.find((id) => id !== this.State.Local?.Identity);
        const bySpeaking = speakingId ? this.State.Remote.find((p) => p.Identity === speakingId) : undefined;
        const byAgent = this.State.Remote.find((p) => p.Role === 'agent');
        return bySpeaking ?? byAgent ?? this.State.Remote[0] ?? this.State.Local ?? null;
    }

    /** The non-spotlight participants for the spotlight-layout filmstrip. */
    public get FilmstripParticipants(): LiveKitParticipantView[] {
        const spot = this.SpotlightParticipant;
        return this.DisplayParticipants.filter((p) => p.Identity !== spot?.Identity);
    }

    /** Whether the room is connected. */
    public get IsConnected(): boolean {
        return this.State.Status === 'connected';
    }

    /** Whether the connection overlay should be visible. */
    public get ShowOverlay(): boolean {
        return this.ShowConnectionOverlay && this.State.Status !== 'connected';
    }

    /** Per-tile avatar URL for a participant (agent gets the configured agent avatar). */
    public avatarFor(p: LiveKitParticipantView): string | null {
        return p.Role === 'agent' ? this.AgentAvatarUrl : null;
    }

    // ── internals ────────────────────────────────────────────────────────────────────

    /** Connects automatically once initialized and both connection inputs are present. */
    private maybeAutoConnect(): void {
        if (this.initialized && this.AutoConnect && this.serverUrl && this.token && this.State.Status === 'idle') {
            void this.Connect();
        }
    }

    /** Subscribes to the controller's event bus and re-surfaces every event as an `@Output`. */
    private wireControllerEvents(): void {
        const e = this.controller.Events;
        // Cancelable before-events — re-emit synchronously so host handlers can set Cancel before the action.
        this.unsubscribers.push(e.On('beforeConnect', (evt) => this.BeforeConnect.emit(evt)));
        this.unsubscribers.push(e.On('beforeDisconnect', (evt) => this.BeforeDisconnect.emit(evt)));
        this.unsubscribers.push(e.On('beforeMediaToggle', (evt) => this.BeforeMediaToggle.emit(evt)));
        this.unsubscribers.push(e.On('beforeSendData', (evt) => this.BeforeSendData.emit(evt)));
        this.unsubscribers.push(e.On('beforeDeviceSwitch', (evt) => this.BeforeDeviceSwitch.emit(evt)));
        // Notifications — wrapped in the Angular zone since LiveKit callbacks fire outside it.
        this.unsubscribers.push(e.On('stateChanged', (s) => this.applyState(s)));
        this.unsubscribers.push(e.On('connected', (evt) => this.runInZone(() => this.Connected.emit(evt.State))));
        this.unsubscribers.push(e.On('disconnected', (evt) => this.runInZone(() => this.Disconnected.emit(evt))));
        this.unsubscribers.push(e.On('reconnecting', () => this.runInZone(() => this.Reconnecting.emit())));
        this.unsubscribers.push(e.On('reconnected', (evt) => this.runInZone(() => this.Reconnected.emit(evt.State))));
        this.unsubscribers.push(e.On('participantJoined', (evt) => this.runInZone(() => this.ParticipantJoined.emit(evt))));
        this.unsubscribers.push(e.On('participantLeft', (evt) => this.runInZone(() => this.ParticipantLeft.emit(evt))));
        this.unsubscribers.push(e.On('activeSpeakersChanged', (evt) => this.runInZone(() => this.ActiveSpeakersChanged.emit(evt))));
        this.unsubscribers.push(e.On('localMediaChanged', (m) => this.runInZone(() => this.LocalMediaChanged.emit(m))));
        this.unsubscribers.push(e.On('dataReceived', (msg) => this.handleData(msg)));
        this.unsubscribers.push(e.On('error', (err) => this.handleError(err)));
    }

    /** Applies a new state snapshot and triggers change detection in the Angular zone. */
    private applyState(state: LiveKitRoomState): void {
        this.runInZone(() => {
            this.State = state;
            this.StateChanged.emit(state);
        });
    }

    /** Routes an inbound data message: chat-topic messages render in the chat panel; all are re-emitted. */
    private handleData(msg: LiveKitDataMessage): void {
        this.runInZone(() => {
            this.DataReceived.emit(msg);
            if (msg.Topic === LIVEKIT_CHAT_TOPIC) {
                this.addChatMessage({
                    Sender: msg.FromDisplayName ?? msg.FromIdentity ?? 'Participant',
                    SenderIdentity: msg.FromIdentity,
                    Text: msg.Text,
                    Timestamp: msg.ReceivedAt,
                    IsLocal: false,
                });
            }
        });
    }

    /** Records a room error and surfaces it on the overlay. */
    private handleError(err: LiveKitRoomError): void {
        this.runInZone(() => {
            this.LastErrorMessage = err.Message;
            this.ErrorOccurred.emit(err);
        });
    }

    /** Appends a chat message, bumps the unread count when the panel is closed, and emits {@link ChatMessage}. */
    private addChatMessage(message: LiveKitChatMessage): void {
        this.ChatMessages = [...this.ChatMessages, message];
        if (!message.IsLocal && this.SidePanel !== 'chat') {
            this.UnreadChatCount++;
        }
        this.ChatMessage.emit(message);
        this.cdr.markForCheck();
    }

    /** Loads available media devices for the device menu. */
    private async loadDevices(): Promise<void> {
        const [mics, cams, speakers] = await Promise.all([
            this.controller.ListDevices('audioinput'),
            this.controller.ListDevices('videoinput'),
            this.controller.ListDevices('audiooutput'),
        ]);
        this.runInZone(() => {
            this.Devices = { Microphones: mics, Cameras: cams, Speakers: speakers };
        });
    }

    /** Runs a function inside the Angular zone and marks the view for check (LiveKit fires outside the zone). */
    private runInZone(fn: () => void): void {
        this.zone.run(() => {
            fn();
            this.cdr.markForCheck();
        });
    }
}
