import { ChangeDetectionStrategy, ChangeDetectorRef, Component, Input, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AgGridAngular } from 'ag-grid-angular';
import type { ColDef, GridOptions, RowClickedEvent } from 'ag-grid-community';
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
  CommsGridTheme,
  ExecuteCommsRemoteOp,
  OpenCommsEntityRecord,
  type CommsAdminLoadedMetadata,
  type CommsAdminMutationOpOutput,
  type CommsBlockEndpointOpOutput,
} from './communications-admin.types';

@Component({
  selector: 'mj-comms-endpoints-suppressions-tab',
  standalone: true,
  imports: [FormsModule, MJButtonDirective, AgGridAngular],
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
          @if (SelectedEndpoint) {
            <div class="comms-actions-row">
              <button mjButton variant="outline" size="sm" (click)="OpenEndpointForm(SelectedEndpoint)">
                Open Form
              </button>
              <button mjButton variant="danger" size="sm" (click)="AddAdminBlock(SelectedEndpoint)">
                Add Admin Block
              </button>
            </div>
          }
        </div>
        <ag-grid-angular
          [theme]="GridTheme"
          [columnDefs]="EndpointCols"
          [gridOptions]="GridOptions"
          [rowData]="Endpoints"
          (rowClicked)="OnEndpointRowClicked($event)"
        />
      </div>
    }

    @if (Suppressions.length > 0) {
      <div class="comms-card">
        <div class="comms-card-header">
          <h3 class="comms-card-title">Suppressions ({{ Suppressions.length }})</h3>
          @if (SelectedSuppression) {
            <div class="comms-actions-row">
              <button mjButton variant="outline" size="sm" (click)="OpenSuppressionForm(SelectedSuppression)">
                Open Form
              </button>
              @if (SelectedSuppression.Status === 'Active') {
                <button mjButton variant="danger" size="sm" (click)="RevokeSuppression(SelectedSuppression)">
                  Revoke Suppression
                </button>
              }
            </div>
          }
        </div>
        <ag-grid-angular
          [theme]="GridTheme"
          [columnDefs]="SuppressionCols"
          [gridOptions]="GridOptions"
          [rowData]="Suppressions"
          (rowClicked)="OnSuppressionRowClicked($event)"
        />
      </div>
    }

    @if (AuditLogs.length > 0) {
      <div class="comms-card">
        <div class="comms-card-header">
          <h3 class="comms-card-title">Consent Audit Log ({{ AuditLogs.length }})</h3>
        </div>
        <ag-grid-angular
          [theme]="GridTheme"
          [columnDefs]="AuditCols"
          [gridOptions]="GridOptions"
          [rowData]="AuditLogs"
        />
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
  public SelectedEndpoint: MJCommunicationEndpointEntity | null = null;
  public SelectedSuppression: MJCommunicationSuppressionEntity | null = null;

  public readonly GridTheme = CommsGridTheme();
  public readonly GridOptions: GridOptions = {
    domLayout: 'autoHeight',
    suppressCellFocus: true,
    rowSelection: { mode: 'singleRow' },
  };
  public readonly EndpointCols: ColDef[] = [
    { field: 'NormalizedValue', headerName: 'Address', flex: 2, valueGetter: (p) => (p.data as MJCommunicationEndpointEntity | undefined)?.NormalizedValue || (p.data as MJCommunicationEndpointEntity | undefined)?.ValueHash || '' },
    { field: 'Status', headerName: 'Status', flex: 1 },
    { field: 'SoftBounceCount', headerName: 'Soft Bounces', flex: 1 },
    { field: 'LastDeliveredAt', headerName: 'Last Delivered', flex: 1, valueFormatter: (p) => (p.value instanceof Date ? p.value.toISOString().slice(0, 10) : '—') },
  ];
  public readonly SuppressionCols: ColDef[] = [
    { field: 'Reason', headerName: 'Reason', flex: 1 },
    { field: 'Source', headerName: 'Source', flex: 1 },
    { field: 'Status', headerName: 'Status', flex: 1 },
    { field: 'EffectiveAt', headerName: 'Effective', flex: 1, valueFormatter: (p) => (p.value instanceof Date ? p.value.toISOString().slice(0, 10) : '—') },
  ];
  public readonly AuditCols: ColDef[] = [
    { field: 'Action', headerName: 'Action', flex: 1 },
    { field: 'Source', headerName: 'Source', flex: 1 },
    { field: '__mj_CreatedAt', headerName: 'Date', flex: 1, valueFormatter: (p) => (p.value instanceof Date ? p.value.toISOString().slice(0, 19) : '—') },
    { field: 'NewValue', headerName: 'New Value', flex: 2 },
  ];

  public OnEndpointRowClicked(event: RowClickedEvent): void {
    this.SelectedEndpoint = (event.data as MJCommunicationEndpointEntity | undefined) ?? null;
    this.cdr.markForCheck();
  }

  public OnSuppressionRowClicked(event: RowClickedEvent): void {
    this.SelectedSuppression = (event.data as MJCommunicationSuppressionEntity | undefined) ?? null;
    this.cdr.markForCheck();
  }

  public OpenEndpointForm(endpoint: MJCommunicationEndpointEntity): void {
    OpenCommsEntityRecord('MJ: Communication Endpoints', endpoint.ID);
  }

  public OpenSuppressionForm(supp: MJCommunicationSuppressionEntity): void {
    OpenCommsEntityRecord('MJ: Communication Suppressions', supp.ID);
  }

  public async Search(): Promise<void> {
    const normalized = NormalizeSearchAddress(this.SearchAddress);
    if (!normalized) return;

    this.IsLoading = true;
    this.ErrorMessage = '';
    this.cdr.markForCheck();

    try {
      const rv = RunView.FromMetadataProvider(this.ProviderToUse);
      this.Endpoints = await this.loadEndpoints(rv, normalized);
      this.Suppressions = await this.loadSuppressions(rv, this.Endpoints);
      this.AuditLogs = await this.loadAuditLogs(rv, this.Suppressions);
    } catch (err: unknown) {
      this.Endpoints = [];
      this.Suppressions = [];
      this.AuditLogs = [];
      this.ErrorMessage = err instanceof Error ? err.message : 'Search failed.';
    } finally {
      this.IsLoading = false;
      this.cdr.markForCheck();
    }
  }

  /**
   * Exact match on the normalized address, or on its hash so an erased endpoint (address removed,
   * hash kept) is still found. Both columns are indexed; a substring scan is not.
   */
  private async loadEndpoints(rv: RunView, normalized: string): Promise<MJCommunicationEndpointEntity[]> {
    const hash = await Sha256Hex(normalized);
    const res = await rv.RunView<MJCommunicationEndpointEntity>({
      EntityName: 'MJ: Communication Endpoints',
      ExtraFilter: `NormalizedValue = '${EscapeSQLString(normalized)}' OR ValueHash = '${EscapeSQLString(hash)}'`,
      MaxRows: 25,
      ResultType: 'entity_object',
    });
    if (!res.Success) throw new Error(`Endpoint lookup failed: ${res.ErrorMessage}`);
    return res.Results;
  }

  private async loadSuppressions(
    rv: RunView,
    endpoints: MJCommunicationEndpointEntity[],
  ): Promise<MJCommunicationSuppressionEntity[]> {
    if (endpoints.length === 0) return [];
    const ids = endpoints.map((e) => `'${EscapeSQLString(e.ID)}'`).join(',');
    const res = await rv.RunView<MJCommunicationSuppressionEntity>({
      EntityName: 'MJ: Communication Suppressions',
      ExtraFilter: `CommunicationEndpointID IN (${ids})`,
      OrderBy: 'EffectiveAt DESC',
      ResultType: 'entity_object',
    });
    // A failed read must not look like "no suppressions": the address would appear sendable.
    if (!res.Success) throw new Error(`Suppression lookup failed: ${res.ErrorMessage}`);
    return res.Results;
  }

  private async loadAuditLogs(
    rv: RunView,
    suppressions: MJCommunicationSuppressionEntity[],
  ): Promise<MJCommunicationConsentAuditLogEntity[]> {
    if (suppressions.length === 0) return [];
    const ids = suppressions.map((s) => `'${EscapeSQLString(s.ID)}'`).join(',');
    const res = await rv.RunView<MJCommunicationConsentAuditLogEntity>({
      EntityName: 'MJ: Communication Consent Audit Logs',
      ExtraFilter: `CommunicationSuppressionID IN (${ids})`,
      OrderBy: '__mj_CreatedAt DESC',
      MaxRows: 50,
      ResultType: 'entity_object',
    });
    if (!res.Success) throw new Error(`Consent audit lookup failed: ${res.ErrorMessage}`);
    return res.Results;
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

/**
 * Normalizes a typed address the way the server stores `NormalizedValue`: an email is trimmed and
 * lower-cased; anything else is reduced to its digits, keeping a leading `+`. This mirrors
 * `NormalizeEndpointAddress` in `@memberjunction/communication-engine`, which is server-only.
 */
export function NormalizeSearchAddress(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  if (trimmed.includes('@')) return trimmed.toLowerCase();
  const digits = trimmed.replace(/\D/g, '');
  if (!digits) return null;
  return trimmed.startsWith('+') ? `+${digits}` : digits;
}

/** SHA-256 hex digest, matching an endpoint's `ValueHash`. */
export async function Sha256Hex(value: string): Promise<string> {
  const bytes = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(bytes), (b) => b.toString(16).padStart(2, '0')).join('');
}
