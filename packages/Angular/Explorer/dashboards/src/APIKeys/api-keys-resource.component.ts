import { Component, OnInit, OnDestroy, ViewChild, ChangeDetectorRef } from '@angular/core';
import { BaseResourceComponent } from '@memberjunction/ng-shared';
import { RegisterClass , UUIDsEqual } from '@memberjunction/global';
import { Metadata, RunView } from '@memberjunction/core';
import { MJAPIKeyEntity, MJAPIScopeEntity, MJAPIKeyUsageLogEntity, MJAPIApplicationEntity, ResourceData } from '@memberjunction/core-entities';
import { APIKeysEngineBase, parseAPIScopeUIConfig } from '@memberjunction/api-keys-base';
import { TabConfig } from '@memberjunction/ng-ui-components';
import { Subject } from 'rxjs';
import { APIKeyFilter, APIKeyListComponent } from './api-key-list.component';
import { APIKeyCreateResult } from './api-key-create-dialog.component';
import { ValidateEnumParam, ValidateStringParam } from '../shared/agent-tool-validation';
import {
    BuildAPIKeysAgentContext,
    VALID_API_KEYS_TABS,
    VALID_API_KEYS_FILTERS,
    APIKeysTab,
    APIKeysFilter,
} from './api-keys-agent-context';

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

/** Current view type */
type ViewType = 'overview' | 'list';

/** Main tab type */
type MainTab = 'keys' | 'applications' | 'scopes' | 'usage';
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
  standalone: false,
    selector: 'mj-api-keys-resource',
    templateUrl: './api-keys-resource.component.html',
    styleUrls: ['./api-keys-resource.component.css']
})
export class APIKeysResourceComponent extends BaseResourceComponent implements OnInit, OnDestroy {
    @ViewChild('keyList') KeyListComponent: APIKeyListComponent | undefined;

    /** @deprecated Use {@link KeyListComponent}. */
    get keyListComponent(): APIKeyListComponent | undefined {
      return this.KeyListComponent;
    }
    /** @deprecated Use {@link KeyListComponent}. */
    set keyListComponent(value: APIKeyListComponent | undefined) {
      this.KeyListComponent = value;
    }

    protected override destroy$ = new Subject<void>();
    private md = this.ProviderToUse;
    private cdr: ChangeDetectorRef;

    // View state
    public CurrentView: ViewType = 'overview';
    public ListFilter: APIKeyFilter = 'all';
    public MainTab: MainTab = 'keys';

    // Application and scope counts for tab badges
    public ApplicationCount = 0;
    public ScopeCount = 0;

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
    public APIKeys: MJAPIKeyEntity[] = [];
    public RecentActivity: ActivityItem[] = [];
    public ScopeStats: ScopeStat[] = [];
    public TopUsedKeys: MJAPIKeyEntity[] = [];

    // Dialog states
    public ShowCreateDialog = false;
    public ShowEditPanel = false;
    public SelectedKeyId: string | null = null;
    /** Friendly Label of the selected key (NEVER the key value/hash/prefix). */
    public SelectedKeyLabel: string | null = null;

    // Default UI config for categories without explicit configuration
    private readonly defaultUIConfig = {
        icon: 'fa-solid fa-ellipsis',
        color: 'var(--mj-text-muted)'
    };

    // Dynamic category UI configs built from root scopes
    private categoryUIConfigs = new Map<string, { icon: string; color: string }>();

    // User permissions
    public UserCanCreateKeys = false;
    public UserCanRevokeKeys = false;

    constructor(cdr: ChangeDetectorRef) {
        super();
        this.cdr = cdr;
    }

    async ngOnInit(): Promise<void> {
        super.ngOnInit();
        this.registerAgentClientTools();
        await this.loadData();
        this.publishAgentContext();
    }

    // ================================================================
    // AI Agent Context & Client Tools
    //
    // 🚨 SAFETY BOUNDARY — READ-ONLY / NAVIGATIONAL ONLY 🚨
    // API Keys is a highly security-sensitive admin surface. The agent context
    // and client tools registered here are strictly NAVIGATIONAL + READ-ONLY:
    // tab switches, status filtering, search, key-LABEL selection (opens the view
    // panel), and data refresh. The mutating operations on this component (create
    // key, revoke key, extend expiration, edit) are DELIBERATELY NOT exposed to
    // the agent — they must remain human-initiated.
    //
    // Context exposes ONLY: navigation state, aggregate counts, a health score,
    // and bounded FRIENDLY DISPLAY names — key Labels (user-chosen friendly names
    // like "CI pipeline", NOT the key value), Application names, and Scope
    // category names. It NEVER exposes the key's hashed value (`Hash`), its
    // `KeyPrefix` (part of the key material), the cleartext key/token shown once
    // at creation, or any other reveal-able secret. None of those values are ever
    // read into the published context. See api-keys-agent-context.ts for the
    // metadata-only context contract and the no-secret-leak unit test.
    // ================================================================

    /**
     * Publish the current API Keys dashboard state to the AI agent. Re-invoked on
     * every meaningful state change (data load, tab switch, selection). Only
     * counts, navigation state, and friendly display names are exposed — never
     * key secrets, hashes, or prefixes.
     */
    private publishAgentContext(): void {
        this.navigationService.SetAgentContext(this, BuildAPIKeysAgentContext({
            MainTab: this.MainTab,
            CurrentView: this.CurrentView,
            ListFilter: this.ListFilter,
            IsLoading: this.IsLoading,

            TotalKeys: this.TotalKeys,
            ActiveKeys: this.ActiveKeys,
            RevokedKeys: this.RevokedKeys,
            ExpiringSoonCount: this.ExpiringSoonCount,
            ExpiredKeys: this.ExpiredKeys,
            NeverUsedKeys: this.NeverUsedKeys,
            ApplicationCount: this.ApplicationCount,
            ScopeCount: this.ScopeCount,
            HealthScore: this.GetHealthScore(),

            // Friendly display names ONLY — never key material.
            KeyLabels: this.APIKeys.map(k => k.Label).filter(l => !!l),
            TopUsedKeyLabels: this.TopUsedKeys.map(k => k.Label).filter(l => !!l),
            ApplicationNames: APIKeysEngineBase.Instance.Applications.map(a => a.Name).filter(n => !!n),
            ScopeCategoryNames: this.ScopeStats.map(s => s.category).filter(c => !!c),

            SelectedKeyId: this.SelectedKeyId,
            SelectedKeyLabel: this.SelectedKeyLabel,
        }));
    }

    /**
     * Register the read-only / navigational client tools the agent may invoke.
     * Every Handler is tolerant: validates input and returns
     * `{ Success: false, ErrorMessage }` rather than throwing.
     */
    private registerAgentClientTools(): void {
        this.navigationService.SetAgentClientTools(this, [
            {
                Name: 'SwitchAPIKeysTab',
                Description: 'Switch the active API Keys tab. Valid tabs: keys, applications, scopes, usage.',
                ParameterSchema: { type: 'object', properties: { tab: { type: 'string', enum: ['keys', 'applications', 'scopes', 'usage'] } }, required: ['tab'] },
                Handler: async (params: Record<string, unknown>) => this.handleSwitchTabTool(params),
            },
            {
                Name: 'FilterAPIKeysByStatus',
                Description: 'Show the API key list filtered by status. Valid filters: all, active, revoked, expiring, expired, never-used.',
                ParameterSchema: { type: 'object', properties: { filter: { type: 'string', enum: ['all', 'active', 'revoked', 'expiring', 'expired', 'never-used'] } }, required: ['filter'] },
                Handler: async (params: Record<string, unknown>) => this.handleFilterByStatusTool(params),
            },
            {
                Name: 'SearchAPIKeys',
                Description: 'Search the API key list by label or other text. Switches to the list view if needed.',
                ParameterSchema: { type: 'object', properties: { searchText: { type: 'string' } }, required: ['searchText'] },
                Handler: async (params: Record<string, unknown>) => this.handleSearchTool(params),
            },
            {
                Name: 'SelectAPIKey',
                Description: 'Select an API key by its friendly Label (e.g. "CI pipeline") to open its details panel for VIEWING. Read-only — opens the panel for inspection; does NOT reveal the key value/hash and does NOT edit, revoke, or rotate. Returns the matched key Label, or the available Labels on a miss.',
                ParameterSchema: { type: 'object', properties: { label: { type: 'string' } }, required: ['label'] },
                Handler: async (params: Record<string, unknown>) => this.handleSelectKeyTool(params),
            },
            {
                Name: 'RefreshAPIKeyData',
                Description: 'Reload all API key dashboard data. Read-only — does not create, revoke, or modify any keys.',
                ParameterSchema: { type: 'object', properties: {} },
                Handler: async () => this.handleRefreshTool(),
            },
        ]);
    }

    private static readonly API_KEYS_TABS = VALID_API_KEYS_TABS;
    private static readonly API_KEYS_FILTERS = VALID_API_KEYS_FILTERS;

    private handleSwitchTabTool(params: Record<string, unknown>): { Success: boolean; ErrorMessage?: string } {
        const v = ValidateEnumParam(params?.['tab'], APIKeysResourceComponent.API_KEYS_TABS, 'tab');
        if (!v.ok) return v.result;
        this.SwitchTab(v.value);
        this.publishAgentContext();
        return { Success: true };
    }

    private handleFilterByStatusTool(params: Record<string, unknown>): { Success: boolean; ErrorMessage?: string } {
        const v = ValidateEnumParam(params?.['filter'], APIKeysResourceComponent.API_KEYS_FILTERS, 'filter');
        if (!v.ok) return v.result;
        this.MainTab = 'keys';
        this.ShowListView(v.value);
        this.publishAgentContext();
        return { Success: true };
    }

    private handleSearchTool(params: Record<string, unknown>): { Success: boolean; ErrorMessage?: string } {
        const v = ValidateStringParam(params?.['searchText'], 'searchText');
        if (!v.ok) return v.result;
        // Ensure the list view is active so the list component (and its search box) exists.
        this.MainTab = 'keys';
        this.ShowListView(this.ListFilter);
        this.cdr.detectChanges();
        if (this.KeyListComponent) {
            this.KeyListComponent.SearchText = v.value;
            this.KeyListComponent.onSearch();
        }
        this.publishAgentContext();
        return { Success: true };
    }

    /**
     * Resolve an API key by its friendly Label (exact, case-insensitive, then
     * partial-contains) and open its details panel for VIEWING. Read-only: opens
     * the inspection panel; never reveals the key value/hash/prefix and never
     * edits, revokes, or rotates.
     */
    private handleSelectKeyTool(params: Record<string, unknown>): { Success: boolean; ErrorMessage?: string } {
        const v = ValidateStringParam(params?.['label'], 'label');
        if (!v.ok) return v.result;
        const query = v.value.trim().toLowerCase();
        if (!query) return { Success: false, ErrorMessage: 'label must be a non-empty string.' };

        const exact = this.APIKeys.find(k => (k.Label ?? '').toLowerCase() === query);
        const match = exact ?? this.APIKeys.find(k => (k.Label ?? '').toLowerCase().includes(query));
        if (!match) {
            const available = this.APIKeys.map(k => k.Label).filter(l => !!l).slice(0, 25).join(', ');
            return { Success: false, ErrorMessage: `No API key matches Label "${v.value}". Available labels: ${available || '(none)'}.` };
        }
        this.MainTab = 'keys';
        this.OpenEditPanel(match);
        return { Success: true };
    }

    private async handleRefreshTool(): Promise<{ Success: boolean; ErrorMessage?: string }> {
        try {
            await this.Refresh();
            this.publishAgentContext();
            return { Success: true };
        } catch (e) {
            return { Success: false, ErrorMessage: e instanceof Error ? e.message : 'Refresh failed.' };
        }
    }

    ngOnDestroy(): void {
        super.ngOnDestroy();
        this.destroy$.next();
        this.destroy$.complete();
    }

    async GetResourceDisplayName(_data: ResourceData): Promise<string> {
        return 'API Keys';
    }

    async GetResourceIconClass(_data: ResourceData): Promise<string> {
        return 'fa-solid fa-key';
    }

    /**
     * Load all dashboard data
     */
    public async loadData(): Promise<void> {
        this.IsLoading = true;
        this.cdr.markForCheck();
        try {
            await Promise.all([
                this.loadAPIKeys(),
                this.loadScopeStats(),
                this.loadRecentActivity(),
                this.loadCounts(),
                this.checkPermissions()
            ]);
            this.calculateStatistics();
        } catch (error) {
            console.error('Error loading API Keys dashboard data:', error);
        } finally {
            this.IsLoading = false;
            this.NotifyLoadComplete();
            this.cdr.markForCheck();
        }
    }

    /**
     * Load application and scope counts for tab badges.
     * Uses cached data from APIKeysEngineBase.
     */
    private loadCounts(): void {
        const base = APIKeysEngineBase.Instance;
        this.ApplicationCount = base.Applications.length;
        this.ScopeCount = base.Scopes.length;
    }

    /**
     * Load all API keys
     */
    private async loadAPIKeys(): Promise<void> {
        const rv = RunView.FromMetadataProvider(this.ProviderToUse);
        const result = await rv.RunView<MJAPIKeyEntity>({
            EntityName: 'MJ: API Keys',
            OrderBy: '__mj_CreatedAt DESC',
            ResultType: 'entity_object'
        });
        if (result.Success) {
            this.APIKeys = result.Results;
        }
    }

    /**
     * Load scope statistics by category.
     * Uses cached data from APIKeysEngineBase.
     */
    private loadScopeStats(): void {
        const base = APIKeysEngineBase.Instance;
        const scopes = base.Scopes;

        // Build category UI configs from root scopes
        this.categoryUIConfigs.clear();
        for (const scope of scopes) {
            if (!scope.ParentID) {
                const uiConfig = parseAPIScopeUIConfig(scope);
                this.categoryUIConfigs.set(scope.Category, {
                    icon: uiConfig.icon || this.defaultUIConfig.icon,
                    color: uiConfig.color || this.defaultUIConfig.color
                });
            }
        }

        const categoryMap = new Map<string, number>();
        for (const scope of scopes) {
            const category = scope.Category || 'Other';
            categoryMap.set(category, (categoryMap.get(category) || 0) + 1);
        }

        const total = scopes.length;
        this.ScopeStats = Array.from(categoryMap.entries()).map(([category, count]) => {
            const config = this.categoryUIConfigs.get(category) || this.defaultUIConfig;
            return {
                category,
                count,
                percentage: total > 0 ? Math.round((count / total) * 100) : 0,
                color: config.color,
                iconClass: config.icon
            };
        });
    }

    /**
     * Load recent activity from usage logs and key changes
     */
    private async loadRecentActivity(): Promise<void> {
        const rv = RunView.FromMetadataProvider(this.ProviderToUse);

        // Load usage logs
        const usageResult = await rv.RunView<MJAPIKeyUsageLogEntity>({
            EntityName: 'MJ: API Key Usage Logs',
            OrderBy: '__mj_CreatedAt DESC',
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
                    date: log.__mj_CreatedAt,
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
            const permissions = entityInfo.GetUserPermisions(this.md.CurrentUser);
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
    public async Refresh(): Promise<void> {
        await this.loadData();
        if (this.KeyListComponent) {
            await this.KeyListComponent.loadKeys();
        }
    }

    /** @deprecated Use {@link Refresh}. */
    public async refresh(): Promise<void> {
      return this.Refresh();
    }

    /**
     * Switch to list view
     */
    public ShowListView(filter: APIKeyFilter = 'all'): void {
        this.ListFilter = filter;
        this.CurrentView = 'list';
        this.publishAgentContext();
    }

    /** @deprecated Use {@link ShowListView}. */
    public showListView(filter: APIKeyFilter = 'all'): void {
      return this.ShowListView(filter);
    }

    /**
     * Switch to overview
     */
    public ShowOverview(): void {
        this.CurrentView = 'overview';
    }

    /** @deprecated Use {@link ShowOverview}. */
    public showOverview(): void {
      return this.ShowOverview();
    }

    /**
     * Open create dialog
     */
    public OpenCreateDialog(): void {
        this.ShowCreateDialog = true;
    }

    /** @deprecated Use {@link OpenCreateDialog}. */
    public openCreateDialog(): void {
      return this.OpenCreateDialog();
    }

    /**
     * Handle key created
     */
    public async OnKeyCreated(result: APIKeyCreateResult): Promise<void> {
        if (result.success) {
            await this.Refresh();
        }
    }

    /** @deprecated Use {@link OnKeyCreated}. */
    public async onKeyCreated(result: APIKeyCreateResult): Promise<void> {
      return this.OnKeyCreated(result);
    }

    /**
     * Handle create dialog closed
     */
    public OnCreateDialogClosed(): void {
        this.ShowCreateDialog = false;
    }

    /** @deprecated Use {@link OnCreateDialogClosed}. */
    public onCreateDialogClosed(): void {
      return this.OnCreateDialogClosed();
    }

    /**
     * Open edit panel for a key
     */
    public OpenEditPanel(key: MJAPIKeyEntity): void {
        this.SelectedKeyId = key.ID;
        this.SelectedKeyLabel = key.Label;
        this.ShowEditPanel = true;
        this.publishAgentContext();
    }

    /** @deprecated Use {@link OpenEditPanel}. */
    public openEditPanel(key: MJAPIKeyEntity): void {
      return this.OpenEditPanel(key);
    }

    /**
     * Handle key from list selected
     */
    public OnKeySelected(key: MJAPIKeyEntity): void {
        this.OpenEditPanel(key);
    }

    /** @deprecated Use {@link OnKeySelected}. */
    public onKeySelected(key: MJAPIKeyEntity): void {
      return this.OnKeySelected(key);
    }

    /**
     * Handle key updated
     */
    public async OnKeyUpdated(): Promise<void> {
        await this.Refresh();
    }

    /** @deprecated Use {@link OnKeyUpdated}. */
    public async onKeyUpdated(): Promise<void> {
      return this.OnKeyUpdated();
    }

    /**
     * Handle key revoked
     */
    public async OnKeyRevoked(): Promise<void> {
        await this.Refresh();
    }

    /** @deprecated Use {@link OnKeyRevoked}. */
    public async onKeyRevoked(): Promise<void> {
      return this.OnKeyRevoked();
    }

    /**
     * Handle edit panel closed
     */
    public OnEditPanelClosed(): void {
        this.ShowEditPanel = false;
        this.SelectedKeyId = null;
        this.SelectedKeyLabel = null;
        this.publishAgentContext();
    }

    /** @deprecated Use {@link OnEditPanelClosed}. */
    public onEditPanelClosed(): void {
      return this.OnEditPanelClosed();
    }

    /**
     * Get health score (0-100) based on key status
     */
    public GetHealthScore(): number {
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

    /** @deprecated Use {@link GetHealthScore}. */
    public getHealthScore(): number {
      return this.GetHealthScore();
    }

    /**
     * Get health label based on score
     */
    public GetHealthLabel(): string {
        const score = this.GetHealthScore();
        if (score >= 90) return 'Excellent Security';
        if (score >= 75) return 'Good Security';
        if (score >= 50) return 'Needs Attention';
        return 'Critical Issues';
    }

    /** @deprecated Use {@link GetHealthLabel}. */
    public getHealthLabel(): string {
      return this.GetHealthLabel();
    }

    /**
     * Get CSS class for health banner
     */
    public GetHealthClass(): string {
        const score = this.GetHealthScore();
        if (score >= 75) return '';
        if (score >= 50) return 'health-warning';
        return 'health-critical';
    }

    /** @deprecated Use {@link GetHealthClass}. */
    public getHealthClass(): string {
      return this.GetHealthClass();
    }

    /**
     * Get donut chart offset for segment
     */
    public GetDonutOffset(index: number): number {
        let offset = 0;
        for (let i = 0; i < index; i++) {
            offset -= this.ScopeStats[i].percentage * 2.51;
        }
        return offset;
    }

    /** @deprecated Use {@link GetDonutOffset}. */
    public getDonutOffset(index: number): number {
      return this.GetDonutOffset(index);
    }

    /**
     * Get activity icon based on action
     */
    public GetActionIcon(action: ActivityAction): string {
        switch (action) {
            case 'Created': return 'fa-solid fa-plus';
            case 'Updated': return 'fa-solid fa-pencil';
            case 'Revoked': return 'fa-solid fa-ban';
            case 'Used': return 'fa-solid fa-arrow-right-to-bracket';
            case 'Extended': return 'fa-solid fa-clock-rotate-left';
            default: return 'fa-solid fa-circle';
        }
    }

    /** @deprecated Use {@link GetActionIcon}. */
    public getActionIcon(action: ActivityAction): string {
      return this.GetActionIcon(action);
    }

    /**
     * Get CSS class for activity action
     */
    public GetActionClass(action: ActivityAction): string {
        switch (action) {
            case 'Created': return 'action-created';
            case 'Updated': return 'action-updated';
            case 'Revoked': return 'action-revoked';
            case 'Used': return 'action-used';
            case 'Extended': return 'action-extended';
            default: return '';
        }
    }

    /** @deprecated Use {@link GetActionClass}. */
    public getActionClass(action: ActivityAction): string {
      return this.GetActionClass(action);
    }

    /**
     * Format date for display
     */
    public formatDate(date: Date | null): string {
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
    public FormatExpiration(date: Date | null): string {
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

    /** @deprecated Use {@link FormatExpiration}. */
    public formatExpiration(date: Date | null): string {
      return this.FormatExpiration(date);
    }

    /**
     * Get expiration status class
     */
    public GetExpirationClass(key: MJAPIKeyEntity): string {
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

    /** @deprecated Use {@link GetExpirationClass}. */
    public getExpirationClass(key: MJAPIKeyEntity): string {
      return this.GetExpirationClass(key);
    }

    /**
     * View activity for a key
     */
    public OnActivityClick(activity: ActivityItem): void {
        const key = this.APIKeys.find(k => UUIDsEqual(k.ID, activity.keyId));
        if (key) {
            this.OpenEditPanel(key);
        }
    }

    /** @deprecated Use {@link OnActivityClick}. */
    public onActivityClick(activity: ActivityItem): void {
      return this.OnActivityClick(activity);
    }

    /**
     * View scope details - now navigates to scopes tab
     */
    public OnScopeClick(_stat: ScopeStat): void {
        this.MainTab = 'scopes';
    }

    /** @deprecated Use {@link OnScopeClick}. */
    public onScopeClick(_stat: ScopeStat): void {
      return this.OnScopeClick(_stat);
    }

    /**
     * Switch to a main tab. Resets to the overview view when returning to the
     * Keys tab so the user always lands on the dashboard, not a stale list view.
     */
    public SwitchTab(tab: MainTab): void {
        this.MainTab = tab;
        if (tab === 'keys') {
            this.CurrentView = 'overview';
        }
        this.publishAgentContext();
    }

    /** @deprecated Use {@link SwitchTab}. */
    public switchTab(tab: MainTab): void {
      return this.SwitchTab(tab);
    }

    /**
     * L2 tabs rendered as `<mj-tab-nav>` in the interior chrome's [toolbar] slot.
     * Badges reflect live counts; Usage Analytics has no badge by design.
     */
    public get TabsConfig(): TabConfig[] {
        return [
            { key: 'keys',         icon: 'fa-solid fa-key',           label: 'API Keys',         badge: this.TotalKeys },
            { key: 'applications', icon: 'fa-solid fa-cube',          label: 'Applications',     badge: this.ApplicationCount },
            { key: 'scopes',       icon: 'fa-solid fa-shield-halved', label: 'Scopes',           badge: this.ScopeCount },
            { key: 'usage',        icon: 'fa-solid fa-chart-line',    label: 'Usage Analytics' }
        ];
    }

    /** @deprecated Use {@link TabsConfig}. */
    public get tabsConfig(): TabConfig[] {
      return this.TabsConfig;
    }

    /** Adapter for `<mj-tab-nav>`'s string-typed `(TabChange)` output. */
    public OnTabChange(key: string): void {
        if (key === 'keys' || key === 'applications' || key === 'scopes' || key === 'usage') {
            this.SwitchTab(key);
        }
    }

    /** @deprecated Use {@link OnTabChange}. */
    public onTabChange(key: string): void {
      return this.OnTabChange(key);
    }

    /** Title rendered in the interior chrome — varies per tab. */
    public get CurrentTabTitle(): string {
        switch (this.MainTab) {
            case 'keys':         return 'API Keys';
            case 'applications': return 'API Applications';
            case 'scopes':       return 'API Scopes';
            case 'usage':        return 'Usage Analytics';
        }
    }

    /** @deprecated Use {@link CurrentTabTitle}. */
    public get currentTabTitle(): string {
      return this.CurrentTabTitle;
    }

    /** Subtitle rendered in the interior chrome — varies per tab to give context. */
    public get CurrentTabSubtitle(): string {
        switch (this.MainTab) {
            case 'keys':         return 'Manage API keys for external integrations and services';
            case 'applications': return 'Register and manage API applications';
            case 'scopes':       return 'Permission scopes that can be granted to API keys';
            case 'usage':        return 'Track usage patterns and analytics across all API keys';
        }
    }

    /** @deprecated Use {@link CurrentTabSubtitle}. */
    public get currentTabSubtitle(): string {
      return this.CurrentTabSubtitle;
    }

    /**
     * Handle updates from child panels
     */
    public async OnDataUpdated(): Promise<void> {
        await this.loadCounts();
        this.cdr.markForCheck();
    }

    /** @deprecated Use {@link OnDataUpdated}. */
    public async onDataUpdated(): Promise<void> {
      return this.OnDataUpdated();
    }
}
