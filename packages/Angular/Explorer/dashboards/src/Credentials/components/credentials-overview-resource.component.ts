import { Component, OnInit, OnDestroy, ChangeDetectorRef, ChangeDetectionStrategy } from '@angular/core';
import { Subject } from 'rxjs';
import { ResourceData, CredentialEntity, CredentialTypeEntity, CredentialCategoryEntity, AuditLogEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseResourceComponent, NavigationService } from '@memberjunction/ng-shared';
import { RunView, Metadata, CompositeKey } from '@memberjunction/core';

export function LoadCredentialsOverviewResource() {
    // Prevents tree-shaking
}

interface CategoryStat {
    category: string;
    categoryId: string;
    count: number;
    iconClass: string;
    color: string;
    percentage: number;
}

interface TypeStat {
    typeId: string;
    typeName: string;
    category: string;
    credentialCount: number;
    activeCount: number;
    expiringCount: number;
}

interface ActivityItem {
    id: string;
    credentialName: string;
    credentialId: string;
    typeName: string;
    action: 'Created' | 'Updated' | 'Accessed' | 'Rotated';
    date: Date;
    user?: string;
}

interface UsageTrendPoint {
    timestamp: Date;
    accessCount: number;
    uniqueCredentials: number;
    successRate: number;
}

@RegisterClass(BaseResourceComponent, 'CredentialsOverviewResource')
@Component({
  standalone: false,
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
    public expiredCredentials = 0;
    public expiringSoonCount = 0;
    public credentialTypes = 0;
    public categories = 0;

    // Grouped data
    public categoryStats: CategoryStat[] = [];
    public typeStats: TypeStat[] = [];
    public recentActivity: ActivityItem[] = [];
    public usageTrend: UsageTrendPoint[] = [];

    // Raw data
    private credentials: CredentialEntity[] = [];
    private types: CredentialTypeEntity[] = [];
    private categoryList: CredentialCategoryEntity[] = [];
    private auditLogs: AuditLogEntity[] = [];

    // Permissions
    private _metadata = new Metadata();
    private _permissionCache = new Map<string, boolean>();

    // Category colors for charts
    private categoryColors: Record<string, string> = {
        'AI': '#8b5cf6',
        'Communication': '#3b82f6',
        'Storage': '#10b981',
        'Database': '#f59e0b',
        'Authentication': '#ef4444',
        'Integration': '#6366f1'
    };

    private destroy$ = new Subject<void>();

    constructor(
        private cdr: ChangeDetectorRef,
        private navigationService: NavigationService
    ) {
        super();
    }

    ngOnInit(): void {
        this.loadData();
    }

    ngOnDestroy(): void {
        this.destroy$.next();
        this.destroy$.complete();
    }

    async GetResourceDisplayName(data: ResourceData): Promise<string> {
        return 'Overview';
    }

    async GetResourceIconClass(data: ResourceData): Promise<string> {
        return 'fa-solid fa-chart-pie';
    }

    // === Permission Checks ===
    public get UserCanCreateCredentials(): boolean {
        return this.checkEntityPermission('MJ: Credentials', 'Create');
    }

    public get UserCanUpdateCredentials(): boolean {
        return this.checkEntityPermission('MJ: Credentials', 'Update');
    }

    private checkEntityPermission(entityName: string, permissionType: 'Create' | 'Read' | 'Update' | 'Delete'): boolean {
        const cacheKey = `${entityName}_${permissionType}`;

        if (this._permissionCache.has(cacheKey)) {
            return this._permissionCache.get(cacheKey)!;
        }

        try {
            const entityInfo = this._metadata.Entities.find(e => e.Name === entityName);
            if (!entityInfo) {
                this._permissionCache.set(cacheKey, false);
                return false;
            }

            const userPermissions = entityInfo.GetUserPermisions(this._metadata.CurrentUser);
            let hasPermission = false;

            switch (permissionType) {
                case 'Create': hasPermission = userPermissions.CanCreate; break;
                case 'Read': hasPermission = userPermissions.CanRead; break;
                case 'Update': hasPermission = userPermissions.CanUpdate; break;
                case 'Delete': hasPermission = userPermissions.CanDelete; break;
            }

            this._permissionCache.set(cacheKey, hasPermission);
            return hasPermission;
        } catch (error) {
            this._permissionCache.set(cacheKey, false);
            return false;
        }
    }

    private async loadData(): Promise<void> {
        try {
            this.isLoading = true;
            this.cdr.markForCheck();

            const rv = new RunView();

            // Calculate date range for audit logs (last 30 days)
            const thirtyDaysAgo = new Date();
            thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
            const dateFilter = `__mj_CreatedAt >= '${thirtyDaysAgo.toISOString()}'`;

            // Load all data in parallel using RunViews
            const [credResult, typeResult, categoryResult, auditResult] = await rv.RunViews([
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
                },
                {
                    EntityName: 'Audit Logs',
                    ExtraFilter: `AuditLogType LIKE '%Credential%' AND ${dateFilter}`,
                    OrderBy: '__mj_CreatedAt DESC',
                    MaxRows: 100,
                    ResultType: 'entity_object'
                }
            ]);

            if (credResult.Success) {
                this.credentials = credResult.Results as CredentialEntity[];
                this.processCredentialStats();
            }

            if (typeResult.Success) {
                this.types = typeResult.Results as CredentialTypeEntity[];
                this.credentialTypes = this.types.length;
                this.processTypeStats();
            }

            if (categoryResult.Success) {
                this.categoryList = categoryResult.Results as CredentialCategoryEntity[];
                this.categories = this.categoryList.length;
                this.processCategoryStats();
            }

            if (auditResult.Success) {
                this.auditLogs = auditResult.Results as AuditLogEntity[];
                this.processActivityAndTrends();
            }

            // Build recent activity from credentials if no audit logs
            if (this.recentActivity.length === 0) {
                this.buildActivityFromCredentials();
            }

        } catch (error) {
            console.error('Error loading credentials overview:', error);
        } finally {
            this.isLoading = false;
            this.NotifyLoadComplete();
            this.cdr.markForCheck();
        }
    }

    private processCredentialStats(): void {
        this.totalCredentials = this.credentials.length;
        this.activeCredentials = this.credentials.filter(c => c.IsActive).length;

        const now = new Date();
        const thirtyDaysFromNow = new Date();
        thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30);

        this.expiredCredentials = this.credentials.filter(c =>
            c.ExpiresAt && new Date(c.ExpiresAt) < now
        ).length;

        this.expiringSoonCount = this.credentials.filter(c =>
            c.ExpiresAt &&
            new Date(c.ExpiresAt) >= now &&
            new Date(c.ExpiresAt) <= thirtyDaysFromNow &&
            c.IsActive
        ).length;
    }

    private processTypeStats(): void {
        const now = new Date();
        const thirtyDaysFromNow = new Date();
        thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30);

        this.typeStats = this.types.map(type => {
            const typeCredentials = this.credentials.filter(c => c.CredentialTypeID === type.ID);

            return {
                typeId: type.ID,
                typeName: type.Name,
                category: type.Category,
                credentialCount: typeCredentials.length,
                activeCount: typeCredentials.filter(c => c.IsActive).length,
                expiringCount: typeCredentials.filter(c =>
                    c.ExpiresAt &&
                    new Date(c.ExpiresAt) >= now &&
                    new Date(c.ExpiresAt) <= thirtyDaysFromNow
                ).length
            };
        }).sort((a, b) => b.credentialCount - a.credentialCount);
    }

    private processCategoryStats(): void {
        const categoryMap = new Map<string, CategoryStat>();

        // Initialize from credential types
        for (const type of this.types) {
            const category = type.Category;
            const existing = categoryMap.get(category);
            const categoryCredentials = this.credentials.filter(c => c.CredentialTypeID === type.ID);

            if (existing) {
                existing.count += categoryCredentials.length;
            } else {
                categoryMap.set(category, {
                    category: category,
                    categoryId: category, // Use category name as ID for filtering
                    count: categoryCredentials.length,
                    iconClass: this.getCategoryIcon(category),
                    color: this.categoryColors[category] || '#64748b',
                    percentage: 0
                });
            }
        }

        // Calculate percentages
        const total = this.totalCredentials || 1;
        categoryMap.forEach(stat => {
            stat.percentage = Math.round((stat.count / total) * 100);
        });

        this.categoryStats = Array.from(categoryMap.values())
            .sort((a, b) => b.count - a.count);
    }

    private processActivityAndTrends(): void {
        // Process recent activity from audit logs
        this.recentActivity = this.auditLogs
            .slice(0, 10)
            .map(log => ({
                id: log.ID,
                credentialName: this.extractCredentialName(log.Description || ''),
                credentialId: '', // Would need to parse from log
                typeName: 'Credential',
                action: this.extractAction(log.Description || '') as ActivityItem['action'],
                date: new Date(log.__mj_CreatedAt),
                user: log.User
            }));

        // Build usage trend data (group by day)
        const trendMap = new Map<string, UsageTrendPoint>();
        const uniqueCredentialsPerDay = new Map<string, Set<string>>();

        for (const log of this.auditLogs) {
            const dateKey = new Date(log.__mj_CreatedAt).toISOString().split('T')[0];

            if (!trendMap.has(dateKey)) {
                trendMap.set(dateKey, {
                    timestamp: new Date(dateKey),
                    accessCount: 0,
                    uniqueCredentials: 0,
                    successRate: 100
                });
                uniqueCredentialsPerDay.set(dateKey, new Set());
            }

            const point = trendMap.get(dateKey)!;
            point.accessCount++;

            // Track unique credentials (would need proper parsing)
            const credId = this.extractCredentialId(log.Description || '');
            if (credId) {
                uniqueCredentialsPerDay.get(dateKey)!.add(credId);
            }
        }

        // Finalize unique counts
        trendMap.forEach((point, dateKey) => {
            point.uniqueCredentials = uniqueCredentialsPerDay.get(dateKey)?.size || 0;
        });

        this.usageTrend = Array.from(trendMap.values())
            .sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
    }

    private buildActivityFromCredentials(): void {
        this.recentActivity = this.credentials
            .filter(c => c.__mj_UpdatedAt)
            .sort((a, b) => new Date(b.__mj_UpdatedAt).getTime() - new Date(a.__mj_UpdatedAt).getTime())
            .slice(0, 10)
            .map(c => ({
                id: c.ID,
                credentialName: c.Name,
                credentialId: c.ID,
                typeName: c.CredentialType || 'Unknown',
                action: 'Updated' as const,
                date: new Date(c.__mj_UpdatedAt),
                user: undefined
            }));
    }

    private extractCredentialName(description: string): string {
        // Try to extract credential name from audit log description
        const match = description.match(/credential[:\s]+['"]?([^'"]+)['"]?/i);
        return match ? match[1] : 'Unknown Credential';
    }

    private extractAction(description: string): string {
        if (description.toLowerCase().includes('creat')) return 'Created';
        if (description.toLowerCase().includes('rotat')) return 'Rotated';
        if (description.toLowerCase().includes('access')) return 'Accessed';
        return 'Updated';
    }

    private extractCredentialId(description: string): string {
        const match = description.match(/[a-f0-9-]{36}/i);
        return match ? match[0] : '';
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

    // === Navigation Actions ===

    public createNewCredential(): void {
        // Navigate to Credentials tab with openCreatePanel flag to show the slide-in editor
        this.navigationService.OpenNavItemByName('Credentials', {
            openCreatePanel: true
        });
    }

    public openCredential(credentialId: string): void {
        const key = new CompositeKey([{ FieldName: 'ID', Value: credentialId }]);
        this.navigationService.OpenEntityRecord('MJ: Credentials', key);
    }

    public onCategoryClick(category: CategoryStat): void {
        // Navigate to types nav item with category filter
        this.navigationService.OpenNavItemByName('Types', {
            categoryFilter: category.category
        });
    }

    public onTypeClick(typeStat: TypeStat): void {
        // Navigate to credentials nav item with type filter
        this.navigationService.OpenNavItemByName('Credentials', {
            typeId: typeStat.typeId
        });
    }

    public onActivityClick(activity: ActivityItem): void {
        if (activity.credentialId) {
            this.openCredential(activity.credentialId);
        }
    }

    public viewAllCredentials(): void {
        this.navigationService.OpenNavItemByName('Credentials');
    }

    public viewAuditLog(): void {
        this.navigationService.OpenNavItemByName('Audit Log');
    }

    public viewAllTypes(): void {
        this.navigationService.OpenNavItemByName('Types');
    }

    public viewAllCategories(): void {
        this.navigationService.OpenNavItemByName('Categories');
    }

    public viewExpiringCredentials(): void {
        this.navigationService.OpenNavItemByName('Credentials', {
            filter: 'expiring'
        });
    }

    // === Formatting Helpers ===

    public formatDate(date: Date): string {
        const now = new Date();
        const diffMs = now.getTime() - date.getTime();
        const diffMins = Math.floor(diffMs / 60000);
        const diffHours = Math.floor(diffMs / 3600000);
        const diffDays = Math.floor(diffMs / 86400000);

        if (diffMins < 1) return 'Just now';
        if (diffMins < 60) return `${diffMins}m ago`;
        if (diffHours < 24) return `${diffHours}h ago`;
        if (diffDays < 7) return `${diffDays}d ago`;

        return date.toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    }

    public getActionIcon(action: string): string {
        const iconMap: Record<string, string> = {
            'Created': 'fa-solid fa-plus',
            'Updated': 'fa-solid fa-pen',
            'Accessed': 'fa-solid fa-eye',
            'Rotated': 'fa-solid fa-rotate'
        };
        return iconMap[action] || 'fa-solid fa-circle';
    }

    public getActionClass(action: string): string {
        const classMap: Record<string, string> = {
            'Created': 'action-created',
            'Updated': 'action-updated',
            'Accessed': 'action-accessed',
            'Rotated': 'action-rotated'
        };
        return classMap[action] || '';
    }

    public refresh(): void {
        this.loadData();
    }

    public getHealthScore(): number {
        if (this.totalCredentials === 0) return 100;

        const activeRatio = this.activeCredentials / this.totalCredentials;
        const expiredPenalty = (this.expiredCredentials / this.totalCredentials) * 30;
        const expiringPenalty = (this.expiringSoonCount / this.totalCredentials) * 15;

        return Math.max(0, Math.min(100, Math.round((activeRatio * 100) - expiredPenalty - expiringPenalty)));
    }

    public getHealthClass(): string {
        const score = this.getHealthScore();
        if (score >= 80) return 'health-good';
        if (score >= 60) return 'health-warning';
        return 'health-critical';
    }

    public getHealthLabel(): string {
        const score = this.getHealthScore();
        if (score >= 80) return 'Healthy';
        if (score >= 60) return 'Needs Attention';
        return 'Critical';
    }

    public getDonutOffset(index: number): number {
        // Calculate cumulative offset for donut chart segments
        // Each segment starts where the previous one ended
        // The circumference is 251 (2 * PI * 40)
        let offset = 63; // Start at top (25% of circumference = 90 degrees rotation)

        for (let i = 0; i < index; i++) {
            offset -= this.categoryStats[i].percentage * 2.51;
        }

        return offset;
    }
}
