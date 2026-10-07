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
  ToLiveKitDeviceKind,
  ToMediaDevice,
  ToMediaParticipant,
} from '@memberjunction/livekit-room-core';
import { NgTemplateOutlet } from '@angular/common';
import {
  MediaAgentStateComponent,
  MediaConnectionOverlayComponent,
  MediaDeviceMenuComponent,
  MediaTileComponent,
  SelfViewComponent,
  SharePreviewComponent,
} from '@memberjunction/ng-realtime-media';
import {
  LayoutMediaStage,
  SelectDisplayParticipants,
  SelectScreenSharer,
  SelectSplitSpeaker,
  type DisplayCaptureSurface,
  type MediaDevice,
  type MediaDeviceSelection,
  type MediaParticipant,
  type MediaPlacement,
  type MediaPlacementMove,
  type MediaStageLayout,
  type MediaSurface,
  type MediaTile,
  type MediaVideoSource,
} from '@memberjunction/ai-realtime-client/media';
import { LiveKitControlBarComponent } from './components/livekit-control-bar.component';
import { LiveKitChatPanelComponent } from './components/livekit-chat-panel.component';
import { LiveKitParticipantsPanelComponent } from './components/livekit-participants-panel.component';
import { LiveKitParticipantAudioComponent } from './components/livekit-participant-audio.component';
import { LiveKitPreJoinComponent, type LiveKitPreJoinChoices } from './components/livekit-prejoin.component';
import type { LiveKitAgentVisualState } from './components/livekit-agent-state.component';
import { LiveKitWhiteboardSurfaceComponent } from './components/livekit-whiteboard-surface.component';
import { MJButtonDirective, MJEmptyStateComponent } from '@memberjunction/ng-ui-components';
import { LiveKitRoomTileDirective } from './livekit-room-tile.directive';
import { DeriveAgentState, IsAgentVisualState, SelectAllParticipants } from './livekit-room-logic';
import {
  LIVEKIT_CHAT_TOPIC,
  LIVEKIT_AGENT_STATE_TOPIC,
  LIVEKIT_WHITEBOARD_TOPIC,
  type LiveKitChatMessage,
  type LiveKitDeviceLists,
  type LiveKitDeviceSelection,
  LIVEKIT_METER_SETTINGS,
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
    NgTemplateOutlet,
    MediaTileComponent,
    SelfViewComponent,
    SharePreviewComponent,
    LiveKitRoomTileDirective,
    MJButtonDirective,
    MediaAgentStateComponent,
    MediaConnectionOverlayComponent,
    MediaDeviceMenuComponent,
    LiveKitParticipantAudioComponent,
    LiveKitControlBarComponent,
    LiveKitChatPanelComponent,
    LiveKitParticipantsPanelComponent,
    LiveKitPreJoinComponent,
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
  /** The user hid their self-view (Hide on their tile) for this session. The camera stays on. */
  public SelfViewHidden = false;
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
  /** {@link Devices} as one `/media` list, for the device menu. */
  public MediaDevices: MediaDevice[] = [];
  /** How the tiles' meters move: as LiveKit's meter always did. */
  public readonly MeterSettings = LIVEKIT_METER_SETTINGS;
  /** The active microphone `deviceId`, used to pre-select it in the device menu. */
  public SelectedMicrophoneId: string | null = null;
  /** The active camera `deviceId`, used to pre-select it in the device menu. */
  public SelectedCameraId: string | null = null;
  /** The active speaker `deviceId`, used to pre-select it in the device menu. */
  public SelectedSpeakerId: string | null = null;
  /** The last room error message, surfaced in the overlay. */
  public LastErrorMessage: string | null = null;
  /**
   * The participant the user put in the spotlight (the pin), or `null`: their tile was moved to the stage
   * ({@link MoveTile}), pinning is on, and they are in the room. Setting it moves that participant's tile there; `null`
   * sends the pinned tile back to the strip.
   */
  public get PinnedIdentity(): string | null {
    const spotlight = this.stage.Layout.Stage;
    return spotlight?.Kind === 'surface' ? (spotlight.Surface.Video?.ParticipantIdentity ?? null) : null;
  }
  public set PinnedIdentity(identity: string | null) {
    if (identity) {
      this.recordTileMove(identity, 'stage');
    } else {
      this.tileMoves = withoutPin(this.tileMoves);
    }
  }

  /** The user's moves of participant tiles, each tile's latest only, oldest first. */
  private tileMoves: readonly MediaPlacementMove[] = [];
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
  public OnPreJoinJoin(choices: LiveKitPreJoinChoices): void {
    this.PreJoinChoices = choices;
    this.PreJoinComplete = true;
    if (choices.DisplayName) {
      this.DisplayName = choices.DisplayName;
    }
    void this.Connect();
  }

  /** @deprecated Use {@link OnPreJoinJoin}. */
  public onPreJoinJoin(choices: LiveKitPreJoinChoices): void {
    return this.OnPreJoinJoin(choices);
  }

  /** Resumes audio playback after a browser autoplay block (must run from a user gesture). */
  public OnEnableSound(): void {
    void this.controller.StartAudio();
  }

  /** @deprecated Use {@link OnEnableSound}. */
  public onEnableSound(): void {
    return this.OnEnableSound();
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
  public OnToggleMicrophone(): void {
    void this.controller.ToggleMicrophone();
  }

  /** @deprecated Use {@link OnToggleMicrophone}. */
  public onToggleMicrophone(): void {
    return this.OnToggleMicrophone();
  }
  /** Toggles the camera. */
  public OnToggleCamera(): void {
    void this.controller.ToggleCamera();
  }

  /** @deprecated Use {@link OnToggleCamera}. */
  public onToggleCamera(): void {
    return this.OnToggleCamera();
  }
  /** Toggles screen sharing. */
  public OnToggleScreenShare(): void {
    void this.controller.ToggleScreenShare();
  }

  /** @deprecated Use {@link OnToggleScreenShare}. */
  public onToggleScreenShare(): void {
    return this.OnToggleScreenShare();
  }
  /** Starts screen sharing with the kind of surface the user picked from the Share menu offered first. */
  public OnScreenShareRequested(surface: DisplayCaptureSurface): void {
    void this.controller.SetScreenShareEnabled(true, surface);
  }
  /** Stops the user's screen share, from its preview. */
  public OnStopShare(): void {
    void this.controller.SetScreenShareEnabled(false);
  }
  /** Shares something else, from the preview's Change: the browser's picker opens again. */
  public OnChangeShare(): void {
    void this.controller.ChangeScreenShare();
  }
  /** Hides the user's self-view for this session; the camera stays on. */
  public OnHideSelfView(): void {
    this.SelfViewHidden = true;
  }
  /** Shows the user's self-view again, from the "Self-view hidden" chip. */
  public OnShowSelfView(): void {
    this.SelfViewHidden = false;
  }
  /** Toggles the chat panel and clears the unread count when opening. */
  public OnToggleChat(): void {
    this.SidePanel = this.SidePanel === 'chat' ? 'none' : 'chat';
    if (this.SidePanel === 'chat') {
      this.UnreadChatCount = 0;
    }
  }

  /** @deprecated Use {@link OnToggleChat}. */
  public onToggleChat(): void {
    return this.OnToggleChat();
  }
  /** Toggles the participants panel. */
  public OnToggleParticipants(): void {
    this.SidePanel = this.SidePanel === 'participants' ? 'none' : 'participants';
  }

  /** @deprecated Use {@link OnToggleParticipants}. */
  public onToggleParticipants(): void {
    return this.OnToggleParticipants();
  }
  /** Opens the device menu and (re)loads device lists. */
  public async OnOpenDeviceSettings(): Promise<void> {
    this.DeviceMenuOpen = !this.DeviceMenuOpen;
    if (this.DeviceMenuOpen) {
      await this.loadDevices();
    }
  }

  /** @deprecated Use {@link OnOpenDeviceSettings}. */
  public async onOpenDeviceSettings(): Promise<void> {
    return this.OnOpenDeviceSettings();
  }
  /** Closes the device menu. */
  public OnCloseDeviceMenu(): void {
    this.DeviceMenuOpen = false;
  }

  /** @deprecated Use {@link OnCloseDeviceMenu}. */
  public onCloseDeviceMenu(): void {
    return this.OnCloseDeviceMenu();
  }
  /** Switches a device. */
  public OnDeviceSelected(selection: LiveKitDeviceSelection): void {
    // Optimistically reflect the user's choice immediately, then reconcile with the
    // controller's actual active device once the async switch resolves.
    this.applySelectedDeviceId(selection.Kind, selection.DeviceId);
    void this.controller.SwitchDevice(selection.Kind, selection.DeviceId).then(() => {
      this.runInZone(() => this.refreshSelectedDeviceIds());
    });
  }

  /** @deprecated Use {@link OnDeviceSelected}. */
  public onDeviceSelected(selection: LiveKitDeviceSelection): void {
    return this.OnDeviceSelected(selection);
  }

  /** Switches the device picked in the device menu. */
  public OnMediaDeviceSelected(selection: MediaDeviceSelection): void {
    this.OnDeviceSelected({ Kind: ToLiveKitDeviceKind(selection.Kind), DeviceId: selection.DeviceID });
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
  public OnNoiseFilterToggled(enabled: boolean): void {
    void this.controller.SetNoiseFilterEnabled(enabled);
  }

  /** @deprecated Use {@link OnNoiseFilterToggled}. */
  public onNoiseFilterToggled(enabled: boolean): void {
    return this.OnNoiseFilterToggled(enabled);
  }
  /** Toggles camera background blur. */
  public OnBackgroundBlurToggled(enabled: boolean): void {
    void this.controller.SetBackgroundEffect(enabled ? { Kind: 'blur', Radius: 12 } : { Kind: 'none' });
  }

  /** @deprecated Use {@link OnBackgroundBlurToggled}. */
  public onBackgroundBlurToggled(enabled: boolean): void {
    return this.OnBackgroundBlurToggled(enabled);
  }
  /** Pins/unpins a participant to the spotlight (toggles off if already pinned): a move to the spotlight and back. */
  public OnTogglePin(identity: string): void {
    this.MoveTile(identity, this.PinnedIdentity === identity ? ROOM_STRIP : 'stage');
  }

  /**
   * Moves a participant's tile: to the spotlight (`stage`), or back among the others (`tab`, the filmstrip or the grid).
   * One participant holds the spotlight: a newer move there sends the last one back. The grid has no spotlight, so a
   * move there switches the room to the Active speaker layout. Moving to the spotlight needs {@link EnablePinning}.
   */
  public MoveTile(identity: string, placement: MediaPlacement): void {
    if (!TILE_PLACEMENTS.includes(placement) || (placement === 'stage' && !this.EnablePinning)) {
      return;
    }
    this.recordTileMove(identity, placement);
    if (placement === 'stage' && this.Layout === 'grid') {
      this.OnSelectLayout('spotlight');
    }
  }

  /**
   * Records a tile's move, replacing its earlier one. A move to the spotlight also sends the last pin back to the strip,
   * so a later unpin gives the spotlight back to the call, not to an earlier pin.
   */
  private recordTileMove(identity: string, placement: MediaPlacement): void {
    const kept = placement === 'stage' ? withoutPin(this.tileMoves) : this.tileMoves;
    this.tileMoves = withTileMove(kept, identity, placement);
  }

  /** @deprecated Use {@link OnTogglePin}. */
  public onTogglePin(identity: string): void {
    return this.OnTogglePin(identity);
  }
  /** Toggles the layout switcher popover. */
  public OnToggleLayoutMenu(): void {
    this.LayoutMenuOpen = !this.LayoutMenuOpen;
  }

  /** @deprecated Use {@link OnToggleLayoutMenu}. */
  public onToggleLayoutMenu(): void {
    return this.OnToggleLayoutMenu();
  }
  /** Selects a layout and emits {@link LayoutChange}. */
  public OnSelectLayout(layout: LiveKitRoomLayout): void {
    this.Layout = layout;
    this.LayoutMenuOpen = false;
    this.LayoutChange.emit(layout);
  }

  /** @deprecated Use {@link OnSelectLayout}. */
  public onSelectLayout(layout: LiveKitRoomLayout): void {
    return this.OnSelectLayout(layout);
  }
  /** Toggles recording intent (the host performs the actual server-side egress call). */
  public OnToggleRecording(): void {
    this.ToggleRecording.emit();
  }

  /** @deprecated Use {@link OnToggleRecording}. */
  public onToggleRecording(): void {
    return this.OnToggleRecording();
  }
  /** Toggles the collaborative whiteboard surface. */
  public OnToggleWhiteboard(): void {
    this.WhiteboardActive = !this.WhiteboardActive;
  }

  /** @deprecated Use {@link OnToggleWhiteboard}. */
  public onToggleWhiteboard(): void {
    return this.OnToggleWhiteboard();
  }
  /** Broadcasts a local whiteboard snapshot to the room over the data channel. */
  public OnWhiteboardChanged(json: string): void {
    void this.controller.SendData(json, LIVEKIT_WHITEBOARD_TOPIC);
  }

  /** @deprecated Use {@link OnWhiteboardChanged}. */
  public onWhiteboardChanged(json: string): void {
    return this.OnWhiteboardChanged(json);
  }

  /** Begins dragging the split-view divider. */
  public OnSplitDragStart(event: PointerEvent): void {
    this.splitDragging = true;
    (event.target as HTMLElement).setPointerCapture?.(event.pointerId);
    event.preventDefault();
  }

  /** @deprecated Use {@link OnSplitDragStart}. */
  public onSplitDragStart(event: PointerEvent): void {
    return this.OnSplitDragStart(event);
  }
  /** Updates the split ratio while dragging the divider, clamped to 20–80%. */
  public OnSplitDragMove(event: PointerEvent, container: HTMLElement): void {
    if (!this.splitDragging) {
      return;
    }
    const rect = container.getBoundingClientRect();
    const ratio = (event.clientX - rect.left) / rect.width;
    this.SplitRatio = Math.max(0.2, Math.min(0.8, ratio));
  }

  /** @deprecated Use {@link OnSplitDragMove}. */
  public onSplitDragMove(event: PointerEvent, container: HTMLElement): void {
    return this.OnSplitDragMove(event, container);
  }
  /** Ends the split-view drag. */
  public OnSplitDragEnd(): void {
    this.splitDragging = false;
  }

  /** @deprecated Use {@link OnSplitDragEnd}. */
  public onSplitDragEnd(): void {
    return this.OnSplitDragEnd();
  }
  /** Sends a chat message on the chat topic and optimistically renders it locally. */
  public OnSendChat(text: string): void {
    void this.controller.SendData(text, LIVEKIT_CHAT_TOPIC);
    this.addChatMessage({
      Sender: this.DisplayName ?? 'You',
      SenderIdentity: this.State.Local?.Identity,
      Text: text,
      Timestamp: Date.now(),
      IsLocal: true,
    });
  }

  /** @deprecated Use {@link OnSendChat}. */
  public onSendChat(text: string): void {
    return this.OnSendChat(text);
  }

  // ── Layout helpers (template-bound) ─────────────────────────────────────────────

  /** The participants to render on the stage (local included unless the host or the user turned the self-view off). */
  public get DisplayParticipants(): LiveKitParticipantView[] {
    const stage = this.stage;
    return stage.Shown.map((p) => stage.ViewOf(p.Identity));
  }

  /** Whether the "Self-view hidden" chip shows: the host allows a self-view and the user hid theirs. */
  public get ShowSelfViewChip(): boolean {
    return this.ShowSelfView && this.SelfViewHidden && this.State.Local !== undefined;
  }

  /** The user's own screen share as a video source, while they share. */
  public get LocalScreenSource(): MediaVideoSource | null {
    const local = this.State.Local;
    return local ? (this.MediaParticipantFor(local).Video.screen ?? null) : null;
  }

  /** All participants (local + remote) for the roster panel. */
  public get AllParticipants(): LiveKitParticipantView[] {
    return SelectAllParticipants(this.State);
  }

  /** The participant featured in spotlight layout (pinned → active speaker → agent → first remote → local). */
  public get SpotlightParticipant(): LiveKitParticipantView | null {
    const stage = this.stage;
    const identity = identityOnStage(stage.Layout.Stage);
    return identity ? stage.ViewOf(identity) : null;
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
    const stage = this.stage;
    return stage.Sharer ? stage.ViewOf(stage.Sharer.Identity) : null;
  }

  /** The "speaker" pane participant for split view (active speaker → agent → first remote → local). */
  public get SplitSpeakerParticipant(): LiveKitParticipantView | null {
    const stage = this.stage;
    return stage.SplitSpeaker ? stage.ViewOf(stage.SplitSpeaker.Identity) : null;
  }

  /** The agent's visual state: an explicit data-channel signal wins, else derived from speaking activity. */
  public get AgentState(): LiveKitAgentVisualState {
    return DeriveAgentState(this.State, this.agentStateSignal);
  }

  /** The non-spotlight participants for the spotlight-layout filmstrip. */
  public get FilmstripParticipants(): LiveKitParticipantView[] {
    const stage = this.stage;
    return stage.Layout.Others.map((p) => stage.ViewOf(p.Identity));
  }

  /**
   * The room laid out by the shared media stage (`LayoutMediaStage`), as the realtime call is: the spotlight and
   * the participants beside it, with what split view and the grid show. Each participant's tile is a surface the
   * user can move; a move to the spotlight counts only while pinning is on. Worked out once per room state, set of
   * moves, pinning and self-view setting.
   */
  private get stage(): RoomStage {
    const moves = this.tileMoves;
    const pinning = this.EnablePinning;
    const showSelf = this.ShowSelfView && !this.SelfViewHidden;
    const memo = this.stageMemo;
    if (memo && memo.State === this.State && memo.Moves === moves && memo.Pinning === pinning && memo.ShowSelf === showSelf) {
      return memo.Stage;
    }
    const counted = pinning ? moves : withoutPin(moves);
    const stage = layOutRoom(this.State, (view) => this.MediaParticipantFor(view), counted, showSelf);
    this.stageMemo = { State: this.State, Moves: moves, Pinning: pinning, ShowSelf: showSelf, Stage: stage };
    return stage;
  }

  /** The last {@link stage}, and what it was worked out from. */
  private stageMemo: {
    State: LiveKitRoomState;
    Moves: readonly MediaPlacementMove[];
    Pinning: boolean;
    ShowSelf: boolean;
    Stage: RoomStage;
  } | null = null;

  /** Whether the room is connected. */
  public get IsConnected(): boolean {
    return this.State.Status === 'connected';
  }

  /** Whether the connection overlay should be visible. */
  public get ShowOverlay(): boolean {
    return this.ShowConnectionOverlay && this.State.Status !== 'connected';
  }

  /** Per-tile avatar URL for a participant (agent gets the configured agent avatar). */
  public AvatarFor(p: LiveKitParticipantView): string | null {
    return p.Role === 'agent' ? this.AgentAvatarUrl : null;
  }

  /** @deprecated Use {@link AvatarFor}. */
  public avatarFor(p: LiveKitParticipantView): string | null {
    return this.AvatarFor(p);
  }

  /** A participant as the tiles render it: the same view always gives the same participant, so a tile never reattaches. */
  public MediaParticipantFor(p: LiveKitParticipantView): MediaParticipant {
    return ToMediaParticipant(p);
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
    if (!IsAgentVisualState(raw)) {
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
      this.MediaDevices = [...mics, ...cams, ...speakers].map(ToMediaDevice);
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

/** A room laid out by the shared media stage, with the way back from each participant to its LiveKit view. */
interface RoomStage {
  /** The spotlight and the participants beside it. */
  Layout: MediaStageLayout;
  /** Everyone the grid shows: the user first, unless the self-view is off. */
  Shown: MediaParticipant[];
  /** The first participant sharing a screen. */
  Sharer: MediaParticipant | null;
  /** Split view's speaker pane, which shows a speaker even while nobody shares. */
  SplitSpeaker: MediaParticipant | null;
  /** The LiveKit view of a participant in the room, by identity. */
  ViewOf(identity: string): LiveKitParticipantView;
}

/** Where a participant's tile is when nobody moved it: among the others, in the filmstrip or the grid. */
const ROOM_STRIP: MediaPlacement = 'tab';

/** Where the user may move a participant's tile: the spotlight, or back among the others. */
const TILE_PLACEMENTS: readonly MediaPlacement[] = ['stage', ROOM_STRIP];

/** The key a participant's tile is moved under. */
function tileKey(identity: string): string {
  return `participant:${identity}`;
}

/** The moves without a move to the spotlight: the pinned tile, if any, goes back to the strip. */
function withoutPin(moves: readonly MediaPlacementMove[]): MediaPlacementMove[] {
  return moves.filter((m) => m.Placement !== 'stage');
}

/** The moves with a tile's move replacing its earlier one, as the newest. */
function withTileMove(moves: readonly MediaPlacementMove[], identity: string, placement: MediaPlacement): MediaPlacementMove[] {
  const key = tileKey(identity);
  return [...moves.filter((m) => m.SurfaceKey !== key), { SurfaceKey: key, Placement: placement }];
}

/** Who fills the stage: the participant whose tile was moved there, else the spotlight participant. */
function identityOnStage(tile: MediaTile | null): string | null {
  if (tile?.Kind === 'surface') {
    return tile.Surface.Video?.ParticipantIdentity ?? null;
  }
  return tile?.Participant.Identity ?? null;
}

/** A participant's tile, as a surface of the shared media stage. */
function tileSurface(view: LiveKitParticipantView): MediaSurface {
  return {
    Key: tileKey(view.Identity),
    Label: view.DisplayName,
    DefaultPlacement: ROOM_STRIP,
    Video: { ParticipantIdentity: view.Identity, Kind: 'camera' },
  };
}

/** Lays out a room's participants with the shared media stage, their tiles where the user moved them. */
function layOutRoom(
  state: LiveKitRoomState,
  toMedia: (view: LiveKitParticipantView) => MediaParticipant,
  moves: readonly MediaPlacementMove[],
  showSelf: boolean
): RoomStage {
  const views = SelectAllParticipants(state);
  const byIdentity = new Map(views.map((view) => [view.Identity, view]));
  const participants = views.map(toMedia);
  const activeSpeakers = state.ActiveSpeakerIdentities;
  return {
    Layout: LayoutMediaStage({
      Participants: participants,
      ActiveSpeakers: activeSpeakers,
      Surfaces: views.map(tileSurface),
      Moves: moves,
      ShowSelfView: showSelf,
    }),
    Shown: SelectDisplayParticipants(participants, showSelf),
    Sharer: SelectScreenSharer(participants),
    SplitSpeaker: SelectSplitSpeaker(participants, activeSpeakers),
    ViewOf: (identity) => byIdentity.get(identity)!,
  };
}
