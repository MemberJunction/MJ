import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output } from '@angular/core';
import type { LiveKitConnectionStatus, LiveKitDisconnectReason } from '@memberjunction/livekit-room-core';
import { MediaConnectionOverlayComponent, MediaDisconnectTitle } from '@memberjunction/ng-realtime-media';

/**
 * `mj-livekit-connection-overlay`: the connecting, reconnecting, error and disconnected overlay.
 *
 * @deprecated Use `mj-connection-overlay` (`MediaConnectionOverlayComponent`) from
 * `@memberjunction/ng-realtime-media`, which this renders with the same inputs and output.
 */
@Component({
  selector: 'mj-livekit-connection-overlay',
  standalone: true,
  imports: [MediaConnectionOverlayComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <mj-connection-overlay
      [Status]="Status"
      [DisconnectReason]="DisconnectReason"
      [ErrorMessage]="ErrorMessage"
      [AllowRetry]="AllowRetry"
      (Retry)="Retry.emit()"
    ></mj-connection-overlay>
  `,
  styles: [':host { display: contents; }'],
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

  /** @deprecated Use {@link MediaDisconnectTitle}. */
  public get disconnectTitle(): string {
    return MediaDisconnectTitle(this.DisconnectReason);
  }
}
