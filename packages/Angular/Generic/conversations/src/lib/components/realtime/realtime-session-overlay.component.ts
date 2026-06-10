import { Component, EventEmitter, Input, Output, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { SharedGenericModule } from '@memberjunction/ng-shared-generic';
import { VoiceSessionService } from '../../services/voice-session.service';
import { RealtimeAgentBannerComponent } from './realtime-agent-banner.component';
import { RealtimeSessionThreadComponent } from './realtime-session-thread.component';
import { RealtimeChannelStripComponent } from './realtime-channel-strip.component';
import { RealtimeComposerComponent } from './realtime-composer.component';
import { RealtimeControlsComponent } from './realtime-controls.component';

/**
 * The full-screen "call mode" overlay for a live real-time voice session — the rich
 * replacement for the small `mj-voice-overlay`. Faithful to live-session.html:
 * a fixed, dimmed/blurred backdrop over the conversation panel, with a centered call panel
 * composed of:
 *  - {@link RealtimeAgentBannerComponent}  — agent identity + glowing turn-state orb
 *  - {@link RealtimeSessionThreadComponent} — unified voice + text + delegation thread
 *  - {@link RealtimeChannelStripComponent}  — active channel chips
 *  - {@link RealtimeComposerComponent}      — in-session text input (joins the SAME call)
 *  - {@link RealtimeControlsComponent}      — mute / captions / end-call
 *
 * Subscribes to {@link VoiceSessionService} for turn-state (children subscribe for their own
 * streams). The host renders this with `@if (voiceActive)`; it emits {@link Ended} when the
 * call ends so the host can drop it.
 */
@Component({
  standalone: true,
  selector: 'mj-realtime-session-overlay',
  imports: [
    CommonModule,
    SharedGenericModule,
    RealtimeAgentBannerComponent,
    RealtimeSessionThreadComponent,
    RealtimeChannelStripComponent,
    RealtimeComposerComponent,
    RealtimeControlsComponent
  ],
  templateUrl: './realtime-session-overlay.component.html',
  styleUrl: './realtime-session-overlay.component.css'
})
export class RealtimeSessionOverlayComponent {
  /** Display name of the agent the voice session fronts (e.g. "Sage"). */
  @Input() AgentName = 'Sage';

  /** Emitted after the call ends so the host can hide the overlay. */
  @Output() Ended = new EventEmitter<void>();

  private voice = inject(VoiceSessionService);

  /** Live turn-state from the session service — drives the banner + connecting screen. */
  public readonly ConnectionState$ = this.voice.ConnectionState$;

  /** Whether caption bubbles are shown in the thread (toggled from the controls). */
  public ShowCaptions = true;

  /** Reflect the captions toggle from the controls into the thread. */
  public OnCaptionsToggled(on: boolean): void {
    this.ShowCaptions = on;
  }

  /** Bubble up the end-of-call. */
  public OnEnded(): void {
    this.Ended.emit();
  }
}
