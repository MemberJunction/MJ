import { Component, OnInit, OnDestroy, ChangeDetectorRef, ChangeDetectionStrategy } from '@angular/core';
import { ResourceData, CredentialEntity, CredentialTypeEntity, CredentialCategoryEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseResourceComponent } from '@memberjunction/ng-shared';
import { RunView } from '@memberjunction/core';

export function LoadCredentialsOverviewResource() {
    // Prevents tree-shaking
}

interface CategoryGroup {
    category: string;
    count: number;
    iconClass: string;
}

interface RecentActivity {
    credentialName: string;
    typeName: string;
    action: string;
    date: Date;
}

@RegisterClass(BaseResourceComponent, 'CredentialsOverviewResource')
@Component({
    selector: 'mj-credentials-overview-resource',
    templateUrl: './credentials-overview-resource.component.html',
    styleUrls: ['./credentials-overview-resource.component.css'],
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class CredentialsOverviewResourceComponent extends BaseResourceComponent implements OnInit, OnDestroy {
    public isLoading = true;

    // Summary stats
    public totalCredentials = 0;
    public activeCredentials = 0;
    public credentialTypes = 0;
    public categories = 0;
    public expiringSoonCount = 0;

    // Grouped data
    public categoryGroups: CategoryGroup[] = [];
    public recentActivity: RecentActivity[] = [];

    // Raw data
    private credentials: CredentialEntity[] = [];
    private types: CredentialTypeEntity[] = [];

    constructor(private cdr: ChangeDetectorRef) {
        super();
    }

    ngOnInit(): void {
        this.loadData();
    }

    ngOnDestroy(): void {
        // Cleanup if needed
    }

    async GetResourceDisplayName(data: ResourceData): Promise<string> {
        return 'Overview';
    }

    async GetResourceIconClass(data: ResourceData): Promise<string> {
        return 'fa-solid fa-chart-pie';
    }

    private async loadData(): Promise<void> {
        try {
            this.isLoading = true;
            this.cdr.markForCheck();

            const rv = new RunView();

            // Load all data in parallel using RunViews
            const [credResult, typeResult, categoryResult] = await rv.RunViews([
                {
                    EntityName: 'MJ: Credentials',
                    ResultType: 'entity_object'
                },
                {
                    EntityName: 'MJ: Credential Types',
                    ResultType: 'entity_object'
                },
                {
                    EntityName: 'MJ: Credential Categories',
                    ResultType: 'entity_object'
                }
            ]);

            if (credResult.Success) {
                this.credentials = credResult.Results as CredentialEntity[];
                this.totalCredentials = this.credentials.length;
                this.activeCredentials = this.credentials.filter(c => c.IsActive).length;

                // Calculate expiring soon (within 30 days)
                const thirtyDaysFromNow = new Date();
                thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30);
                this.expiringSoonCount = this.credentials.filter(c =>
                    c.ExpiresAt && new Date(c.ExpiresAt) <= thirtyDaysFromNow && c.IsActive
                ).length;

                // Build recent activity from credentials
                this.recentActivity = this.credentials
                    .filter(c => c.__mj_UpdatedAt)
                    .sort((a, b) => new Date(b.__mj_UpdatedAt).getTime() - new Date(a.__mj_UpdatedAt).getTime())
                    .slice(0, 5)
                    .map(c => ({
                        credentialName: c.Name,
                        typeName: c.CredentialType || 'Unknown',
                        action: 'Updated',
                        date: new Date(c.__mj_UpdatedAt)
                    }));
            }

            if (typeResult.Success) {
                this.types = typeResult.Results as CredentialTypeEntity[];
                this.credentialTypes = this.types.length;

                // Build category groups from types
                const categoryMap = new Map<string, CategoryGroup>();
                for (const type of this.types) {
                    const existing = categoryMap.get(type.Category);
                    if (existing) {
                        existing.count++;
                    } else {
                        categoryMap.set(type.Category, {
                            category: type.Category,
                            count: 1,
                            iconClass: this.getCategoryIcon(type.Category)
                        });
                    }
                }
                this.categoryGroups = Array.from(categoryMap.values());
            }

            if (categoryResult.Success) {
                this.categories = (categoryResult.Results as CredentialCategoryEntity[]).length;
            }

        } catch (error) {
            console.error('Error loading credentials overview:', error);
        } finally {
            this.isLoading = false;
            this.NotifyLoadComplete();
            this.cdr.markForCheck();
        }
    }

    private getCategoryIcon(category: string): string {
        const iconMap: Record<string, string> = {
            'AI': 'fa-solid fa-brain',
            'Communication': 'fa-solid fa-envelope',
            'Storage': 'fa-solid fa-cloud',
            'Database': 'fa-solid fa-database',
            'Authentication': 'fa-solid fa-shield-halved',
            'Integration': 'fa-solid fa-plug'
        };
        return iconMap[category] || 'fa-solid fa-key';
    }

    public formatDate(date: Date): string {
        return date.toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    }
}
