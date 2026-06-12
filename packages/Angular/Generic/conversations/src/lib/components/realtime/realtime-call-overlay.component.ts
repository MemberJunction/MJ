import { Component, EventEmitter, Output, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MJButtonDirective } from '@memberjunction/ng-ui-components';
import { SharedGenericModule } from '@memberjunction/ng-shared-generic';
import { RealtimeSessionService, VoiceConnectionState } from '../../services/realtime-session.service';

/**
 * Focused "call" overlay for a live real-time voice session. Shows the
 * connection / turn state, toggleable live captions, and mute + end-call
 * controls. All session state is sourced reactively from {@link RealtimeSessionService}.
 *
 * MVP scope: a fixed panel (Matt / LXT own the visual polish later — see the
 * "Real-Time UX in Explorer" plan section). Renders only while a session is
 * Active; the host wires `@if (voiceActive$ | async)` around it.
 */
@Component({
  standalone: true,
  selector: 'mj-realtime-call-overlay',
  imports: [CommonModule, MJButtonDirective, SharedGenericModule],
  templateUrl: './realtime-call-overlay.component.html',
  styleUrl: './realtime-call-overlay.component.css'
})
export class RealtimeCallOverlayComponent {
  private voice = inject(RealtimeSessionService);

  /** Emitted after the user ends the call (so the host can hide the overlay). */
  @Output() Ended = new EventEmitter<void>();

  /** Live reactive state from the session service. */
  public readonly ConnectionState$ = this.voice.ConnectionState$;
  public readonly Captions$ = this.voice.Captions$;

  /** Whether the captions list is shown (some users want it, some don't). */
  public ShowCaptions = true;
  /** Local mic mute state. */
  public IsMuted = false;

  /** Human-readable label for each connection state. */
  public StateLabel(state: VoiceConnectionState): string {
    switch (state) {
      case 'connecting': return 'Connecting…';
      case 'listening': return 'Listening';
      case 'speaking': return 'Agent speaking';
      case 'thinking': return 'Working on it…';
      case 'error': return 'Connection error';
      case 'closed': return 'Call ended';
      default: return '';
    }
  }

  /** Font Awesome icon for each connection state. */
  public StateIcon(state: VoiceConnectionState): string {
    switch (state) {
      case 'connecting': return 'fa-circle-notch fa-spin';
      case 'listening': return 'fa-microphone';
      case 'speaking': return 'fa-volume-high';
      case 'thinking': return 'fa-gear fa-spin';
      case 'error': return 'fa-triangle-exclamation';
      case 'closed': return 'fa-phone-slash';
      default: return 'fa-circle';
    }
  }

  /** True while we're still establishing the connection. */
  public IsConnecting(state: VoiceConnectionState): boolean {
    return state === 'connecting';
  }

  /** Toggle the live-captions panel. */
  public ToggleCaptions(): void {
    this.ShowCaptions = !this.ShowCaptions;
  }

  /** Toggle the local microphone mute. */
  public ToggleMute(): void {
    this.IsMuted = this.voice.ToggleMute();
  }

  /** End the call and notify the host. */
  public async EndCall(): Promise<void> {
    await this.voice.EndVoiceSession();
    this.Ended.emit();
  }
}
