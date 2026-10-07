import { ChangeDetectionStrategy, ChangeDetectorRef, Component, EventEmitter, Input, OnInit, Output, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import type { IMetadataProvider } from '@memberjunction/core';
import type { MeetingInfo } from '@memberjunction/graphql-dataprovider';

@Component({
  selector: 'mj-meeting-lobby',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule],
  template: `
    <div class="mj-mtg-lobby">
      <div class="mj-mtg-lobby__card">
        <!-- Top Back Nav -->
        <button type="button" class="mj-mtg-lobby__back" (click)="OnBack()">
          <i class="fa-solid fa-arrow-left"></i> Back to Meetings
        </button>

        <div class="mj-mtg-lobby__content">
          <!-- Left: Device Preview -->
          <div class="mj-mtg-lobby__preview-col">
            <div class="mj-mtg-lobby__preview">
              @if (StartWithVideo) {
                <div class="mj-mtg-lobby__video-placeholder">
                  <i class="fa-solid fa-video"></i>
                  <span>Camera is enabled</span>
                </div>
              } @else {
                <div class="mj-mtg-lobby__avatar">
                  <i class="fa-solid fa-user"></i>
                </div>
                <div class="mj-mtg-lobby__cam-off-label">Camera is turned off</div>
              }

              <!-- Device Control Toggles in Preview -->
              <div class="mj-mtg-lobby__controls">
                <button
                  type="button"
                  class="mj-mtg-lobby__control-btn"
                  [class.mj-mtg-lobby__control-btn--off]="!StartWithAudio"
                  [title]="StartWithAudio ? 'Mute Microphone' : 'Unmute Microphone'"
                  (click)="ToggleAudio()">
                  <i [class]="StartWithAudio ? 'fa-solid fa-microphone' : 'fa-solid fa-microphone-slash'"></i>
                </button>
                <button
                  type="button"
                  class="mj-mtg-lobby__control-btn"
                  [class.mj-mtg-lobby__control-btn--off]="!StartWithVideo"
                  [title]="StartWithVideo ? 'Turn Off Camera' : 'Turn On Camera'"
                  (click)="ToggleVideo()">
                  <i [class]="StartWithVideo ? 'fa-solid fa-video' : 'fa-solid fa-video-slash'"></i>
                </button>
              </div>
            </div>

            <!-- Join Button — Confirm button LEFT -->
            <div class="mj-mtg-lobby__join-actions">
              <button
                type="button"
                class="mj-btn mj-btn--primary mj-mtg-lobby__join-btn"
                (click)="OnJoin()">
                <i class="fa-solid fa-right-to-bracket"></i> Join Now
              </button>
            </div>
          </div>

          <!-- Right: Meeting Info & Roster -->
          <div class="mj-mtg-lobby__info-col">
            <div class="mj-mtg-lobby__status-pill" [class]="'mj-mtg-status--' + Meeting.Status.toLowerCase()">
              {{ Meeting.Status }}
            </div>
            <h1 class="mj-mtg-lobby__title">{{ Meeting.Title }}</h1>

            @if (Meeting.Description) {
              <p class="mj-mtg-lobby__desc">{{ Meeting.Description }}</p>
            }

            <div class="mj-mtg-lobby__meta-list">
              <div class="mj-mtg-lobby__meta-item">
                <i class="fa-solid fa-user-tie"></i>
                <span>Host: <strong>{{ Meeting.HostUserName || 'Host' }}</strong></span>
              </div>
              @if (Meeting.ScheduledStartAt) {
                <div class="mj-mtg-lobby__meta-item">
                  <i class="fa-solid fa-clock"></i>
                  <span>{{ FormatTime(Meeting.ScheduledStartAt) }}</span>
                </div>
              }
              @if (Meeting.AllowPhoneDialIn && Meeting.DialInPhoneNumber) {
                <div class="mj-mtg-lobby__dialin-box">
                  <div class="mj-mtg-lobby__dialin-title">
                    <i class="fa-solid fa-phone"></i> Phone Dial-In
                  </div>
                  <div class="mj-mtg-lobby__dialin-details">
                    <span>Number: <strong>{{ Meeting.DialInPhoneNumber }}</strong></span>
                    @if (Meeting.DialInCode) {
                      <span>PIN Code: <strong>{{ Meeting.DialInCode }}</strong></span>
                    }
                  </div>
                </div>
              }
              @if (Meeting.RecordingPolicy === 'Automatic') {
                <div class="mj-mtg-lobby__meta-item mj-mtg-lobby__rec-note">
                  <i class="fa-solid fa-circle-dot"></i>
                  <span>This meeting records automatically with an audio announcement.</span>
                </div>
              }
            </div>

            <!-- Participants Roster -->
            @if (Meeting.Participants && Meeting.Participants.length > 0) {
              <div class="mj-mtg-lobby__roster">
                <h4 class="mj-mtg-lobby__roster-title">
                  Participants ({{ Meeting.Participants.length }})
                </h4>
                <div class="mj-mtg-lobby__roster-list">
                  @for (p of Meeting.Participants; track p.ID) {
                    <div class="mj-mtg-lobby__roster-item">
                      <i [class]="p.Role === 'Agent' ? 'fa-solid fa-robot' : 'fa-solid fa-user'"></i>
                      <span class="mj-mtg-lobby__roster-name">
                        {{ p.AgentName || p.UserName || p.ExternalName || p.ExternalEmail || 'Participant' }}
                      </span>
                      <span class="mj-mtg-badge">{{ p.Role }}</span>
                      <span class="mj-mtg-rsvp-pill" [class]="'mj-mtg-rsvp--' + p.InviteStatus.toLowerCase()">
                        {{ p.InviteStatus }}
                      </span>
                    </div>
                  }
                </div>
              </div>
            }
          </div>
        </div>
      </div>
    </div>
  `,
  styles: [
    `
      :host {
        display: block;
        max-width: 56rem;
        margin: 0 auto;
        padding: var(--mj-space-6, 24px) var(--mj-space-4, 16px);
      }
      .mj-mtg-lobby__card {
        background: var(--mj-bg-surface, #ffffff);
        border: 1px solid var(--mj-border-default, #e2e8f0);
        border-radius: 12px;
        padding: var(--mj-space-6, 24px);
        box-shadow: var(--mj-shadow-sm, 0 1px 3px rgba(0, 0, 0, 0.05));
      }
      .mj-mtg-lobby__back {
        border: none;
        background: none;
        color: var(--mj-brand-primary, #0076b6);
        cursor: pointer;
        font-size: 0.875rem;
        font-weight: 500;
        display: inline-flex;
        align-items: center;
        gap: 6px;
        margin-bottom: var(--mj-space-4, 16px);
      }
      .mj-mtg-lobby__content {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: var(--mj-space-8, 32px);
      }
      @media (max-width: 768px) {
        .mj-mtg-lobby__content {
          grid-template-columns: 1fr;
        }
      }
      .mj-mtg-lobby__preview {
        background: var(--mj-bg-surface-card, #0f172a);
        color: var(--mj-text-inverse, #ffffff);
        border-radius: 12px;
        height: 280px;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        position: relative;
        overflow: hidden;
      }
      .mj-mtg-lobby__avatar {
        width: 72px;
        height: 72px;
        border-radius: 50%;
        background: rgba(255, 255, 255, 0.15);
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 2rem;
        margin-bottom: 12px;
      }
      .mj-mtg-lobby__cam-off-label {
        font-size: 0.875rem;
        color: rgba(255, 255, 255, 0.7);
      }
      .mj-mtg-lobby__video-placeholder {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 8px;
        font-size: 1rem;
        color: var(--mj-brand-accent, #38bdf8);
      }
      .mj-mtg-lobby__video-placeholder i {
        font-size: 2.5rem;
      }
      .mj-mtg-lobby__controls {
        position: absolute;
        bottom: 16px;
        display: flex;
        gap: 12px;
        z-index: 10;
      }
      .mj-mtg-lobby__control-btn {
        width: 44px;
        height: 44px;
        border-radius: 50%;
        border: none;
        background: rgba(255, 255, 255, 0.2);
        color: var(--mj-text-inverse, #ffffff);
        font-size: 1.1rem;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: background 0.2s;
      }
      .mj-mtg-lobby__control-btn--off {
        background: var(--mj-status-error, #ef4444);
      }
      .mj-mtg-lobby__join-actions {
        margin-top: var(--mj-space-4, 16px);
      }
      .mj-mtg-lobby__join-btn {
        width: 100%;
        padding: 12px 20px;
        font-size: 1rem;
        justify-content: center;
      }
      .mj-btn {
        padding: 9px 20px;
        border-radius: 6px;
        font-size: 0.875rem;
        font-weight: 500;
        cursor: pointer;
        display: inline-flex;
        align-items: center;
        gap: 8px;
        border: none;
      }
      .mj-btn--primary {
        background: var(--mj-brand-primary, #0076b6);
        color: var(--mj-text-inverse, #ffffff);
      }
      .mj-mtg-lobby__status-pill {
        display: inline-block;
        padding: 3px 8px;
        border-radius: 999px;
        font-size: 0.75rem;
        font-weight: 600;
        text-transform: uppercase;
        margin-bottom: 8px;
      }
      .mj-mtg-status--live {
        background: var(--mj-status-success-subtle, #dcfce7);
        color: var(--mj-status-success, #15803d);
      }
      .mj-mtg-status--scheduled {
        background: var(--mj-status-info-subtle, #e0f2fe);
        color: var(--mj-status-info, #0369a1);
      }
      .mj-mtg-status--ended {
        background: var(--mj-bg-surface-card, #f1f5f9);
        color: var(--mj-text-secondary, #64748b);
      }
      .mj-mtg-lobby__title {
        margin: 0 0 var(--mj-space-2, 8px) 0;
        font-size: 1.5rem;
        font-weight: 700;
        color: var(--mj-text-primary, #0f172a);
      }
      .mj-mtg-lobby__desc {
        font-size: 0.875rem;
        color: var(--mj-text-secondary, #475569);
        margin: 0 0 var(--mj-space-4, 16px) 0;
        line-height: 1.5;
      }
      .mj-mtg-lobby__meta-list {
        display: flex;
        flex-direction: column;
        gap: 8px;
        font-size: 0.875rem;
        color: var(--mj-text-secondary, #475569);
        margin-bottom: var(--mj-space-5, 20px);
      }
      .mj-mtg-lobby__meta-item {
        display: flex;
        align-items: center;
        gap: 8px;
      }
      .mj-mtg-lobby__dialin-box {
        padding: 10px 14px;
        border-radius: 8px;
        background: var(--mj-bg-surface-card, #f8fafc);
        border: 1px solid var(--mj-border-default, #e2e8f0);
        margin-top: 6px;
      }
      .mj-mtg-lobby__dialin-title {
        font-weight: 600;
        font-size: 0.8125rem;
        color: var(--mj-brand-primary, #0076b6);
        display: flex;
        align-items: center;
        gap: 6px;
        margin-bottom: 4px;
      }
      .mj-mtg-lobby__dialin-details {
        display: flex;
        gap: 16px;
        font-size: 0.8125rem;
      }
      .mj-mtg-lobby__rec-note {
        color: var(--mj-status-error, #ef4444);
        font-size: 0.8125rem;
        font-weight: 500;
      }
      .mj-mtg-lobby__roster {
        border-top: 1px solid var(--mj-border-default, #e2e8f0);
        padding-top: var(--mj-space-4, 16px);
      }
      .mj-mtg-lobby__roster-title {
        margin: 0 0 var(--mj-space-3, 12px) 0;
        font-size: 0.875rem;
        font-weight: 600;
        color: var(--mj-text-primary, #1e293b);
      }
      .mj-mtg-lobby__roster-list {
        display: flex;
        flex-direction: column;
        gap: 6px;
        max-height: 180px;
        overflow-y: auto;
      }
      .mj-mtg-lobby__roster-item {
        display: flex;
        align-items: center;
        gap: 8px;
        font-size: 0.8125rem;
        padding: 4px 0;
      }
      .mj-mtg-lobby__roster-name {
        flex: 1;
        font-weight: 500;
      }
      .mj-mtg-badge {
        padding: 2px 6px;
        border-radius: 4px;
        background: var(--mj-bg-surface-card, #f1f5f9);
        font-size: 0.6875rem;
        font-weight: 600;
      }
      .mj-mtg-rsvp-pill {
        padding: 2px 6px;
        border-radius: 4px;
        font-size: 0.6875rem;
        font-weight: 600;
      }
      .mj-mtg-rsvp--accepted {
        background: var(--mj-status-success-subtle, #dcfce7);
        color: var(--mj-status-success, #15803d);
      }
      .mj-mtg-rsvp--declined {
        background: var(--mj-status-error-subtle, #fee2e2);
        color: var(--mj-status-error, #b91c1c);
      }
      .mj-mtg-rsvp--invited {
        background: var(--mj-bg-surface-card, #f1f5f9);
        color: var(--mj-text-secondary, #64748b);
      }
      .mj-mtg-rsvp--tentative {
        background: var(--mj-status-warning-subtle, #fef3c7);
        color: var(--mj-status-warning, #b45309);
      }
    `,
  ],
})
export class MJMeetingLobbyComponent implements OnInit {
  private readonly cdr = inject(ChangeDetectorRef, { optional: true });

  @Input() Meeting!: MeetingInfo;
  @Input() Provider?: IMetadataProvider;

  @Output() JoinConfirmed = new EventEmitter<{ startWithAudio: boolean; startWithVideo: boolean }>();
  @Output() Cancelled = new EventEmitter<void>();

  public StartWithAudio: boolean = true;
  public StartWithVideo: boolean = false;

  ngOnInit(): void {}

  public ToggleAudio(): void {
    this.StartWithAudio = !this.StartWithAudio;
    this.cdr?.markForCheck();
  }

  public ToggleVideo(): void {
    this.StartWithVideo = !this.StartWithVideo;
    this.cdr?.markForCheck();
  }

  public OnJoin(): void {
    this.JoinConfirmed.emit({
      startWithAudio: this.StartWithAudio,
      startWithVideo: this.StartWithVideo,
    });
  }

  public OnBack(): void {
    this.Cancelled.emit();
  }

  public FormatTime(dateStr?: string): string {
    if (!dateStr) return '';
    try {
      const d = new Date(dateStr);
      return d.toLocaleString(undefined, {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
      });
    } catch {
      return dateStr;
    }
  }
}
