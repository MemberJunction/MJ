import { ChangeDetectionStrategy, ChangeDetectorRef, Component, Input, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RunView } from '@memberjunction/core';
import { BaseAngularComponent } from '@memberjunction/ng-base-types';
import { MJButtonDirective } from '@memberjunction/ng-ui-components';
import type {
  MJCommunicationConsentAuditLogEntity,
  MJCommunicationEndpointEntity,
  MJCommunicationSuppressionEntity,
} from '@memberjunction/core-entities';
import { EscapeSQLString } from '@memberjunction/global';
import {
  ExecuteCommsRemoteOp,
  type CommsAdminLoadedMetadata,
  type CommsAdminMutationOpOutput,
  type CommsBlockEndpointOpOutput,
} from './communications-admin.types';

@Component({
  selector: 'mj-comms-endpoints-suppressions-tab',
  standalone: true,
  imports: [FormsModule, MJButtonDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrls: ['./communications-admin.css'],
  template: `
    <div class="comms-card">
      <div class="comms-card-header">
        <div>
          <h3 class="comms-card-title">Endpoint & Suppression Lookup</h3>
          <p class="comms-card-subtitle">Search by email or phone, inspect SoftBounceCount, and manage Admin Blocks.</p>
        </div>
      </div>

      <div class="comms-actions-row">
        <input
          class="comms-input"
          type="text"
          style="max-width: 340px"
          [(ngModel)]="SearchAddress"
          placeholder="user@example.com or +15551234567"
          (keyup.enter)="Search()"
        />
        <button mjButton variant="primary" size="sm" [disabled]="IsLoading || !SearchAddress.trim()" (click)="Search()">
          <i class="fa-solid fa-magnifying-glass"></i>
          {{ IsLoading ? 'Searching…' : 'Search' }}
        </button>
      </div>

      @if (ErrorMessage) {
        <p class="comms-error-msg">{{ ErrorMessage }}</p>
      }
    </div>

    @if (Endpoints.length > 0) {
      <div class="comms-card">
        <div class="comms-card-header">
          <h3 class="comms-card-title">Endpoints ({{ Endpoints.length }})</h3>
        </div>
        <table class="comms-table">
          <thead>
            <tr>
              <th>Address</th>
              <th>Status</th>
              <th>Soft Bounce Count</th>
              <th>Last Delivered</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            @for (ep of Endpoints; track ep.ID) {
              <tr>
                <td>{{ ep.NormalizedValue || ep.ValueHash }}</td>
                <td><span class="comms-pill">{{ ep.Status }}</span></td>
                <td>{{ ep.SoftBounceCount }}</td>
                <td>{{ ep.LastDeliveredAt ? ep.LastDeliveredAt.toISOString().slice(0, 10) : '—' }}</td>
                <td>
                  <button mjButton variant="danger" size="sm" (click)="AddAdminBlock(ep)">
                    Add Admin Block
                  </button>
                </td>
              </tr>
            }
          </tbody>
        </table>
      </div>
    }

    @if (Suppressions.length > 0) {
      <div class="comms-card">
        <div class="comms-card-header">
          <h3 class="comms-card-title">Suppressions ({{ Suppressions.length }})</h3>
        </div>
        <table class="comms-table">
          <thead>
            <tr>
              <th>Reason</th>
              <th>Source</th>
              <th>Status</th>
              <th>Effective</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            @for (s of Suppressions; track s.ID) {
              <tr>
                <td>{{ s.Reason }}</td>
                <td>{{ s.Source }}</td>
                <td>
                  <span
                    class="comms-pill"
                    [class.comms-pill--blocked]="s.Status === 'Active'"
                    [class.comms-pill--active]="s.Status === 'Revoked'"
                  >
                    {{ s.Status }}
                  </span>
                </td>
                <td>{{ s.EffectiveAt.toISOString().slice(0, 10) }}</td>
                <td>
                  @if (s.Status === 'Active') {
                    <button mjButton variant="outline" size="sm" (click)="RevokeSuppression(s)">
                      Revoke
                    </button>
                  }
                </td>
              </tr>
            }
          </tbody>
        </table>
      </div>
    }

    @if (AuditLogs.length > 0) {
      <div class="comms-card">
        <div class="comms-card-header">
          <h3 class="comms-card-title">Consent Audit Log ({{ AuditLogs.length }})</h3>
        </div>
        <table class="comms-table">
          <thead>
            <tr>
              <th>Action</th>
              <th>Source</th>
              <th>Date</th>
              <th>New Value</th>
            </tr>
          </thead>
          <tbody>
            @for (log of AuditLogs; track log.ID) {
              <tr>
                <td><span class="comms-pill">{{ log.Action }}</span></td>
                <td>{{ log.Source }}</td>
                <td>{{ log.__mj_CreatedAt.toISOString().slice(0, 19) }}</td>
                <td><code>{{ log.NewValue }}</code></td>
              </tr>
            }
          </tbody>
        </table>
      </div>
    }
  `,
})
export class CommsEndpointsSuppressionsTabComponent extends BaseAngularComponent {
  private readonly cdr = inject(ChangeDetectorRef);

  @Input() public Metadata: CommsAdminLoadedMetadata | null = null;

  public SearchAddress = '';
  public IsLoading = false;
  public ErrorMessage = '';
  public Endpoints: MJCommunicationEndpointEntity[] = [];
  public Suppressions: MJCommunicationSuppressionEntity[] = [];
  public AuditLogs: MJCommunicationConsentAuditLogEntity[] = [];

  public async Search(): Promise<void> {
    const query = this.SearchAddress.trim().toLowerCase();
    if (!query) return;

    this.IsLoading = true;
    this.ErrorMessage = '';
    this.cdr.markForCheck();

    try {
      const rv = RunView.FromMetadataProvider(this.ProviderToUse);
      const safe = EscapeSQLString(query);
      const epRes = await rv.RunView<MJCommunicationEndpointEntity>({
        EntityName: 'MJ: Communication Endpoints',
        ExtraFilter: `NormalizedValue LIKE '%${safe}%'`,
        MaxRows: 25,
        ResultType: 'entity_object',
      });
      this.Endpoints = epRes.Success ? epRes.Results : [];

      if (this.Endpoints.length > 0) {
        const ids = this.Endpoints.map((e) => `'${EscapeSQLString(e.ID)}'`).join(',');
        const suppRes = await rv.RunView<MJCommunicationSuppressionEntity>({
          EntityName: 'MJ: Communication Suppressions',
          ExtraFilter: `CommunicationEndpointID IN (${ids})`,
          OrderBy: 'EffectiveAt DESC',
          ResultType: 'entity_object',
        });
        this.Suppressions = suppRes.Success ? suppRes.Results : [];

        if (this.Suppressions.length > 0) {
          const sIds = this.Suppressions.map((s) => `'${EscapeSQLString(s.ID)}'`).join(',');
          const auditRes = await rv.RunView<MJCommunicationConsentAuditLogEntity>({
            EntityName: 'MJ: Communication Consent Audit Logs',
            ExtraFilter: `CommunicationSuppressionID IN (${sIds})`,
            OrderBy: '__mj_CreatedAt DESC',
            MaxRows: 50,
            ResultType: 'entity_object',
          });
          this.AuditLogs = auditRes.Success ? auditRes.Results : [];
        } else {
          this.AuditLogs = [];
        }
      } else {
        this.Suppressions = [];
        this.AuditLogs = [];
      }
    } catch (err: unknown) {
      this.ErrorMessage = err instanceof Error ? err.message : 'Search failed.';
    } finally {
      this.IsLoading = false;
      this.cdr.markForCheck();
    }
  }

  public async AddAdminBlock(endpoint: MJCommunicationEndpointEntity): Promise<void> {
    this.ErrorMessage = '';
    try {
      const payload = await ExecuteCommsRemoteOp<{ EndpointID: string }, CommsBlockEndpointOpOutput>(
        this.ProviderToUse,
        'Communications.BlockEndpoint',
        { EndpointID: endpoint.ID },
      );
      if (!payload.Success) {
        throw new Error(payload.ErrorMessage || 'Failed to add Admin Block.');
      }
      await this.Search();
    } catch (err: unknown) {
      this.ErrorMessage = err instanceof Error ? err.message : 'Failed to add Admin Block.';
      this.cdr.markForCheck();
    }
  }

  public async RevokeSuppression(supp: MJCommunicationSuppressionEntity): Promise<void> {
    this.ErrorMessage = '';
    try {
      const payload = await ExecuteCommsRemoteOp<{ SuppressionID: string }, CommsAdminMutationOpOutput>(
        this.ProviderToUse,
        'Communications.RevokeSuppression',
        { SuppressionID: supp.ID },
      );
      if (!payload.Success) {
        throw new Error(payload.ErrorMessage || 'Failed to revoke suppression.');
      }
      if (payload.WarningMessage) {
        this.ErrorMessage = `Revoked in MJ, but downstream provider returned warning: ${payload.WarningMessage}`;
      }
      await this.Search();
    } catch (err: unknown) {
      this.ErrorMessage = err instanceof Error ? err.message : 'Failed to revoke suppression.';
      this.cdr.markForCheck();
    }
  }
}
