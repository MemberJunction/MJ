import {
  AfterViewChecked,
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
  ViewChild,
  SimpleChanges,
  inject,
  InjectionToken,
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
  type LiveKitE2EEOptions,
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
import { LiveKitPreJoinComponent, type LiveKitPreJoinChoices } from './components/livekit-prejoin.component';
import { LiveKitAgentStateComponent, type LiveKitAgentVisualState } from './components/livekit-agent-state.component';
import { LiveKitWhiteboardSurfaceComponent } from './components/livekit-whiteboard-surface.component';
import { MJEmptyStateComponent } from '@memberjunction/ng-ui-components';
import {
  deriveAgentState,
  isAgentVisualState,
  selectAllParticipants,
  selectDisplayParticipants,
  selectFilmstrip,
  selectScreenShare,
  selectSplitSpeaker,
  selectSpotlight,
} from './livekit-room-logic';
import {
  LIVEKIT_CHAT_TOPIC,
  LIVEKIT_AGENT_STATE_TOPIC,
  LIVEKIT_WHITEBOARD_TOPIC,
  type LiveKitChatMessage,
  type LiveKitDeviceLists,
  type LiveKitDeviceSelection,
} from './models';

/**
 * Factory token for the room's {@link LiveKitRoomController}. Each `LiveKitRoomComponent`
 * resolves this factory and invokes it to obtain its **own** controller instance (the room is
 * stateful per-instance, so this is a factory, not a shared singleton). The default factory
 * returns `new LiveKitRoomController()` — production behavior is identical to the previous
 * inline `new`. Tests override the token to inject a fake controller and drive the container's
 * DOM, e.g. `{ provide: LIVEKIT_ROOM_CONTROLLER_FACTORY, useValue: () => fakeController }`.
 */
export const LIVEKIT_ROOM_CONTROLLER_FACTORY = new InjectionToken<() => LiveKitRoomController>('LIVEKIT_ROOM_CONTROLLER_FACTORY', {
  providedIn: 'root',
  factory: () => () => new LiveKitRoomController(),
});

/** Which side panel is open in the room, if any. */
type LiveKitSidePanel = 'none' | 'chat' | 'participants';

/**
 * The room layout mode:
 * - `grid` — gallery view, all tiles equal.
 * - `spotlight` — focus the active speaker (or pinned participant) large + a filmstrip.
 * - `split` — a resizable splitter between the active screen-share and the speaker.
 * - `audio-only` — compact avatar tiles, no video emphasis.
 */
export type LiveKitRoomLayout = 'grid' | 'spotlight' | 'split' | 'audio-only';

/** A layout option for the layout switcher. */
export interface LiveKitLayoutOption {
  /** The layout value. */
  Layout: LiveKitRoomLayout;
  /** The display label. */
  Label: string;
  /** A Font Awesome icon class. */
  Icon: string;
}

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
    LiveKitPreJoinComponent,
    LiveKitAgentStateComponent,
    LiveKitWhiteboardSurfaceComponent,
    MJEmptyStateComponent,
  ],
  templateUrl: './livekit-room.component.html',
  styleUrls: ['./livekit-room.component.css'],
})
export class LiveKitRoomComponent implements OnInit, OnChanges, OnDestroy, AfterViewChecked {
  private readonly zone = inject(NgZone);
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly controller: LiveKitRoomController = inject(LIVEKIT_ROOM_CONTROLLER_FACTORY)();
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
  /**
   * Turns the leave button into a Zoom/Teams-style split offering **Leave** vs. **End meeting for everyone**.
   * Purely presentational here — this generic component has no notion of "ending for everyone"; it just emits
   * {@link EndForAll} so the host (e.g. the MJ binding) can tear down agents/the room. Default `false` (plain Leave).
   */
  @Input() public CanEndForAll = false;
  /** Enable the data-channel chat feature (toggle + panel). */
  @Input() public ShowChat = true;
  /** Enable the participants roster panel (toggle + panel). */
  @Input() public ShowParticipantsPanel = true;
  /** Allow pinning a participant to the spotlight (hover pin button on tiles). */
  @Input() public EnablePinning = true;
  /** Expose the Krisp noise-filter toggle in the settings menu (LiveKit Cloud). */
  @Input() public EnableNoiseFilter = false;
  /** Expose the background-blur toggle in the settings menu. */
  @Input() public EnableBackgroundEffects = false;
  /** Show the agent-state visualizer (listening/thinking/speaking) for the agent participant. */
  @Input() public ShowAgentState = false;
  /** Enable the collaborative whiteboard surface (data-channel-synced; agent co-authoring supported). */
  @Input() public ShowWhiteboard = false;
  /** Show the recording toggle in the control bar (the host wires the actual egress call). */
  @Input() public ShowRecordingControl = false;
  /** Whether a recording is currently in progress (host-managed). */
  @Input() public IsRecording = false;
  /** Show the layout switcher (gallery / active speaker / split / audio-only). */
  @Input() public EnableLayoutSwitcher = true;

  // ── Behavior ──────────────────────────────────────────────────────────────────
  /** Open the chat panel by default on connect. */
  @Input() public ChatOpenByDefault = false;
  /** Show a device-preview PreJoin lobby before connecting (suppresses auto-connect until the user joins). */
  @Input() public ShowPreJoin = false;
  /** End-to-end-encryption passphrase. When set with {@link E2EEWorker}, the room connects with E2EE. */
  @Input() public E2EEPassphrase: string | null = null;
  /** The E2EE web worker (host-provided, bundler-specific). Required for {@link E2EEPassphrase}. */
  @Input() public E2EEWorker: Worker | null = null;

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
  /**
   * Fired when the user chooses "End meeting for everyone" from the split-leave menu (only reachable when
   * {@link CanEndForAll}). The host should tear down the meeting (e.g. stop all agents), then disconnect.
   */
  @Output() public EndForAll = new EventEmitter<void>();
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
  /** Fired when the user toggles recording (the host performs the server-side egress call). */
  @Output() public ToggleRecording = new EventEmitter<void>();
  /** Fired when the user changes the layout via the layout switcher. */
  @Output() public LayoutChange = new EventEmitter<LiveKitRoomLayout>();

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
  /** Whether the layout switcher popover is open. */
  public LayoutMenuOpen = false;
  /** Whether the whiteboard surface is currently shown (replaces the participant stage). */
  public WhiteboardActive = false;
  /** A whiteboard snapshot received before the surface was rendered, applied once it mounts. */
  private pendingWhiteboardSnapshot: string | null = null;
  @ViewChild(LiveKitWhiteboardSurfaceComponent) private whiteboardSurface?: LiveKitWhiteboardSurfaceComponent;
  /** The split-view ratio (left/screen pane fraction, 0.2–0.8). */
  public SplitRatio = 0.62;
  private splitDragging = false;
  /** The available layout options for the switcher. */
  public readonly LayoutOptions: LiveKitLayoutOption[] = [
    { Layout: 'grid', Label: 'Gallery', Icon: 'fa-table-cells' },
    { Layout: 'spotlight', Label: 'Active speaker', Icon: 'fa-user-large' },
    { Layout: 'split', Label: 'Split view', Icon: 'fa-table-columns' },
    { Layout: 'audio-only', Label: 'Audio only', Icon: 'fa-headphones' },
  ];
  /** The device lists for the device menu. */
  public Devices: LiveKitDeviceLists = { Microphones: [], Cameras: [], Speakers: [] };
  /** The active microphone `deviceId`, used to pre-select it in the device menu. */
  public SelectedMicrophoneId: string | null = null;
  /** The active camera `deviceId`, used to pre-select it in the device menu. */
  public SelectedCameraId: string | null = null;
  /** The active speaker `deviceId`, used to pre-select it in the device menu. */
  public SelectedSpeakerId: string | null = null;
  /** The last room error message, surfaced in the overlay. */
  public LastErrorMessage: string | null = null;
  /** The identity of the pinned participant (drives spotlight when {@link EnablePinning}). */
  public PinnedIdentity: string | null = null;
  /** Whether the user has passed the PreJoin lobby (or PreJoin is disabled). */
  public PreJoinComplete = false;
  /** The PreJoin choices, once confirmed. */
  public PreJoinChoices: LiveKitPreJoinChoices | null = null;
  /** The agent state explicitly signaled over the data channel, if any. */
  private agentStateSignal: LiveKitAgentVisualState | null = null;
  private agentStateTimer: ReturnType<typeof setTimeout> | null = null;

  /** The underlying controller — exposed for advanced/imperative host scenarios. */
  public get Controller(): LiveKitRoomController {
    return this.controller;
  }

  public ngOnInit(): void {
    this.initialized = true;
    this.PreJoinComplete = !this.ShowPreJoin;
    this.wireControllerEvents();
    this.maybeAutoConnect();
    if (this.ChatOpenByDefault && this.ShowChat) {
      this.SidePanel = 'chat';
    }
  }

  public ngOnChanges(_changes: SimpleChanges): void {
    // Inputs are read directly in the template / on demand; setters handle auto-connect triggers.
  }

  public ngAfterViewChecked(): void {
    // Flush a whiteboard snapshot that arrived before the surface had mounted.
    if (this.pendingWhiteboardSnapshot && this.whiteboardSurface) {
      const snapshot = this.pendingWhiteboardSnapshot;
      this.pendingWhiteboardSnapshot = null;
      this.whiteboardSurface.ApplyRemote(snapshot);
    }
  }

  public ngOnDestroy(): void {
    this.unsubscribers.forEach((u) => u());
    this.unsubscribers = [];
    if (this.agentStateTimer) {
      clearTimeout(this.agentStateTimer);
    }
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
    const choices = this.PreJoinChoices;
    await this.controller.Connect(this.serverUrl, this.token, {
      DisplayName: choices?.DisplayName ?? this.DisplayName ?? undefined,
      EnableMicrophone: choices?.MicrophoneEnabled ?? this.StartWithMicrophone,
      EnableCamera: choices?.CameraEnabled ?? this.StartWithCamera,
      MicrophoneDeviceId: choices?.MicrophoneDeviceId,
      CameraDeviceId: choices?.CameraDeviceId,
      E2EE: this.buildE2EEOptions(),
    });
  }

  /** Handles PreJoin completion: stores the choices, marks PreJoin complete, and connects. */
  public onPreJoinJoin(choices: LiveKitPreJoinChoices): void {
    this.PreJoinChoices = choices;
    this.PreJoinComplete = true;
    if (choices.DisplayName) {
      this.DisplayName = choices.DisplayName;
    }
    void this.Connect();
  }

  /** Resumes audio playback after a browser autoplay block (must run from a user gesture). */
  public onEnableSound(): void {
    void this.controller.StartAudio();
  }

  /** Builds the E2EE connect options when a passphrase + worker are both supplied. */
  private buildE2EEOptions(): LiveKitE2EEOptions | undefined {
    if (this.E2EEPassphrase && this.E2EEWorker) {
      return { Passphrase: this.E2EEPassphrase, Worker: this.E2EEWorker };
    }
    return undefined;
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
    // Optimistically reflect the user's choice immediately, then reconcile with the
    // controller's actual active device once the async switch resolves.
    this.applySelectedDeviceId(selection.Kind, selection.DeviceId);
    void this.controller.SwitchDevice(selection.Kind, selection.DeviceId).then(() => {
      this.runInZone(() => this.refreshSelectedDeviceIds());
    });
  }

  /** Updates the locally-tracked selected device id for a kind. */
  private applySelectedDeviceId(kind: LiveKitDeviceSelection['Kind'], deviceId: string): void {
    if (kind === 'audioinput') {
      this.SelectedMicrophoneId = deviceId;
    } else if (kind === 'videoinput') {
      this.SelectedCameraId = deviceId;
    } else {
      this.SelectedSpeakerId = deviceId;
    }
  }
  /** Toggles the Krisp noise filter. */
  public onNoiseFilterToggled(enabled: boolean): void {
    void this.controller.SetNoiseFilterEnabled(enabled);
  }
  /** Toggles camera background blur. */
  public onBackgroundBlurToggled(enabled: boolean): void {
    void this.controller.SetBackgroundEffect(enabled ? { Kind: 'blur', Radius: 12 } : { Kind: 'none' });
  }
  /** Pins/unpins a participant to the spotlight (toggles off if already pinned). */
  public onTogglePin(identity: string): void {
    this.PinnedIdentity = this.PinnedIdentity === identity ? null : identity;
  }
  /** Toggles the layout switcher popover. */
  public onToggleLayoutMenu(): void {
    this.LayoutMenuOpen = !this.LayoutMenuOpen;
  }
  /** Selects a layout and emits {@link LayoutChange}. */
  public onSelectLayout(layout: LiveKitRoomLayout): void {
    this.Layout = layout;
    this.LayoutMenuOpen = false;
    this.LayoutChange.emit(layout);
  }
  /** Toggles recording intent (the host performs the actual server-side egress call). */
  public onToggleRecording(): void {
    this.ToggleRecording.emit();
  }
  /** Toggles the collaborative whiteboard surface. */
  public onToggleWhiteboard(): void {
    this.WhiteboardActive = !this.WhiteboardActive;
  }
  /** Broadcasts a local whiteboard snapshot to the room over the data channel. */
  public onWhiteboardChanged(json: string): void {
    void this.controller.SendData(json, LIVEKIT_WHITEBOARD_TOPIC);
  }

  /** Begins dragging the split-view divider. */
  public onSplitDragStart(event: PointerEvent): void {
    this.splitDragging = true;
    (event.target as HTMLElement).setPointerCapture?.(event.pointerId);
    event.preventDefault();
  }
  /** Updates the split ratio while dragging the divider, clamped to 20–80%. */
  public onSplitDragMove(event: PointerEvent, container: HTMLElement): void {
    if (!this.splitDragging) {
      return;
    }
    const rect = container.getBoundingClientRect();
    const ratio = (event.clientX - rect.left) / rect.width;
    this.SplitRatio = Math.max(0.2, Math.min(0.8, ratio));
  }
  /** Ends the split-view drag. */
  public onSplitDragEnd(): void {
    this.splitDragging = false;
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
    return selectDisplayParticipants(this.State, this.ShowSelfView);
  }

  /** All participants (local + remote) for the roster panel. */
  public get AllParticipants(): LiveKitParticipantView[] {
    return selectAllParticipants(this.State);
  }

  /** The participant featured in spotlight layout (pinned → active speaker → agent → first remote → local). */
  public get SpotlightParticipant(): LiveKitParticipantView | null {
    return selectSpotlight(this.State, this.PinnedIdentity, this.EnablePinning);
  }

  /**
   * The agent participant whose name/state the agent indicator shows. In a MULTI-agent room this prefers the
   * agent that is currently speaking (so the indicator reads e.g. "Marketing Agent · speaking", not whichever
   * agent merely joined first), falling back to the first agent when none is speaking.
   */
  public get AgentParticipant(): LiveKitParticipantView | null {
    const agents = this.State.Remote.filter((p) => p.Role === 'agent');
    return agents.find((p) => p.IsSpeaking) ?? agents[0] ?? null;
  }

  /** The participant currently sharing their screen (for split view), if any. */
  public get ScreenShareParticipant(): LiveKitParticipantView | null {
    return selectScreenShare(this.AllParticipants);
  }

  /** The "speaker" pane participant for split view (active speaker → agent → first remote → local). */
  public get SplitSpeakerParticipant(): LiveKitParticipantView | null {
    return selectSplitSpeaker(this.State);
  }

  /** The agent's visual state: an explicit data-channel signal wins, else derived from speaking activity. */
  public get AgentState(): LiveKitAgentVisualState {
    return deriveAgentState(this.State, this.agentStateSignal);
  }

  /** The non-spotlight participants for the spotlight-layout filmstrip. */
  public get FilmstripParticipants(): LiveKitParticipantView[] {
    return selectFilmstrip(this.DisplayParticipants, this.SpotlightParticipant);
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
    if (this.initialized && this.AutoConnect && this.PreJoinComplete && this.serverUrl && this.token && this.State.Status === 'idle') {
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
      if (msg.Topic === LIVEKIT_AGENT_STATE_TOPIC) {
        this.applyAgentStateSignal(msg.Text);
        return;
      }
      if (msg.Topic === LIVEKIT_WHITEBOARD_TOPIC) {
        this.applyWhiteboardSnapshot(msg.Text);
        return;
      }
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

  /** Applies an inbound whiteboard snapshot — auto-opens the surface, applying once it has mounted. */
  private applyWhiteboardSnapshot(json: string): void {
    if (!this.ShowWhiteboard) {
      return;
    }
    this.WhiteboardActive = true;
    if (this.whiteboardSurface) {
      this.whiteboardSurface.ApplyRemote(json);
    } else {
      this.pendingWhiteboardSnapshot = json; // surface not mounted yet — apply in ngAfterViewChecked
    }
  }

  /** Applies an explicit agent-state signal from the data channel, auto-clearing after a short idle. */
  private applyAgentStateSignal(raw: string): void {
    if (!isAgentVisualState(raw)) {
      return;
    }
    this.agentStateSignal = raw;
    if (this.agentStateTimer) {
      clearTimeout(this.agentStateTimer);
    }
    // Fall back to heuristic state if no further signal arrives (avoids a stuck "thinking…").
    this.agentStateTimer = setTimeout(() => {
      this.agentStateSignal = null;
      this.cdr.markForCheck();
    }, 8000);
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
      this.refreshSelectedDeviceIds();
    });
  }

  /** Reads the active device ids from the controller so the menu pre-selects them. */
  private refreshSelectedDeviceIds(): void {
    this.SelectedMicrophoneId = this.controller.GetActiveDeviceId('audioinput');
    this.SelectedCameraId = this.controller.GetActiveDeviceId('videoinput');
    this.SelectedSpeakerId = this.controller.GetActiveDeviceId('audiooutput');
  }

  /** Runs a function inside the Angular zone and marks the view for check (LiveKit fires outside the zone). */
  private runInZone(fn: () => void): void {
    this.zone.run(() => {
      fn();
      this.cdr.markForCheck();
    });
  }
}
