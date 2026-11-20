import { ChangeDetectionStrategy, ChangeDetectorRef, Component, EventEmitter, Input, OnInit, Output, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RunView } from '@memberjunction/core';
import { BaseAngularComponent } from '@memberjunction/ng-base-types';
import { MJButtonDirective } from '@memberjunction/ng-ui-components';
import { UUIDsEqual } from '@memberjunction/global';
import type { DomainDNSRecord } from '@memberjunction/communication-types';
import type {
  MJCommunicationProviderEntity,
  MJCommunicationSendingDomainEntity,
} from '@memberjunction/core-entities';
import type { CommsAdminLoadedMetadata } from './communications-admin.types';

interface GqlCapableProvider {
  ExecuteGQL(query: string, variables?: Record<string, unknown>): Promise<Record<string, unknown>>;
}

function asGqlProvider(provider: unknown): GqlCapableProvider | null {
  if (
    provider &&
    typeof provider === 'object' &&
    'ExecuteGQL' in provider &&
    typeof (provider as { ExecuteGQL?: unknown }).ExecuteGQL === 'function'
  ) {
    return provider as GqlCapableProvider;
  }
  return null;
}

@Component({
  selector: 'mj-comms-sending-domains-tab',
  standalone: true,
  imports: [FormsModule, MJButtonDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrls: ['./communications-admin.css'],
  template: `
    <div class="comms-card">
      <div class="comms-card-header">
        <div>
          <h3 class="comms-card-title">Sending Domains & DNS</h3>
          <p class="comms-card-subtitle">Generate SPF/DKIM/DMARC records and verify domain authentication.</p>
        </div>
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

      <table class="comms-table">
        <thead>
          <tr>
            <th>Domain</th>
            <th>Provider</th>
            <th>Status</th>
            <th>Last Verified</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          @for (dom of Metadata?.SendingDomains ?? []; track dom.ID) {
            <tr>
              <td>{{ dom.Domain }}</td>
              <td>{{ dom.CommunicationProvider ?? '—' }}</td>
              <td>
                <span
                  class="comms-pill"
                  [class.comms-pill--verified]="dom.Status === 'Verified'"
                  [class.comms-pill--pending]="dom.Status === 'Pending'"
                  [class.comms-pill--failed]="dom.Status === 'Failed' || dom.Status === 'Revoked'"
                >
                  {{ dom.Status }}
                </span>
              </td>
              <td>{{ dom.LastVerifiedAt ? dom.LastVerifiedAt.toISOString().slice(0, 10) : 'Never' }}</td>
              <td>
                <div class="comms-actions-row">
                  <button mjButton variant="outline" size="sm" (click)="SelectDomain(dom)">
                    Inspect DNS
                  </button>
                  <button
                    mjButton
                    variant="secondary"
                    size="sm"
                    [disabled]="IsBusy(dom.ID)"
                    (click)="GenerateDnsRecords(dom)"
                  >
                    Generate SPF/DKIM
                  </button>
                  <button
                    mjButton
                    variant="primary"
                    size="sm"
                    [disabled]="IsBusy(dom.ID)"
                    (click)="VerifyDns(dom)"
                  >
                    Verify DNS
                  </button>
                  <button
                    mjButton
                    variant="danger"
                    size="sm"
                    [disabled]="IsBusy(dom.ID)"
                    (click)="DeleteDomain(dom)"
                  >
                    Delete
                  </button>
                </div>
              </td>
            </tr>
          } @empty {
            <tr>
              <td colspan="5">No sending domains configured.</td>
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

    @if (SelectedDomain) {
      <div class="comms-card">
        <div class="comms-card-header">
          <h3 class="comms-card-title">DNS Records for {{ SelectedDomain.Domain }}</h3>
        </div>
        <table class="comms-table">
          <thead>
            <tr>
              <th>Purpose</th>
              <th>Type</th>
              <th>Host</th>
              <th>Value</th>
              <th>Validated</th>
            </tr>
          </thead>
          <tbody>
            @for (rec of SelectedRecords; track rec.Host + rec.Purpose) {
              <tr>
                <td>{{ rec.Purpose }}</td>
                <td><code>{{ rec.Type }}</code></td>
                <td><code>{{ rec.Host }}</code></td>
                <td><code>{{ rec.Value }}</code></td>
                <td>
                  <span
                    class="comms-pill"
                    [class.comms-pill--verified]="rec.Validated"
                    [class.comms-pill--pending]="!rec.Validated"
                  >
                    {{ rec.Validated ? 'Valid' : 'Pending' }}
                  </span>
                </td>
              </tr>
            } @empty {
              <tr>
                <td colspan="5">No DNS records generated yet. Click "Generate SPF/DKIM".</td>
              </tr>
            }
          </tbody>
        </table>
      </div>
    }
  `,
})
export class CommsSendingDomainsTabComponent extends BaseAngularComponent implements OnInit {
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
      const gql = asGqlProvider(this.ProviderToUse);
      if (!gql) {
        throw new Error('GraphQL provider is not available.');
      }
      const mutation = `
        mutation DeleteCommsSendingDomain($DomainID: String!) {
          DeleteCommsSendingDomain(DomainID: $DomainID) {
            Success
            ErrorMessage
          }
        }
      `;
      const res = await gql.ExecuteGQL(mutation, { DomainID: domain.ID });
      const payload = res['DeleteCommsSendingDomain'] as
        | { Success: boolean; ErrorMessage?: string }
        | undefined;
      if (!payload?.Success) {
        throw new Error(payload?.ErrorMessage || 'Failed to delete sending domain.');
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
      const gql = asGqlProvider(this.ProviderToUse);
      if (!gql) {
        throw new Error('GraphQL provider is not available.');
      }
      const mutation = `
        mutation CreateCommsSendingDomain($DomainID: String!) {
          CreateCommsSendingDomain(DomainID: $DomainID) {
            Success
            Status
            ProviderDomainID
            DNSRecordsJSON
            ErrorMessage
          }
        }
      `;
      const res = await gql.ExecuteGQL(mutation, { DomainID: domain.ID });
      const payload = res['CreateCommsSendingDomain'] as
        | { Success: boolean; Status?: string; ProviderDomainID?: string; DNSRecordsJSON?: string; ErrorMessage?: string }
        | undefined;
      if (!payload?.Success) {
        throw new Error(payload?.ErrorMessage || 'Failed to create provider domain authentication.');
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
      const gql = asGqlProvider(this.ProviderToUse);
      if (!gql) {
        throw new Error('GraphQL provider is not available.');
      }
      const mutation = `
        mutation VerifyCommsSendingDomain($DomainID: String!) {
          VerifyCommsSendingDomain(DomainID: $DomainID) {
            Success
            Verified
            Status
            ProviderDomainID
            DNSRecordsJSON
            ErrorMessage
          }
        }
      `;
      const res = await gql.ExecuteGQL(mutation, { DomainID: domain.ID });
      const payload = res['VerifyCommsSendingDomain'] as
        | { Success: boolean; Verified?: boolean; Status?: string; DNSRecordsJSON?: string; ErrorMessage?: string }
        | undefined;
      if (!payload) {
        throw new Error('No response from VerifyCommsSendingDomain.');
      }
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
