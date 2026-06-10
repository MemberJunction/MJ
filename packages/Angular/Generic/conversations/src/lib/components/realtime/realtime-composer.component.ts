import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { VoiceSessionService } from '../../services/voice-session.service';

/**
 * In-session text composer (mirrors `.call-composer` in live-session.html). Makes it clear
 * the typed text joins the SAME live voice call — a brand-accented note + a focused pill
 * input. On submit it calls {@link VoiceSessionService.SendText}, which injects the text as
 * a user turn into the realtime session (the model then responds aloud + the turn persists).
 */
@Component({
  standalone: true,
  selector: 'mj-realtime-composer',
  imports: [CommonModule, FormsModule],
  templateUrl: './realtime-composer.component.html',
  styleUrl: './realtime-composer.component.css'
})
export class RealtimeComposerComponent {
  /** Current draft text in the composer. */
  public Draft = '';

  private voice = inject(VoiceSessionService);

  /** True when there's non-whitespace text to send. */
  public get CanSend(): boolean {
    return this.Draft.trim().length > 0;
  }

  /** Send the typed text into the live session, then clear the input. */
  public Send(): void {
    if (!this.CanSend) {
      return;
    }
    this.voice.SendText(this.Draft);
    this.Draft = '';
  }

  /** Enter sends (Shift+Enter is free for future multiline if the input becomes a textarea). */
  public OnKeydown(event: KeyboardEvent): void {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      this.Send();
    }
  }
}
