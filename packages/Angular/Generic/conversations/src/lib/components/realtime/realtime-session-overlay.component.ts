import { Component, EventEmitter, Input, Output, OnDestroy, ChangeDetectorRef, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Subscription } from 'rxjs';
import { SharedGenericModule } from '@memberjunction/ng-shared-generic';
import { VoiceSessionService } from '../../services/voice-session.service';
import { RealtimeSessionState } from './realtime-session-state';
import { RealtimeAgentBannerComponent } from './realtime-agent-banner.component';
import { RealtimeSessionThreadComponent } from './realtime-session-thread.component';
import { RealtimeChannelStripComponent } from './realtime-channel-strip.component';
import { RealtimeComposerComponent } from './realtime-composer.component';
import { RealtimeControlsComponent } from './realtime-controls.component';
import { RealtimeActivityRailComponent } from './realtime-activity-rail.component';

/**
 * The "call mode" overlay for a live real-time voice session. Hosted by the
 * conversation chat area (`<mj-conversation-chat-area>`) behind `Active$`, it fills the
 * conversation panel IN PLACE (`position:absolute; inset:0` over the panel — not a
 * fixed app-wide dialog), replacing the conversation view including the composer.
 *
 * Two-column layout:
 *  - MAIN column — {@link RealtimeAgentBannerComponent} (compact identity + turn-state),
 *    the unified {@link RealtimeSessionThreadComponent}, the channel strip, the in-call
 *    {@link RealtimeComposerComponent} and {@link RealtimeControlsComponent}.
 *  - RIGHT RAIL — {@link RealtimeActivityRailComponent}: all tool/agent calls of the
 *    session, newest first (collapsible).
 *
 * Owns the shared {@link RealtimeSessionState} — the SINGLE merge of the service's
 * caption/delegation/narration streams — and passes it to both thread and rail via
 * inputs, so neither duplicates subscription logic.
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
    RealtimeControlsComponent,
    RealtimeActivityRailComponent
  ],
  templateUrl: './realtime-session-overlay.component.html',
  styleUrl: './realtime-session-overlay.component.css'
})
export class RealtimeSessionOverlayComponent implements OnDestroy {
  private _agentName = 'Sage';

  /** Display name of the agent the voice session fronts (e.g. "Sage"). */
  @Input()
  set AgentName(value: string) {
    this._agentName = value || 'Sage';
    this.State.AgentName = this._agentName;
  }
  get AgentName(): string {
    return this._agentName;
  }

  /** Emitted after the call ends so the host can react (visibility is driven by Active$). */
  @Output() Ended = new EventEmitter<void>();

  private voice = inject(VoiceSessionService);
  private cdr = inject(ChangeDetectorRef);

  /** Shared session state — single source for the thread AND the activity rail. */
  public readonly State = new RealtimeSessionState();

  /** Live turn-state from the session service — drives the banner + connecting screen. */
  public readonly ConnectionState$ = this.voice.ConnectionState$;

  /** Server-reported realtime model name for the active session — shown subtly in the banner. */
  public readonly ModelName$ = this.voice.ModelName$;

  /** Whether caption bubbles are shown in the thread (toggled from the controls). */
  public ShowCaptions = true;

  private changedSub: Subscription;

  constructor() {
    this.State.Attach(this.voice);
    this.changedSub = this.State.Changed$.subscribe(() => this.cdr.markForCheck());
  }

  ngOnDestroy(): void {
    this.changedSub.unsubscribe();
    this.State.Detach();
  }

  /** Reflect the captions toggle from the controls into the thread. */
  public OnCaptionsToggled(on: boolean): void {
    this.ShowCaptions = on;
  }

  /** Bubble up the end-of-call. */
  public OnEnded(): void {
    this.Ended.emit();
  }
}
