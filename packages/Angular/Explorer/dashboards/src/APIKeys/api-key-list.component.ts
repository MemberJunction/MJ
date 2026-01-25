import { Component, EventEmitter, Input, OnChanges, OnInit, Output, SimpleChanges } from '@angular/core';
import { RunView } from '@memberjunction/core';
import { APIKeyEntity } from '@memberjunction/core-entities';

/** Filter options for the list */
export type APIKeyFilter = 'all' | 'active' | 'revoked' | 'expiring' | 'expired' | 'never-used';

/** Tree shaking prevention function */
export function LoadAPIKeyList(): void {
    // This function prevents tree shaking
}

/**
 * List view component for displaying and filtering API keys
 */
@Component({
    selector: 'mj-api-key-list',
    templateUrl: './api-key-list.component.html',
    styleUrls: ['./api-key-list.component.css']
})
export class APIKeyListComponent implements OnInit, OnChanges {
    @Input() Filter: APIKeyFilter = 'all';
    @Output() KeySelected = new EventEmitter<APIKeyEntity>();
    @Output() CreateRequested = new EventEmitter<void>();

    // Expose Math for template
    public Math = Math;

    // Data
    public AllKeys: APIKeyEntity[] = [];
    public FilteredKeys: APIKeyEntity[] = [];
    public IsLoading = true;

    // Search
    public SearchText = '';

    // Sorting
    public SortField: 'Label' | 'Status' | 'User' | 'LastUsedAt' | 'ExpiresAt' | '__mj_CreatedAt' = '__mj_CreatedAt';
    public SortDirection: 'asc' | 'desc' = 'desc';

    // Pagination
    public PageSize = 20;
    public CurrentPage = 1;

    // Statistics
    public Stats = {
        total: 0,
        active: 0,
        revoked: 0,
        expiring: 0,
        expired: 0,
        neverUsed: 0
    };

    async ngOnInit(): Promise<void> {
        await this.loadKeys();
    }

    async ngOnChanges(changes: SimpleChanges): Promise<void> {
        if (changes['Filter'] && !changes['Filter'].firstChange) {
            this.applyFilters();
        }
    }

    /**
     * Load all API keys
     */
    public async loadKeys(): Promise<void> {
        this.IsLoading = true;
        try {
            const rv = new RunView();
            const result = await rv.RunView<APIKeyEntity>({
                EntityName: 'MJ: API Keys',
                OrderBy: '__mj_CreatedAt DESC',
                ResultType: 'entity_object'
            });

            if (result.Success) {
                this.AllKeys = result.Results;
                this.calculateStats();
                this.applyFilters();
            }
        } catch (error) {
            console.error('Error loading API keys:', error);
        } finally {
            this.IsLoading = false;
        }
    }

    /**
     * Calculate statistics
     */
    private calculateStats(): void {
        const now = new Date();
        const thirtyDaysFromNow = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

        this.Stats = {
            total: this.AllKeys.length,
            active: this.AllKeys.filter(k => k.Status === 'Active').length,
            revoked: this.AllKeys.filter(k => k.Status === 'Revoked').length,
            expiring: this.AllKeys.filter(k =>
                k.Status === 'Active' &&
                k.ExpiresAt &&
                new Date(k.ExpiresAt) > now &&
                new Date(k.ExpiresAt) < thirtyDaysFromNow
            ).length,
            expired: this.AllKeys.filter(k =>
                k.ExpiresAt && new Date(k.ExpiresAt) < now
            ).length,
            neverUsed: this.AllKeys.filter(k =>
                k.Status === 'Active' && !k.LastUsedAt
            ).length
        };
    }

    /**
     * Apply filters and sorting
     */
    public applyFilters(): void {
        const now = new Date();
        const thirtyDaysFromNow = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

        let filtered = [...this.AllKeys];

        // Apply status filter
        switch (this.Filter) {
            case 'active':
                filtered = filtered.filter(k => k.Status === 'Active');
                break;
            case 'revoked':
                filtered = filtered.filter(k => k.Status === 'Revoked');
                break;
            case 'expiring':
                filtered = filtered.filter(k =>
                    k.Status === 'Active' &&
                    k.ExpiresAt &&
                    new Date(k.ExpiresAt) > now &&
                    new Date(k.ExpiresAt) < thirtyDaysFromNow
                );
                break;
            case 'expired':
                filtered = filtered.filter(k =>
                    k.ExpiresAt && new Date(k.ExpiresAt) < now
                );
                break;
            case 'never-used':
                filtered = filtered.filter(k =>
                    k.Status === 'Active' && !k.LastUsedAt
                );
                break;
        }

        // Apply search filter
        if (this.SearchText.trim()) {
            const search = this.SearchText.toLowerCase();
            filtered = filtered.filter(k =>
                k.Label.toLowerCase().includes(search) ||
                (k.Description && k.Description.toLowerCase().includes(search)) ||
                k.User.toLowerCase().includes(search) ||
                k.Hash.toLowerCase().includes(search)
            );
        }

        // Apply sorting
        filtered.sort((a, b) => {
            let aVal: string | number | Date | null = null;
            let bVal: string | number | Date | null = null;

            switch (this.SortField) {
                case 'Label':
                    aVal = a.Label.toLowerCase();
                    bVal = b.Label.toLowerCase();
                    break;
                case 'Status':
                    aVal = a.Status;
                    bVal = b.Status;
                    break;
                case 'User':
                    aVal = a.User.toLowerCase();
                    bVal = b.User.toLowerCase();
                    break;
                case 'LastUsedAt':
                    aVal = a.LastUsedAt ? new Date(a.LastUsedAt).getTime() : 0;
                    bVal = b.LastUsedAt ? new Date(b.LastUsedAt).getTime() : 0;
                    break;
                case 'ExpiresAt':
                    aVal = a.ExpiresAt ? new Date(a.ExpiresAt).getTime() : Number.MAX_SAFE_INTEGER;
                    bVal = b.ExpiresAt ? new Date(b.ExpiresAt).getTime() : Number.MAX_SAFE_INTEGER;
                    break;
                case '__mj_CreatedAt':
                    aVal = new Date(a.__mj_CreatedAt).getTime();
                    bVal = new Date(b.__mj_CreatedAt).getTime();
                    break;
            }

            if (aVal < bVal) return this.SortDirection === 'asc' ? -1 : 1;
            if (aVal > bVal) return this.SortDirection === 'asc' ? 1 : -1;
            return 0;
        });

        this.FilteredKeys = filtered;
        this.CurrentPage = 1;
    }

    /**
     * Handle search input
     */
    public onSearch(): void {
        this.applyFilters();
    }

    /**
     * Clear search
     */
    public clearSearch(): void {
        this.SearchText = '';
        this.applyFilters();
    }

    /**
     * Set filter
     */
    public setFilter(filter: APIKeyFilter): void {
        this.Filter = filter;
        this.applyFilters();
    }

    /**
     * Toggle sort
     */
    public toggleSort(field: typeof this.SortField): void {
        if (this.SortField === field) {
            this.SortDirection = this.SortDirection === 'asc' ? 'desc' : 'asc';
        } else {
            this.SortField = field;
            this.SortDirection = field === 'Label' ? 'asc' : 'desc';
        }
        this.applyFilters();
    }

    /**
     * Get sort icon class
     */
    public getSortIcon(field: typeof this.SortField): string {
        if (this.SortField !== field) return 'fa-solid fa-sort';
        return this.SortDirection === 'asc' ? 'fa-solid fa-sort-up' : 'fa-solid fa-sort-down';
    }

    /**
     * Get paginated keys
     */
    public getPaginatedKeys(): APIKeyEntity[] {
        const start = (this.CurrentPage - 1) * this.PageSize;
        return this.FilteredKeys.slice(start, start + this.PageSize);
    }

    /**
     * Get total pages
     */
    public getTotalPages(): number {
        return Math.ceil(this.FilteredKeys.length / this.PageSize);
    }

    /**
     * Go to page
     */
    public goToPage(page: number): void {
        if (page >= 1 && page <= this.getTotalPages()) {
            this.CurrentPage = page;
        }
    }

    /**
     * Get page numbers to display
     */
    public getPageNumbers(): number[] {
        const total = this.getTotalPages();
        const current = this.CurrentPage;
        const pages: number[] = [];

        if (total <= 7) {
            for (let i = 1; i <= total; i++) pages.push(i);
        } else {
            pages.push(1);
            if (current > 3) pages.push(-1); // ellipsis

            const start = Math.max(2, current - 1);
            const end = Math.min(total - 1, current + 1);

            for (let i = start; i <= end; i++) pages.push(i);

            if (current < total - 2) pages.push(-1); // ellipsis
            pages.push(total);
        }

        return pages;
    }

    /**
     * Select a key
     */
    public selectKey(key: APIKeyEntity): void {
        this.KeySelected.emit(key);
    }

    /**
     * Request key creation
     */
    public requestCreate(): void {
        this.CreateRequested.emit();
    }

    /**
     * Format date for display
     */
    public formatDate(date: Date | null): string {
        if (!date) return 'Never';

        const now = new Date();
        const d = new Date(date);
        const diff = now.getTime() - d.getTime();
        const days = Math.floor(diff / 86400000);

        if (days === 0) {
            const hours = Math.floor(diff / 3600000);
            if (hours === 0) {
                const minutes = Math.floor(diff / 60000);
                return minutes < 1 ? 'Just now' : `${minutes}m ago`;
            }
            return `${hours}h ago`;
        }
        if (days === 1) return 'Yesterday';
        if (days < 7) return `${days} days ago`;

        return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    }

    /**
     * Format expiration for display
     */
    public formatExpiration(date: Date | null): string {
        if (!date) return 'Never';

        const now = new Date();
        const d = new Date(date);
        const diff = d.getTime() - now.getTime();

        if (diff < 0) return 'Expired';

        const days = Math.floor(diff / 86400000);
        if (days === 0) return 'Today';
        if (days === 1) return 'Tomorrow';
        if (days < 30) return `${days} days`;

        return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    }

    /**
     * Get expiration status class
     */
    public getExpirationClass(key: APIKeyEntity): string {
        if (!key.ExpiresAt) return 'never';

        const now = new Date();
        const expiresAt = new Date(key.ExpiresAt);
        const diff = expiresAt.getTime() - now.getTime();
        const days = Math.floor(diff / 86400000);

        if (diff < 0) return 'expired';
        if (days < 7) return 'critical';
        if (days < 30) return 'warning';
        return 'ok';
    }

    /**
     * Get filter count
     */
    public getFilterCount(filter: APIKeyFilter): number {
        switch (filter) {
            case 'all': return this.Stats.total;
            case 'active': return this.Stats.active;
            case 'revoked': return this.Stats.revoked;
            case 'expiring': return this.Stats.expiring;
            case 'expired': return this.Stats.expired;
            case 'never-used': return this.Stats.neverUsed;
        }
    }
}
