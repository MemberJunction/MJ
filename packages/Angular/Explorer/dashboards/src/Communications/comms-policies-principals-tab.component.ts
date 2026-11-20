import { ChangeDetectionStrategy, ChangeDetectorRef, Component, EventEmitter, Input, Output, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { BaseAngularComponent } from '@memberjunction/ng-base-types';
import { MJButtonDirective } from '@memberjunction/ng-ui-components';
import { UUIDsEqual } from '@memberjunction/global';
import type {
  MJCommunicationPrincipalEntity,
  MJCommunicationSuppressionPolicyEntity,
  MJEntityCommunicationMessageTypeEntity,
} from '@memberjunction/core-entities';
import type { CommsAdminLoadedMetadata } from './communications-admin.types';

export interface PrincipalSlotMappingForm {
  FullName: string;
  Jurisdiction: string;
  Timezone: string;
  PreferredLanguage: string;
  IsExistingCustomer: string;
}

@Component({
  selector: 'mj-comms-policies-principals-tab',
  standalone: true,
  imports: [FormsModule, MJButtonDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrls: ['./communications-admin.css'],
  template: `
    <div class="comms-card">
      <div class="comms-card-header">
        <div>
          <h3 class="comms-card-title">Suppression Policies</h3>
          <p class="comms-card-subtitle">Automatic reputation protection (including SoftBounceThresholdPolicy).</p>
        </div>
      </div>

      <table class="comms-table">
        <thead>
          <tr>
            <th>Name</th>
            <th>Driver</th>
            <th>Parameters</th>
            <th>Status</th>
            <th>Action</th>
          </tr>
        </thead>
        <tbody>
          @for (policy of Metadata?.SuppressionPolicies ?? []; track policy.ID) {
            <tr>
              <td>{{ policy.Name }}</td>
              <td><code>{{ policy.DriverClass }}</code></td>
              <td><code>{{ policy.Parameters }}</code></td>
              <td>
                <span
                  class="comms-pill"
                  [class.comms-pill--active]="policy.Status === 'Active'"
                  [class.comms-pill--disabled]="policy.Status !== 'Active'"
                >
                  {{ policy.Status }}
                </span>
              </td>
              <td>
                <button mjButton variant="outline" size="sm" (click)="TogglePolicyStatus(policy)">
                  {{ policy.Status === 'Active' ? 'Disable' : 'Activate' }}
                </button>
              </td>
            </tr>
          }
        </tbody>
      </table>
    </div>

    <div class="comms-card">
      <div class="comms-card-header">
        <div>
          <h3 class="comms-card-title">Unregistered V1 Entity Message Types</h3>
          <p class="comms-card-subtitle">Register legacy EntityCommunicationMessageType rows as V2 Principals.</p>
        </div>
      </div>

      <table class="comms-table">
        <thead>
          <tr>
            <th>Entity</th>
            <th>Message Type</th>
            <th>Action</th>
          </tr>
        </thead>
        <tbody>
          @for (item of UnregisteredV1Types; track item.ID) {
            <tr>
              <td>{{ item.Entity }}</td>
              <td>{{ item.BaseMessageType }}</td>
              <td>
                <button
                  mjButton
                  variant="primary"
                  size="sm"
                  [disabled]="IsBusy(item.ID)"
                  (click)="RegisterAsPrincipal(item)"
                >
                  {{ IsBusy(item.ID) ? 'Registering…' : 'Register as Principal' }}
                </button>
              </td>
            </tr>
          } @empty {
            <tr>
              <td colspan="3">All V1 Entity Communication Message Types are registered as Principals.</td>
            </tr>
          }
        </tbody>
      </table>
      @if (ErrorMessage) {
        <p class="comms-error-msg">{{ ErrorMessage }}</p>
      }
      @if (StatusMessage) {
        <p class="comms-status-msg">{{ StatusMessage }}</p>
      }
    </div>

    <div class="comms-card">
      <div class="comms-card-header">
        <div>
          <h3 class="comms-card-title">Communication Principals &amp; Slot Mapping</h3>
          <p class="comms-card-subtitle">Map entity fields to compliance principal attributes (FullName, Jurisdiction, Timezone, Language, Existing Customer).</p>
        </div>
      </div>

      <table class="comms-table">
        <thead>
          <tr>
            <th>Name</th>
            <th>Entity</th>
            <th>Driver</th>
            <th>Status</th>
            <th>Action</th>
          </tr>
        </thead>
        <tbody>
          @for (principal of Metadata?.Principals ?? []; track principal.ID) {
            <tr>
              <td>{{ principal.Name }}</td>
              <td>{{ principal.Entity }}</td>
              <td><code>{{ principal.DriverClass }}</code></td>
              <td>
                <span
                  class="comms-pill"
                  [class.comms-pill--active]="principal.Status === 'Active'"
                  [class.comms-pill--disabled]="principal.Status !== 'Active'"
                >
                  {{ principal.Status }}
                </span>
              </td>
              <td>
                <button mjButton variant="outline" size="sm" (click)="EditSlots(principal)">
                  Configure Slots
                </button>
              </td>
            </tr>
          } @empty {
            <tr>
              <td colspan="5">No communication principals configured.</td>
            </tr>
          }
        </tbody>
      </table>

      @if (SelectedPrincipal) {
        <div class="comms-slot-editor" style="margin-top: 16px; padding-top: 16px; border-top: 1px solid var(--mj-border-default);">
          <h4 class="comms-card-title" style="margin-bottom: 12px;">Slot Mapping for {{ SelectedPrincipal.Name }}</h4>
          <div class="comms-form-grid">
            <label class="comms-field">
              <span>FullName Field</span>
              <input class="comms-input" type="text" [(ngModel)]="SlotForm.FullName" placeholder="FullName" />
            </label>
            <label class="comms-field">
              <span>Jurisdiction Field</span>
              <input class="comms-input" type="text" [(ngModel)]="SlotForm.Jurisdiction" placeholder="Country or State" />
            </label>
            <label class="comms-field">
              <span>Timezone Field</span>
              <input class="comms-input" type="text" [(ngModel)]="SlotForm.Timezone" placeholder="Timezone" />
            </label>
            <label class="comms-field">
              <span>PreferredLanguage Field</span>
              <input class="comms-input" type="text" [(ngModel)]="SlotForm.PreferredLanguage" placeholder="PreferredLanguage" />
            </label>
            <label class="comms-field">
              <span>IsExistingCustomer Field</span>
              <input class="comms-input" type="text" [(ngModel)]="SlotForm.IsExistingCustomer" placeholder="IsExistingCustomer" />
            </label>
          </div>
          <div class="comms-actions-row" style="margin-top: 12px;">
            <button mjButton variant="primary" size="sm" [disabled]="IsBusy(SelectedPrincipal.ID)" (click)="SaveSlots()">
              {{ IsBusy(SelectedPrincipal.ID) ? 'Saving…' : 'Save Slot Mapping' }}
            </button>
            <button mjButton variant="outline" size="sm" (click)="CancelSlotEdit()">
              Cancel
            </button>
          </div>
        </div>
      }
    </div>
  `,
})
export class CommsPoliciesPrincipalsTabComponent extends BaseAngularComponent {
  private readonly cdr = inject(ChangeDetectorRef);
  private _metadata: CommsAdminLoadedMetadata | null = null;

  @Input()
  public set Metadata(value: CommsAdminLoadedMetadata | null) {
    this._metadata = value;
    this.UnregisteredV1Types = (value?.EntityCommMessageTypes ?? []).filter(
      (t) => !t.CommunicationPrincipalID,
    );
  }
  public get Metadata(): CommsAdminLoadedMetadata | null {
    return this._metadata;
  }

  @Output() public RefreshRequested = new EventEmitter<void>();

  public IsBusy(id: string): boolean {
    return UUIDsEqual(this.BusyId, id);
  }

  public UnregisteredV1Types: MJEntityCommunicationMessageTypeEntity[] = [];
  public SelectedPrincipal: MJCommunicationPrincipalEntity | null = null;
  public SlotForm: PrincipalSlotMappingForm = {
    FullName: '',
    Jurisdiction: '',
    Timezone: '',
    PreferredLanguage: '',
    IsExistingCustomer: '',
  };
  public BusyId: string | null = null;
  public ErrorMessage = '';
  public StatusMessage = '';

  public EditSlots(principal: MJCommunicationPrincipalEntity): void {
    this.SelectedPrincipal = principal;
    this.ErrorMessage = '';
    this.StatusMessage = '';
    let slots: Partial<PrincipalSlotMappingForm> = {};
    if (principal.Configuration) {
      try {
        const parsed = JSON.parse(principal.Configuration) as { Slots?: Partial<PrincipalSlotMappingForm> };
        slots = parsed.Slots ?? {};
      } catch {
        slots = {};
      }
    }
    this.SlotForm = {
      FullName: slots.FullName ?? '',
      Jurisdiction: slots.Jurisdiction ?? '',
      Timezone: slots.Timezone ?? '',
      PreferredLanguage: slots.PreferredLanguage ?? '',
      IsExistingCustomer: slots.IsExistingCustomer ?? '',
    };
    this.cdr.markForCheck();
  }

  public CancelSlotEdit(): void {
    this.SelectedPrincipal = null;
    this.cdr.markForCheck();
  }

  public async SaveSlots(): Promise<void> {
    const principal = this.SelectedPrincipal;
    if (!principal) return;
    this.BusyId = principal.ID;
    this.ErrorMessage = '';
    this.StatusMessage = '';
    this.cdr.markForCheck();

    try {
      let existingConfig: Record<string, unknown> = {};
      if (principal.Configuration) {
        try {
          const parsed = JSON.parse(principal.Configuration) as unknown;
          if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
            existingConfig = parsed as Record<string, unknown>;
          }
        } catch {
          existingConfig = {};
        }
      }

      const slots: Record<string, string> = {};
      if (this.SlotForm.FullName.trim()) slots['FullName'] = this.SlotForm.FullName.trim();
      if (this.SlotForm.Jurisdiction.trim()) slots['Jurisdiction'] = this.SlotForm.Jurisdiction.trim();
      if (this.SlotForm.Timezone.trim()) slots['Timezone'] = this.SlotForm.Timezone.trim();
      if (this.SlotForm.PreferredLanguage.trim()) slots['PreferredLanguage'] = this.SlotForm.PreferredLanguage.trim();
      if (this.SlotForm.IsExistingCustomer.trim()) slots['IsExistingCustomer'] = this.SlotForm.IsExistingCustomer.trim();

      existingConfig['Slots'] = slots;
      principal.Configuration = JSON.stringify(existingConfig, null, 2);
      if (!(await principal.Save())) {
        throw new Error(principal.LatestResult?.CompleteMessage || 'Failed to save slot mapping.');
      }
      this.StatusMessage = `Saved slot mapping for ${principal.Name}.`;
      this.SelectedPrincipal = null;
      this.RefreshRequested.emit();
    } catch (err: unknown) {
      this.ErrorMessage = err instanceof Error ? err.message : 'Failed to save slot mapping.';
    } finally {
      this.BusyId = null;
      this.cdr.markForCheck();
    }
  }

  public async TogglePolicyStatus(policy: MJCommunicationSuppressionPolicyEntity): Promise<void> {
    this.ErrorMessage = '';
    try {
      policy.Status = policy.Status === 'Active' ? 'Disabled' : 'Active';
      if (await policy.Save()) {
        this.RefreshRequested.emit();
      }
    } catch (err: unknown) {
      this.ErrorMessage = err instanceof Error ? err.message : 'Failed to update policy.';
      this.cdr.markForCheck();
    }
  }

  public async RegisterAsPrincipal(item: MJEntityCommunicationMessageTypeEntity): Promise<void> {
    this.BusyId = item.ID;
    this.ErrorMessage = '';
    this.cdr.markForCheck();

    try {
      const p = this.ProviderToUse;
      const principal = await p.GetEntityObject<MJCommunicationPrincipalEntity>(
        'MJ: Communication Principals',
        p.CurrentUser,
      );
      principal.EntityID = item.EntityID;
      principal.Name = item.Entity;
      principal.DisplayOrder = (this._metadata?.Principals.length ?? 0) + 1;
      principal.Status = 'Active';
      if (!(await principal.Save())) {
        throw new Error(principal.LatestResult?.CompleteMessage || 'Failed to create principal.');
      }

      item.CommunicationPrincipalID = principal.ID;
      if (!(await item.Save())) {
        throw new Error(item.LatestResult?.CompleteMessage || 'Failed to link principal.');
      }
      this.RefreshRequested.emit();
    } catch (err: unknown) {
      this.ErrorMessage = err instanceof Error ? err.message : 'Failed to register principal.';
    } finally {
      this.BusyId = null;
      this.cdr.markForCheck();
    }
  }
}
