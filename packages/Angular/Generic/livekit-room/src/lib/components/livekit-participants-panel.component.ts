import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output } from '@angular/core';
import type { LiveKitParticipantView } from '@memberjunction/livekit-room-core';

/** A side panel listing all participants with mic/video/role/quality indicators. Presentational. */
@Component({
  selector: 'mj-livekit-participants-panel',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="lk-roster">
      <header class="lk-roster__head">
        <span><i class="fa-solid fa-users"></i> Participants ({{ Participants.length }})</span>
        <button type="button" class="lk-roster__close" aria-label="Close participants panel" title="Close participants panel" (click)="Close.emit()"><i class="fa-solid fa-xmark" aria-hidden="true"></i></button>
      </header>
      <ul class="lk-roster__list">
        @for (p of Participants; track p.Identity) {
          <li class="lk-roster__item" [class.lk-roster__item--speaking]="p.IsSpeaking">
            <span class="lk-roster__avatar" [class.lk-roster__avatar--agent]="p.Role === 'agent'">{{ initials(p) }}</span>
            <span class="lk-roster__name">
              {{ p.DisplayName }}
              @if (p.IsLocal) {
                <em class="lk-roster__tag">you</em>
              }
              @if (p.Role === 'agent') {
                <em class="lk-roster__tag lk-roster__tag--agent">AI</em>
              }
            </span>
            <span class="lk-roster__icons">
              <i class="fa-solid" [class.fa-microphone]="p.HasAudio" [class.fa-microphone-slash]="!p.HasAudio" [class.lk-roster__muted]="!p.HasAudio"></i>
              @if (p.HasVideo) {
                <i class="fa-solid fa-video"></i>
              }
              @if (p.IsScreenSharing) {
                <i class="fa-solid fa-display"></i>
              }
            </span>
          </li>
        }
      </ul>
    </div>
  `,
  styles: [
    `
      :host {
        display: block;
        height: 100%;
      }
      .lk-roster {
        display: flex;
        flex-direction: column;
        height: 100%;
        background: var(--mj-bg-surface, #fff);
        border-left: 1px solid var(--mj-border-default, #e2e8f0);
      }
      .lk-roster__head {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 10px 12px;
        font-weight: 600;
        color: var(--mj-text-primary, #334155);
        border-bottom: 1px solid var(--mj-border-subtle, #eef2f7);
      }
      .lk-roster__close {
        border: none;
        background: transparent;
        cursor: pointer;
        color: var(--mj-text-muted, #64748b);
      }
      .lk-roster__list {
        list-style: none;
        margin: 0;
        padding: 6px;
        overflow-y: auto;
      }
      .lk-roster__item {
        display: flex;
        align-items: center;
        gap: 10px;
        padding: 8px 10px;
        border-radius: 8px;
      }
      .lk-roster__item--speaking {
        background: color-mix(in srgb, var(--mj-brand-primary, #0076b6) 10%, transparent);
      }
      .lk-roster__avatar {
        width: 30px;
        height: 30px;
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 0.72rem;
        font-weight: 600;
        color: var(--mj-text-inverse, #fff);
        background: var(--mj-text-muted, #64748b);
        flex-shrink: 0;
      }
      .lk-roster__avatar--agent {
        background: var(--mj-brand-primary, #0076b6);
      }
      .lk-roster__name {
        flex: 1;
        display: inline-flex;
        align-items: center;
        gap: 6px;
        font-size: 0.86rem;
        color: var(--mj-text-primary, #334155);
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .lk-roster__tag {
        font-size: 0.62rem;
        font-style: normal;
        padding: 1px 5px;
        border-radius: 4px;
        background: var(--mj-bg-surface-card, #f1f5f9);
        color: var(--mj-text-muted, #64748b);
      }
      .lk-roster__tag--agent {
        background: var(--mj-brand-primary, #0076b6);
        color: var(--mj-text-inverse, #fff);
      }
      .lk-roster__icons {
        display: inline-flex;
        gap: 8px;
        color: var(--mj-text-muted, #64748b);
        font-size: 0.8rem;
      }
      .lk-roster__muted {
        color: var(--mj-status-error, #ef4444);
      }
    `,
  ],
})
export class LiveKitParticipantsPanelComponent {
  /** The participants to list (typically local + remote). */
  @Input() public Participants: LiveKitParticipantView[] = [];
  /** Emits when the user closes the panel. */
  @Output() public Close = new EventEmitter<void>();

  /** Computes a participant's initials for the roster avatar. */
  public initials(p: LiveKitParticipantView): string {
    const parts = (p.DisplayName ?? '').trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0) {
      return '?';
    }
    return (parts[0][0] + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase();
  }
}
