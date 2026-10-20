import { Component, OnInit, OnDestroy, ChangeDetectorRef, ChangeDetectionStrategy } from '@angular/core';
import { Subject } from 'rxjs';
import { ResourceData, MJCredentialEntity, MJCredentialTypeEntity, MJCredentialCategoryEntity, MJAuditLogEntity } from '@memberjunction/core-entities';
import { RegisterClass , UUIDsEqual } from '@memberjunction/global';
import { BaseResourceComponent, NavigationService } from '@memberjunction/ng-shared';
import { RunView, Metadata, CompositeKey } from '@memberjunction/core';
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
    public TotalCredentials = 0;

    /** @deprecated Use {@link TotalCredentials}. */
    public get totalCredentials() {
      return this.TotalCredentials;
    }
    /** @deprecated Use {@link TotalCredentials}. */
    public set totalCredentials(value) {
      this.TotalCredentials = value;
    }
    public ActiveCredentials = 0;

    /** @deprecated Use {@link ActiveCredentials}. */
    public get activeCredentials() {
      return this.ActiveCredentials;
    }
    /** @deprecated Use {@link ActiveCredentials}. */
    public set activeCredentials(value) {
      this.ActiveCredentials = value;
    }
    public ExpiredCredentials = 0;

    /** @deprecated Use {@link ExpiredCredentials}. */
    public get expiredCredentials() {
      return this.ExpiredCredentials;
    }
    /** @deprecated Use {@link ExpiredCredentials}. */
    public set expiredCredentials(value) {
      this.ExpiredCredentials = value;
    }
    public ExpiringSoonCount = 0;

    /** @deprecated Use {@link ExpiringSoonCount}. */
    public get expiringSoonCount() {
      return this.ExpiringSoonCount;
    }
    /** @deprecated Use {@link ExpiringSoonCount}. */
    public set expiringSoonCount(value) {
      this.ExpiringSoonCount = value;
    }
    public CredentialTypes = 0;

    /** @deprecated Use {@link CredentialTypes}. */
    public get credentialTypes() {
      return this.CredentialTypes;
    }
    /** @deprecated Use {@link CredentialTypes}. */
    public set credentialTypes(value) {
      this.CredentialTypes = value;
    }
    public Categories = 0;

    /** @deprecated Use {@link Categories}. */
    public get categories() {
      return this.Categories;
    }
    /** @deprecated Use {@link Categories}. */
    public set categories(value) {
      this.Categories = value;
    }

    // Grouped data
    public CategoryStats: CategoryStat[] = [];

    /** @deprecated Use {@link CategoryStats}. */
    public get categoryStats(): CategoryStat[] {
      return this.CategoryStats;
    }
    /** @deprecated Use {@link CategoryStats}. */
    public set categoryStats(value: CategoryStat[]) {
      this.CategoryStats = value;
    }
    public TypeStats: TypeStat[] = [];

    /** @deprecated Use {@link TypeStats}. */
    public get typeStats(): TypeStat[] {
      return this.TypeStats;
    }
    /** @deprecated Use {@link TypeStats}. */
    public set typeStats(value: TypeStat[]) {
      this.TypeStats = value;
    }
    public RecentActivity: ActivityItem[] = [];

    /** @deprecated Use {@link RecentActivity}. */
    public get recentActivity(): ActivityItem[] {
      return this.RecentActivity;
    }
    /** @deprecated Use {@link RecentActivity}. */
    public set recentActivity(value: ActivityItem[]) {
      this.RecentActivity = value;
    }
    public UsageTrend: UsageTrendPoint[] = [];

    /** @deprecated Use {@link UsageTrend}. */
    public get usageTrend(): UsageTrendPoint[] {
      return this.UsageTrend;
    }
    /** @deprecated Use {@link UsageTrend}. */
    public set usageTrend(value: UsageTrendPoint[]) {
      this.UsageTrend = value;
    }

    // Raw data
    private credentials: MJCredentialEntity[] = [];
    private types: MJCredentialTypeEntity[] = [];
    private categoryList: MJCredentialCategoryEntity[] = [];
    private auditLogs: MJAuditLogEntity[] = [];

    // Permissions
    private _metadata = this.ProviderToUse;
    private _permissionCache = new Map<string, boolean>();

    // Category colors for charts - using CSS custom properties via getComputedStyle at runtime
    // These are semantic fallback values; the actual tokens are resolved from the theme
    private categoryColors: Record<string, string> = {
        'AI': 'var(--mj-brand-primary)',
        'Communication': 'var(--mj-brand-primary)',
        'Storage': 'var(--mj-status-success)',
        'Database': 'var(--mj-status-warning)',
        'Authentication': 'var(--mj-status-error)',
        'Integration': 'var(--mj-brand-primary)'
    };

    protected override destroy$ = new Subject<void>();

    constructor(
        private cdr: ChangeDetectorRef) {
        super();
    }

    ngOnInit(): void {
        super.ngOnInit();
        this.loadData();
    }

    ngOnDestroy(): void {
        super.ngOnDestroy();
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

            const rv = RunView.FromMetadataProvider(this.ProviderToUse);

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
                    EntityName: 'MJ: Audit Logs',
                    ExtraFilter: `AuditLogType LIKE '%Credential%' AND ${dateFilter}`,
                    OrderBy: '__mj_CreatedAt DESC',
                    MaxRows: 100,
                    ResultType: 'entity_object'
                }
            ]);

            if (credResult.Success) {
                this.credentials = credResult.Results as MJCredentialEntity[];
                this.processCredentialStats();
            }

            if (typeResult.Success) {
                this.types = typeResult.Results as MJCredentialTypeEntity[];
                this.CredentialTypes = this.types.length;
                this.processTypeStats();
            }

            if (categoryResult.Success) {
                this.categoryList = categoryResult.Results as MJCredentialCategoryEntity[];
                this.Categories = this.categoryList.length;
                this.processCategoryStats();
            }

            if (auditResult.Success) {
                this.auditLogs = auditResult.Results as MJAuditLogEntity[];
                this.processActivityAndTrends();
            }

            // Build recent activity from credentials if no audit logs
            if (this.RecentActivity.length === 0) {
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
        this.TotalCredentials = this.credentials.length;
        this.ActiveCredentials = this.credentials.filter(c => c.IsActive).length;

        const now = new Date();
        const thirtyDaysFromNow = new Date();
        thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30);

        this.ExpiredCredentials = this.credentials.filter(c =>
            c.ExpiresAt && new Date(c.ExpiresAt) < now
        ).length;

        this.ExpiringSoonCount = this.credentials.filter(c =>
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

        this.TypeStats = this.types.map(type => {
            const typeCredentials = this.credentials.filter(c => UUIDsEqual(c.CredentialTypeID, type.ID));

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
            const categoryCredentials = this.credentials.filter(c => UUIDsEqual(c.CredentialTypeID, type.ID));

            if (existing) {
                existing.count += categoryCredentials.length;
            } else {
                categoryMap.set(category, {
                    category: category,
                    categoryId: category, // Use category name as ID for filtering
                    count: categoryCredentials.length,
                    iconClass: this.getCategoryIcon(category),
                    color: this.categoryColors[category] || 'var(--mj-text-muted)',
                    percentage: 0
                });
            }
        }

        // Calculate percentages
        const total = this.TotalCredentials || 1;
        categoryMap.forEach(stat => {
            stat.percentage = Math.round((stat.count / total) * 100);
        });

        this.CategoryStats = Array.from(categoryMap.values())
            .sort((a, b) => b.count - a.count);
    }

    private processActivityAndTrends(): void {
        // Process recent activity from audit logs
        this.RecentActivity = this.auditLogs
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

        this.UsageTrend = Array.from(trendMap.values())
            .sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
    }

    private buildActivityFromCredentials(): void {
        this.RecentActivity = this.credentials
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

    public CreateNewCredential(): void {
        // Navigate to Credentials tab with openCreatePanel flag to show the slide-in editor
        this.navigationService.OpenNavItemByName('Credentials', {
            openCreatePanel: true
        });
    }

    /** @deprecated Use {@link CreateNewCredential}. */
    public createNewCredential(): void {
      return this.CreateNewCredential();
    }

    public OpenCredential(credentialId: string): void {
        this.navigationService.OpenEntityRecord('MJ: Credentials', CompositeKey.FromID(credentialId));
    }

    /** @deprecated Use {@link OpenCredential}. */
    public openCredential(credentialId: string): void {
      return this.OpenCredential(credentialId);
    }

    public OnCategoryClick(category: CategoryStat): void {
        // Navigate to types nav item with category filter
        this.navigationService.OpenNavItemByName('Types', {
            categoryFilter: category.category
        });
    }

    /** @deprecated Use {@link OnCategoryClick}. */
    public onCategoryClick(category: CategoryStat): void {
      return this.OnCategoryClick(category);
    }

    public OnTypeClick(typeStat: TypeStat): void {
        // Navigate to credentials nav item with type filter
        this.navigationService.OpenNavItemByName('Credentials', {
            typeId: typeStat.typeId
        });
    }

    /** @deprecated Use {@link OnTypeClick}. */
    public onTypeClick(typeStat: TypeStat): void {
      return this.OnTypeClick(typeStat);
    }

    public OnActivityClick(activity: ActivityItem): void {
        if (activity.credentialId) {
            this.OpenCredential(activity.credentialId);
        }
    }

    /** @deprecated Use {@link OnActivityClick}. */
    public onActivityClick(activity: ActivityItem): void {
      return this.OnActivityClick(activity);
    }

    public ViewAllCredentials(): void {
        this.navigationService.OpenNavItemByName('Credentials');
    }

    /** @deprecated Use {@link ViewAllCredentials}. */
    public viewAllCredentials(): void {
      return this.ViewAllCredentials();
    }

    public ViewAuditLog(): void {
        this.navigationService.OpenNavItemByName('Audit Log');
    }

    /** @deprecated Use {@link ViewAuditLog}. */
    public viewAuditLog(): void {
      return this.ViewAuditLog();
    }

    public ViewAllTypes(): void {
        this.navigationService.OpenNavItemByName('Types');
    }

    /** @deprecated Use {@link ViewAllTypes}. */
    public viewAllTypes(): void {
      return this.ViewAllTypes();
    }

    public ViewAllCategories(): void {
        this.navigationService.OpenNavItemByName('Categories');
    }

    /** @deprecated Use {@link ViewAllCategories}. */
    public viewAllCategories(): void {
      return this.ViewAllCategories();
    }

    public ViewExpiringCredentials(): void {
        this.navigationService.OpenNavItemByName('Credentials', {
            filter: 'expiring'
        });
    }

    /** @deprecated Use {@link ViewExpiringCredentials}. */
    public viewExpiringCredentials(): void {
      return this.ViewExpiringCredentials();
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

    public GetActionIcon(action: string): string {
        const iconMap: Record<string, string> = {
            'Created': 'fa-solid fa-plus',
            'Updated': 'fa-solid fa-pen',
            'Accessed': 'fa-solid fa-eye',
            'Rotated': 'fa-solid fa-rotate'
        };
        return iconMap[action] || 'fa-solid fa-circle';
    }

    /** @deprecated Use {@link GetActionIcon}. */
    public getActionIcon(action: string): string {
      return this.GetActionIcon(action);
    }

    public GetActionClass(action: string): string {
        const classMap: Record<string, string> = {
            'Created': 'action-created',
            'Updated': 'action-updated',
            'Accessed': 'action-accessed',
            'Rotated': 'action-rotated'
        };
        return classMap[action] || '';
    }

    /** @deprecated Use {@link GetActionClass}. */
    public getActionClass(action: string): string {
      return this.GetActionClass(action);
    }

    public Refresh(): void {
        this.loadData();
    }

    /** @deprecated Use {@link Refresh}. */
    public refresh(): void {
      return this.Refresh();
    }

    public GetHealthScore(): number {
        if (this.TotalCredentials === 0) return 100;

        const activeRatio = this.ActiveCredentials / this.TotalCredentials;
        const expiredPenalty = (this.ExpiredCredentials / this.TotalCredentials) * 30;
        const expiringPenalty = (this.ExpiringSoonCount / this.TotalCredentials) * 15;

        return Math.max(0, Math.min(100, Math.round((activeRatio * 100) - expiredPenalty - expiringPenalty)));
    }

    /** @deprecated Use {@link GetHealthScore}. */
    public getHealthScore(): number {
      return this.GetHealthScore();
    }

    public GetHealthClass(): string {
        const score = this.GetHealthScore();
        if (score >= 80) return 'health-good';
        if (score >= 60) return 'health-warning';
        return 'health-critical';
    }

    /** @deprecated Use {@link GetHealthClass}. */
    public getHealthClass(): string {
      return this.GetHealthClass();
    }

    public GetHealthLabel(): string {
        const score = this.GetHealthScore();
        if (score >= 80) return 'Healthy';
        if (score >= 60) return 'Needs Attention';
        return 'Critical';
    }

    /** @deprecated Use {@link GetHealthLabel}. */
    public getHealthLabel(): string {
      return this.GetHealthLabel();
    }

    public GetDonutOffset(index: number): number {
        // Calculate cumulative offset for donut chart segments
        // Each segment starts where the previous one ended
        // The circumference is 251 (2 * PI * 40)
        let offset = 63; // Start at top (25% of circumference = 90 degrees rotation)

        for (let i = 0; i < index; i++) {
            offset -= this.CategoryStats[i].percentage * 2.51;
        }

        return offset;
    }

    /** @deprecated Use {@link GetDonutOffset}. */
    public getDonutOffset(index: number): number {
      return this.GetDonutOffset(index);
    }
}
