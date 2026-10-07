import { ChangeDetectionStrategy, ChangeDetectorRef, Component, EventEmitter, Input, OnInit, Output, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import type { IMetadataProvider } from '@memberjunction/core';
import {
  GraphQLDataProvider,
  GraphQLMeetingClient,
  type CreateMeetingInput,
  type UpdateMeetingInput,
  type MeetingInfo,
  type MeetingParticipantInput,
  type DialInPhoneNumberInfo,
} from '@memberjunction/graphql-dataprovider';
import { MJMeetingParticipantPickerComponent } from './meeting-participant-picker.component';

@Component({
  selector: 'mj-meeting-schedule-form',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, FormsModule, MJMeetingParticipantPickerComponent],
  template: `
    <div class="mj-mtg-form">
      <div class="mj-mtg-form__header">
        <h2 class="mj-mtg-form__title">
          {{ Meeting ? 'Edit Meeting' : 'Schedule a Meeting' }}
        </h2>
        <p class="mj-mtg-form__subtitle">
          Configure meeting details, time, dial-in options, and invite participants.
        </p>
      </div>

      @if (ErrorMessage) {
        <div class="mj-mtg-form__alert mj-mtg-form__alert--error">
          <i class="fa-solid fa-circle-exclamation"></i>
          <span>{{ ErrorMessage }}</span>
        </div>
      }

      <form (ngSubmit)="OnSubmit()" class="mj-mtg-form__body">
        <!-- Title -->
        <div class="mj-mtg-form__field">
          <label class="mj-mtg-form__label" for="mtg-title">Meeting Title *</label>
          <input
            id="mtg-title"
            type="text"
            class="mj-input"
            placeholder="e.g. Weekly Strategy Sync"
            required
            [(ngModel)]="Title"
            name="Title"
          />
        </div>

        <!-- Description -->
        <div class="mj-mtg-form__field">
          <label class="mj-mtg-form__label" for="mtg-desc">Description / Agenda</label>
          <textarea
            id="mtg-desc"
            class="mj-input mj-input--textarea"
            rows="3"
            placeholder="Meeting notes, topics to discuss, or preparation links…"
            [(ngModel)]="Description"
            name="Description">
          </textarea>
        </div>

        <!-- Date & Times -->
        <div class="mj-mtg-form__grid">
          <div class="mj-mtg-form__field">
            <label class="mj-mtg-form__label" for="mtg-start">Start Time</label>
            <input
              id="mtg-start"
              type="datetime-local"
              class="mj-input"
              [(ngModel)]="StartAt"
              name="StartAt"
            />
          </div>
          <div class="mj-mtg-form__field">
            <label class="mj-mtg-form__label" for="mtg-end">End Time</label>
            <input
              id="mtg-end"
              type="datetime-local"
              class="mj-input"
              [(ngModel)]="EndAt"
              name="EndAt"
            />
          </div>
        </div>

        <!-- Dial-In Options -->
        <div class="mj-mtg-form__section">
          <div class="mj-mtg-form__toggle-row">
            <label class="mj-mtg-form__toggle-label">
              <input
                type="checkbox"
                [(ngModel)]="AllowPhoneDialIn"
                name="AllowPhoneDialIn"
              />
              <span>Allow Phone Dial-In (LiveKit SIP)</span>
            </label>
          </div>

          @if (AllowPhoneDialIn) {
            <div class="mj-mtg-form__field mj-mtg-form__nested">
              <label class="mj-mtg-form__label" for="mtg-phone">Dial-In Phone Number</label>
              @if (LoadingPhoneNumbers) {
                <div class="mj-mtg-form__hint">Loading available numbers…</div>
              } @else if (PhoneNumbers.length === 0) {
                <div class="mj-mtg-form__hint mj-mtg-form__hint--warn">
                  No active phone numbers found. The server will attempt to assign a default active number.
                </div>
              } @else {
                <select
                  id="mtg-phone"
                  class="mj-input"
                  [(ngModel)]="SelectedPhoneNumberID"
                  name="SelectedPhoneNumberID">
                  @for (p of PhoneNumbers; track p.ID) {
                    <option [value]="p.ID">
                      {{ p.Number }} {{ p.Label ? '(' + p.Label + ')' : '' }}
                    </option>
                  }
                </select>
              }
              <div class="mj-mtg-form__hint">
                A 6-digit PIN code will be automatically generated so callers can dial in.
              </div>
            </div>
          }
        </div>

        <!-- Recording Policy -->
        <div class="mj-mtg-form__field">
          <label class="mj-mtg-form__label" for="mtg-rec">Recording Policy</label>
          <select
            id="mtg-rec"
            class="mj-input"
            [(ngModel)]="RecordingPolicy"
            name="RecordingPolicy">
            <option value="Off">Off (Recording not permitted)</option>
            <option value="Allowed">Allowed (Host may start recording during call)</option>
            <option value="Automatic">Automatic (Records from beginning with audio banner)</option>
          </select>
        </div>

        <!-- Participants Section -->
        <div class="mj-mtg-form__section">
          <label class="mj-mtg-form__label">Participants</label>
          <mj-meeting-participant-picker
            [Provider]="Provider"
            [InitialParticipants]="Participants"
            (ParticipantsChange)="OnParticipantsChange($event)">
          </mj-meeting-participant-picker>
        </div>

        <!-- Actions — Confirm button LEFT per MJ UX standards -->
        <div class="mj-mtg-form__actions">
          <button
            type="submit"
            class="mj-btn mj-btn--primary"
            [disabled]="Saving || !Title.trim()">
            @if (Saving) {
              <i class="fa-solid fa-spinner fa-spin"></i> Saving…
            } @else {
              <i class="fa-solid fa-check"></i> {{ Meeting ? 'Save Changes' : 'Schedule Meeting' }}
            }
          </button>
          <button
            type="button"
            class="mj-btn mj-btn--secondary"
            [disabled]="Saving"
            (click)="OnCancel()">
            Cancel
          </button>
        </div>
      </form>
    </div>
  `,
  styles: [
    `
      :host {
        display: block;
        max-width: 48rem;
        margin: 0 auto;
        padding: var(--mj-space-6, 24px) var(--mj-space-4, 16px);
      }
      .mj-mtg-form {
        background: var(--mj-bg-surface, #ffffff);
        border: 1px solid var(--mj-border-default, #e2e8f0);
        border-radius: 12px;
        padding: var(--mj-space-6, 24px);
        box-shadow: var(--mj-shadow-sm, 0 1px 3px rgba(0, 0, 0, 0.05));
      }
      .mj-mtg-form__header {
        margin-bottom: var(--mj-space-6, 24px);
      }
      .mj-mtg-form__title {
        margin: 0 0 var(--mj-space-1, 4px) 0;
        font-size: 1.25rem;
        font-weight: 600;
        color: var(--mj-text-primary, #0f172a);
      }
      .mj-mtg-form__subtitle {
        margin: 0;
        font-size: 0.875rem;
        color: var(--mj-text-secondary, #64748b);
      }
      .mj-mtg-form__alert {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 10px 14px;
        border-radius: 8px;
        margin-bottom: var(--mj-space-4, 16px);
        font-size: 0.875rem;
      }
      .mj-mtg-form__alert--error {
        background: var(--mj-bg-error-subtle, #fef2f2);
        color: var(--mj-status-error, #ef4444);
        border: 1px solid var(--mj-border-error, #fecaca);
      }
      .mj-mtg-form__field {
        margin-bottom: var(--mj-space-4, 16px);
      }
      .mj-mtg-form__label {
        display: block;
        font-size: 0.875rem;
        font-weight: 500;
        margin-bottom: 6px;
        color: var(--mj-text-primary, #1e293b);
      }
      .mj-input {
        width: 100%;
        padding: 9px 12px;
        border: 1px solid var(--mj-border-default, #cbd5e1);
        border-radius: 6px;
        font-size: 0.875rem;
        background: var(--mj-bg-surface, #ffffff);
        color: var(--mj-text-primary, #0f172a);
        box-sizing: border-box;
      }
      .mj-input--textarea {
        resize: vertical;
      }
      .mj-mtg-form__grid {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: var(--mj-space-4, 16px);
      }
      .mj-mtg-form__section {
        margin-bottom: var(--mj-space-5, 20px);
        padding-top: var(--mj-space-2, 8px);
      }
      .mj-mtg-form__toggle-row {
        margin-bottom: var(--mj-space-2, 8px);
      }
      .mj-mtg-form__toggle-label {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        font-size: 0.875rem;
        font-weight: 500;
        cursor: pointer;
        color: var(--mj-text-primary, #1e293b);
      }
      .mj-mtg-form__nested {
        margin-left: 24px;
        margin-top: 8px;
      }
      .mj-mtg-form__hint {
        font-size: 0.75rem;
        color: var(--mj-text-secondary, #64748b);
        margin-top: 4px;
      }
      .mj-mtg-form__hint--warn {
        color: var(--mj-status-warning, #d97706);
      }
      .mj-mtg-form__actions {
        display: flex;
        align-items: center;
        gap: var(--mj-space-3, 12px);
        margin-top: var(--mj-space-6, 24px);
        padding-top: var(--mj-space-4, 16px);
        border-top: 1px solid var(--mj-border-default, #e2e8f0);
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
      }
      .mj-btn--primary {
        background: var(--mj-brand-primary, #0076b6);
        color: var(--mj-text-inverse, #ffffff);
        border: none;
      }
      .mj-btn--secondary {
        background: var(--mj-bg-surface, #ffffff);
        color: var(--mj-text-primary, #1e293b);
        border: 1px solid var(--mj-border-default, #cbd5e1);
      }
      .mj-btn:disabled {
        opacity: 0.5;
        cursor: not-allowed;
      }
    `,
  ],
})
export class MJMeetingScheduleFormComponent implements OnInit {
  private readonly cdr = inject(ChangeDetectorRef, { optional: true });

  @Input() Provider?: IMetadataProvider;
  @Input() Meeting?: MeetingInfo;

  @Output() MeetingSaved = new EventEmitter<MeetingInfo>();
  @Output() Cancelled = new EventEmitter<void>();

  public Title: string = '';
  public Description: string = '';
  public StartAt: string = '';
  public EndAt: string = '';
  public AllowPhoneDialIn: boolean = false;
  public SelectedPhoneNumberID: string = '';
  public RecordingPolicy: 'Off' | 'Allowed' | 'Automatic' = 'Off';
  public Participants: MeetingParticipantInput[] = [];

  public PhoneNumbers: DialInPhoneNumberInfo[] = [];
  public LoadingPhoneNumbers: boolean = false;
  public Saving: boolean = false;
  public ErrorMessage: string | null = null;

  ngOnInit(): void {
    if (this.Meeting) {
      this.Title = this.Meeting.Title;
      this.Description = this.Meeting.Description || '';
      this.StartAt = this.Meeting.ScheduledStartAt ? this.formatDateForInput(new Date(this.Meeting.ScheduledStartAt)) : '';
      this.EndAt = this.Meeting.ScheduledEndAt ? this.formatDateForInput(new Date(this.Meeting.ScheduledEndAt)) : '';
      this.AllowPhoneDialIn = this.Meeting.AllowPhoneDialIn;
      this.SelectedPhoneNumberID = this.Meeting.DialInPhoneNumberID || '';
      this.RecordingPolicy = this.Meeting.RecordingPolicy;
      if (this.Meeting.Participants) {
        this.Participants = this.Meeting.Participants.map((p) => ({
          UserID: p.UserID,
          AgentID: p.AgentID,
          ExternalName: p.ExternalName,
          ExternalEmail: p.ExternalEmail,
          ExternalPhone: p.ExternalPhone,
          Role: p.Role,
        }));
      }
    } else {
      // Default times: start at next half-hour, end 30 mins later
      const now = new Date();
      now.setMinutes(Math.ceil(now.getMinutes() / 30) * 30, 0, 0);
      const end = new Date(now.getTime() + 30 * 60 * 1000);
      this.StartAt = this.formatDateForInput(now);
      this.EndAt = this.formatDateForInput(end);
    }

    void this.LoadPhoneNumbers();
  }

  public async LoadPhoneNumbers(): Promise<void> {
    this.LoadingPhoneNumbers = true;
    this.cdr?.markForCheck();
    try {
      const client = new GraphQLMeetingClient(this.Provider || GraphQLDataProvider.Instance);
      this.PhoneNumbers = await client.AvailableDialInPhoneNumbers();
      if (!this.SelectedPhoneNumberID && this.PhoneNumbers.length > 0) {
        this.SelectedPhoneNumberID = this.PhoneNumbers[0].ID;
      }
    } catch {
      this.PhoneNumbers = [];
    } finally {
      this.LoadingPhoneNumbers = false;
      this.cdr?.markForCheck();
    }
  }

  public OnParticipantsChange(updated: MeetingParticipantInput[]): void {
    this.Participants = updated;
    this.cdr?.markForCheck();
  }

  public async OnSubmit(): Promise<void> {
    const trimmedTitle = this.Title.trim();
    if (!trimmedTitle) {
      this.ErrorMessage = 'Please enter a meeting title.';
      this.cdr?.markForCheck();
      return;
    }

    this.Saving = true;
    this.ErrorMessage = null;
    this.cdr?.markForCheck();

    try {
      const client = new GraphQLMeetingClient(this.Provider || GraphQLDataProvider.Instance);
      const startDate = this.StartAt ? new Date(this.StartAt) : undefined;
      const endDate = this.EndAt ? new Date(this.EndAt) : undefined;

      if (this.Meeting) {
        const updateInput: UpdateMeetingInput = {
          MeetingID: this.Meeting.ID,
          Title: trimmedTitle,
          Description: this.Description.trim() || undefined,
          ScheduledStartAt: startDate,
          ScheduledEndAt: endDate,
          AllowPhoneDialIn: this.AllowPhoneDialIn,
          DialInPhoneNumberID: this.AllowPhoneDialIn ? this.SelectedPhoneNumberID : undefined,
          RecordingPolicy: this.RecordingPolicy,
          Participants: this.Participants,
        };
        const res = await client.UpdateMeeting(updateInput);
        if (res.Success && res.Meeting) {
          this.MeetingSaved.emit(res.Meeting);
        } else {
          this.ErrorMessage = res.ErrorMessage || 'Failed to update meeting.';
        }
      } else {
        const createInput: CreateMeetingInput = {
          Title: trimmedTitle,
          Description: this.Description.trim() || undefined,
          ScheduledStartAt: startDate,
          ScheduledEndAt: endDate,
          AllowPhoneDialIn: this.AllowPhoneDialIn,
          DialInPhoneNumberID: this.AllowPhoneDialIn ? this.SelectedPhoneNumberID : undefined,
          RecordingPolicy: this.RecordingPolicy,
          Participants: this.Participants,
        };
        const res = await client.CreateMeeting(createInput);
        if (res.Success && res.Meeting) {
          this.MeetingSaved.emit(res.Meeting);
        } else {
          this.ErrorMessage = res.ErrorMessage || 'Failed to schedule meeting.';
        }
      }
    } catch (err) {
      this.ErrorMessage = err instanceof Error ? err.message : String(err);
    } finally {
      this.Saving = false;
      this.cdr?.markForCheck();
    }
  }

  public OnCancel(): void {
    this.Cancelled.emit();
  }

  private formatDateForInput(d: Date): string {
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }
}
