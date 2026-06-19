import { ChangeDetectionStrategy, ChangeDetectorRef, Component, EventEmitter, Input, OnInit, Output, inject } from '@angular/core';
import { BaseAngularComponent } from '@memberjunction/ng-base-types';
import { GraphQLDataProvider, GraphQLLiveKitClient } from '@memberjunction/graphql-dataprovider';
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
    this.SessionStarted.emit({ SessionBridgeID: result.SessionBridgeID, RoomName: result.RoomName });
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
