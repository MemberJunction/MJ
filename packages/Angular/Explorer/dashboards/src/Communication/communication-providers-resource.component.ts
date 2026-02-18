import { Component, OnInit, OnDestroy, ChangeDetectorRef } from '@angular/core';
import { ResourceData, MJCommunicationProviderEntity, MJCommunicationLogEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseResourceComponent, NavigationService } from '@memberjunction/ng-shared';
import { Metadata, RunView, CompositeKey } from '@memberjunction/core';

interface ProviderCardData {
    Entity: MJCommunicationProviderEntity;
    SentCount: number;
    SuccessRate: number;
    FailedCount: number;
    IconClass: string;
    LogoClass: string;
}
@RegisterClass(BaseResourceComponent, 'CommunicationProvidersResource')
@Component({
  standalone: false,
    selector: 'mj-communication-providers-resource',
    template: `
    <div class="providers-wrapper">
      <div class="providers-header">
        <div>
          <h2>Communication Providers</h2>
          <p>Manage your messaging service integrations</p>
        </div>
        <button class="tb-btn primary" (click)="addNewProvider()">
          <i class="fa-solid fa-plus"></i> Add Provider
        </button>
      </div>
    
      @if (isLoading) {
        <div class="loading-state">
          <mj-loading text="Loading providers..."></mj-loading>
        </div>
      }
    
      @if (!isLoading) {
        <div class="providers-grid">
          @for (card of providerCards; track card) {
            <div class="provider-card" [class.disabled]="card.Entity.Status === 'Disabled'">
              <div class="provider-card-header">
                <div class="provider-card-logo" [ngClass]="card.LogoClass">
                  <i [class]="card.IconClass"></i>
                </div>
                <div class="provider-card-title">
                  <div class="provider-card-name">{{card.Entity.Name}}</div>
                  <div class="provider-card-desc">{{card.Entity.Description || 'No description'}}</div>
                </div>
                <span class="provider-card-status" [ngClass]="card.Entity.Status.toLowerCase()">
                  {{card.Entity.Status}}
                </span>
              </div>
              <div class="provider-card-body">
                <div class="provider-capabilities">
                  <span class="capability-chip" [class.supported]="card.Entity.SupportsSending" [class.unsupported]="!card.Entity.SupportsSending">
                    <i [class]="card.Entity.SupportsSending ? 'fa-solid fa-check' : 'fa-solid fa-xmark'"></i> Sending
                  </span>
                  <span class="capability-chip" [class.supported]="card.Entity.SupportsReceiving" [class.unsupported]="!card.Entity.SupportsReceiving">
                    <i [class]="card.Entity.SupportsReceiving ? 'fa-solid fa-check' : 'fa-solid fa-xmark'"></i> Receiving
                  </span>
                  @if (card.Entity.SupportsScheduledSending) {
                    <span class="capability-chip supported">
                      <i class="fa-solid fa-check"></i> Scheduled
                    </span>
                  }
                  @if (card.Entity.SupportsDrafts) {
                    <span class="capability-chip supported">
                      <i class="fa-solid fa-check"></i> Drafts
                    </span>
                  }
                  @if (card.Entity.SupportsForwarding) {
                    <span class="capability-chip supported">
                      <i class="fa-solid fa-check"></i> Forward
                    </span>
                  }
                  @if (card.Entity.SupportsReplying) {
                    <span class="capability-chip supported">
                      <i class="fa-solid fa-check"></i> Reply
                    </span>
                  }
                </div>
                <div class="provider-card-stats">
                  <div class="provider-stat">
                    <div class="provider-stat-value">{{card.SentCount}}</div>
                    <div class="provider-stat-label">Sent (24h)</div>
                  </div>
                  <div class="provider-stat">
                    <div class="provider-stat-value">{{card.SuccessRate}}%</div>
                    <div class="provider-stat-label">Success</div>
                  </div>
                  <div class="provider-stat">
                    <div class="provider-stat-value">{{card.FailedCount}}</div>
                    <div class="provider-stat-label">Failed</div>
                  </div>
                </div>
              </div>
              <div class="provider-card-footer">
                <button (click)="configureProvider(card.Entity)">
                  <i class="fa-solid fa-gear"></i> Configure
                </button>
                <button (click)="viewProviderLogs(card.Entity)">
                  <i class="fa-solid fa-chart-line"></i> Analytics
                </button>
              </div>
            </div>
          }
        </div>
      }
    </div>
    `,
    styles: [`
    .providers-wrapper {
        height: 100%;
        padding: 24px;
        overflow-y: auto;
        background: var(--mat-sys-surface-container);
    }
    .providers-header {
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
        margin-bottom: 20px;
    }
    .providers-header h2 {
        margin: 0;
        font-size: 18px;
        font-weight: 800;
        color: var(--mat-sys-on-surface);
    }
    .providers-header p {
        margin: 4px 0 0;
        font-size: 13px;
        color: var(--mat-sys-on-surface-variant);
    }

    .tb-btn {
        display: inline-flex; align-items: center;
        gap: 6px; padding: 8px 16px;
        border: 1px solid var(--mat-sys-outline-variant);
        border-radius: var(--mat-sys-corner-extra-small, 4px);
        background: var(--mat-sys-surface-container-lowest);
        color: var(--mat-sys-on-surface-variant);
        font-size: 12px; font-weight: 600;
        cursor: pointer; transition: all 0.15s ease;
        font-family: inherit;
    }
    .tb-btn.primary {
        background: var(--mat-sys-primary);
        color: var(--mat-sys-on-primary, #fff);
        border-color: var(--mat-sys-primary);
    }
    .tb-btn.primary:hover { filter: brightness(1.1); }

    .loading-state {
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 80px 0;
    }

    /* GRID */
    .providers-grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(340px, 1fr));
        gap: 16px;
    }
    .provider-card {
        background: var(--mat-sys-surface-container-lowest);
        border: 1px solid var(--mat-sys-outline-variant);
        border-radius: var(--mat-sys-corner-medium, 12px);
        overflow: hidden;
        transition: all 0.15s ease;
    }
    .provider-card:hover {
        box-shadow: 0 2px 6px 2px rgba(0,0,0,.08), 0 1px 2px rgba(0,0,0,.04);
        border-color: var(--mat-sys-outline);
    }
    .provider-card.disabled { opacity: 0.65; }

    .provider-card-header {
        display: flex;
        align-items: center;
        gap: 14px;
        padding: 20px 20px 16px;
    }
    .provider-card-logo {
        width: 48px; height: 48px;
        border-radius: var(--mat-sys-corner-medium, 12px);
        display: flex; align-items: center; justify-content: center;
        font-size: 22px; flex-shrink: 0;
        background: var(--mat-sys-surface-container);
    }
    .provider-card-logo.sendgrid { background: #E8F4FD; color: #1A82E2; }
    .provider-card-logo.twilio { background: #FEECEE; color: #F22F46; }
    .provider-card-logo.gmail { background: #FEECED; color: #EA4335; }
    .provider-card-logo.msgraph { background: #E6F0FA; color: #0078D4; }

    .provider-card-title { flex: 1; min-width: 0; }
    .provider-card-name {
        font-size: 15px; font-weight: 700;
        color: var(--mat-sys-on-surface);
        white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
    }
    .provider-card-desc {
        font-size: 12px;
        color: var(--mat-sys-on-surface-variant);
        margin-top: 2px;
    }
    .provider-card-status {
        font-size: 10px; font-weight: 700;
        text-transform: uppercase; letter-spacing: 0.5px;
        padding: 3px 10px; border-radius: 10px;
        flex-shrink: 0;
    }
    .provider-card-status.active { background: #d4f8e0; color: #1b873f; }
    .provider-card-status.disabled { background: var(--mat-sys-surface-container-high); color: var(--mat-sys-on-surface-variant); }

    .provider-card-body { padding: 0 20px 16px; }

    .provider-capabilities {
        display: flex; flex-wrap: wrap;
        gap: 6px; margin-bottom: 16px;
    }
    .capability-chip {
        display: inline-flex; align-items: center;
        gap: 4px; padding: 4px 10px;
        border-radius: 12px; font-size: 11px; font-weight: 500;
    }
    .capability-chip.supported { background: #d4f8e0; color: #1b873f; }
    .capability-chip.unsupported {
        background: var(--mat-sys-surface-container);
        color: var(--mat-sys-outline);
        text-decoration: line-through;
    }

    .provider-card-stats {
        display: grid;
        grid-template-columns: repeat(3, 1fr);
        gap: 12px; padding: 12px;
        background: var(--mat-sys-surface-container-low);
        border-radius: var(--mat-sys-corner-small, 8px);
    }
    .provider-stat { text-align: center; }
    .provider-stat-value {
        font-size: 16px; font-weight: 800;
        color: var(--mat-sys-on-surface);
    }
    .provider-stat-label {
        font-size: 10px;
        color: var(--mat-sys-on-surface-variant);
        text-transform: uppercase; letter-spacing: 0.3px;
    }

    .provider-card-footer {
        display: flex;
        border-top: 1px solid var(--mat-sys-outline-variant);
    }
    .provider-card-footer button {
        flex: 1; padding: 12px;
        border: none; background: transparent;
        font-size: 12px; font-weight: 600;
        color: var(--mat-sys-primary);
        cursor: pointer; transition: background 0.15s;
        font-family: inherit;
        display: flex; align-items: center;
        justify-content: center; gap: 6px;
    }
    .provider-card-footer button:hover {
        background: var(--mat-sys-surface-container-low);
    }
    .provider-card-footer button + button {
        border-left: 1px solid var(--mat-sys-outline-variant);
    }
  `]
})
export class CommunicationProvidersResourceComponent extends BaseResourceComponent implements OnInit, OnDestroy {
    public isLoading = false;
    public providerCards: ProviderCardData[] = [];

    constructor(private cdr: ChangeDetectorRef, private navService: NavigationService) {
        super();
    }

    async ngOnInit(): Promise<void> {
        await this.loadData();
        this.NotifyLoadComplete();
    }

    ngOnDestroy(): void { }

    public async loadData(): Promise<void> {
        try {
            this.isLoading = true;
            this.cdr.detectChanges();

            const rv = new RunView();
            const yesterday = new Date();
            yesterday.setDate(yesterday.getDate() - 1);
            const yesterdayIso = yesterday.toISOString();

            const [providersResult, logsResult] = await Promise.all([
                rv.RunView<MJCommunicationProviderEntity>({
                    EntityName: 'MJ: Communication Providers',
                    OrderBy: 'Name ASC',
                    ResultType: 'entity_object'
                }),
                rv.RunView<MJCommunicationLogEntity>({
                    EntityName: 'MJ: Communication Logs',
                    ExtraFilter: `MessageDate >= '${yesterdayIso}'`,
                    ResultType: 'entity_object'
                })
            ]);

            if (providersResult.Success) {
                const logs = logsResult.Success ? logsResult.Results : [];
                this.providerCards = providersResult.Results.map(p => this.buildProviderCard(p, logs));
            }
        } catch (error) {
            console.error('Error loading providers:', error);
        } finally {
            this.isLoading = false;
            this.cdr.detectChanges();
        }
    }

    private buildProviderCard(provider: MJCommunicationProviderEntity, logs: MJCommunicationLogEntity[]): ProviderCardData {
        const providerLogs = logs.filter(l => l.CommunicationProvider === provider.Name);
        const sent = providerLogs.length;
        const failed = providerLogs.filter(l => l.Status === 'Failed').length;
        const rate = sent > 0 ? parseFloat(((sent - failed) / sent * 100).toFixed(1)) : 100;

        return {
            Entity: provider,
            SentCount: sent,
            SuccessRate: rate,
            FailedCount: failed,
            IconClass: this.getProviderIcon(provider.Name),
            LogoClass: this.getProviderLogoClass(provider.Name)
        };
    }

    private getProviderIcon(name: string): string {
        const n = name.toLowerCase();
        if (n.includes('sendgrid')) return 'fa-solid fa-envelope';
        if (n.includes('twilio')) return 'fa-solid fa-comment-sms';
        if (n.includes('gmail') || n.includes('google')) return 'fa-brands fa-google';
        if (n.includes('microsoft') || n.includes('graph') || n.includes('outlook')) return 'fa-brands fa-microsoft';
        if (n.includes('aws') || n.includes('ses')) return 'fa-brands fa-aws';
        if (n.includes('slack')) return 'fa-brands fa-slack';
        return 'fa-solid fa-server';
    }

    private getProviderLogoClass(name: string): string {
        const n = name.toLowerCase();
        if (n.includes('sendgrid')) return 'sendgrid';
        if (n.includes('twilio')) return 'twilio';
        if (n.includes('gmail') || n.includes('google')) return 'gmail';
        if (n.includes('microsoft') || n.includes('graph') || n.includes('outlook')) return 'msgraph';
        return '';
    }

    public configureProvider(provider: MJCommunicationProviderEntity): void {
        const pk = new CompositeKey();
        pk.LoadFromEntityInfoAndRecord(new Metadata().Entities.find(e => e.Name === 'MJ: Communication Providers')!, provider);
        this.navService.OpenEntityRecord('MJ: Communication Providers', pk);
    }

    public viewProviderLogs(provider: MJCommunicationProviderEntity): void {
        console.log('View analytics for provider:', provider.Name);
    }

    public addNewProvider(): void {
        this.navService.OpenEntityRecord('MJ: Communication Providers', new CompositeKey());
    }

    async GetResourceDisplayName(data: ResourceData): Promise<string> {
        return 'Providers';
    }

    async GetResourceIconClass(data: ResourceData): Promise<string> {
        return 'fa-solid fa-server';
    }
}
