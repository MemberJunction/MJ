import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output } from '@angular/core';
import type { LiveKitConnectionStatus, LiveKitDisconnectReason } from '@memberjunction/livekit-room-core';

/**
 * A full-surface overlay shown while the room is connecting/reconnecting, or after an error/disconnect.
 * Emits {@link Retry} so the host can re-attempt the connection.
 */
@Component({
  selector: 'mj-livekit-connection-overlay',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="lk-overlay">
      <div class="lk-overlay__card">
        @switch (Status) {
          @case ('connecting') {
            <i class="fa-solid fa-spinner fa-spin lk-overlay__icon"></i>
            <p class="lk-overlay__title">Connecting…</p>
          }
          @case ('reconnecting') {
            <i class="fa-solid fa-spinner fa-spin lk-overlay__icon"></i>
            <p class="lk-overlay__title">Reconnecting…</p>
            <p class="lk-overlay__sub">Your connection dropped — trying to restore it.</p>
          }
          @case ('error') {
            <i class="fa-solid fa-triangle-exclamation lk-overlay__icon lk-overlay__icon--error"></i>
            <p class="lk-overlay__title">Connection failed</p>
            <p class="lk-overlay__sub">{{ ErrorMessage || 'We could not join the room.' }}</p>
            <button type="button" class="lk-overlay__btn" (click)="Retry.emit()">Try again</button>
          }
          @case ('disconnected') {
            <i class="fa-solid fa-phone-slash lk-overlay__icon"></i>
            <p class="lk-overlay__title">{{ disconnectTitle }}</p>
            @if (AllowRetry) {
              <button type="button" class="lk-overlay__btn" (click)="Retry.emit()">Rejoin</button>
            }
          }
          @default {
            <i class="fa-solid fa-video lk-overlay__icon"></i>
            <p class="lk-overlay__title">Ready to connect</p>
          }
        }
      </div>
    </div>
  `,
  styles: [
    `
      .lk-overlay {
        position: absolute;
        inset: 0;
        display: flex;
        align-items: center;
        justify-content: center;
        background: var(--mj-bg-overlay, rgba(15, 23, 42, 0.6));
        backdrop-filter: blur(2px);
        z-index: 10;
      }
      .lk-overlay__card {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 10px;
        padding: 28px 36px;
        border-radius: 14px;
        background: var(--mj-bg-surface, #fff);
        box-shadow: 0 10px 30px rgba(15, 23, 42, 0.25);
        text-align: center;
      }
      .lk-overlay__icon {
        font-size: 1.8rem;
        color: var(--mj-brand-primary, #0076b6);
      }
      .lk-overlay__icon--error {
        color: var(--mj-status-error, #ef4444);
      }
      .lk-overlay__title {
        margin: 0;
        font-weight: 600;
        color: var(--mj-text-primary, #334155);
      }
      .lk-overlay__sub {
        margin: 0;
        font-size: 0.84rem;
        color: var(--mj-text-muted, #64748b);
        max-width: 280px;
      }
      .lk-overlay__btn {
        margin-top: 6px;
        padding: 8px 18px;
        border: none;
        border-radius: 8px;
        cursor: pointer;
        color: var(--mj-text-inverse, #fff);
        background: var(--mj-brand-primary, #0076b6);
      }
    `,
  ],
})
export class LiveKitConnectionOverlayComponent {
  /** The current connection status driving the overlay content. */
  @Input() public Status: LiveKitConnectionStatus = 'idle';
  /** The disconnect reason, used to title the disconnected state. */
  @Input() public DisconnectReason: LiveKitDisconnectReason | null = null;
  /** An error message to show in the error state. */
  @Input() public ErrorMessage: string | null = null;
  /** Whether to offer a "Rejoin" button in the disconnected state. */
  @Input() public AllowRetry = true;

  /** Emits when the user asks to (re)connect. */
  @Output() public Retry = new EventEmitter<void>();

  /** A friendly title for the disconnected state based on the reason. */
  public get disconnectTitle(): string {
    switch (this.DisconnectReason) {
      case 'participant-removed':
        return 'You were removed from the room';
      case 'room-deleted':
        return 'The room has ended';
      case 'server-shutdown':
        return 'The room was shut down';
      case 'duplicate-identity':
        return 'You joined from another device';
      case 'connection-lost':
        return 'Connection lost';
      default:
        return 'You left the room';
    }
  }
}
