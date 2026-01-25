import { Component, OnDestroy } from '@angular/core';
import { BaseResourceComponent } from '@memberjunction/ng-shared-generic';
import { RegisterClass } from '@memberjunction/global';
import { Metadata, RunView } from '@memberjunction/core';
import { APIKeyEntity, APIScopeEntity, APIKeyUsageLogEntity } from '@memberjunction/core-entities';
import { Subject } from 'rxjs';

/** Activity types for recent activity display */
type ActivityAction = 'Created' | 'Updated' | 'Revoked' | 'Used' | 'Extended';

/** Interface for recent activity items */
interface ActivityItem {
    keyLabel: string;
    action: ActivityAction;
    user: string;
    date: Date;
    keyId: string;
}

/** Interface for scope statistics */
interface ScopeStat {
    category: string;
    count: number;
    percentage: number;
    color: string;
    iconClass: string;
}

/** Tree shaking prevention function */
export function LoadAPIKeysResource(): void {
    // This function prevents tree shaking
}

/**
 * API Keys Resource Component
 * Provides management interface for MJ API Keys including:
 * - Overview statistics and health monitoring
 * - Key listing with status filters
 * - Key creation and revocation
 * - Usage tracking and analytics
 */
@RegisterClass(BaseResourceComponent, 'APIKeysResource')
@Component({
    selector: 'mj-api-keys-resource',
    templateUrl: './api-keys-resource.component.html',
    styleUrls: ['./api-keys-resource.component.css']
})
export class APIKeysResourceComponent extends BaseResourceComponent implements OnDestroy {
    private destroy$ = new Subject<void>();
    private md = new Metadata();

    // Loading states
    public IsLoading = true;

    // Statistics
    public TotalKeys = 0;
    public ActiveKeys = 0;
    public RevokedKeys = 0;
    public ExpiringSoonCount = 0;
    public ExpiredKeys = 0;
    public NeverUsedKeys = 0;

    // Data collections
    public APIKeys: APIKeyEntity[] = [];
    public RecentActivity: ActivityItem[] = [];
    public ScopeStats: ScopeStat[] = [];
    public TopUsedKeys: APIKeyEntity[] = [];

    // Scope category colors
    private readonly categoryColors: Record<string, string> = {
        'Entities': '#6366f1',
        'Agents': '#10b981',
        'Admin': '#f59e0b',
        'Actions': '#8b5cf6',
        'Queries': '#3b82f6',
        'Reports': '#ef4444',
        'Communication': '#ec4899',
        'Other': '#6b7280'
    };

    private readonly categoryIcons: Record<string, string> = {
        'Entities': 'fa-solid fa-database',
        'Agents': 'fa-solid fa-robot',
        'Admin': 'fa-solid fa-shield-halved',
        'Actions': 'fa-solid fa-bolt',
        'Queries': 'fa-solid fa-magnifying-glass',
        'Reports': 'fa-solid fa-chart-bar',
        'Communication': 'fa-solid fa-envelope',
        'Other': 'fa-solid fa-ellipsis'
    };

    // User permissions
    public UserCanCreateKeys = false;
    public UserCanRevokeKeys = false;

    constructor() {
        super();
    }

    ngOnDestroy(): void {
        this.destroy$.next();
        this.destroy$.complete();
    }

    override async AfterResourceLoaded(): Promise<void> {
        await this.loadData();
    }

    /**
     * Load all dashboard data
     */
    public async loadData(): Promise<void> {
        this.IsLoading = true;
        try {
            await Promise.all([
                this.loadAPIKeys(),
                this.loadScopeStats(),
                this.loadRecentActivity(),
                this.checkPermissions()
            ]);
            this.calculateStatistics();
        } catch (error) {
            console.error('Error loading API Keys dashboard data:', error);
        } finally {
            this.IsLoading = false;
        }
    }

    /**
     * Load all API keys
     */
    private async loadAPIKeys(): Promise<void> {
        const rv = new RunView();
        const result = await rv.RunView<APIKeyEntity>({
            EntityName: 'MJ: API Keys',
            OrderBy: '__mj_CreatedAt DESC',
            ResultType: 'entity_object'
        });
        if (result.Success) {
            this.APIKeys = result.Results;
        }
    }

    /**
     * Load scope statistics by category
     */
    private async loadScopeStats(): Promise<void> {
        const rv = new RunView();
        const result = await rv.RunView<APIScopeEntity>({
            EntityName: 'MJ: API Scopes',
            OrderBy: 'Category, Name',
            ResultType: 'entity_object'
        });

        if (result.Success) {
            const categoryMap = new Map<string, number>();
            for (const scope of result.Results) {
                const category = scope.Category || 'Other';
                categoryMap.set(category, (categoryMap.get(category) || 0) + 1);
            }

            const total = result.Results.length;
            this.ScopeStats = Array.from(categoryMap.entries()).map(([category, count]) => ({
                category,
                count,
                percentage: total > 0 ? Math.round((count / total) * 100) : 0,
                color: this.categoryColors[category] || this.categoryColors['Other'],
                iconClass: this.categoryIcons[category] || this.categoryIcons['Other']
            }));
        }
    }

    /**
     * Load recent activity from usage logs and key changes
     */
    private async loadRecentActivity(): Promise<void> {
        const rv = new RunView();

        // Load usage logs
        const usageResult = await rv.RunView<APIKeyUsageLogEntity>({
            EntityName: 'MJ: API Key Usage Logs',
            OrderBy: 'RequestTimestamp DESC',
            MaxRows: 20,
            ResultType: 'entity_object'
        });

        const activities: ActivityItem[] = [];

        if (usageResult.Success) {
            for (const log of usageResult.Results.slice(0, 10)) {
                activities.push({
                    keyLabel: log.APIKey || 'Unknown Key',
                    action: 'Used',
                    user: log.APIKey || 'System',
                    date: log.RequestTimestamp,
                    keyId: log.APIKeyID
                });
            }
        }

        // Add key creation/update activities from keys
        for (const key of this.APIKeys.slice(0, 10)) {
            if (key.Status === 'Revoked') {
                activities.push({
                    keyLabel: key.Label,
                    action: 'Revoked',
                    user: key.User,
                    date: key.__mj_UpdatedAt,
                    keyId: key.ID
                });
            } else {
                activities.push({
                    keyLabel: key.Label,
                    action: 'Created',
                    user: key.CreatedByUser,
                    date: key.__mj_CreatedAt,
                    keyId: key.ID
                });
            }
        }

        // Sort by date and take top 10
        this.RecentActivity = activities
            .sort((a, b) => b.date.getTime() - a.date.getTime())
            .slice(0, 10);
    }

    /**
     * Check user permissions
     */
    private async checkPermissions(): Promise<void> {
        // Check if user can create/manage API keys
        const entityInfo = this.md.Entities.find(e => e.Name === 'MJ: API Keys');
        if (entityInfo) {
            const permissions = entityInfo.GetUserPermissions(this.md.CurrentUser);
            this.UserCanCreateKeys = permissions.CanCreate;
            this.UserCanRevokeKeys = permissions.CanUpdate;
        }
    }

    /**
     * Calculate dashboard statistics from loaded data
     */
    private calculateStatistics(): void {
        const now = new Date();
        const thirtyDaysFromNow = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

        this.TotalKeys = this.APIKeys.length;
        this.ActiveKeys = this.APIKeys.filter(k => k.Status === 'Active').length;
        this.RevokedKeys = this.APIKeys.filter(k => k.Status === 'Revoked').length;

        this.ExpiredKeys = this.APIKeys.filter(k =>
            k.ExpiresAt && new Date(k.ExpiresAt) < now
        ).length;

        this.ExpiringSoonCount = this.APIKeys.filter(k =>
            k.Status === 'Active' &&
            k.ExpiresAt &&
            new Date(k.ExpiresAt) > now &&
            new Date(k.ExpiresAt) < thirtyDaysFromNow
        ).length;

        this.NeverUsedKeys = this.APIKeys.filter(k =>
            k.Status === 'Active' && !k.LastUsedAt
        ).length;

        // Get top used keys (most recently used active keys)
        this.TopUsedKeys = this.APIKeys
            .filter(k => k.Status === 'Active' && k.LastUsedAt)
            .sort((a, b) => {
                const aDate = a.LastUsedAt ? new Date(a.LastUsedAt).getTime() : 0;
                const bDate = b.LastUsedAt ? new Date(b.LastUsedAt).getTime() : 0;
                return bDate - aDate;
            })
            .slice(0, 5);
    }

    /**
     * Refresh all data
     */
    public async refresh(): Promise<void> {
        await this.loadData();
    }

    /**
     * Get health score (0-100) based on key status
     */
    public getHealthScore(): number {
        if (this.TotalKeys === 0) return 100;

        let score = 100;

        // Deduct for expired keys
        score -= (this.ExpiredKeys / this.TotalKeys) * 40;

        // Deduct for expiring soon
        score -= (this.ExpiringSoonCount / this.TotalKeys) * 20;

        // Deduct for never used active keys (might be leaked)
        score -= (this.NeverUsedKeys / this.TotalKeys) * 10;

        // Deduct if too many active keys
        if (this.ActiveKeys > 20) {
            score -= Math.min(15, (this.ActiveKeys - 20) * 0.5);
        }

        return Math.max(0, Math.round(score));
    }

    /**
     * Get health label based on score
     */
    public getHealthLabel(): string {
        const score = this.getHealthScore();
        if (score >= 90) return 'Excellent Security';
        if (score >= 75) return 'Good Security';
        if (score >= 50) return 'Needs Attention';
        return 'Critical Issues';
    }

    /**
     * Get CSS class for health banner
     */
    public getHealthClass(): string {
        const score = this.getHealthScore();
        if (score >= 75) return '';
        if (score >= 50) return 'health-warning';
        return 'health-critical';
    }

    /**
     * Get donut chart offset for segment
     */
    public getDonutOffset(index: number): number {
        let offset = 0;
        for (let i = 0; i < index; i++) {
            offset -= this.ScopeStats[i].percentage * 2.51;
        }
        return offset;
    }

    /**
     * Get activity icon based on action
     */
    public getActionIcon(action: ActivityAction): string {
        switch (action) {
            case 'Created': return 'fa-solid fa-plus';
            case 'Updated': return 'fa-solid fa-pencil';
            case 'Revoked': return 'fa-solid fa-ban';
            case 'Used': return 'fa-solid fa-arrow-right-to-bracket';
            case 'Extended': return 'fa-solid fa-clock-rotate-left';
            default: return 'fa-solid fa-circle';
        }
    }

    /**
     * Get CSS class for activity action
     */
    public getActionClass(action: ActivityAction): string {
        switch (action) {
            case 'Created': return 'action-created';
            case 'Updated': return 'action-updated';
            case 'Revoked': return 'action-revoked';
            case 'Used': return 'action-used';
            case 'Extended': return 'action-extended';
            default: return '';
        }
    }

    /**
     * Format date for display
     */
    public formatDate(date: Date): string {
        if (!date) return 'Never';

        const now = new Date();
        const diff = now.getTime() - new Date(date).getTime();
        const minutes = Math.floor(diff / 60000);
        const hours = Math.floor(diff / 3600000);
        const days = Math.floor(diff / 86400000);

        if (minutes < 1) return 'Just now';
        if (minutes < 60) return `${minutes}m ago`;
        if (hours < 24) return `${hours}h ago`;
        if (days < 7) return `${days}d ago`;

        return new Date(date).toLocaleDateString();
    }

    /**
     * Format expiration for display
     */
    public formatExpiration(date: Date | null): string {
        if (!date) return 'Never expires';

        const now = new Date();
        const expiresAt = new Date(date);
        const diff = expiresAt.getTime() - now.getTime();

        if (diff < 0) return 'Expired';

        const days = Math.floor(diff / 86400000);
        if (days === 0) return 'Expires today';
        if (days === 1) return 'Expires tomorrow';
        if (days < 30) return `Expires in ${days} days`;

        return `Expires ${expiresAt.toLocaleDateString()}`;
    }

    /**
     * Get expiration status class
     */
    public getExpirationClass(key: APIKeyEntity): string {
        if (!key.ExpiresAt) return '';

        const now = new Date();
        const expiresAt = new Date(key.ExpiresAt);
        const diff = expiresAt.getTime() - now.getTime();
        const days = Math.floor(diff / 86400000);

        if (diff < 0) return 'expired';
        if (days < 7) return 'expiring-critical';
        if (days < 30) return 'expiring-soon';
        return '';
    }

    /**
     * Navigate to create new key
     */
    public createNewKey(): void {
        // Emit event to parent to open key creation dialog
        this.Data.Configuration = { action: 'create' };
        // This will be handled by the parent component
    }

    /**
     * View all keys with filter
     */
    public viewAllKeys(filter?: string): void {
        this.Data.Configuration = { action: 'list', filter };
    }

    /**
     * View expiring keys
     */
    public viewExpiringKeys(): void {
        this.viewAllKeys('expiring');
    }

    /**
     * View a specific key
     */
    public viewKey(key: APIKeyEntity): void {
        this.Data.Configuration = { action: 'view', keyId: key.ID };
    }

    /**
     * View activity for a key
     */
    public onActivityClick(activity: ActivityItem): void {
        this.Data.Configuration = { action: 'view', keyId: activity.keyId };
    }

    /**
     * View usage logs
     */
    public viewUsageLogs(): void {
        this.Data.Configuration = { action: 'logs' };
    }

    /**
     * View scope details
     */
    public onScopeClick(stat: ScopeStat): void {
        this.Data.Configuration = { action: 'scopes', category: stat.category };
    }
}
