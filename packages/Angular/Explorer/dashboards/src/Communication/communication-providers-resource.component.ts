import { Component, OnInit, OnDestroy, ChangeDetectorRef } from '@angular/core';
import { ResourceData } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseResourceComponent, NavigationService } from '@memberjunction/ng-shared';
import { Metadata, RunView, CompositeKey } from '@memberjunction/core';

/**
 * Tree-shaking prevention function
 */
export function LoadCommunicationProvidersResource() {
    // Force inclusion in production builds
}

@RegisterClass(BaseResourceComponent, 'CommunicationProvidersResource')
@Component({
  standalone: false,
    selector: 'mj-communication-providers-resource',
    template: `
    <div class="providers-container">
        <header class="providers-header">
            <div class="title-area">
                <h1>Communication Providers</h1>
                <p>Manage your messaging integrations and services</p>
            </div>
            <div class="header-actions">
                <button class="add-btn" (click)="addNewProvider()">
                    <i class="fa-solid fa-plus"></i>
                    <span>Add Provider</span>
                </button>
            </div>
        </header>

        <div *ngIf="isLoading" class="loader-container">
            <div class="spinner"></div>
            <p>Loading providers...</p>
        </div>

        <div *ngIf="!isLoading" class="providers-grid">
            <div *ngFor="let provider of providers" class="provider-card" [class.disabled]="provider.Status === 'Disabled'">
                <div class="card-header">
                    <div class="provider-logo">
                        <i [class]="getProviderIcon(provider.Name)"></i>
                    </div>
                    <div class="status-badge" [class]="provider.Status.toLowerCase()">
                        {{provider.Status}}
                    </div>
                </div>
                <div class="card-body">
                    <h3>{{provider.Name}}</h3>
                    <p>{{provider.Description || 'No description provided.'}}</p>
                    
                    <div class="capabilities">
                        <span class="cap" [class.active]="provider.SupportsSending">
                            <i class="fa-solid fa-paper-plane"></i> Sending
                        </span>
                        <span class="cap" [class.active]="provider.SupportsReceiving">
                            <i class="fa-solid fa-inbox"></i> Receiving
                        </span>
                    </div>
                </div>
                <div class="card-footer">
                    <button class="config-btn" (click)="configureProvider(provider)">
                        <i class="fa-solid fa-gear"></i> Configure
                    </button>
                    <button class="view-logs-btn" (click)="viewProviderLogs(provider)">
                        Logs
                    </button>
                </div>
            </div>

            <div class="add-card" (click)="addNewProvider()">
                <i class="fa-solid fa-circle-plus"></i>
                <span>Connect New Service</span>
            </div>
        </div>
    </div>
  `,
    styles: [`
    .providers-container {
        padding: 32px;
        background-color: #f8fafc;
        min-height: 100%;
        font-family: 'Inter', system-ui, -apple-system, sans-serif;
    }
    .providers-header {
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
        margin-bottom: 32px;
    }
    .title-area h1 {
        margin: 0;
        font-size: 1.875rem;
        font-weight: 800;
        color: #0f172a;
    }
    .title-area p {
        margin: 4px 0 0;
        color: #64748b;
        font-size: 1rem;
    }
    .add-btn {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 12px 24px;
        background: #3b82f6;
        border: none;
        border-radius: 10px;
        color: white;
        font-weight: 600;
        cursor: pointer;
        transition: all 0.2s;
        box-shadow: 0 4px 6px -1px rgba(59, 130, 246, 0.2);
    }
    .add-btn:hover {
        background: #2563eb;
        transform: translateY(-1px);
        box-shadow: 0 10px 15px -3px rgba(59, 130, 246, 0.3);
    }

    .loader-container {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        padding: 100px 0;
        color: #64748b;
    }
    .spinner {
        width: 40px;
        height: 40px;
        border: 4px solid #e2e8f0;
        border-top-color: #3b82f6;
        border-radius: 50%;
        animation: spin 1s linear infinite;
        margin-bottom: 16px;
    }
    @keyframes spin {
        to { transform: rotate(360deg); }
    }

    .providers-grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
        gap: 24px;
    }
    .provider-card {
        background: white;
        border-radius: 20px;
        border: 1px solid #f1f5f9;
        padding: 24px;
        display: flex;
        flex-direction: column;
        transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
        box-shadow: 0 1px 3px rgba(0,0,0,0.05);
    }
    .provider-card:hover {
        transform: translateY(-4px);
        box-shadow: 0 20px 25px -5px rgba(0,0,0,0.1), 0 10px 10px -5px rgba(0,0,0,0.04);
    }
    .provider-card.disabled {
        opacity: 0.7;
        background: #fcfcfc;
    }

    .card-header {
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
        margin-bottom: 20px;
    }
    .provider-logo {
        width: 56px;
        height: 56px;
        background: #f8fafc;
        border-radius: 14px;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 1.75rem;
        color: #334155;
        border: 1px solid #f1f5f9;
    }
    .status-badge {
        font-size: 0.75rem;
        font-weight: 700;
        padding: 4px 12px;
        border-radius: 20px;
        text-transform: uppercase;
        letter-spacing: 0.025em;
    }
    .status-badge.active { background: #dcfce7; color: #166534; }
    .status-badge.disabled { background: #f1f5f9; color: #475569; }

    .card-body h3 {
        margin: 0 0 8px;
        font-size: 1.25rem;
        font-weight: 700;
        color: #0f172a;
    }
    .card-body p {
        margin: 0 0 20px;
        font-size: 0.9375rem;
        color: #64748b;
        line-height: 1.5;
        height: 45px;
        overflow: hidden;
        display: -webkit-box;
        -webkit-line-clamp: 2;
        -webkit-box-orient: vertical;
    }

    .capabilities {
        display: flex;
        gap: 12px;
        margin-bottom: 24px;
    }
    .cap {
        font-size: 0.75rem;
        font-weight: 600;
        color: #94a3b8;
        display: flex;
        align-items: center;
        gap: 6px;
    }
    .cap.active {
        color: #3b82f6;
    }

    .card-footer {
        display: flex;
        gap: 12px;
        margin-top: auto;
    }
    .config-btn {
        flex: 1;
        padding: 10px;
        background: #f8fafc;
        border: 1px solid #e2e8f0;
        border-radius: 8px;
        color: #475569;
        font-weight: 600;
        font-size: 0.875rem;
        cursor: pointer;
        transition: all 0.2s;
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 8px;
    }
    .config-btn:hover {
        background: #f1f5f9;
        border-color: #cbd5e1;
        color: #1e293b;
    }
    .view-logs-btn {
        padding: 10px 16px;
        background: transparent;
        border: 1px solid transparent;
        color: #64748b;
        font-weight: 600;
        font-size: 0.875rem;
        cursor: pointer;
    }
    .view-logs-btn:hover {
        color: #3b82f6;
    }

    .add-card {
        border: 2px dashed #e2e8f0;
        border-radius: 20px;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: 16px;
        color: #94a3b8;
        cursor: pointer;
        transition: all 0.2s;
        min-height: 240px;
    }
    .add-card:hover {
        border-color: #3b82f6;
        background: #eff6ff;
        color: #3b82f6;
    }
    .add-card i {
        font-size: 3rem;
    }
    .add-card span {
        font-weight: 600;
    }
  `]
})
export class CommunicationProvidersResourceComponent extends BaseResourceComponent implements OnInit, OnDestroy {
    public isLoading = false;
    public providers: any[] = [];

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
            const result = await rv.RunView({
                EntityName: 'Communication Providers',
                OrderBy: 'Name ASC',
                ResultType: 'entity_object'
            });

            if (result.Success) {
                this.providers = result.Results;
            }
        } catch (error) {
            console.error('Error loading providers:', error);
        } finally {
            this.isLoading = false;
            this.cdr.detectChanges();
        }
    }

    public getProviderIcon(name: string): string {
        const n = name.toLowerCase();
        if (n.includes('sendgrid')) return 'fa-solid fa-envelope';
        if (n.includes('twilio')) return 'fa-solid fa-comment-sms';
        if (n.includes('aws') || n.includes('ses')) return 'fa-brands fa-aws';
        if (n.includes('slack')) return 'fa-brands fa-slack';
        if (n.includes('teams')) return 'fa-solid fa-users-rectangle';
        return 'fa-solid fa-server';
    }

    public configureProvider(provider: any): void {
        const pk = new CompositeKey();
        pk.LoadFromEntityInfoAndRecord(new Metadata().Entities.find(e => e.Name === 'Communication Providers')!, provider);
        this.navService.OpenEntityRecord('Communication Providers', pk);
    }

    public viewProviderLogs(provider: any): void {
        // Navigate to logs with filter
        // For now just open the logs tab (this would need a more complex navigation or shared state)
        console.log('View logs for provider:', provider.Name);
    }

    public addNewProvider(): void {
        this.navService.OpenEntityRecord('Communication Providers', new CompositeKey());
    }

    async GetResourceDisplayName(data: ResourceData): Promise<string> {
        return 'Providers';
    }

    async GetResourceIconClass(data: ResourceData): Promise<string> {
        return 'fa-solid fa-server';
    }
}
