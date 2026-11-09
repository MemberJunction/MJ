import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output } from '@angular/core';
import { MJButtonDirective } from '@memberjunction/ng-ui-components';
import type { MediaConnectionStatus, MediaDisconnectReason } from '@memberjunction/ai-realtime-client/media';

/** The title the overlay shows for a disconnect reason. */
export function MediaDisconnectTitle(reason: MediaDisconnectReason | null): string {
  switch (reason) {
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

/**
 * `mj-connection-overlay`: a full-surface overlay while a session connects or reconnects, or after an error or
 * a disconnect. Emits {@link Retry} so the host can connect again.
 */
@Component({
  selector: 'mj-connection-overlay',
  standalone: true,
  imports: [MJButtonDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="overlay">
      <div class="overlay__card">
        @switch (Status) {
          @case ('connecting') {
            <i class="fa-solid fa-spinner fa-spin overlay__icon" aria-hidden="true"></i>
            <p class="overlay__title">Connecting…</p>
          }
          @case ('reconnecting') {
            <i class="fa-solid fa-spinner fa-spin overlay__icon" aria-hidden="true"></i>
            <p class="overlay__title">Reconnecting…</p>
            <p class="overlay__sub">Your connection dropped. Trying to restore it.</p>
          }
          @case ('error') {
            <i class="fa-solid fa-triangle-exclamation overlay__icon overlay__icon--error" aria-hidden="true"></i>
            <p class="overlay__title">Connection failed</p>
            <p class="overlay__sub">{{ ErrorMessage || 'We could not join the room.' }}</p>
            <button type="button" mjButton Variant="primary" class="overlay__action" (click)="Retry.emit()">Try again</button>
          }
          @case ('disconnected') {
            <i class="fa-solid fa-phone-slash overlay__icon" aria-hidden="true"></i>
            <p class="overlay__title">{{ DisconnectTitle }}</p>
            @if (AllowRetry) {
              <button type="button" mjButton Variant="primary" class="overlay__action" (click)="Retry.emit()">Rejoin</button>
            }
          }
          @default {
            <i class="fa-solid fa-video overlay__icon" aria-hidden="true"></i>
            <p class="overlay__title">Ready to connect</p>
          }
        }
      </div>
    </div>
  `,
  styleUrls: ['./connection-overlay.component.css'],
})
export class MediaConnectionOverlayComponent {
  /** The connection status that decides what the overlay shows. */
  @Input() public Status: MediaConnectionStatus = 'idle';
  /** Why the session ended; titles the disconnected state. */
  @Input() public DisconnectReason: MediaDisconnectReason | null = null;
  /** The message shown in the error state. */
  @Input() public ErrorMessage: string | null = null;
  /** Whether the disconnected state offers "Rejoin". */
  @Input() public AllowRetry = true;

  /** Emits when the user asks to connect again. */
  @Output() public Retry = new EventEmitter<void>();

  /** The disconnected state's title. */
  public get DisconnectTitle(): string {
    return MediaDisconnectTitle(this.DisconnectReason);
  }
}
