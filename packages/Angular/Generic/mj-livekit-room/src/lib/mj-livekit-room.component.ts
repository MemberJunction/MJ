import { ChangeDetectionStrategy, ChangeDetectorRef, Component, EventEmitter, Input, OnInit, Output, ViewChild, inject } from '@angular/core';
import { BaseAngularComponent } from '@memberjunction/ng-base-types';
import { UUIDsEqual } from '@memberjunction/global';
import { GraphQLDataProvider, GraphQLLiveKitClient, RealtimeModelVoices, RealtimeVoiceOption } from '@memberjunction/graphql-dataprovider';
import { LiveKitRoomComponent, type LiveKitRoomLayout } from '@memberjunction/ng-livekit-room';
import type {
  LiveKitDataMessage,
  LiveKitDisconnectedEvent,
  LiveKitParticipantJoinedEvent,
  LiveKitParticipantLeftEvent,
  LiveKitRoomError,
  LiveKitRoomState,
} from '@memberjunction/livekit-room-core';

/** How the MJ binding obtains its room: start an agent in a room, or just join an existing room. */
export type MJLiveKitConnectionMode = 'agent' | 'join';

/** Emitted when an agent room session has been started server-side. */
export interface MJLiveKitSessionStartedEvent {
  /** The durable bridge-session row id. */
  SessionBridgeID: string;
  /** The room name. */
  RoomName: string;
}

/** One agent bot bridged into the room — tracked for the in-room add/remove roster. */
export interface AgentInRoom {
  /** The `MJ: AI Agent Session Bridges` row id (used to stop/remove this agent). */
  SessionBridgeID: string;
  /** The target agent this bot voices, when known. */
  TargetAgentID: string | null;
  /** Display name (the target agent's name). */
  Name: string;
  /** True while a remove request is in flight. */
  Removing?: boolean;
}

/**
 * `mj-livekit-agent-room` — the MemberJunction binding for the LiveKit room UI. It resolves a scoped
 * access token (and, in `'agent'` mode, starts the agent's presence in the room) via the RealtimeBridge
 * GraphQL surface, then renders {@link LiveKitRoomComponent} with the resolved connection. All the rich
 * feature gates of the generic component are forwarded; MJ user/provider context is threaded in.
 *
 * Public members are PascalCase (MJ convention); private members are camelCase.
 */
@Component({
  selector: 'mj-livekit-agent-room',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [LiveKitRoomComponent],
  template: `
    @if (loading) {
      <div class="mj-lk-status">
        <i class="fa-solid fa-spinner fa-spin"></i>
        <span>{{ Mode === 'agent' ? 'Starting agent session…' : 'Joining room…' }}</span>
      </div>
    } @else if (errorMessage) {
      <div class="mj-lk-status mj-lk-status--error">
        <i class="fa-solid fa-triangle-exclamation"></i>
        <span>{{ errorMessage }}</span>
        <button type="button" class="mj-lk-retry" (click)="Start()">Try again</button>
      </div>
    } @else if (serverUrl && token) {
      <div class="mj-lk-room-wrap">
      <mj-livekit-room
        [ServerUrl]="serverUrl"
        [Token]="token"
        [DisplayName]="resolvedDisplayName"
        [AutoConnect]="true"
        [StartWithMicrophone]="StartWithMicrophone"
        [StartWithCamera]="StartWithCamera"
        [Layout]="Layout"
        [Title]="Title"
        [ShowHeader]="ShowHeader"
        [ShowControlBar]="ShowControlBar"
        [ShowChat]="ShowChat"
        [ShowParticipantsPanel]="ShowParticipantsPanel"
        [EnableMicrophoneControl]="EnableMicrophoneControl"
        [EnableCameraControl]="EnableCameraControl"
        [EnableScreenShareControl]="EnableScreenShareControl"
        [EnableDeviceSettings]="EnableDeviceSettings"
        [EnableLeaveControl]="EnableLeaveControl"
        [EnablePinning]="EnablePinning"
        [EnableLayoutSwitcher]="EnableLayoutSwitcher"
        [EnableNoiseFilter]="EnableNoiseFilter"
        [EnableBackgroundEffects]="EnableBackgroundEffects"
        [ShowAgentState]="ShowAgentState"
        [ShowWhiteboard]="ShowWhiteboard"
        [ShowPreJoin]="ShowPreJoin"
        [ShowRecordingControl]="EnableRecording"
        [IsRecording]="isRecording"
        [E2EEPassphrase]="E2EEPassphrase"
        [E2EEWorker]="E2EEWorker"
        [AgentAvatarUrl]="AgentAvatarUrl"
        (Connected)="Connected.emit($event)"
        (Disconnected)="Disconnected.emit($event)"
        (ParticipantJoined)="ParticipantJoined.emit($event)"
        (ParticipantLeft)="ParticipantLeft.emit($event)"
        (DataReceived)="DataReceived.emit($event)"
        (ToggleRecording)="onToggleRecording()"
        (ErrorOccurred)="ErrorOccurred.emit($event)"
      ></mj-livekit-room>

      @if (Mode === 'agent' && EnableAgentManagement && resolvedRoomName) {
        <div class="mj-lk-agents">
          @if (showAgentsPanel) {
            <div class="mj-lk-agents__panel">
              <div class="mj-lk-agents__head">In this room</div>
              @for (a of agentsInRoom; track a.SessionBridgeID) {
                <div class="mj-lk-agents__row">
                  <span class="mj-lk-agents__name"><i class="fa-solid fa-robot"></i> {{ a.Name }}</span>
                  <button type="button" class="mj-lk-agents__remove" title="Remove agent"
                    [disabled]="a.Removing" (click)="RemoveAgent(a)">
                    <i class="fa-solid" [class.fa-xmark]="!a.Removing" [class.fa-spinner]="a.Removing" [class.fa-spin]="a.Removing"></i>
                  </button>
                </div>
              }
              @if (availableToAdd.length) {
                <div class="mj-lk-agents__add">
                  <select class="mj-input mj-lk-agents__select" (change)="onAddTargetChange($event)">
                    <option value="">Add an agent…</option>
                    @for (a of availableToAdd; track a.ID) {
                      <option [value]="a.ID" [selected]="UUIDsEqual(a.ID, addTargetId)">{{ a.Name }}</option>
                    }
                  </select>
                  <button type="button" class="mj-lk-agents__addbtn" [disabled]="!addTargetId || addingAgent" (click)="AddAgent()">
                    <i class="fa-solid" [class.fa-plus]="!addingAgent" [class.fa-spinner]="addingAgent" [class.fa-spin]="addingAgent"></i>
                  </button>
                </div>
                @if (CanPickModelVoice && AvailableModels.length) {
                  <div class="mj-lk-agents__overrides">
                    <select class="mj-input mj-lk-agents__select mj-lk-agents__select--sm" (change)="onAddModelChange($event)" title="Model (dev override)">
                      <option value="">Default model</option>
                      @for (m of AvailableModels; track m.ModelID) {
                        <option [value]="m.ModelID" [selected]="UUIDsEqual(m.ModelID, addModelId)">{{ m.ModelName }}</option>
                      }
                    </select>
                    @if (addVoices.length) {
                      <select class="mj-input mj-lk-agents__select mj-lk-agents__select--sm" (change)="onAddVoiceChange($event)" title="Voice (dev override)">
                        <option value="">Default voice</option>
                        @for (v of addVoices; track v.ID) {
                          <option [value]="v.ID" [selected]="v.ID === addVoice">{{ v.Name }}</option>
                        }
                      </select>
                    }
                  </div>
                }
              }
              @if (addError) {
                <div class="mj-lk-agents__error">{{ addError }}</div>
              }
            </div>
          }
          <div class="mj-lk-agents__pills">
            <button type="button" class="mj-lk-agents__toggle" (click)="showAgentsPanel = !showAgentsPanel">
              <i class="fa-solid fa-robot"></i> Agents ({{ agentsInRoom.length }})
            </button>
            @if (EnableInvite) {
              <button type="button" class="mj-lk-agents__toggle" title="Copy a link to invite someone to this room"
                (click)="CopyInvite()">
                <i class="fa-solid" [class.fa-link]="!inviteCopied" [class.fa-check]="inviteCopied"></i>
                {{ inviteCopied ? 'Link copied' : 'Copy link' }}
              </button>
              <button type="button" class="mj-lk-agents__toggle" title="Invite people from this workspace"
                (click)="InvitePeopleRequested.emit(resolvedRoomName)">
                <i class="fa-solid fa-user-plus"></i> Invite people
              </button>
            }
            @if (EnableAgentManagement && agentsInRoom.length) {
              <button type="button" class="mj-lk-agents__toggle mj-lk-agents__toggle--end"
                title="End the meeting for everyone — disconnects all agents and closes the room"
                [disabled]="endingMeeting" (click)="EndMeeting()">
                <i class="fa-solid" [class.fa-circle-stop]="!endingMeeting" [class.fa-spinner]="endingMeeting" [class.fa-spin]="endingMeeting"></i>
                {{ endingMeeting ? 'Ending…' : 'End meeting' }}
              </button>
            }
          </div>
        </div>
      }
      </div>
    }
  `,
  styles: [
    `
      :host {
        display: block;
        width: 100%;
        height: 100%;
      }
      .mj-lk-status {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: 10px;
        height: 100%;
        min-height: 220px;
        color: var(--mj-text-secondary, #475569);
        background: var(--mj-bg-surface-card, #f1f5f9);
        border-radius: 12px;
      }
      .mj-lk-status i {
        font-size: 1.6rem;
        color: var(--mj-brand-primary, #0076b6);
      }
      .mj-lk-status--error i {
        color: var(--mj-status-error, #ef4444);
      }
      .mj-lk-retry {
        padding: 7px 16px;
        border: none;
        border-radius: 8px;
        cursor: pointer;
        color: var(--mj-text-inverse, #fff);
        background: var(--mj-brand-primary, #0076b6);
      }
      .mj-lk-room-wrap {
        position: relative;
        width: 100%;
        height: 100%;
      }
      .mj-lk-agents {
        position: absolute;
        left: 16px;
        bottom: 84px;
        z-index: 40;
        display: flex;
        flex-direction: column;
        align-items: flex-start;
        gap: 8px;
      }
      .mj-lk-agents__pills {
        display: flex;
        gap: 8px;
      }
      .mj-lk-agents__toggle {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        padding: 7px 12px;
        border: 1px solid var(--mj-border-default);
        border-radius: 999px;
        cursor: pointer;
        font-size: 0.8125rem;
        color: var(--mj-text-primary);
        background: var(--mj-bg-surface-elevated, var(--mj-bg-surface));
        box-shadow: var(--mj-shadow-sm, 0 2px 8px rgba(0, 0, 0, 0.18));
      }
      .mj-lk-agents__toggle--end {
        color: var(--mj-status-error-text, var(--mj-status-error));
        border-color: var(--mj-status-error-border, var(--mj-status-error));
        background: var(--mj-status-error-bg, color-mix(in srgb, var(--mj-status-error) 10%, var(--mj-bg-surface)));
      }
      .mj-lk-agents__toggle--end:disabled {
        opacity: 0.6;
        cursor: default;
      }
      .mj-lk-agents__panel {
        width: 260px;
        padding: 10px;
        border: 1px solid var(--mj-border-default);
        border-radius: 10px;
        background: var(--mj-bg-surface-elevated, var(--mj-bg-surface));
        box-shadow: var(--mj-shadow-md, 0 6px 20px rgba(0, 0, 0, 0.25));
      }
      .mj-lk-agents__head {
        font-size: 0.6875rem;
        text-transform: uppercase;
        letter-spacing: 0.04em;
        color: var(--mj-text-muted);
        margin-bottom: 6px;
      }
      .mj-lk-agents__row {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
        padding: 5px 0;
      }
      .mj-lk-agents__name {
        display: inline-flex;
        align-items: center;
        gap: 7px;
        font-size: 0.8125rem;
        color: var(--mj-text-primary);
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .mj-lk-agents__name i {
        color: var(--mj-brand-primary);
      }
      .mj-lk-agents__remove {
        flex: none;
        width: 26px;
        height: 26px;
        border: none;
        border-radius: 6px;
        cursor: pointer;
        color: var(--mj-text-muted);
        background: transparent;
      }
      .mj-lk-agents__remove:hover:not(:disabled) {
        color: var(--mj-status-error);
        background: var(--mj-bg-surface-hover);
      }
      .mj-lk-agents__add {
        display: flex;
        gap: 6px;
        margin-top: 8px;
        padding-top: 8px;
        border-top: 1px solid var(--mj-border-subtle, var(--mj-border-default));
      }
      .mj-lk-agents__select {
        flex: 1;
        min-width: 0;
        font-size: 0.8125rem;
      }
      .mj-lk-agents__overrides {
        display: flex;
        gap: 6px;
        margin-top: 6px;
      }
      .mj-lk-agents__select--sm {
        font-size: 0.75rem;
      }
      .mj-lk-agents__addbtn {
        flex: none;
        width: 32px;
        border: none;
        border-radius: 6px;
        cursor: pointer;
        color: var(--mj-text-inverse);
        background: var(--mj-brand-primary);
      }
      .mj-lk-agents__addbtn:disabled {
        opacity: 0.5;
        cursor: not-allowed;
      }
      .mj-lk-agents__error {
        margin-top: 6px;
        font-size: 0.75rem;
        color: var(--mj-status-error-text, var(--mj-status-error));
      }
    `,
  ],
})
export class MJLiveKitRoomComponent extends BaseAngularComponent implements OnInit {
  private readonly cdr = inject(ChangeDetectorRef);

  // ── MJ connection inputs ───────────────────────────────────────────────────────
  /** Whether to start an agent in the room (`'agent'`) or just join an existing room (`'join'`). */
  @Input() public Mode: MJLiveKitConnectionMode = 'agent';
  /** The agent to voice (agent mode) — the Realtime Co-Agent / voice front-end. */
  @Input() public AgentID: string | null = null;
  /** The agent's display name (bot name + addressing). */
  @Input() public AgentName: string | null = null;
  /**
   * The TARGET agent the co-agent voices — the one being "called". The Realtime Co-Agent delegates to
   * it via `invoke-target-agent`; without it the agent has nobody to speak for and stays idle.
   */
  @Input() public TargetAgentID: string | null = null;
  /** The room name. Required for `'join'` mode; optional for `'agent'` (server generates one). */
  @Input() public RoomName: string | null = null;
  /** The display name the local user joins as. Defaults to the authenticated user server-side. */
  @Input() public DisplayName: string | null = null;
  /** Turn-taking mode for the agent. */
  @Input() public TurnMode: 'Passive' | 'Active' | 'Hybrid' | null = null;
  /** Resolve the connection automatically on init. */
  @Input() public AutoStart = true;

  // ── In-room agent management (agent mode) ─────────────────────────────────────────
  /** Show the in-room "Agents" panel to add/remove agents (agent mode only). */
  @Input() public EnableAgentManagement = true;
  /** Show the "Invite" pill that copies a join link to this room. */
  @Input() public EnableInvite = true;
  /** Target agents the user can ADD in-room (id + name). The host (e.g. the Explorer resource) supplies these. */
  @Input() public AvailableAgents: { ID: string; Name: string }[] = [];

  /** Per-session Realtime MODEL override for the INITIAL agent (from the host's pre-join picker). */
  @Input() public RealtimeModelID: string | null = null;
  /** Per-session VOICE override for the INITIAL agent (from the host's pre-join picker). */
  @Input() public RealtimeVoice: string | null = null;
  /**
   * Whether the dev model/voice pickers are shown in the in-room "Add an agent" control. The HOST
   * computes this (the `Realtime: Advanced Session Controls` authorization) and passes it down — this
   * generic component never evaluates authorizations itself.
   */
  @Input() public CanPickModelVoice = false;
  /** Active Realtime models + their voices, supplied by the host (for the add-agent dropdowns). */
  @Input() public AvailableModels: RealtimeModelVoices[] = [];

  /** True briefly after the invite link is copied (drives the "Link copied" pill state). */
  public inviteCopied = false;

  /** Whether the floating agents panel is open. */
  public showAgentsPanel = false;
  /** The agent bots currently bridged into the room (the first is the one started on join). */
  public agentsInRoom: AgentInRoom[] = [];
  /** The target id chosen in the "Add an agent" picker. */
  public addTargetId: string | null = null;
  /** The MODEL override chosen in the "Add an agent" picker (dev-only; null = co-agent/target default). */
  public addModelId: string | null = null;
  /** The VOICE override chosen in the "Add an agent" picker (dev-only; null = co-agent/target default). */
  public addVoice: string | null = null;
  /** Exposed for template use — platform-safe UUID equality (SQL upper vs PG lower). */
  public UUIDsEqual = UUIDsEqual;
  /** True while an Add request is in flight. */
  public addingAgent = false;
  /** Last add error, shown under the picker. */
  public addError: string | null = null;
  /** True while an "End meeting" (stop all agents + leave) is in flight. */
  public endingMeeting = false;

  /** The inner Generic room — used to trigger the local disconnect when ending/leaving the meeting. */
  @ViewChild(LiveKitRoomComponent) private roomComponent?: LiveKitRoomComponent;

  /** Available agents not already in the room (by target id) — the "Add" picker options. */
  public get availableToAdd(): { ID: string; Name: string }[] {
    const present = new Set(this.agentsInRoom.map((a) => (a.TargetAgentID ?? '').toLowerCase()));
    return this.AvailableAgents.filter((a) => !present.has(a.ID.toLowerCase()));
  }

  /** Voices for the model chosen in the add-agent picker (empty when no model picked or it has none). */
  public get addVoices(): RealtimeVoiceOption[] {
    const model = this.AvailableModels.find((m) => UUIDsEqual(m.ModelID, this.addModelId));
    return model?.Voices ?? [];
  }

  /** Records the add-agent MODEL choice; clears the voice so it can't outlive a model switch. */
  public onAddModelChange(event: Event): void {
    this.addModelId = (event.target as HTMLSelectElement).value || null;
    this.addVoice = null;
  }

  /** Records the add-agent VOICE choice. */
  public onAddVoiceChange(event: Event): void {
    this.addVoice = (event.target as HTMLSelectElement).value || null;
  }

  // ── Forwarded UI gates (see LiveKitRoomComponent) ────────────────────────────────
  /** @see LiveKitRoomComponent.Layout */
  @Input() public Layout: LiveKitRoomLayout = 'grid';
  /** @see LiveKitRoomComponent.Title */
  @Input() public Title: string | null = null;
  /** @see LiveKitRoomComponent.ShowHeader */
  @Input() public ShowHeader = true;
  /** @see LiveKitRoomComponent.ShowControlBar */
  @Input() public ShowControlBar = true;
  /** @see LiveKitRoomComponent.ShowChat */
  @Input() public ShowChat = true;
  /** @see LiveKitRoomComponent.ShowParticipantsPanel */
  @Input() public ShowParticipantsPanel = true;
  /** @see LiveKitRoomComponent.EnableMicrophoneControl */
  @Input() public EnableMicrophoneControl = true;
  /** @see LiveKitRoomComponent.EnableCameraControl */
  @Input() public EnableCameraControl = true;
  /** @see LiveKitRoomComponent.EnableScreenShareControl */
  @Input() public EnableScreenShareControl = true;
  /** @see LiveKitRoomComponent.EnableDeviceSettings */
  @Input() public EnableDeviceSettings = true;
  /** @see LiveKitRoomComponent.EnableLeaveControl */
  @Input() public EnableLeaveControl = true;
  /** @see LiveKitRoomComponent.StartWithMicrophone */
  @Input() public StartWithMicrophone = true;
  /** @see LiveKitRoomComponent.StartWithCamera */
  @Input() public StartWithCamera = false;
  /** @see LiveKitRoomComponent.AgentAvatarUrl */
  @Input() public AgentAvatarUrl: string | null = null;
  /** @see LiveKitRoomComponent.EnablePinning */
  @Input() public EnablePinning = true;
  /** @see LiveKitRoomComponent.EnableLayoutSwitcher */
  @Input() public EnableLayoutSwitcher = true;
  /** @see LiveKitRoomComponent.EnableNoiseFilter */
  @Input() public EnableNoiseFilter = false;
  /** @see LiveKitRoomComponent.EnableBackgroundEffects */
  @Input() public EnableBackgroundEffects = false;
  /** @see LiveKitRoomComponent.ShowAgentState */
  @Input() public ShowAgentState = false;
  /** @see LiveKitRoomComponent.ShowWhiteboard */
  @Input() public ShowWhiteboard = false;
  /** @see LiveKitRoomComponent.ShowPreJoin */
  @Input() public ShowPreJoin = false;
  /** Enable the server-authorized recording control (composite egress). */
  @Input() public EnableRecording = false;
  /** @see LiveKitRoomComponent.E2EEPassphrase */
  @Input() public E2EEPassphrase: string | null = null;
  /** @see LiveKitRoomComponent.E2EEWorker */
  @Input() public E2EEWorker: Worker | null = null;

  // ── Outputs ────────────────────────────────────────────────────────────────────
  /** Emitted once the agent room session is started (agent mode). */
  @Output() public SessionStarted = new EventEmitter<MJLiveKitSessionStartedEvent>();
  /**
   * Emitted (with the room name) when the user clicks "Invite people". The host (e.g. the Explorer
   * resource) opens an MJ user-picker and calls the invite mutation — kept out of this generic
   * component, which knows nothing about MJ users.
   */
  @Output() public InvitePeopleRequested = new EventEmitter<string>();
  /** Emitted when the room connects. */
  @Output() public Connected = new EventEmitter<LiveKitRoomState>();
  /** Emitted when the room disconnects. */
  @Output() public Disconnected = new EventEmitter<LiveKitDisconnectedEvent>();
  /** Emitted when a participant joins. */
  @Output() public ParticipantJoined = new EventEmitter<LiveKitParticipantJoinedEvent>();
  /** Emitted when a participant leaves. */
  @Output() public ParticipantLeft = new EventEmitter<LiveKitParticipantLeftEvent>();
  /** Emitted for inbound data-channel messages. */
  @Output() public DataReceived = new EventEmitter<LiveKitDataMessage>();
  /** Emitted on room errors (and on token/session-resolution failures). */
  @Output() public ErrorOccurred = new EventEmitter<LiveKitRoomError>();

  // ── View state ─────────────────────────────────────────────────────────────────
  /** Whether the binding is resolving the token/session. */
  public loading = false;
  /** The token/session-resolution error, if any. */
  public errorMessage: string | null = null;
  /** The resolved LiveKit server URL. */
  public serverUrl: string | null = null;
  /** The resolved access token. */
  public token: string | null = null;
  /** The display name passed to the room. */
  public resolvedDisplayName: string | null = null;
  /** The resolved room name (for recording calls). */
  public resolvedRoomName: string | null = null;
  /** Whether a recording is currently in progress. */
  public isRecording = false;
  /** The active egress id, when recording. */
  private currentEgressId: string | null = null;

  public ngOnInit(): void {
    if (this.AutoStart) {
      void this.Start();
    }
  }

  /**
   * Max time to wait for the connection to start before surfacing a retryable error, so a hung or very
   * slow server (e.g. an agent bot that can't reach the LiveKit media path) doesn't spin forever. Set
   * `0` to disable the client-side timeout.
   */
  @Input() public ConnectTimeoutMs = 25000;

  /** Resolves the connection (mints a token and, in agent mode, starts the agent session). */
  public async Start(): Promise<void> {
    this.loading = true;
    this.errorMessage = null;
    this.cdr.markForCheck();
    try {
      const client = new GraphQLLiveKitClient(this.ProviderToUse as unknown as GraphQLDataProvider);
      this.resolvedDisplayName = this.DisplayName;
      const connect = this.Mode === 'agent' ? this.startAgentSession(client) : this.joinRoom(client);
      await this.withTimeout(connect, this.ConnectTimeoutMs);
    } catch (err) {
      this.fail(err instanceof Error ? err.message : String(err));
    } finally {
      this.loading = false;
      this.cdr.markForCheck();
    }
  }

  /**
   * Races `op` against a timeout: if it hasn't settled within `ms`, rejects with a clear, retryable
   * message (the template's "Try again" button re-runs {@link Start}). A non-positive `ms` disables it.
   */
  private withTimeout<T>(op: Promise<T>, ms: number): Promise<T> {
    if (!ms || ms <= 0) {
      return op;
    }
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(
        () =>
          reject(
            new Error(
              'The connection is taking too long — the agent could not join the room. ' +
                'Check that the LiveKit server is running and reachable, then try again.',
            ),
          ),
        ms,
      );
      op.then(
        (value) => {
          clearTimeout(timer);
          resolve(value);
        },
        (error) => {
          clearTimeout(timer);
          reject(error);
        },
      );
    });
  }

  /** Starts the agent room session and applies the returned client token. */
  private async startAgentSession(client: GraphQLLiveKitClient): Promise<void> {
    const result = await client.StartAgentRoomSession({
      AgentID: this.AgentID ?? undefined,
      AgentName: this.AgentName ?? undefined,
      TargetAgentID: this.TargetAgentID ?? undefined,
      RealtimeModelID: this.RealtimeModelID ?? undefined,
      RealtimeVoice: this.RealtimeVoice ?? undefined,
      RoomName: this.RoomName ?? undefined,
      TurnMode: this.TurnMode ?? undefined,
    });
    if (!result.Success) {
      this.fail(result.ErrorMessage ?? 'Failed to start the agent session.');
      return;
    }
    this.serverUrl = result.ServerUrl;
    this.token = result.ClientToken;
    this.resolvedRoomName = result.RoomName;
    // Track the agent we just brought in as the first entry in the in-room roster.
    this.agentsInRoom = [
      { SessionBridgeID: result.SessionBridgeID, TargetAgentID: this.TargetAgentID, Name: this.AgentName ?? 'Agent' },
    ];
    this.SessionStarted.emit({ SessionBridgeID: result.SessionBridgeID, RoomName: result.RoomName });
  }

  /** Picker selection handler for the in-room "Add an agent" control (native select; no FormsModule dep). */
  public onAddTargetChange(event: Event): void {
    this.addTargetId = (event.target as HTMLSelectElement).value || null;
    this.addError = null;
  }

  /**
   * Adds another agent to the SAME room — starts a new bridge (the co-agent voicing the chosen target)
   * and appends it to the roster. The new bot joins the live room alongside the existing participants.
   */
  public async AddAgent(): Promise<void> {
    if (!this.addTargetId || !this.resolvedRoomName || this.addingAgent) {
      return;
    }
    const target = this.AvailableAgents.find((a) => UUIDsEqual(a.ID, this.addTargetId));
    this.addingAgent = true;
    this.addError = null;
    this.cdr.markForCheck();
    try {
      const client = new GraphQLLiveKitClient(this.ProviderToUse as unknown as GraphQLDataProvider);
      const result = await client.StartAgentRoomSession({
        AgentID: this.AgentID ?? undefined,
        AgentName: target?.Name ?? undefined,
        TargetAgentID: this.addTargetId,
        RealtimeModelID: this.addModelId ?? undefined,
        RealtimeVoice: this.addVoice ?? undefined,
        RoomName: this.resolvedRoomName,
        TurnMode: this.TurnMode ?? undefined,
      });
      if (!result.Success) {
        this.addError = result.ErrorMessage ?? 'Failed to add the agent.';
        return;
      }
      this.agentsInRoom = [
        ...this.agentsInRoom,
        { SessionBridgeID: result.SessionBridgeID, TargetAgentID: this.addTargetId, Name: target?.Name ?? 'Agent' },
      ];
      this.addTargetId = null;
      this.addModelId = null;
      this.addVoice = null;
    } catch (err) {
      this.addError = err instanceof Error ? err.message : String(err);
    } finally {
      this.addingAgent = false;
      this.cdr.markForCheck();
    }
  }

  /** Removes an agent from the room — stops its bridge and drops it from the roster. */
  public async RemoveAgent(agent: AgentInRoom): Promise<void> {
    if (agent.Removing) {
      return;
    }
    agent.Removing = true;
    this.cdr.markForCheck();
    try {
      const client = new GraphQLLiveKitClient(this.ProviderToUse as unknown as GraphQLDataProvider);
      const ok = await client.StopAgentRoomSession(agent.SessionBridgeID);
      if (ok) {
        this.agentsInRoom = this.agentsInRoom.filter((a) => a.SessionBridgeID !== agent.SessionBridgeID);
      } else {
        agent.Removing = false;
      }
    } catch {
      agent.Removing = false;
    } finally {
      this.cdr.markForCheck();
    }
  }

  /**
   * **End meeting** (the Zoom/Teams "End for all"): stops EVERY agent bridge in the room, then disconnects
   * the local user. Contrast with **Leave** (the control-bar button → {@link LiveKitRoomComponent.Leave}),
   * which only disconnects YOU and lets the meeting continue — the server then auto-leaves the agents once the
   * last human is gone, so neither path strands billable agent sessions in an empty room.
   */
  public async EndMeeting(): Promise<void> {
    if (this.endingMeeting) {
      return;
    }
    this.endingMeeting = true;
    this.cdr.markForCheck();
    try {
      const client = new GraphQLLiveKitClient(this.ProviderToUse as unknown as GraphQLDataProvider);
      // Stop all agents in parallel; tolerate individual failures (we still leave below).
      await Promise.all(this.agentsInRoom.map((a) => client.StopAgentRoomSession(a.SessionBridgeID).catch(() => false)));
      this.agentsInRoom = [];
    } catch {
      /* best-effort — fall through and still disconnect the local user */
    } finally {
      await this.roomComponent?.Leave();
      this.endingMeeting = false;
      this.cdr.markForCheck();
    }
  }

  /**
   * Builds the shareable invite URL for THIS room: the current page URL with a `room=<roomName>` query
   * param. Opening it lands the invitee on the Live Room in join mode for the same room.
   */
  public get inviteUrl(): string {
    const url = new URL(window.location.href);
    url.searchParams.set('room', this.resolvedRoomName ?? '');
    return url.toString();
  }

  /** Copies {@link inviteUrl} to the clipboard and flips the pill to "Link copied" briefly. */
  public async CopyInvite(): Promise<void> {
    if (!this.resolvedRoomName) {
      return;
    }
    try {
      await navigator.clipboard.writeText(this.inviteUrl);
      this.inviteCopied = true;
      this.cdr.markForCheck();
      setTimeout(() => {
        this.inviteCopied = false;
        this.cdr.markForCheck();
      }, 2000);
    } catch {
      // Clipboard blocked (insecure context / permissions) — leave the pill unchanged.
    }
  }

  /** Joins an existing room by minting a client token. */
  private async joinRoom(client: GraphQLLiveKitClient): Promise<void> {
    if (!this.RoomName) {
      this.fail('RoomName is required when Mode is "join".');
      return;
    }
    const result = await client.MintClientToken({ RoomName: this.RoomName, DisplayName: this.DisplayName ?? undefined });
    if (!result.Success) {
      this.fail(result.ErrorMessage ?? 'Failed to obtain a room token.');
      return;
    }
    this.serverUrl = result.ServerUrl;
    this.token = result.Token;
    this.resolvedRoomName = this.RoomName;
  }

  /** Toggles room recording via the RealtimeBridge GraphQL surface (server-authorized egress). */
  public async onToggleRecording(): Promise<void> {
    if (!this.resolvedRoomName) {
      return;
    }
    const client = new GraphQLLiveKitClient(this.ProviderToUse as unknown as GraphQLDataProvider);
    if (!this.isRecording) {
      const result = await client.StartRecording(this.resolvedRoomName);
      if (result.Success) {
        this.isRecording = true;
        this.currentEgressId = result.EgressID;
      } else {
        this.fail(result.ErrorMessage ?? 'Failed to start recording.');
      }
    } else if (this.currentEgressId) {
      await client.StopRecording(this.currentEgressId);
      this.isRecording = false;
      this.currentEgressId = null;
    }
    this.cdr.markForCheck();
  }

  /** Records a failure and emits an error event. */
  private fail(message: string): void {
    this.errorMessage = message;
    this.ErrorOccurred.emit({ Kind: 'connect', Message: message });
  }
}
