import { ChangeDetectionStrategy, ChangeDetectorRef, Component, EventEmitter, Input, Output, inject } from '@angular/core';
import { BaseAngularComponent } from '@memberjunction/ng-base-types';
import { MJButtonDirective } from '@memberjunction/ng-ui-components';
import { UUIDsEqual } from '@memberjunction/global';
import type {
  MJCommunicationPrincipalEntity,
  MJCommunicationSuppressionPolicyEntity,
  MJEntityCommunicationMessageTypeEntity,
} from '@memberjunction/core-entities';
import type { CommsAdminLoadedMetadata } from './communications-admin.types';

@Component({
  selector: 'mj-comms-policies-principals-tab',
  standalone: true,
  imports: [MJButtonDirective],
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
  public BusyId: string | null = null;
  public ErrorMessage = '';

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
