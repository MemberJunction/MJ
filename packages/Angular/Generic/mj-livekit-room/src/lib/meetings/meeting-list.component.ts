import { ChangeDetectionStrategy, ChangeDetectorRef, Component, EventEmitter, Input, OnInit, Output, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import type { IMetadataProvider } from '@memberjunction/core';
import {
  GraphQLDataProvider,
  GraphQLMeetingClient,
  type MeetingInfo,
} from '@memberjunction/graphql-dataprovider';

@Component({
  selector: 'mj-meeting-list',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="mj-mtg-list-view">
      <!-- Toolbar -->
      <div class="mj-mtg-list-view__toolbar">
        <div class="mj-mtg-list-view__search-wrap">
          <i class="fa-solid fa-magnifying-glass mj-mtg-list-view__search-icon"></i>
          <input
            type="text"
            class="mj-input mj-mtg-list-view__search-input"
            placeholder="Search meetings by title or host…"
            [(ngModel)]="SearchQuery"
            (ngModelChange)="OnSearchChange()"
          />
        </div>

        <div class="mj-mtg-list-view__filters">
          <button
            type="button"
            class="mj-mtg-filter-btn"
            [class.mj-mtg-filter-btn--active]="ActiveFilter === 'all'"
            (click)="SetFilter('all')">
            All
          </button>
          <button
            type="button"
            class="mj-mtg-filter-btn"
            [class.mj-mtg-filter-btn--active]="ActiveFilter === 'live'"
            (click)="SetFilter('live')">
            <span class="mj-mtg-dot-live"></span> Live
          </button>
          <button
            type="button"
            class="mj-mtg-filter-btn"
            [class.mj-mtg-filter-btn--active]="ActiveFilter === 'scheduled'"
            (click)="SetFilter('scheduled')">
            Scheduled
          </button>
          <button
            type="button"
            class="mj-mtg-filter-btn"
            [class.mj-mtg-filter-btn--active]="ActiveFilter === 'past'"
            (click)="SetFilter('past')">
            Past
          </button>
        </div>

        <button
          type="button"
          class="mj-btn mj-btn--primary"
          (click)="OnSchedule()">
          <i class="fa-solid fa-plus"></i> Schedule Meeting
        </button>
      </div>

      <!-- State Views -->
      @if (Loading) {
        <div class="mj-mtg-status">
          <i class="fa-solid fa-spinner fa-spin"></i>
          <span>Loading meetings…</span>
        </div>
      } @else if (ErrorMessage) {
        <div class="mj-mtg-status mj-mtg-status--error">
          <i class="fa-solid fa-triangle-exclamation"></i>
          <span>{{ ErrorMessage }}</span>
          <button type="button" class="mj-btn mj-btn--secondary" (click)="LoadMeetings()">Retry</button>
        </div>
      } @else if (FilteredMeetings.length === 0) {
        <div class="mj-mtg-empty">
          <div class="mj-mtg-empty__icon"><i class="fa-solid fa-calendar-days"></i></div>
          <h3 class="mj-mtg-empty__title">No meetings found</h3>
          <p class="mj-mtg-empty__subtitle">
            {{ SearchQuery ? 'Try adjusting your search query or filter.' : 'You have no meetings scheduled.' }}
          </p>
          <button type="button" class="mj-btn mj-btn--primary" (click)="OnSchedule()">
            <i class="fa-solid fa-plus"></i> Schedule your first meeting
          </button>
        </div>
      } @else {
        <!-- Meetings Grid -->
        <div class="mj-mtg-grid">
          @for (m of FilteredMeetings; track m.ID) {
            <div class="mj-mtg-card" [class.mj-mtg-card--live]="m.Status === 'Live'">
              <div class="mj-mtg-card__header">
                <span class="mj-mtg-pill" [class]="'mj-mtg-pill--' + m.Status.toLowerCase()">
                  @if (m.Status === 'Live') {
                    <span class="mj-mtg-dot-live"></span>
                  }
                  {{ m.Status }}
                </span>
                @if (m.RecordingPolicy !== 'Off') {
                  <span class="mj-mtg-badge-rec" title="Recording {{ m.RecordingPolicy }}">
                    <i class="fa-solid fa-record-vinyl"></i> {{ m.RecordingPolicy }}
                  </span>
                }
              </div>

              <h3 class="mj-mtg-card__title">{{ m.Title }}</h3>

              @if (m.Description) {
                <p class="mj-mtg-card__desc">{{ m.Description }}</p>
              }

              <div class="mj-mtg-card__meta">
                <div class="mj-mtg-card__meta-item">
                  <i class="fa-solid fa-user"></i>
                  <span>Host: {{ m.HostUserName || 'Host' }}</span>
                </div>
                @if (m.ScheduledStartAt) {
                  <div class="mj-mtg-card__meta-item">
                    <i class="fa-solid fa-clock"></i>
                    <span>{{ FormatTime(m.ScheduledStartAt) }}</span>
                  </div>
                }
                @if (m.AllowPhoneDialIn && m.DialInPhoneNumber) {
                  <div class="mj-mtg-card__meta-item mj-mtg-card__dialin">
                    <i class="fa-solid fa-phone"></i>
                    <span>Dial-In: {{ m.DialInPhoneNumber }} (PIN: {{ m.DialInCode }})</span>
                  </div>
                }
                @if (m.Participants && m.Participants.length > 0) {
                  <div class="mj-mtg-card__meta-item">
                    <i class="fa-solid fa-users"></i>
                    <span>{{ m.Participants.length }} participant{{ m.Participants.length > 1 ? 's' : '' }}</span>
                  </div>
                }
              </div>

              <!-- Card Actions — Confirm/Join button LEFT -->
              <div class="mj-mtg-card__actions">
                @if (m.Status === 'Live') {
                  <button
                    type="button"
                    class="mj-btn mj-btn--primary mj-btn--success"
                    (click)="OnJoin(m)">
                    <i class="fa-solid fa-video"></i> Join Call
                  </button>
                } @else if (m.Status === 'Scheduled') {
                  <button
                    type="button"
                    class="mj-btn mj-btn--primary"
                    (click)="OnJoin(m)">
                    <i class="fa-solid fa-arrow-right-to-bracket"></i> Enter Lobby
                  </button>
                  <button
                    type="button"
                    class="mj-btn mj-btn--secondary"
                    title="Edit Meeting"
                    (click)="OnEdit(m)">
                    <i class="fa-solid fa-pen"></i> Edit
                  </button>
                }

                @if (m.Status === 'Live' || m.Status === 'Scheduled') {
                  <button
                    type="button"
                    class="mj-btn mj-btn--danger-text"
                    title="Cancel Meeting"
                    (click)="OnCancelMeeting(m)">
                    <i class="fa-solid fa-ban"></i> Cancel
                  </button>
                }
              </div>
            </div>
          }
        </div>
      }
    </div>
  `,
  styles: [
    `
      :host {
        display: block;
        padding: var(--mj-space-6, 24px) var(--mj-space-4, 16px);
        max-width: 72rem;
        margin: 0 auto;
      }
      .mj-mtg-list-view__toolbar {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: var(--mj-space-3, 12px);
        margin-bottom: var(--mj-space-6, 24px);
      }
      .mj-mtg-list-view__search-wrap {
        position: relative;
        flex: 1;
        min-width: 220px;
      }
      .mj-mtg-list-view__search-icon {
        position: absolute;
        left: 12px;
        top: 50%;
        transform: translateY(-50%);
        color: var(--mj-text-secondary, #94a3b8);
        font-size: 0.875rem;
      }
      .mj-mtg-list-view__search-input {
        width: 100%;
        padding: 9px 12px 9px 34px;
        border: 1px solid var(--mj-border-default, #cbd5e1);
        border-radius: 8px;
        font-size: 0.875rem;
        box-sizing: border-box;
      }
      .mj-mtg-list-view__filters {
        display: flex;
        gap: 4px;
        background: var(--mj-bg-surface-card, #f1f5f9);
        padding: 4px;
        border-radius: 8px;
      }
      .mj-mtg-filter-btn {
        border: none;
        background: none;
        padding: 6px 12px;
        font-size: 0.8125rem;
        font-weight: 500;
        cursor: pointer;
        border-radius: 6px;
        color: var(--mj-text-secondary, #64748b);
        display: inline-flex;
        align-items: center;
        gap: 6px;
      }
      .mj-mtg-filter-btn--active {
        background: var(--mj-bg-surface, #ffffff);
        color: var(--mj-text-primary, #0f172a);
        font-weight: 600;
        box-shadow: 0 1px 2px rgba(0, 0, 0, 0.05);
      }
      .mj-mtg-dot-live {
        width: 8px;
        height: 8px;
        border-radius: 50%;
        background: var(--mj-status-success, #16a34a);
        display: inline-block;
        box-shadow: 0 0 0 2px var(--mj-status-success-subtle, rgba(22, 163, 74, 0.2));
        animation: pulse 2s infinite;
      }
      @keyframes pulse {
        0% { transform: scale(0.95); opacity: 0.9; }
        50% { transform: scale(1.15); opacity: 1; }
        100% { transform: scale(0.95); opacity: 0.9; }
      }
      .mj-mtg-grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
        gap: var(--mj-space-4, 16px);
      }
      .mj-mtg-card {
        background: var(--mj-bg-surface, #ffffff);
        border: 1px solid var(--mj-border-default, #e2e8f0);
        border-radius: 12px;
        padding: var(--mj-space-5, 20px);
        display: flex;
        flex-direction: column;
        transition: border-color 0.2s, box-shadow 0.2s;
      }
      .mj-mtg-card:hover {
        border-color: var(--mj-brand-primary, #0076b6);
        box-shadow: var(--mj-shadow-md, 0 4px 12px rgba(0, 0, 0, 0.05));
      }
      .mj-mtg-card--live {
        border-color: var(--mj-status-success, #22c55e);
        background: var(--mj-status-success-subtle, #f0fdf4);
      }
      .mj-mtg-card__header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        margin-bottom: var(--mj-space-2, 8px);
      }
      .mj-mtg-pill {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        padding: 3px 8px;
        border-radius: 999px;
        font-size: 0.75rem;
        font-weight: 600;
        text-transform: uppercase;
      }
      .mj-mtg-pill--live {
        background: var(--mj-status-success-subtle, #dcfce7);
        color: var(--mj-status-success, #15803d);
      }
      .mj-mtg-pill--scheduled {
        background: var(--mj-status-info-subtle, #e0f2fe);
        color: var(--mj-status-info, #0369a1);
      }
      .mj-mtg-pill--ended {
        background: var(--mj-bg-surface-card, #f1f5f9);
        color: var(--mj-text-secondary, #64748b);
      }
      .mj-mtg-pill--cancelled {
        background: var(--mj-status-error-subtle, #fee2e2);
        color: var(--mj-status-error, #b91c1c);
      }
      .mj-mtg-badge-rec {
        font-size: 0.6875rem;
        color: var(--mj-status-error, #ef4444);
        display: flex;
        align-items: center;
        gap: 4px;
        font-weight: 500;
      }
      .mj-mtg-card__title {
        margin: 0 0 var(--mj-space-2, 8px) 0;
        font-size: 1.125rem;
        font-weight: 600;
        color: var(--mj-text-primary, #0f172a);
      }
      .mj-mtg-card__desc {
        margin: 0 0 var(--mj-space-4, 16px) 0;
        font-size: 0.8125rem;
        color: var(--mj-text-secondary, #64748b);
        display: -webkit-box;
        -webkit-line-clamp: 2;
        -webkit-box-orient: vertical;
        overflow: hidden;
      }
      .mj-mtg-card__meta {
        margin-top: auto;
        display: flex;
        flex-direction: column;
        gap: 6px;
        font-size: 0.8125rem;
        color: var(--mj-text-secondary, #64748b);
        padding-top: var(--mj-space-3, 12px);
        border-top: 1px solid var(--mj-border-default, #f1f5f9);
      }
      .mj-mtg-card__meta-item {
        display: flex;
        align-items: center;
        gap: 8px;
      }
      .mj-mtg-card__dialin {
        color: var(--mj-brand-primary, #0076b6);
      }
      .mj-mtg-card__actions {
        display: flex;
        align-items: center;
        gap: 8px;
        margin-top: var(--mj-space-4, 16px);
      }
      .mj-btn {
        padding: 8px 14px;
        border-radius: 6px;
        font-size: 0.8125rem;
        font-weight: 500;
        cursor: pointer;
        display: inline-flex;
        align-items: center;
        gap: 6px;
        border: none;
      }
      .mj-btn--primary {
        background: var(--mj-brand-primary, #0076b6);
        color: var(--mj-text-inverse, #ffffff);
      }
      .mj-btn--success {
        background: var(--mj-status-success, #16a34a);
        color: var(--mj-text-inverse, #ffffff);
      }
      .mj-btn--secondary {
        background: var(--mj-bg-surface, #ffffff);
        color: var(--mj-text-primary, #1e293b);
        border: 1px solid var(--mj-border-default, #cbd5e1);
      }
      .mj-btn--danger-text {
        background: none;
        color: var(--mj-status-error, #ef4444);
        padding: 6px 8px;
      }
      .mj-mtg-status {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: 12px;
        padding: 48px;
        color: var(--mj-text-secondary, #64748b);
      }
      .mj-mtg-status i {
        font-size: 2rem;
        color: var(--mj-brand-primary, #0076b6);
      }
      .mj-mtg-empty {
        text-align: center;
        padding: 64px 16px;
        max-width: 24rem;
        margin: 0 auto;
      }
      .mj-mtg-empty__icon {
        font-size: 2.5rem;
        color: var(--mj-text-secondary, #94a3b8);
        margin-bottom: 12px;
      }
      .mj-mtg-empty__title {
        font-size: 1.125rem;
        font-weight: 600;
        margin: 0 0 6px 0;
        color: var(--mj-text-primary, #0f172a);
      }
      .mj-mtg-empty__subtitle {
        font-size: 0.875rem;
        color: var(--mj-text-secondary, #64748b);
        margin: 0 0 16px 0;
      }
    `,
  ],
})
export class MJMeetingListComponent implements OnInit {
  private readonly cdr = inject(ChangeDetectorRef, { optional: true });

  @Input() Provider?: IMetadataProvider;

  @Output() JoinMeeting = new EventEmitter<MeetingInfo>();
  @Output() ScheduleRequested = new EventEmitter<void>();
  @Output() EditMeetingRequested = new EventEmitter<MeetingInfo>();

  public Meetings: MeetingInfo[] = [];
  public FilteredMeetings: MeetingInfo[] = [];
  public ActiveFilter: 'all' | 'live' | 'scheduled' | 'past' = 'all';
  public SearchQuery: string = '';
  public Loading: boolean = false;
  public ErrorMessage: string | null = null;

  ngOnInit(): void {
    void this.LoadMeetings();
  }

  public async LoadMeetings(): Promise<void> {
    this.Loading = true;
    this.ErrorMessage = null;
    this.cdr?.markForCheck();

    try {
      const client = new GraphQLMeetingClient(this.Provider || GraphQLDataProvider.Instance);
      this.Meetings = await client.MyMeetings();
      this.ApplyFilter();
    } catch (err) {
      this.ErrorMessage = err instanceof Error ? err.message : String(err);
    } finally {
      this.Loading = false;
      this.cdr?.markForCheck();
    }
  }

  public SetFilter(filter: 'all' | 'live' | 'scheduled' | 'past'): void {
    this.ActiveFilter = filter;
    this.ApplyFilter();
  }

  public OnSearchChange(): void {
    this.ApplyFilter();
  }

  public ApplyFilter(): void {
    let list = [...this.Meetings];

    if (this.ActiveFilter === 'live') {
      list = list.filter((m) => m.Status === 'Live');
    } else if (this.ActiveFilter === 'scheduled') {
      list = list.filter((m) => m.Status === 'Scheduled');
    } else if (this.ActiveFilter === 'past') {
      list = list.filter((m) => m.Status === 'Ended' || m.Status === 'Cancelled');
    }

    if (this.SearchQuery.trim()) {
      const q = this.SearchQuery.toLowerCase().trim();
      list = list.filter(
        (m) =>
          m.Title.toLowerCase().includes(q) ||
          (m.Description && m.Description.toLowerCase().includes(q)) ||
          (m.HostUserName && m.HostUserName.toLowerCase().includes(q)),
      );
    }

    this.FilteredMeetings = list;
    this.cdr?.markForCheck();
  }

  public OnJoin(meeting: MeetingInfo): void {
    this.JoinMeeting.emit(meeting);
  }

  public OnSchedule(): void {
    this.ScheduleRequested.emit();
  }

  public OnEdit(meeting: MeetingInfo): void {
    this.EditMeetingRequested.emit(meeting);
  }

  public async OnCancelMeeting(meeting: MeetingInfo): Promise<void> {
    if (!confirm(`Are you sure you want to cancel the meeting "${meeting.Title}"?`)) {
      return;
    }
    try {
      const client = new GraphQLMeetingClient(this.Provider || GraphQLDataProvider.Instance);
      const res = await client.CancelMeeting(meeting.ID);
      if (res.Success) {
        await this.LoadMeetings();
      } else {
        alert(res.ErrorMessage || 'Failed to cancel meeting.');
      }
    } catch (err) {
      alert(err instanceof Error ? err.message : String(err));
    }
  }

  public FormatTime(dateStr?: string): string {
    if (!dateStr) return '';
    try {
      const d = new Date(dateStr);
      return d.toLocaleString(undefined, {
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
