import { Component, EventEmitter, Input, Output, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { VoiceSessionService } from '../../services/voice-session.service';

/**
 * Call controls for the overlay (mirrors `.call-controls` in live-session.html): Mute,
 * Captions toggle, the developer-mode gear, and End call. The End button is the destructive
 * action and is placed rightmost following MJ conventions (affirmative/neutral actions lead;
 * destructive trails the row as the deliberate, last control).
 *
 * Mute drives {@link VoiceSessionService.ToggleMute} directly; Captions, Dev mode + End are
 * emitted up so the overlay shell owns that state (captions visibility, dev affordances) and
 * lifecycle (ending the call). The gear mirrors the main UX convention: developer affordances
 * stay hidden until explicitly asked for, per session, never persisted.
 */
@Component({
  standalone: true,
  selector: 'mj-realtime-controls',
  imports: [CommonModule],
  templateUrl: './realtime-controls.component.html',
  styleUrl: './realtime-controls.component.css'
})
export class RealtimeControlsComponent {
  /** Whether captions are currently shown (drives the captions button's active state). */
  @Input() CaptionsOn = true;

  /** Whether developer affordances (open-record links) are revealed (gear active state). */
  @Input() DevMode = false;

  /** Emitted when the user toggles captions; parent flips {@link CaptionsOn}. */
  @Output() CaptionsToggled = new EventEmitter<boolean>();
  /** Emitted when the user toggles the developer gear; parent flips {@link DevMode}. */
  @Output() DevModeToggled = new EventEmitter<boolean>();
  /** Emitted when the user ends the call (after the session has been torn down). */
  @Output() Ended = new EventEmitter<void>();

  /** Local mic mute state, reflected from the service. */
  public IsMuted = false;

  private voice = inject(VoiceSessionService);

  /** Toggle the local microphone mute. */
  public ToggleMute(): void {
    this.IsMuted = this.voice.ToggleMute();
  }

  /** Toggle captions visibility and notify the parent. */
  public ToggleCaptions(): void {
    this.CaptionsOn = !this.CaptionsOn;
    this.CaptionsToggled.emit(this.CaptionsOn);
  }

  /** Toggle developer mode (gear) and notify the parent. */
  public ToggleDevMode(): void {
    this.DevMode = !this.DevMode;
    this.DevModeToggled.emit(this.DevMode);
  }

  /** End the call: tear down the session, then notify the host to hide the overlay. */
  public async EndCall(): Promise<void> {
    await this.voice.EndVoiceSession();
    this.Ended.emit();
  }
}
