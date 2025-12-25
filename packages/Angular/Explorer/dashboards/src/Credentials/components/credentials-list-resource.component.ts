import { Component, OnInit, OnDestroy, ChangeDetectorRef, ChangeDetectionStrategy } from '@angular/core';
import { ResourceData, CredentialEntity, CredentialTypeEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseResourceComponent } from '@memberjunction/ng-shared';
import { RunView } from '@memberjunction/core';

export function LoadCredentialsListResource() {
    // Prevents tree-shaking
}

@RegisterClass(BaseResourceComponent, 'CredentialsListResource')
@Component({
    selector: 'mj-credentials-list-resource',
    templateUrl: './credentials-list-resource.component.html',
    styleUrls: ['./credentials-list-resource.component.css'],
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class CredentialsListResourceComponent extends BaseResourceComponent implements OnInit, OnDestroy {
    public isLoading = true;
    public credentials: CredentialEntity[] = [];
    public filteredCredentials: CredentialEntity[] = [];
    public types: CredentialTypeEntity[] = [];

    public searchText = '';
    public selectedTypeFilter = '';
    public showActiveOnly = true;

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
        return 'Credentials';
    }

    async GetResourceIconClass(data: ResourceData): Promise<string> {
        return 'fa-solid fa-key';
    }

    private async loadData(): Promise<void> {
        try {
            this.isLoading = true;
            this.cdr.markForCheck();

            const rv = new RunView();

            const [credResult, typeResult] = await rv.RunViews([
                {
                    EntityName: 'MJ: Credentials',
                    OrderBy: '__mj_UpdatedAt DESC',
                    ResultType: 'entity_object'
                },
                {
                    EntityName: 'MJ: Credential Types',
                    OrderBy: 'Name',
                    ResultType: 'entity_object'
                }
            ]);

            if (credResult.Success) {
                this.credentials = credResult.Results as CredentialEntity[];
            }

            if (typeResult.Success) {
                this.types = typeResult.Results as CredentialTypeEntity[];
            }

            this.applyFilters();

        } catch (error) {
            console.error('Error loading credentials:', error);
        } finally {
            this.isLoading = false;
            this.NotifyLoadComplete();
            this.cdr.markForCheck();
        }
    }

    public onSearchChange(value: string): void {
        this.searchText = value;
        this.applyFilters();
    }

    public onTypeFilterChange(typeId: string): void {
        this.selectedTypeFilter = typeId;
        this.applyFilters();
    }

    public onActiveFilterChange(showActive: boolean): void {
        this.showActiveOnly = showActive;
        this.applyFilters();
    }

    private applyFilters(): void {
        let filtered = [...this.credentials];

        // Filter by active status
        if (this.showActiveOnly) {
            filtered = filtered.filter(c => c.IsActive);
        }

        // Filter by type
        if (this.selectedTypeFilter) {
            filtered = filtered.filter(c => c.CredentialTypeID === this.selectedTypeFilter);
        }

        // Filter by search text
        if (this.searchText.trim()) {
            const search = this.searchText.toLowerCase().trim();
            filtered = filtered.filter(c =>
                c.Name.toLowerCase().includes(search) ||
                (c.Description && c.Description.toLowerCase().includes(search)) ||
                (c.CredentialType && c.CredentialType.toLowerCase().includes(search))
            );
        }

        this.filteredCredentials = filtered;
        this.cdr.markForCheck();
    }

    public getTypeById(typeId: string): CredentialTypeEntity | undefined {
        return this.types.find(t => t.ID === typeId);
    }

    public getStatusClass(credential: CredentialEntity): string {
        if (!credential.IsActive) {
            return 'inactive';
        }
        if (credential.ExpiresAt) {
            const expiresAt = new Date(credential.ExpiresAt);
            const now = new Date();
            const thirtyDays = 30 * 24 * 60 * 60 * 1000;
            if (expiresAt < now) {
                return 'expired';
            }
            if (expiresAt.getTime() - now.getTime() < thirtyDays) {
                return 'expiring';
            }
        }
        return 'active';
    }

    public getStatusLabel(credential: CredentialEntity): string {
        const statusClass = this.getStatusClass(credential);
        const labels: Record<string, string> = {
            'active': 'Active',
            'inactive': 'Inactive',
            'expired': 'Expired',
            'expiring': 'Expiring Soon'
        };
        return labels[statusClass] || 'Unknown';
    }

    public formatDate(date: Date | null | undefined): string {
        if (!date) return 'Never';
        return new Date(date).toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric'
        });
    }

    public refresh(): void {
        this.loadData();
    }
}
