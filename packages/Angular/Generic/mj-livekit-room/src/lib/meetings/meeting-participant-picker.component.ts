import { ChangeDetectionStrategy, ChangeDetectorRef, Component, EventEmitter, Input, OnInit, Output, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RunView, Metadata, type IMetadataProvider } from '@memberjunction/core';
import { UUIDsEqual } from '@memberjunction/global';
import type { MeetingParticipantInput } from '@memberjunction/graphql-dataprovider';

interface SelectableOption {
  ID: string;
  Name: string;
  Secondary?: string;
}

@Component({
  selector: 'mj-meeting-participant-picker',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="mj-mtg-picker">
      <div class="mj-mtg-picker__tabs">
        <button
          type="button"
          class="mj-mtg-picker__tab"
          [class.mj-mtg-picker__tab--active]="ActiveTab === 'user'"
          (click)="SetActiveTab('user')">
          <i class="fa-solid fa-user"></i> User
        </button>
        <button
          type="button"
          class="mj-mtg-picker__tab"
          [class.mj-mtg-picker__tab--active]="ActiveTab === 'agent'"
          (click)="SetActiveTab('agent')">
          <i class="fa-solid fa-robot"></i> AI Agent
        </button>
        <button
          type="button"
          class="mj-mtg-picker__tab"
          [class.mj-mtg-picker__tab--active]="ActiveTab === 'guest'"
          (click)="SetActiveTab('guest')">
          <i class="fa-solid fa-envelope"></i> External Guest
        </button>
      </div>

      <div class="mj-mtg-picker__body">
        @switch (ActiveTab) {
          @case ('user') {
            <div class="mj-mtg-picker__field">
              <label class="mj-mtg-picker__label">Search Users</label>
              <input
                type="text"
                class="mj-input"
                placeholder="Type name or email…"
                [(ngModel)]="SearchUserQuery"
                (ngModelChange)="OnUserSearch($event)"
              />
              @if (UserOptions.length > 0) {
                <div class="mj-mtg-picker__dropdown">
                  @for (u of UserOptions; track u.ID) {
                    <div class="mj-mtg-picker__option" (click)="SelectUser(u)">
                      <span class="mj-mtg-picker__option-title">{{ u.Name }}</span>
                      @if (u.Secondary) {
                        <span class="mj-mtg-picker__option-sub">{{ u.Secondary }}</span>
                      }
                    </div>
                  }
                </div>
              }
            </div>
            <div class="mj-mtg-picker__row">
              <label class="mj-mtg-picker__label">Role</label>
              <select class="mj-input mj-mtg-picker__select" [(ngModel)]="SelectedRole">
                <option value="Attendee">Attendee</option>
                <option value="CoHost">Co-Host</option>
              </select>
              <button
                type="button"
                class="mj-btn mj-btn--primary"
                [disabled]="!SelectedUser"
                (click)="AddUserParticipant()">
                Add User
              </button>
            </div>
            @if (SelectedUser) {
              <div class="mj-mtg-picker__selected-note">
                Selected: <strong>{{ SelectedUser.Name }}</strong>
              </div>
            }
          }
          @case ('agent') {
            <div class="mj-mtg-picker__field">
              <label class="mj-mtg-picker__label">Select AI Agent</label>
              <select class="mj-input mj-mtg-picker__select" [(ngModel)]="SelectedAgentID">
                <option value="">-- Choose Agent --</option>
                @for (a of AgentOptions; track a.ID) {
                  <option [value]="a.ID">{{ a.Name }}</option>
                }
              </select>
            </div>
            <div class="mj-mtg-picker__row">
              <button
                type="button"
                class="mj-btn mj-btn--primary"
                [disabled]="!SelectedAgentID"
                (click)="AddAgentParticipant()">
                Add Agent
              </button>
            </div>
          }
          @case ('guest') {
            <div class="mj-mtg-picker__grid">
              <div class="mj-mtg-picker__field">
                <label class="mj-mtg-picker__label">Guest Name</label>
                <input type="text" class="mj-input" placeholder="Alex Guest" [(ngModel)]="GuestName" />
              </div>
              <div class="mj-mtg-picker__field">
                <label class="mj-mtg-picker__label">Email Address</label>
                <input type="email" class="mj-input" placeholder="guest@example.com" [(ngModel)]="GuestEmail" />
              </div>
              <div class="mj-mtg-picker__field">
                <label class="mj-mtg-picker__label">Phone Number (optional)</label>
                <input type="tel" class="mj-input" placeholder="+14155550199" [(ngModel)]="GuestPhone" />
              </div>
              <div class="mj-mtg-picker__field">
                <label class="mj-mtg-picker__label">Role</label>
                <select class="mj-input mj-mtg-picker__select" [(ngModel)]="GuestRole">
                  <option value="Attendee">Attendee</option>
                  <option value="CoHost">Co-Host</option>
                </select>
              </div>
            </div>
            <div class="mj-mtg-picker__row">
              <button
                type="button"
                class="mj-btn mj-btn--primary"
                [disabled]="!GuestName && !GuestEmail"
                (click)="AddGuestParticipant()">
                Add Guest
              </button>
            </div>
          }
        }
      </div>

      <!-- Current Participants Table -->
      @if (Participants.length > 0) {
        <div class="mj-mtg-picker__list">
          <h4 class="mj-mtg-picker__heading">Invited Participants ({{ Participants.length }})</h4>
          <div class="mj-mtg-picker__items">
            @for (p of Participants; track $index) {
              <div class="mj-mtg-picker__item">
                <div class="mj-mtg-picker__item-icon">
                  @if (p.AgentID) {
                    <i class="fa-solid fa-robot"></i>
                  } @else if (p.UserID) {
                    <i class="fa-solid fa-user"></i>
                  } @else {
                    <i class="fa-solid fa-envelope"></i>
                  }
                </div>
                <div class="mj-mtg-picker__item-details">
                  <div class="mj-mtg-picker__item-name">
                    {{ GetParticipantDisplayName(p) }}
                  </div>
                  <div class="mj-mtg-picker__item-meta">
                    <span class="mj-mtg-badge">{{ p.Role }}</span>
                    @if (p.ExternalEmail) {
                      <span class="mj-mtg-picker__item-sub">{{ p.ExternalEmail }}</span>
                    }
                  </div>
                </div>
                <button
                  type="button"
                  class="mj-mtg-picker__remove"
                  title="Remove"
                  (click)="RemoveParticipant($index)">
                  <i class="fa-solid fa-trash-can"></i>
                </button>
              </div>
            }
          </div>
        </div>
      }
    </div>
  `,
  styles: [
    `
      :host {
        display: block;
      }
      .mj-mtg-picker {
        border: 1px solid var(--mj-border-default, #e2e8f0);
        border-radius: 8px;
        padding: var(--mj-space-4, 16px);
        background: var(--mj-bg-surface, #ffffff);
      }
      .mj-mtg-picker__tabs {
        display: flex;
        gap: var(--mj-space-2, 8px);
        margin-bottom: var(--mj-space-3, 12px);
        border-bottom: 1px solid var(--mj-border-default, #e2e8f0);
        padding-bottom: var(--mj-space-2, 8px);
      }
      .mj-mtg-picker__tab {
        border: none;
        background: none;
        padding: 6px 12px;
        font-size: 0.875rem;
        cursor: pointer;
        color: var(--mj-text-secondary, #64748b);
        border-radius: 6px;
        display: inline-flex;
        align-items: center;
        gap: 6px;
      }
      .mj-mtg-picker__tab--active {
        color: var(--mj-brand-primary, #0076b6);
        background: var(--mj-bg-surface-card, #f1f5f9);
        font-weight: 600;
      }
      .mj-mtg-picker__field {
        margin-bottom: var(--mj-space-3, 12px);
        position: relative;
      }
      .mj-mtg-picker__label {
        display: block;
        font-size: 0.8125rem;
        font-weight: 500;
        margin-bottom: 4px;
        color: var(--mj-text-primary, #1e293b);
      }
      .mj-input {
        width: 100%;
        padding: 8px 12px;
        border: 1px solid var(--mj-border-default, #cbd5e1);
        border-radius: 6px;
        font-size: 0.875rem;
        background: var(--mj-bg-surface, #ffffff);
        color: var(--mj-text-primary, #0f172a);
        box-sizing: border-box;
      }
      .mj-mtg-picker__dropdown {
        position: absolute;
        top: 100%;
        left: 0;
        right: 0;
        max-height: 180px;
        overflow-y: auto;
        background: var(--mj-bg-surface-elevated, #ffffff);
        border: 1px solid var(--mj-border-default, #cbd5e1);
        border-radius: 6px;
        box-shadow: var(--mj-shadow-md, 0 4px 12px rgba(0, 0, 0, 0.1));
        z-index: 50;
      }
      .mj-mtg-picker__option {
        padding: 8px 12px;
        cursor: pointer;
        display: flex;
        flex-direction: column;
        gap: 2px;
      }
      .mj-mtg-picker__option:hover {
        background: var(--mj-bg-surface-card, #f8fafc);
      }
      .mj-mtg-picker__option-title {
        font-size: 0.875rem;
        font-weight: 500;
      }
      .mj-mtg-picker__option-sub {
        font-size: 0.75rem;
        color: var(--mj-text-secondary, #64748b);
      }
      .mj-mtg-picker__row {
        display: flex;
        align-items: center;
        gap: var(--mj-space-2, 8px);
        margin-bottom: var(--mj-space-3, 12px);
      }
      .mj-mtg-picker__select {
        width: auto;
        flex: 1;
      }
      .mj-mtg-picker__grid {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: var(--mj-space-3, 12px);
      }
      .mj-btn {
        padding: 8px 16px;
        border-radius: 6px;
        font-size: 0.875rem;
        cursor: pointer;
        border: none;
      }
      .mj-btn--primary {
        background: var(--mj-brand-primary, #0076b6);
        color: var(--mj-text-inverse, #ffffff);
      }
      .mj-btn:disabled {
        opacity: 0.5;
        cursor: not-allowed;
      }
      .mj-mtg-picker__selected-note {
        font-size: 0.8125rem;
        color: var(--mj-status-success, #16a34a);
        margin-bottom: var(--mj-space-2, 8px);
      }
      .mj-mtg-picker__list {
        margin-top: var(--mj-space-4, 16px);
        border-top: 1px solid var(--mj-border-default, #e2e8f0);
        padding-top: var(--mj-space-3, 12px);
      }
      .mj-mtg-picker__heading {
        margin: 0 0 var(--mj-space-2, 8px) 0;
        font-size: 0.875rem;
        font-weight: 600;
        color: var(--mj-text-primary, #1e293b);
      }
      .mj-mtg-picker__items {
        display: flex;
        flex-direction: column;
        gap: var(--mj-space-2, 8px);
      }
      .mj-mtg-picker__item {
        display: flex;
        align-items: center;
        gap: var(--mj-space-2, 8px);
        padding: 8px 12px;
        background: var(--mj-bg-surface-card, #f8fafc);
        border-radius: 6px;
        border: 1px solid var(--mj-border-default, #e2e8f0);
      }
      .mj-mtg-picker__item-icon {
        color: var(--mj-brand-primary, #0076b6);
        font-size: 1rem;
      }
      .mj-mtg-picker__item-details {
        flex: 1;
      }
      .mj-mtg-picker__item-name {
        font-size: 0.875rem;
        font-weight: 500;
      }
      .mj-mtg-picker__item-meta {
        display: flex;
        align-items: center;
        gap: 6px;
        font-size: 0.75rem;
      }
      .mj-mtg-badge {
        display: inline-block;
        padding: 2px 6px;
        border-radius: 4px;
        background: var(--mj-bg-surface, #ffffff);
        border: 1px solid var(--mj-border-default, #cbd5e1);
        font-size: 0.75rem;
        font-weight: 600;
      }
      .mj-mtg-picker__remove {
        border: none;
        background: none;
        color: var(--mj-status-error, #ef4444);
        cursor: pointer;
        padding: 4px;
        font-size: 0.875rem;
      }
    `,
  ],
})
export class MJMeetingParticipantPickerComponent implements OnInit {
  private readonly cdr = inject(ChangeDetectorRef, { optional: true });

  @Input() Provider?: IMetadataProvider;
  public get ProviderToUse(): IMetadataProvider {
    return this.Provider ?? Metadata.Provider;
  }

  @Input() set InitialParticipants(val: MeetingParticipantInput[] | undefined) {
    if (val) {
      this.Participants = [...val];
      this.cdr?.markForCheck();
    }
  }

  @Output() ParticipantsChange = new EventEmitter<MeetingParticipantInput[]>();

  public ActiveTab: 'user' | 'agent' | 'guest' = 'user';
  public Participants: MeetingParticipantInput[] = [];

  // User tab
  public SearchUserQuery: string = '';
  public UserOptions: SelectableOption[] = [];
  public SelectedUser: SelectableOption | null = null;
  public SelectedRole: 'Attendee' | 'CoHost' = 'Attendee';

  // Agent tab
  public AgentOptions: SelectableOption[] = [];
  public SelectedAgentID: string = '';

  // Guest tab
  public GuestName: string = '';
  public GuestEmail: string = '';
  public GuestPhone: string = '';
  public GuestRole: 'Attendee' | 'CoHost' = 'Attendee';

  ngOnInit(): void {
    void this.LoadAgents();
  }

  public SetActiveTab(tab: 'user' | 'agent' | 'guest'): void {
    this.ActiveTab = tab;
    this.cdr?.markForCheck();
  }

  public async OnUserSearch(query: string): Promise<void> {
    const q = query.trim();
    if (q.length < 2) {
      this.UserOptions = [];
      this.cdr?.markForCheck();
      return;
    }

    try {
      const rv = RunView.FromMetadataProvider(this.ProviderToUse);
      const escaped = q.replace(/'/g, "''");
      const res = await rv.RunView<{ ID: string; Name: string; Email: string }>({
        EntityName: 'MJ: Users',
        ExtraFilter: `Name LIKE '%${escaped}%' OR Email LIKE '%${escaped}%'`,
        MaxRows: 10,
        ResultType: 'simple',
      });
      if (res.Success && res.Results) {
        this.UserOptions = res.Results.map((u) => ({
          ID: u.ID,
          Name: u.Name,
          Secondary: u.Email,
        }));
      }
    } catch {
      this.UserOptions = [];
    }
    this.cdr?.markForCheck();
  }

  public SelectUser(u: SelectableOption): void {
    this.SelectedUser = u;
    this.UserOptions = [];
    this.SearchUserQuery = u.Name;
    this.cdr?.markForCheck();
  }

  public AddUserParticipant(): void {
    if (!this.SelectedUser) return;
    this.Participants.push({
      UserID: this.SelectedUser.ID,
      Role: this.SelectedRole,
    });
    this.SelectedUser = null;
    this.SearchUserQuery = '';
    this.emitChange();
  }

  public async LoadAgents(): Promise<void> {
    try {
      const rv = RunView.FromMetadataProvider(this.ProviderToUse);
      const res = await rv.RunView<{ ID: string; Name: string }>({
        EntityName: 'MJ: AI Agents',
        MaxRows: 50,
        OrderBy: 'Name ASC',
        ResultType: 'simple',
      });
      if (res.Success && res.Results) {
        this.AgentOptions = res.Results.map((a) => ({
          ID: a.ID,
          Name: a.Name,
        }));
        this.cdr?.markForCheck();
      }
    } catch {
      this.AgentOptions = [];
    }
  }

  public AddAgentParticipant(): void {
    if (!this.SelectedAgentID) return;
    this.Participants.push({
      AgentID: this.SelectedAgentID,
      Role: 'Agent',
    });
    this.SelectedAgentID = '';
    this.emitChange();
  }

  public AddGuestParticipant(): void {
    if (!this.GuestName && !this.GuestEmail) return;
    this.Participants.push({
      ExternalName: this.GuestName.trim() || undefined,
      ExternalEmail: this.GuestEmail.trim() || undefined,
      ExternalPhone: this.GuestPhone.trim() || undefined,
      Role: this.GuestRole,
    });
    this.GuestName = '';
    this.GuestEmail = '';
    this.GuestPhone = '';
    this.emitChange();
  }

  public RemoveParticipant(index: number): void {
    this.Participants.splice(index, 1);
    this.emitChange();
  }

  public GetParticipantDisplayName(p: MeetingParticipantInput): string {
    if (p.AgentID) {
      const matched = this.AgentOptions.find((a) => UUIDsEqual(a.ID, p.AgentID));
      return matched ? `Agent: ${matched.Name}` : `Agent (${p.AgentID})`;
    }
    if (p.UserID) {
      return `User (${p.UserID})`;
    }
    return p.ExternalName || p.ExternalEmail || p.ExternalPhone || 'External Guest';
  }

  private emitChange(): void {
    this.ParticipantsChange.emit([...this.Participants]);
    this.cdr?.markForCheck();
  }
}
