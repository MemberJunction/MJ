import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output } from '@angular/core';
import type { LiveKitLocalMediaState } from '@memberjunction/livekit-room-core';

/**
 * The room control bar: microphone / camera / screen-share toggles, a chat toggle, a participants
 * toggle, a device-settings button, and a leave button. Every control is individually gated by an
 * `@Input`; the bar only emits intent — the host component drives the {@link LiveKitRoomController}.
 */
@Component({
  selector: 'mj-livekit-control-bar',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="lk-bar">
      @if (EnableMicrophoneControl) {
        <button
          type="button"
          class="lk-bar__btn"
          [class.lk-bar__btn--off]="!LocalMedia.MicrophoneEnabled"
          [title]="LocalMedia.MicrophoneEnabled ? 'Mute microphone' : 'Unmute microphone'"
          (click)="ToggleMicrophone.emit()"
        >
          <i class="fa-solid" [class.fa-microphone]="LocalMedia.MicrophoneEnabled" [class.fa-microphone-slash]="!LocalMedia.MicrophoneEnabled"></i>
        </button>
      }
      @if (EnableCameraControl) {
        <button
          type="button"
          class="lk-bar__btn"
          [class.lk-bar__btn--off]="!LocalMedia.CameraEnabled"
          [title]="LocalMedia.CameraEnabled ? 'Turn off camera' : 'Turn on camera'"
          (click)="ToggleCamera.emit()"
        >
          <i class="fa-solid" [class.fa-video]="LocalMedia.CameraEnabled" [class.fa-video-slash]="!LocalMedia.CameraEnabled"></i>
        </button>
      }
      @if (EnableScreenShareControl) {
        <button
          type="button"
          class="lk-bar__btn"
          [class.lk-bar__btn--active]="LocalMedia.ScreenShareEnabled"
          [title]="LocalMedia.ScreenShareEnabled ? 'Stop sharing' : 'Share screen'"
          (click)="ToggleScreenShare.emit()"
        >
          <i class="fa-solid fa-display"></i>
        </button>
      }
      @if (EnableLayoutSwitcher) {
        <button type="button" class="lk-bar__btn" title="Change layout" (click)="ToggleLayoutMenu.emit()">
          <i class="fa-solid fa-table-columns"></i>
        </button>
      }
      @if (EnableDeviceSettings) {
        <button type="button" class="lk-bar__btn" title="Device settings" (click)="OpenDeviceSettings.emit()">
          <i class="fa-solid fa-gear"></i>
        </button>
      }
      @if (EnableChatToggle) {
        <button type="button" class="lk-bar__btn" [class.lk-bar__btn--active]="ChatOpen" title="Chat" (click)="ToggleChat.emit()">
          <i class="fa-solid fa-comment"></i>
          @if (UnreadChatCount > 0) {
            <span class="lk-bar__badge">{{ UnreadChatCount }}</span>
          }
        </button>
      }
      @if (EnableParticipantsToggle) {
        <button type="button" class="lk-bar__btn" [class.lk-bar__btn--active]="ParticipantsOpen" title="Participants" (click)="ToggleParticipants.emit()">
          <i class="fa-solid fa-users"></i>
          @if (ParticipantCount > 0) {
            <span class="lk-bar__badge">{{ ParticipantCount }}</span>
          }
        </button>
      }
      @if (EnableWhiteboard) {
        <button type="button" class="lk-bar__btn" [class.lk-bar__btn--active]="WhiteboardActive" title="Whiteboard" (click)="ToggleWhiteboard.emit()">
          <i class="fa-solid fa-chalkboard"></i>
        </button>
      }
      @if (EnableRecordingControl) {
        <button
          type="button"
          class="lk-bar__btn"
          [class.lk-bar__btn--recording]="IsRecording"
          [title]="IsRecording ? 'Stop recording' : 'Start recording'"
          (click)="ToggleRecording.emit()"
        >
          <i class="fa-solid" [class.fa-circle]="!IsRecording" [class.fa-stop]="IsRecording"></i>
        </button>
      }
      @if (EnableLeaveControl) {
        <button type="button" class="lk-bar__btn lk-bar__btn--leave" title="Leave" (click)="Leave.emit()">
          <i class="fa-solid fa-phone-slash"></i>
        </button>
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
      .lk-bar__btn {
        position: relative;
        width: 44px;
        height: 44px;
        border-radius: 50%;
        border: none;
        cursor: pointer;
        font-size: 1rem;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        color: var(--mj-text-primary, #334155);
        background: var(--mj-bg-surface-card, #f1f5f9);
        transition:
          background-color 120ms ease,
          color 120ms ease,
          transform 80ms ease;
      }
      .lk-bar__btn:hover {
        background: var(--mj-bg-surface-hover, #e2e8f0);
      }
      .lk-bar__btn:active {
        transform: scale(0.94);
      }
      .lk-bar__btn--off {
        color: var(--mj-text-inverse, #fff);
        background: var(--mj-status-error, #ef4444);
      }
      .lk-bar__btn--active {
        color: var(--mj-text-inverse, #fff);
        background: var(--mj-brand-primary, #0076b6);
      }
      .lk-bar__btn--recording {
        color: var(--mj-text-inverse, #fff);
        background: var(--mj-status-error, #ef4444);
        animation: lk-bar-rec 1.4s ease-in-out infinite;
      }
      @keyframes lk-bar-rec {
        50% {
          opacity: 0.6;
        }
      }
      .lk-bar__btn--leave {
        color: var(--mj-text-inverse, #fff);
        background: var(--mj-status-error, #ef4444);
      }
      .lk-bar__btn--leave:hover {
        background: var(--mj-status-error-text, #b91c1c);
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
  /** Show the device-settings button. */
  @Input() public EnableDeviceSettings = true;
  /** Show the chat toggle. */
  @Input() public EnableChatToggle = true;
  /** Show the participants toggle. */
  @Input() public EnableParticipantsToggle = true;
  /** Show the leave button. */
  @Input() public EnableLeaveControl = true;
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

  // ── Intent outputs ─────────────────────────────────────────────────────────────────
  /** The user clicked the microphone toggle. */
  @Output() public ToggleMicrophone = new EventEmitter<void>();
  /** The user clicked the camera toggle. */
  @Output() public ToggleCamera = new EventEmitter<void>();
  /** The user clicked the screen-share toggle. */
  @Output() public ToggleScreenShare = new EventEmitter<void>();
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
  /** The user clicked leave. */
  @Output() public Leave = new EventEmitter<void>();
}
