/**
 * A stand-in for MJ's `<mj-realtime-session-overlay>` in the widget's DOM tests. The real overlay needs the
 * media stack, so the widget's own contract (attributes, properties, methods, events, phase surfaces) is
 * tested against this stub, which records the inputs the widget hands it and lets a test fire `Ended`.
 */
import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output } from '@angular/core';

@Component({
  selector: 'mj-realtime-session-overlay',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: '<div class="stub-overlay" [attr.data-chrome]="Chrome" [attr.data-agent]="AgentName"></div>'
})
export class StubRealtimeSessionOverlayComponent {
  @Input() AgentName = '';
  @Input() Chrome = 'orb';
  @Output() Ended = new EventEmitter<void>();
}
