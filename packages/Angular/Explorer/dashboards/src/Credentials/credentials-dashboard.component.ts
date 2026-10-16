import { Component, AfterViewInit, OnDestroy, ChangeDetectorRef, ChangeDetectionStrategy } from '@angular/core';
import { BaseDashboard } from '@memberjunction/ng-shared';
import { RegisterClass } from '@memberjunction/global';
import { Subject } from 'rxjs';
import { debounceTime } from 'rxjs/operators';
import { SharedService } from '@memberjunction/ng-shared';
import { ResourceData } from '@memberjunction/core-entities';
import { RunView } from '@memberjunction/core';
import {
    BuildCredentialsAgentContext,
    IsValidCredentialsTab,
    VALID_CREDENTIALS_TABS,
} from './credentials-agent-context';
import { ValidateEnumParam, ValidateStringParam, AgentToolResult } from '../shared/agent-tool-validation';

interface CredentialsDashboardState {
    activeTab: string;
}

@Component({
  standalone: false,
    selector: 'mj-credentials-dashboard',
    templateUrl: './credentials-dashboard.component.html',
    styleUrls: ['./credentials-dashboard.component.css'],
    changeDetection: ChangeDetectionStrategy.OnPush
})
@RegisterClass(BaseDashboard, 'CredentialsDashboard')
export class CredentialsDashboardComponent extends BaseDashboard implements AfterViewInit, OnDestroy {
    public isLoading = false;
    public ActiveTab = 'overview';

    /** @deprecated Use {@link ActiveTab}. */
    public get activeTab() {
      return this.ActiveTab;
    }
    /** @deprecated Use {@link ActiveTab}. */
    public set activeTab(value) {
      this.ActiveTab = value;
    }
    public SelectedIndex = 0;

    /** @deprecated Use {@link SelectedIndex}. */
    public get selectedIndex() {
      return this.SelectedIndex;
    }
    /** @deprecated Use {@link SelectedIndex}. */
    public set selectedIndex(value) {
      this.SelectedIndex = value;
    }

    // Counts for badges
    public CredentialCount = 0;

    /** @deprecated Use {@link CredentialCount}. */
    public get credentialCount() {
      return this.CredentialCount;
    }
    /** @deprecated Use {@link CredentialCount}. */
    public set credentialCount(value) {
      this.CredentialCount = value;
    }
    public TypeCount = 0;

    /** @deprecated Use {@link TypeCount}. */
    public get typeCount() {
      return this.TypeCount;
    }
    /** @deprecated Use {@link TypeCount}. */
    public set typeCount(value) {
      this.TypeCount = value;
    }
    public CategoryCount = 0;

    /** @deprecated Use {@link CategoryCount}. */
    public get categoryCount() {
      return this.CategoryCount;
    }
    /** @deprecated Use {@link CategoryCount}. */
    public set categoryCount(value) {
      this.CategoryCount = value;
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

    // Bounded definition names (non-sensitive: schema/organizational definitions,
    // NOT individual credential records or secret values).
    public TypeNames: string[] = [];

    /** @deprecated Use {@link TypeNames}. */
    public get typeNames(): string[] {
      return this.TypeNames;
    }
    /** @deprecated Use {@link TypeNames}. */
    public set typeNames(value: string[]) {
      this.TypeNames = value;
    }
    public CategoryNames: string[] = [];

    /** @deprecated Use {@link CategoryNames}. */
    public get categoryNames(): string[] {
      return this.CategoryNames;
    }
    /** @deprecated Use {@link CategoryNames}. */
    public set categoryNames(value: string[]) {
      this.CategoryNames = value;
    }

    // Track visited tabs for lazy loading
    private visitedTabs = new Set<string>();

    // Navigation items
    public NavigationItems: string[] = ['overview', 'credentials', 'types', 'categories', 'audit'];

    /** @deprecated Use {@link NavigationItems}. */
    public get navigationItems(): string[] {
      return this.NavigationItems;
    }
    /** @deprecated Use {@link NavigationItems}. */
    public set navigationItems(value: string[]) {
      this.NavigationItems = value;
    }

    public TabLabels: Record<string, string> = {
        'overview': 'Overview',
        'credentials': 'Credentials',
        'types': 'Credential Types',
        'categories': 'Categories',
        'audit': 'Audit Trail'
    };

    /** @deprecated Use {@link TabLabels}. */
    public get tabLabels(): Record<string, string> {
      return this.TabLabels;
    }
    /** @deprecated Use {@link TabLabels}. */
    public set tabLabels(value: Record<string, string>) {
      this.TabLabels = value;
    }

    private stateChangeSubject = new Subject<CredentialsDashboardState>();

    constructor(private cdr: ChangeDetectorRef) {
        super();
        this.setupStateManagement();
    }

    async GetResourceDisplayName(data: ResourceData): Promise<string> {
        return "Credentials";
    }

    ngAfterViewInit(): void {
        this.visitedTabs.add(this.ActiveTab);
        this.registerAgentClientTools();
        this.loadCounts();
        this.emitStateChange();
        this.publishAgentContext();
        this.cdr.detectChanges();
    }

    // ================================================================
    // AI Agent Context & Client Tools
    //
    // 🚨 SAFETY BOUNDARY — READ-ONLY / NAVIGATIONAL ONLY 🚨
    // Credentials is a highly security-sensitive surface. The agent context and
    // client tools registered here are strictly NAVIGATIONAL + READ-ONLY: tab
    // switches, a metadata-count refresh, and a credential-TYPE-definition lookup
    // that navigates to the Types tab. The following are DELIBERATELY NOT exposed
    // to the agent and must remain human-initiated:
    //   - Reading / revealing any credential SECRET value (`Values`), API key,
    //     password, token, or connection string.
    //   - Creating, editing, or deleting credentials.
    //   - Creating, renaming, or deleting credential types or categories.
    //   - Writing to the audit trail.
    // Context exposes ONLY the active tab + label, aggregate counts (credentials /
    // types / categories / expiring-soon), the loading flag, and bounded
    // credential-TYPE + CATEGORY *definition* names (e.g. "OAuth 2.0", "API Key" —
    // reusable schema/organizational definitions, NOT individual credential
    // records and NEVER a secret). It never exposes an individual credential's
    // name or its secret payload. See credentials-agent-context.ts for the
    // metadata-only context contract and the no-secret-leak unit test.
    // ================================================================

    /**
     * Publish the current Credentials dashboard state to the AI agent. Re-invoked on
     * every meaningful state change (data load, tab switch). Only non-sensitive
     * navigation/metadata is exposed — never secret values.
     */
    private publishAgentContext(): void {
        this.navigationService.SetAgentContext(this, BuildCredentialsAgentContext({
            ActiveTab: IsValidCredentialsTab(this.ActiveTab) ? this.ActiveTab : 'overview',
            TabLabel: this.GetCurrentTabLabel(),
            CredentialCount: this.CredentialCount,
            TypeCount: this.TypeCount,
            CategoryCount: this.CategoryCount,
            ExpiringSoonCount: this.ExpiringSoonCount,
            IsLoading: this.isLoading,
            TypeNames: this.TypeNames,
            CategoryNames: this.CategoryNames,
        }));
    }

    /**
     * Register the read-only / navigational client tools the agent may invoke.
     * Every Handler is tolerant: validates input and returns
     * `{ Success: false, ErrorMessage }` rather than throwing. No tool here
     * reads, reveals, or mutates any credential.
     */
    private registerAgentClientTools(): void {
        this.navigationService.SetAgentClientTools(this, [
            {
                Name: 'SwitchCredentialsTab',
                Description: 'Switch the active Credentials tab. Valid tabs: overview, credentials, types, categories, audit. Navigational only — does not read or reveal any credential.',
                ParameterSchema: { type: 'object', properties: { tabId: { type: 'string', enum: [...VALID_CREDENTIALS_TABS] } }, required: ['tabId'] },
                Handler: async (params: Record<string, unknown>) => this.handleSwitchTabTool(params),
            },
            {
                Name: 'RefreshCredentialCounts',
                Description: 'Reload the aggregate credential and credential-type counts shown on the dashboard. Read-only — does not create, modify, reveal, or delete any credential.',
                ParameterSchema: { type: 'object', properties: {} },
                Handler: async () => this.handleRefreshCountsTool(),
            },
            {
                Name: 'FindCredentialType',
                Description: 'Look up a credential TYPE definition (e.g. "OAuth 2.0", "API Key") by name and switch to the Types tab to view it. Read-only navigation — does not reveal any credential or secret. Returns the matched type name, or the available type names on a miss.',
                ParameterSchema: { type: 'object', properties: { name: { type: 'string' } }, required: ['name'] },
                Handler: async (params: Record<string, unknown>) => this.handleFindCredentialTypeTool(params),
            },
        ]);
    }

    private handleSwitchTabTool(params: Record<string, unknown>): AgentToolResult {
        const v = ValidateEnumParam(params?.['tabId'], VALID_CREDENTIALS_TABS, 'tabId');
        if (!v.ok) {
            return v.result;
        }
        this.OnTabChange(v.value);
        return { Success: true };
    }

    /**
     * Resolve a credential-type definition by name (exact, case-insensitive, then
     * partial-contains) and navigate to the Types tab. Read-only: opens the Types
     * tab for viewing; never reveals a credential record or secret value.
     */
    private handleFindCredentialTypeTool(params: Record<string, unknown>): AgentToolResult {
        const v = ValidateStringParam(params?.['name'], 'name');
        if (!v.ok) {
            return v.result;
        }
        const query = v.value.trim().toLowerCase();
        if (!query) {
            return { Success: false, ErrorMessage: 'name must be a non-empty string.' };
        }
        const exact = this.TypeNames.find(n => n.toLowerCase() === query);
        const match = exact ?? this.TypeNames.find(n => n.toLowerCase().includes(query));
        if (!match) {
            const available = this.TypeNames.slice(0, 25).join(', ');
            return { Success: false, ErrorMessage: `No credential type matches "${v.value}". Available types: ${available || '(none)'}.` };
        }
        this.OnTabChange('types');
        return { Success: true };
    }

    private async handleRefreshCountsTool(): Promise<AgentToolResult> {
        try {
            await this.loadCounts();
            this.publishAgentContext();
            return { Success: true };
        } catch (e) {
            return { Success: false, ErrorMessage: e instanceof Error ? e.message : 'Refresh failed.' };
        }
    }

    ngOnDestroy(): void {
        super.ngOnDestroy();
        this.stateChangeSubject.complete();
    }

    private async loadCounts(): Promise<void> {
        try {
            const rv = RunView.FromMetadataProvider(this.ProviderToUse);

            // Batch the read-only metadata queries. We load credential-type and
            // category DEFINITIONS (names + the type's Category enum) — these are
            // schema/organizational definitions, NOT credential records or secret
            // values. We deliberately never load the `Values` (secret payload)
            // field, nor individual credential names.
            const now = new Date();
            const [credResult, typeResult, categoryResult, expiringResult] = await rv.RunViews([
                {
                    EntityName: 'MJ: Credentials',
                    ExtraFilter: 'IsActive = 1',
                    ResultType: 'count_only'
                },
                {
                    EntityName: 'MJ: Credential Types',
                    Fields: ['Name', 'Category'],
                    OrderBy: 'Name',
                    ResultType: 'simple'
                },
                {
                    EntityName: 'MJ: Credential Categories',
                    Fields: ['Name'],
                    OrderBy: 'Name',
                    ResultType: 'simple'
                },
                {
                    EntityName: 'MJ: Credentials',
                    ExtraFilter: `IsActive = 1 AND ExpiresAt IS NOT NULL AND ExpiresAt > '${now.toISOString()}' AND ExpiresAt < '${new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString()}'`,
                    ResultType: 'count_only'
                }
            ]);

            if (credResult.Success) {
                this.CredentialCount = credResult.RowCount;
            }
            if (typeResult.Success) {
                const rows = typeResult.Results as Array<{ Name?: string }>;
                this.TypeNames = rows.map(r => r.Name ?? '').filter(n => n.length > 0);
                this.TypeCount = rows.length;
            }
            if (categoryResult.Success) {
                const rows = categoryResult.Results as Array<{ Name?: string }>;
                this.CategoryNames = rows.map(r => r.Name ?? '').filter(n => n.length > 0);
                this.CategoryCount = rows.length;
            }
            if (expiringResult.Success) {
                this.ExpiringSoonCount = expiringResult.RowCount;
            }

            this.publishAgentContext();
            this.cdr.markForCheck();
        } catch (error) {
            console.error('Error loading counts:', error);
        }
    }

    public OnTabChange(tabId: string): void {
        this.ActiveTab = tabId;
        const index = this.NavigationItems.indexOf(tabId);

        this.SelectedIndex = index >= 0 ? index : 0;

        setTimeout(() => {
            SharedService.Instance.InvokeManualResize();
        }, 100);

        this.visitedTabs.add(tabId);
        this.emitStateChange();
        this.publishAgentContext();
        this.cdr.markForCheck();
    }

    /** @deprecated Use {@link OnTabChange}. */
    public onTabChange(tabId: string): void {
      return this.OnTabChange(tabId);
    }

    public HasVisited(tabId: string): boolean {
        return this.visitedTabs.has(tabId);
    }

    /** @deprecated Use {@link HasVisited}. */
    public hasVisited(tabId: string): boolean {
      return this.HasVisited(tabId);
    }

    private setupStateManagement(): void {
        this.stateChangeSubject.pipe(
            debounceTime(50)
        ).subscribe(state => {
            this.UserStateChanged.emit(state);
        });
    }

    private emitStateChange(): void {
        const state: CredentialsDashboardState = {
            activeTab: this.ActiveTab
        };

        this.stateChangeSubject.next(state);
    }

    public LoadUserState(state: Partial<CredentialsDashboardState>): void {
        if (state.activeTab) {
            this.ActiveTab = state.activeTab;
            const index = this.NavigationItems.indexOf(state.activeTab);
            this.SelectedIndex = index >= 0 ? index : 0;
            this.visitedTabs.add(state.activeTab);
        }

        this.cdr.markForCheck();
    }

    /** @deprecated Use {@link LoadUserState}. */
    public loadUserState(state: Partial<CredentialsDashboardState>): void {
      return this.LoadUserState(state);
    }

    initDashboard(): void {
        try {
            this.isLoading = true;
        } catch (error) {
            console.error('Error initializing Credentials dashboard:', error);
            this.Error.emit(new Error('Failed to initialize Credentials dashboard. Please try again.'));
        } finally {
            this.isLoading = false;
        }
    }

    loadData(): void {
        if (this.Config?.userState) {
            setTimeout(() => {
                if (this.Config?.userState) {
                    this.LoadUserState(this.Config.userState);
                }
            }, 0);
        }

        this.NotifyLoadComplete();
    }

    public GetCurrentTabLabel(): string {
        return this.TabLabels[this.ActiveTab] || 'Credential Management';
    }

    /** @deprecated Use {@link GetCurrentTabLabel}. */
    public getCurrentTabLabel(): string {
      return this.GetCurrentTabLabel();
    }
}
