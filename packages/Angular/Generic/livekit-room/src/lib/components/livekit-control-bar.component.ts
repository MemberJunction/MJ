import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output } from '@angular/core';
import type { LiveKitLocalMediaState } from '@memberjunction/livekit-room-core';
import type { DisplayCaptureSurface } from '@memberjunction/ai-realtime-client/media';
import { MJButtonDirective } from '@memberjunction/ng-ui-components';
import { MediaControlsComponent, type MediaSharePanel, type MediaShareRequest } from '@memberjunction/ng-realtime-media';

/**
 * The room control bar: the microphone, camera and Share buttons (`mj-media-controls`), then layout, device settings,
 * chat, participants, whiteboard, recording and leave, all round `mjButton`s. Every control is individually gated by
 * an `@Input`; the bar only emits intent — the host component drives the {@link LiveKitRoomController}.
 */
@Component({
  selector: 'mj-livekit-control-bar',
  standalone: true,
  imports: [MJButtonDirective, MediaControlsComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="lk-bar">
      @if (EnableMicrophoneControl || EnableCameraControl || EnableScreenShareControl || ShowAgentVision) {
        <mj-media-controls
          [MicrophoneOn]="LocalMedia.MicrophoneEnabled"
          [CameraOn]="LocalMedia.CameraEnabled"
          [Sharing]="LocalMedia.ScreenShareEnabled"
          [ShowMicrophone]="EnableMicrophoneControl"
          [ShowCamera]="EnableCameraControl"
          [ShowShare]="EnableScreenShareControl"
          [ShowShareMenu]="EnableShareMenu"
          [SharePanels]="SharePanels"
          [ShowAgentVision]="ShowAgentVision"
          [AgentVisionOn]="AgentVisionOn"
          (MicrophoneToggled)="ToggleMicrophone.emit()"
          (CameraToggled)="ToggleCamera.emit()"
          (ShareRequested)="OnShareRequested($event)"
          (StopShareRequested)="ToggleScreenShare.emit()"
          (AgentVisionToggled)="ToggleAgentVision.emit($event)"
        ></mj-media-controls>
      }
      @if (EnableLayoutSwitcher) {
        <button type="button" mjButton Shape="circle" AriaLabel="Change layout" title="Change layout" (click)="ToggleLayoutMenu.emit()">
          <i class="fa-solid fa-table-columns" aria-hidden="true"></i>
        </button>
      }
      @if (EnableDeviceSettings) {
        <button type="button" mjButton Shape="circle" AriaLabel="Device settings" title="Device settings" (click)="OpenDeviceSettings.emit()">
          <i class="fa-solid fa-gear" aria-hidden="true"></i>
        </button>
      }
      @if (EnableChatToggle) {
        <button
          type="button"
          mjButton
          Shape="circle"
          class="lk-bar__anchor"
          [Variant]="ChatOpen ? 'primary' : 'secondary'"
          [AriaLabel]="ChatLabel"
          title="Chat"
          (click)="ToggleChat.emit()"
        >
          <i class="fa-solid fa-comment" aria-hidden="true"></i>
          @if (UnreadChatCount > 0) {
            <span class="lk-bar__badge" aria-hidden="true">{{ UnreadChatCount }}</span>
          }
        </button>
      }
      @if (EnableParticipantsToggle) {
        <button
          type="button"
          mjButton
          Shape="circle"
          class="lk-bar__anchor"
          [Variant]="ParticipantsOpen ? 'primary' : 'secondary'"
          [AriaLabel]="ParticipantsLabel"
          title="Participants"
          (click)="ToggleParticipants.emit()"
        >
          <i class="fa-solid fa-users" aria-hidden="true"></i>
          @if (ParticipantCount > 0) {
            <span class="lk-bar__badge" aria-hidden="true">{{ ParticipantCount }}</span>
          }
        </button>
      }
      @if (EnableWhiteboard) {
        <button
          type="button"
          mjButton
          Shape="circle"
          [Variant]="WhiteboardActive ? 'primary' : 'secondary'"
          AriaLabel="Whiteboard"
          title="Whiteboard"
          (click)="ToggleWhiteboard.emit()"
        >
          <i class="fa-solid fa-chalkboard" aria-hidden="true"></i>
        </button>
      }
      @if (EnableRecordingControl) {
        <button
          type="button"
          mjButton
          Shape="circle"
          [class.lk-bar__recording]="IsRecording"
          [Variant]="IsRecording ? 'danger' : 'secondary'"
          [AriaLabel]="IsRecording ? 'Stop recording' : 'Start recording'"
          [title]="IsRecording ? 'Stop recording' : 'Start recording'"
          (click)="ToggleRecording.emit()"
        >
          <i class="fa-solid" [class.fa-circle]="!IsRecording" [class.fa-stop]="IsRecording" aria-hidden="true"></i>
        </button>
      }
      @if (EnableLeaveControl) {
        @if (CanEndForAll) {
          <!-- Zoom/Teams-style split: the red button opens a menu offering Leave (you go, meeting continues)
               vs. End meeting for everyone (tears down all agents). The backdrop closes the menu on outside click. -->
          @if (LeaveMenuOpen) {
            <div class="lk-bar__leave-backdrop" (click)="LeaveMenuOpen = false"></div>
            <div class="lk-bar__leave-menu" role="menu">
              <button type="button" class="lk-bar__leave-item lk-bar__leave-item--end" role="menuitem"
                (click)="LeaveMenuOpen = false; EndForAll.emit()">
                <i class="fa-solid fa-circle-stop"></i> End meeting for everyone
              </button>
              <button type="button" class="lk-bar__leave-item" role="menuitem"
                (click)="LeaveMenuOpen = false; Leave.emit()">
                <i class="fa-solid fa-arrow-right-from-bracket"></i> Leave meeting
              </button>
            </div>
          }
          <button type="button" mjButton Shape="circle" Variant="danger" class="lk-bar__anchor"
            AriaLabel="Leave or end the meeting" title="Leave or end the meeting" (click)="LeaveMenuOpen = !LeaveMenuOpen">
            <i class="fa-solid fa-phone-slash" aria-hidden="true"></i>
            <i class="fa-solid fa-caret-up lk-bar__leave-caret" aria-hidden="true"></i>
          </button>
        } @else {
          <button type="button" mjButton Shape="circle" Variant="danger" AriaLabel="Leave" title="Leave" (click)="Leave.emit()">
            <i class="fa-solid fa-phone-slash" aria-hidden="true"></i>
          </button>
        }
      }
    </div>
  `,
  styles: [
    `
      .lk-bar {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 10px;
        padding: 10px 14px;
      }
      /* Anchors a count badge or the leave caret on its button. */
      .lk-bar__anchor {
        position: relative;
      }
      .lk-bar__recording {
        animation: lk-bar-rec 1.4s ease-in-out infinite;
      }
      @keyframes lk-bar-rec {
        50% {
          opacity: 0.6;
        }
      }
      /* Under the anchor class, so it outranks mjButton's own icon size. */
      .lk-bar__anchor .lk-bar__leave-caret {
        position: absolute;
        right: 3px;
        bottom: 3px;
        font-size: 0.55rem;
        opacity: 0.85;
      }
      /* Transparent full-screen catcher so a click anywhere outside the menu closes it. */
      .lk-bar__leave-backdrop {
        position: fixed;
        inset: 0;
        z-index: 60;
      }
      .lk-bar__leave-menu {
        position: absolute;
        bottom: calc(100% + 8px);
        right: 0;
        z-index: 61;
        display: flex;
        flex-direction: column;
        min-width: 230px;
        padding: 6px;
        border: 1px solid var(--mj-border-default);
        border-radius: 10px;
        background: var(--mj-bg-surface-elevated, var(--mj-bg-surface));
        box-shadow: var(--mj-shadow-md, 0 6px 20px rgba(0, 0, 0, 0.25));
      }
      .lk-bar__leave-item {
        display: flex;
        align-items: center;
        gap: 9px;
        width: 100%;
        padding: 9px 12px;
        border: none;
        border-radius: 7px;
        cursor: pointer;
        font-size: 0.85rem;
        text-align: left;
        color: var(--mj-text-primary);
        background: transparent;
      }
      .lk-bar__leave-item:hover {
        background: var(--mj-bg-surface-hover);
      }
      .lk-bar__leave-item i {
        width: 16px;
        text-align: center;
        color: var(--mj-text-muted);
      }
      .lk-bar__leave-item--end {
        color: var(--mj-status-error-text, var(--mj-status-error));
      }
      .lk-bar__leave-item--end:hover {
        background: var(--mj-status-error-bg, color-mix(in srgb, var(--mj-status-error) 10%, var(--mj-bg-surface)));
      }
      .lk-bar__leave-item--end i {
        color: var(--mj-status-error, #ef4444);
      }
      .lk-bar__badge {
        position: absolute;
        top: -2px;
        right: -2px;
        min-width: 16px;
        height: 16px;
        padding: 0 4px;
        border-radius: 999px;
        font-size: 0.62rem;
        line-height: 16px;
        color: var(--mj-text-inverse, #fff);
        background: var(--mj-brand-primary, #0076b6);
      }
    `,
  ],
})
export class LiveKitControlBarComponent {
  /** The current local-media toggle state, to render the mic/cam/screen button states. */
  @Input() public LocalMedia: LiveKitLocalMediaState = { MicrophoneEnabled: false, CameraEnabled: false, ScreenShareEnabled: false };
  /** Whether the chat panel is currently open (highlights the chat button). */
  @Input() public ChatOpen = false;
  /** Whether the participants panel is currently open. */
  @Input() public ParticipantsOpen = false;
  /** Unread chat message count, shown as a badge on the chat button. */
  @Input() public UnreadChatCount = 0;
  /** Participant count, shown as a badge on the participants button. */
  @Input() public ParticipantCount = 0;

  // ── Feature gates (each hides its control when false) ──────────────────────────────
  /** Show the microphone toggle. */
  @Input() public EnableMicrophoneControl = true;
  /** Show the camera toggle. */
  @Input() public EnableCameraControl = true;
  /** Show the screen-share toggle. */
  @Input() public EnableScreenShareControl = true;
  /**
   * Show the Share button's arrow, whose menu asks the browser's picker for an entire screen, a window or a browser
   * tab first. Off by default: a host that turns it on handles {@link ScreenShareRequested}.
   */
  @Input() public EnableShareMenu = false;
  /**
   * Panels of the page the user can share on their own, offered in the Share menu under "This panel" (with the menu
   * on). With none, "This panel" is left out. A host that lists some handles {@link PanelShareRequested}.
   */
  @Input() public SharePanels: readonly MediaSharePanel[] = [];
  /** Show the device-settings button. */
  @Input() public EnableDeviceSettings = true;
  /** Show the chat toggle. */
  @Input() public EnableChatToggle = true;
  /** Show the participants toggle. */
  @Input() public EnableParticipantsToggle = true;
  /** Show the leave button. */
  @Input() public EnableLeaveControl = true;
  /**
   * When `true`, the leave button becomes a Zoom/Teams-style split that opens a menu offering **Leave**
   * (you disconnect, the meeting continues) vs. **End meeting for everyone** (the host tears it down).
   * When `false` (default), the button is a plain Leave — the parent decides whether ending-for-all is
   * even possible (this generic component knows nothing about agents/MJ; it only emits {@link EndForAll}).
   */
  @Input() public CanEndForAll = false;
  /** Show the recording toggle (server-authorized; the host wires the actual egress call). */
  @Input() public EnableRecordingControl = false;
  /** Whether a recording is currently in progress. */
  @Input() public IsRecording = false;
  /** Show the layout-switcher button. */
  @Input() public EnableLayoutSwitcher = false;
  /** Show the whiteboard toggle. */
  @Input() public EnableWhiteboard = false;
  /** Whether the whiteboard surface is currently active. */
  @Input() public WhiteboardActive = false;
  /** Show the "Let the agent see" button: an agent in the room watches. */
  @Input() public ShowAgentVision = false;
  /** Whether the user lets agents see their camera and shared screen. */
  @Input() public AgentVisionOn = false;

  // ── Intent outputs ─────────────────────────────────────────────────────────────────
  /** The user clicked the microphone toggle. */
  @Output() public ToggleMicrophone = new EventEmitter<void>();
  /** The user clicked the camera toggle. */
  @Output() public ToggleCamera = new EventEmitter<void>();
  /** The user clicked the screen-share toggle. */
  @Output() public ToggleScreenShare = new EventEmitter<void>();
  /** The user picked, from the Share menu, the kind of surface the browser's picker should offer first. */
  @Output() public ScreenShareRequested = new EventEmitter<DisplayCaptureSurface>();
  /** The user picked one of {@link SharePanels} under "This panel": the panel's key. */
  @Output() public PanelShareRequested = new EventEmitter<string>();
  /** The user clicked the device-settings button. */
  @Output() public OpenDeviceSettings = new EventEmitter<void>();
  /** The user clicked the chat toggle. */
  @Output() public ToggleChat = new EventEmitter<void>();
  /** The user clicked the participants toggle. */
  @Output() public ToggleParticipants = new EventEmitter<void>();
  /** The user clicked the recording toggle. */
  @Output() public ToggleRecording = new EventEmitter<void>();
  /** The user clicked the layout-switcher button. */
  @Output() public ToggleLayoutMenu = new EventEmitter<void>();
  /** The user clicked the whiteboard toggle. */
  @Output() public ToggleWhiteboard = new EventEmitter<void>();
  /** The user asked to let agents see their camera and screen (`true`) or to stop (`false`). */
  @Output() public ToggleAgentVision = new EventEmitter<boolean>();
  /** The user clicked leave (they disconnect; any meeting continues for everyone else). */
  @Output() public Leave = new EventEmitter<void>();
  /** The user chose "End meeting for everyone" from the split-leave menu (only reachable when {@link CanEndForAll}). */
  @Output() public EndForAll = new EventEmitter<void>();

  /** Whether the Zoom-style leave menu (Leave vs. End for everyone) is open. */
  public LeaveMenuOpen = false;

  /** The chat button's name, with the unread count its badge shows. */
  public get ChatLabel(): string {
    return this.UnreadChatCount > 0 ? `Chat, ${this.UnreadChatCount} unread` : 'Chat';
  }

  /** The participants button's name, with the count its badge shows. */
  public get ParticipantsLabel(): string {
    return this.ParticipantCount > 0 ? `Participants, ${this.ParticipantCount}` : 'Participants';
  }

  /**
   * Hands a Share request on: a panel picked under "This panel" as {@link PanelShareRequested}, a kind of surface
   * picked from the menu as {@link ScreenShareRequested}, the main button's request (no preference) as
   * {@link ToggleScreenShare}.
   */
  public OnShareRequested(request: MediaShareRequest): void {
    if (request.Kind === 'panel') {
      this.PanelShareRequested.emit(request.PanelKey);
    } else if (request.PreferredSurface) {
      this.ScreenShareRequested.emit(request.PreferredSurface);
    } else {
      this.ToggleScreenShare.emit();
    }
  }
}
