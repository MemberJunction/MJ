import { ChangeDetectionStrategy, ChangeDetectorRef, Component, EventEmitter, Input, OnInit, Output, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AgGridAngular } from 'ag-grid-angular';
import type { ColDef, GridOptions, RowClickedEvent } from 'ag-grid-community';
import { RunView } from '@memberjunction/core';
import { BaseAngularComponent } from '@memberjunction/ng-base-types';
import { MJButtonDirective } from '@memberjunction/ng-ui-components';
import { UUIDsEqual } from '@memberjunction/global';
import type { DomainDNSRecord } from '@memberjunction/communication-types';
import type {
  MJCommunicationProviderEntity,
  MJCommunicationSendingDomainEntity,
} from '@memberjunction/core-entities';
import {
  CommsGridTheme,
  ExecuteCommsRemoteOp,
  OpenCommsEntityRecord,
  type CommsAdminLoadedMetadata,
  type CommsAdminMutationOpOutput,
  type CommsSendingDomainOpOutput,
} from './communications-admin.types';

@Component({
  selector: 'mj-comms-sending-domains-tab',
  standalone: true,
  imports: [FormsModule, MJButtonDirective, AgGridAngular],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrls: ['./communications-admin.css'],
  template: `
    <div class="comms-card">
      <div class="comms-card-header">
        <div>
          <h3 class="comms-card-title">Sending Domains & DNS</h3>
          <p class="comms-card-subtitle">Generate SPF/DKIM/DMARC records and verify domain authentication.</p>
        </div>
        @if (SelectedDomain) {
          <div class="comms-actions-row">
            <button mjButton variant="outline" size="sm" (click)="OpenDomainForm(SelectedDomain)">
              Edit in Form
            </button>
            <button
              mjButton
              variant="secondary"
              size="sm"
              [disabled]="IsBusy(SelectedDomain.ID)"
              (click)="GenerateDnsRecords(SelectedDomain)"
            >
              Generate SPF/DKIM
            </button>
            <button
              mjButton
              variant="primary"
              size="sm"
              [disabled]="IsBusy(SelectedDomain.ID)"
              (click)="VerifyDns(SelectedDomain)"
            >
              Verify DNS
            </button>
            <button
              mjButton
              variant="danger"
              size="sm"
              [disabled]="IsBusy(SelectedDomain.ID)"
              (click)="DeleteDomain(SelectedDomain)"
            >
              Delete
            </button>
          </div>
        }
      </div>

      <div class="comms-form-grid" style="margin-bottom: 16px;">
        <label class="comms-field">
          <span>Domain</span>
          <input class="comms-input" type="text" [(ngModel)]="NewDomain" placeholder="mail.example.com" />
        </label>
        <label class="comms-field">
          <span>Provider</span>
          <select class="comms-select" [(ngModel)]="NewProviderId">
            @for (prov of Providers; track prov.ID) {
              <option [value]="prov.ID">{{ prov.Name }}</option>
            }
          </select>
        </label>
        <label class="comms-field">
          <span>Credential ID (optional)</span>
          <input class="comms-input" type="text" [(ngModel)]="NewCredentialId" placeholder="Credential GUID" />
        </label>
        <div class="comms-field" style="justify-content: flex-end;">
          <button
            mjButton
            variant="primary"
            size="sm"
            [disabled]="IsAdding || !NewDomain.trim() || !NewProviderId"
            (click)="AddDomain()"
          >
            {{ IsAdding ? 'Adding…' : 'Add Domain' }}
          </button>
        </div>
      </div>

      <ag-grid-angular
        [theme]="GridTheme"
        [columnDefs]="DomainCols"
        [gridOptions]="GridOptions"
        [rowData]="Metadata?.SendingDomains ?? []"
        (rowClicked)="OnDomainRowClicked($event)"
      />

      @if (ErrorMessage) {
        <p class="comms-error-msg">{{ ErrorMessage }}</p>
      }
      @if (StatusMessage) {
        <p class="comms-status-msg">{{ StatusMessage }}</p>
      }
    </div>

    @if (SelectedDomain) {
      <div class="comms-card">
        <div class="comms-card-header">
          <h3 class="comms-card-title">DNS Records for {{ SelectedDomain.Domain }}</h3>
        </div>
        @if (SelectedRecords.length > 0) {
          <ag-grid-angular
            [theme]="GridTheme"
            [columnDefs]="DnsRecordCols"
            [gridOptions]="GridOptions"
            [rowData]="SelectedRecords"
          />
        } @else {
          <p class="comms-card-subtitle">No DNS records generated yet. Click "Generate SPF/DKIM".</p>
        }
      </div>
    }
  `,
})
export class CommsSendingDomainsTabComponent extends BaseAngularComponent implements OnInit {
  public readonly GridTheme = CommsGridTheme();
  public readonly GridOptions: GridOptions = {
    domLayout: 'autoHeight',
    suppressCellFocus: true,
    rowSelection: { mode: 'singleRow' },
  };
  public readonly DomainCols: ColDef[] = [
    { field: 'Domain', headerName: 'Domain', flex: 2 },
    { field: 'CommunicationProvider', headerName: 'Provider', flex: 1, valueFormatter: (p) => p.value || '—' },
    { field: 'Status', headerName: 'Status', flex: 1 },
    { field: 'LastVerifiedAt', headerName: 'Last Verified', flex: 1, valueFormatter: (p) => (p.value instanceof Date ? p.value.toISOString().slice(0, 10) : 'Never') },
  ];
  public readonly DnsRecordCols: ColDef<DomainDNSRecord>[] = [
    { field: 'Purpose', headerName: 'Purpose', flex: 1 },
    { field: 'Type', headerName: 'Type', flex: 1 },
    { field: 'Host', headerName: 'Host', flex: 2 },
    { field: 'Value', headerName: 'Value', flex: 3 },
    { field: 'Validated', headerName: 'Validated', flex: 1, valueFormatter: (p) => (p.value ? 'Valid' : 'Pending') },
  ];

  public OnDomainRowClicked(event: RowClickedEvent): void {
    const row = event.data as MJCommunicationSendingDomainEntity | undefined;
    if (row) {
      this.SelectDomain(row);
    }
  }

  public OpenDomainForm(domain: MJCommunicationSendingDomainEntity): void {
    OpenCommsEntityRecord('MJ: Communication Sending Domains', domain.ID);
  }
  private readonly cdr = inject(ChangeDetectorRef);

  @Input() public Metadata: CommsAdminLoadedMetadata | null = null;
  @Output() public RefreshRequested = new EventEmitter<void>();

  public Providers: MJCommunicationProviderEntity[] = [];
  public NewDomain = '';
  public NewProviderId = '';
  public NewCredentialId = '';
  public IsAdding = false;
  public SelectedDomain: MJCommunicationSendingDomainEntity | null = null;
  public SelectedRecords: DomainDNSRecord[] = [];
  public BusyDomainId: string | null = null;
  public StatusMessage = '';
  public ErrorMessage = '';

  public async ngOnInit(): Promise<void> {
    try {
      const rv = RunView.FromMetadataProvider(this.ProviderToUse);
      const res = await rv.RunView<MJCommunicationProviderEntity>({
        EntityName: 'MJ: Communication Providers',
        ExtraFilter: `Status='Active'`,
        OrderBy: 'Name',
        ResultType: 'entity_object',
      });
      if (res.Success) {
        this.Providers = res.Results;
        if (!this.NewProviderId && this.Providers.length > 0) {
          this.NewProviderId = this.Providers[0].ID;
        }
        this.cdr.markForCheck();
      }
    } catch {
      // ignore if metadata provider is not initialized in isolated unit tests
    }
  }

  public async AddDomain(): Promise<void> {
    const domainName = this.NewDomain.trim().toLowerCase();
    if (!domainName || !this.NewProviderId) return;
    this.IsAdding = true;
    this.ErrorMessage = '';
    this.StatusMessage = '';
    this.cdr.markForCheck();

    try {
      const p = this.ProviderToUse;
      const entity = await p.GetEntityObject<MJCommunicationSendingDomainEntity>(
        'MJ: Communication Sending Domains',
        p.CurrentUser,
      );
      entity.Domain = domainName;
      entity.CommunicationProviderID = this.NewProviderId;
      entity.CredentialID = this.NewCredentialId.trim() || null;
      entity.Status = 'Pending';
      if (!(await entity.Save())) {
        throw new Error(entity.LatestResult?.CompleteMessage || 'Failed to add sending domain.');
      }
      this.NewDomain = '';
      this.NewCredentialId = '';
      this.StatusMessage = `Added sending domain ${domainName}.`;
      this.RefreshRequested.emit();
    } catch (err: unknown) {
      this.ErrorMessage = err instanceof Error ? err.message : 'Failed to add sending domain.';
    } finally {
      this.IsAdding = false;
      this.cdr.markForCheck();
    }
  }

  public async DeleteDomain(domain: MJCommunicationSendingDomainEntity): Promise<void> {
    this.BusyDomainId = domain.ID;
    this.ErrorMessage = '';
    this.StatusMessage = '';
    this.cdr.markForCheck();

    try {
      const payload = await ExecuteCommsRemoteOp<{ DomainID: string }, CommsAdminMutationOpOutput>(
        this.ProviderToUse,
        'Communications.DeleteSendingDomain',
        { DomainID: domain.ID },
      );
      if (!payload.Success) {
        throw new Error(payload.ErrorMessage || 'Failed to delete sending domain.');
      }
      domain.Status = 'Revoked';
      if (this.SelectedDomain && UUIDsEqual(this.SelectedDomain.ID, domain.ID)) {
        this.SelectedDomain = null;
        this.SelectedRecords = [];
      }
      this.StatusMessage = `Revoked sending domain ${domain.Domain}.`;
      this.RefreshRequested.emit();
    } catch (err: unknown) {
      this.ErrorMessage = err instanceof Error ? err.message : 'Failed to delete sending domain.';
    } finally {
      this.BusyDomainId = null;
      this.cdr.markForCheck();
    }
  }

  public SelectDomain(domain: MJCommunicationSendingDomainEntity): void {
    this.SelectedDomain = domain;
    this.SelectedRecords = this.parseRecords(domain.DNSRecords);
    this.cdr.markForCheck();
  }

  public IsBusy(id: string): boolean {
    return UUIDsEqual(this.BusyDomainId, id);
  }

  public async GenerateDnsRecords(domain: MJCommunicationSendingDomainEntity): Promise<void> {
    this.BusyDomainId = domain.ID;
    this.ErrorMessage = '';
    this.StatusMessage = '';
    this.cdr.markForCheck();

    try {
      const payload = await ExecuteCommsRemoteOp<{ DomainID: string }, CommsSendingDomainOpOutput>(
        this.ProviderToUse,
        'Communications.CreateSendingDomain',
        { DomainID: domain.ID },
      );
      if (!payload.Success) {
        throw new Error(payload.ErrorMessage || 'Failed to create provider domain authentication.');
      }
      if (payload.DNSRecordsJSON) {
        domain.DNSRecords = payload.DNSRecordsJSON;
      }
      if (payload.ProviderDomainID) {
        domain.ProviderDomainID = payload.ProviderDomainID;
      }
      if (payload.Status) {
        domain.Status = payload.Status as MJCommunicationSendingDomainEntity['Status'];
      }
      this.SelectDomain(domain);
      this.StatusMessage = `Generated provider DNS records for ${domain.Domain}.`;
      this.RefreshRequested.emit();
    } catch (err: unknown) {
      this.ErrorMessage = err instanceof Error ? err.message : 'Failed to generate DNS records.';
    } finally {
      this.BusyDomainId = null;
      this.cdr.markForCheck();
    }
  }

  public async VerifyDns(domain: MJCommunicationSendingDomainEntity): Promise<void> {
    this.BusyDomainId = domain.ID;
    this.ErrorMessage = '';
    this.StatusMessage = '';
    this.cdr.markForCheck();

    try {
      const payload = await ExecuteCommsRemoteOp<{ DomainID: string }, CommsSendingDomainOpOutput>(
        this.ProviderToUse,
        'Communications.VerifySendingDomain',
        { DomainID: domain.ID },
      );
      if (payload.DNSRecordsJSON) {
        domain.DNSRecords = payload.DNSRecordsJSON;
      }
      if (payload.Status) {
        domain.Status = payload.Status as MJCommunicationSendingDomainEntity['Status'];
      }
      domain.LastVerifiedAt = new Date();
      if (payload.Verified) {
        domain.VerifiedAt = domain.VerifiedAt ?? domain.LastVerifiedAt;
      }
      this.SelectDomain(domain);
      if (!payload.Success && payload.ErrorMessage) {
        this.ErrorMessage = payload.ErrorMessage;
      } else {
        this.StatusMessage = payload.Verified
          ? `${domain.Domain} is Verified.`
          : `DNS check recorded for ${domain.Domain}. Publish all DNS records to complete verification.`;
      }
      this.RefreshRequested.emit();
    } catch (err: unknown) {
      this.ErrorMessage = err instanceof Error ? err.message : 'Failed to verify DNS.';
    } finally {
      this.BusyDomainId = null;
      this.cdr.markForCheck();
    }
  }

  private parseRecords(raw: string | null): DomainDNSRecord[] {
    if (!raw) return [];
    try {
      const parsed = JSON.parse(raw) as unknown;
      return Array.isArray(parsed) ? (parsed as DomainDNSRecord[]) : [];
    } catch {
      return [];
    }
  }
}
