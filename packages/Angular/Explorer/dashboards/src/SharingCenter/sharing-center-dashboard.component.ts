import { AfterViewInit, ChangeDetectionStrategy, ChangeDetectorRef, Component, Input, OnDestroy, ViewChild, inject } from '@angular/core';
import { IMetadataProvider, NormalizedPermission, PermissionAction, PermissionAuditEntry } from '@memberjunction/core';
import { PermissionEngine, ResourceData } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { ApplicationManager } from '@memberjunction/ng-base-application';
import { SharingCenterDomainGroup, SharingCenterTab, UserSharingCenterComponent } from '@memberjunction/ng-resource-permissions';
import { BaseDashboard, OpenSharedResourceInExplorer } from '@memberjunction/ng-shared';
import { TabConfig } from '@memberjunction/ng-ui-components';

import { PermissionsDomainGroup, groupPermissionsByDomain } from '../Permissions/permissions-shared';
import {
    buildSharingCenterAgentContext,
    resolveSharingCenterTab,
    SharingCenterDashboardTab,
} from './sharing-center-agent-context';
import {
    filterSharingCenterActivityEntries,
    filterSharingCenterPermissionGroups,
    getSharingCenterAccessSource,
    getSharingCenterAccessSourceLabel,
} from './sharing-center-view-models';

interface SharingCenterDashboardState {
    activeTab?: SharingCenterDashboardTab;
}

/**
 * Full-page host for direct sharing plus the P2 read-only transparency reports.
 * The generic child owns share grouping and revoke writes; this dashboard owns
 * Explorer chrome, shared filtering, URL state, and self-service visibility.
 */
@Component({
    standalone: false,
    selector: 'mj-sharing-center-dashboard',
    templateUrl: './sharing-center-dashboard.component.html',
    styleUrls: ['./sharing-center-dashboard.component.css'],
    changeDetection: ChangeDetectionStrategy.OnPush,
})
@RegisterClass(BaseDashboard, 'SharingCenter')
export class SharingCenterDashboardComponent extends BaseDashboard implements AfterViewInit, OnDestroy {
    @ViewChild(UserSharingCenterComponent) private sharingCenter?: UserSharingCenterComponent;

    /** Explicitly re-declared so Angular publishes the inherited provider as a component input. */
    @Input() override Provider: IMetadataProvider | null = null;

    /** The resource wrapper's data carries the tab's persisted query parameters. */
    @Input()
    override set Data(value: ResourceData) {
        super.Data = value;
    }
    override get Data(): ResourceData {
        return super.Data;
    }

    public ActiveTab: SharingCenterDashboardTab = 'shared-with-me';
    public ActiveShareTab: SharingCenterTab = 'shared-with-me';
    public IsRefreshing = false;
    public SearchTerm = '';
    public DomainFilter = '';

    public MyAccessGroups: PermissionsDomainGroup[] = [];
    public ActivityEntries: PermissionAuditEntry[] = [];
    public IsLoadingMyAccess = false;
    public IsLoadingActivity = false;
    public HasLoadedMyAccess = false;
    public HasLoadedActivity = false;
    public TransparencyErrorMessage: string | null = null;

    private hasLoadedSharedWithMe = false;
    private hasLoadedSharedByMe = false;
    private myAccessRequest: Promise<void> | null = null;
    private activityRequest: Promise<void> | null = null;

    private readonly cdr = inject(ChangeDetectorRef);
    private readonly appManager = inject(ApplicationManager);

    public readonly Tabs: TabConfig[] = [
        { key: 'shared-with-me', label: 'Inbox', icon: 'fa-solid fa-inbox' },
        { key: 'shared-by-me', label: 'Shared by me', icon: 'fa-solid fa-paper-plane' },
        { key: 'my-access', label: 'My Access', icon: 'fa-solid fa-shield-halved' },
        { key: 'activity', label: 'Activity', icon: 'fa-solid fa-clock-rotate-left' },
    ];

    public get FilteredMyAccessGroups(): PermissionsDomainGroup[] {
        return filterSharingCenterPermissionGroups(this.MyAccessGroups, this.SearchTerm, this.DomainFilter);
    }

    public get FilteredActivityEntries(): PermissionAuditEntry[] {
        return filterSharingCenterActivityEntries(this.ActivityEntries, this.SearchTerm, this.DomainFilter);
    }

    public get MyAccessCount(): number {
        return this.MyAccessGroups.reduce((sum, group) => sum + group.Count, 0);
    }

    public get SharedWithMeCount(): number | null {
        if (!this.hasLoadedSharedWithMe) {
            return null;
        }
        return this.countShareRows(this.sharingCenter?.SharedWithMe ?? []);
    }

    public get SharedByMeCount(): number | null {
        if (!this.hasLoadedSharedByMe) {
            return null;
        }
        return this.countShareRows(this.sharingCenter?.SharedByMe ?? []);
    }

    public get AvailableDomains(): string[] {
        const names = new Set<string>();
        for (const domain of PermissionEngine.Instance.Domains) {
            names.add(domain.Name);
        }
        for (const group of this.MyAccessGroups) {
            names.add(group.DomainName);
        }
        for (const entry of this.ActivityEntries) {
            names.add(entry.DomainName);
        }
        for (const group of this.sharingCenter?.SharedWithMe ?? []) {
            names.add(group.DomainName);
        }
        for (const group of this.sharingCenter?.SharedByMe ?? []) {
            names.add(group.DomainName);
        }
        return Array.from(names).sort((left, right) => left.localeCompare(right));
    }

    public get ActiveFilterCount(): number {
        return this.DomainFilter ? 1 : 0;
    }

    public get IsShareTab(): boolean {
        return this.ActiveTab === 'shared-with-me' || this.ActiveTab === 'shared-by-me';
    }

    public get HasActiveFilters(): boolean {
        return this.SearchTerm.trim().length > 0 || this.DomainFilter.length > 0;
    }

    async GetResourceDisplayName(_data: ResourceData): Promise<string> {
        return 'Sharing Center';
    }

    protected override initDashboard(): void {
        const savedState: SharingCenterDashboardState | undefined = this.Config?.userState;
        const savedTab = resolveSharingCenterTab(savedState?.activeTab);
        const queryTab = resolveSharingCenterTab(this.GetQueryParams()['tab']);
        this.ActiveTab = queryTab ?? savedTab ?? 'shared-with-me';
        if (this.ActiveTab === 'shared-with-me' || this.ActiveTab === 'shared-by-me') {
            this.ActiveShareTab = this.ActiveTab;
        }
    }

    protected override loadData(): void {
        void this.loadTransparencyData(false);
    }

    ngAfterViewInit(): void {
        this.publishAgentContext();
    }

    override ngOnDestroy(): void {
        super.ngOnDestroy();
    }

    /** Receives both tab-nav clicks and the generic component's two-way tab output. */
    public OnTabChange(tabValue: string): void {
        const tab = resolveSharingCenterTab(tabValue);
        if (!tab || tab === this.ActiveTab) {
            return;
        }

        this.ActiveTab = tab;
        if (tab === 'shared-with-me' || tab === 'shared-by-me') {
            this.ActiveShareTab = tab;
        }
        this.UpdateQueryParams({ tab });
        this.UserStateChanged.emit({ activeTab: tab } satisfies SharingCenterDashboardState);
        this.publishAgentContext();
        this.cdr.markForCheck();
    }

    /** Applies deep links, pin clicks, and browser back/forward updates. */
    public HandleQueryParamsChanged(params: Record<string, string>, _source: 'popstate' | 'deeplink'): void {
        const tab = resolveSharingCenterTab(params['tab']);
        if (!tab || tab === this.ActiveTab) {
            return;
        }

        this.ActiveTab = tab;
        if (tab === 'shared-with-me' || tab === 'shared-by-me') {
            this.ActiveShareTab = tab;
        }
        this.publishAgentContext();
        this.cdr.markForCheck();
    }

    public OnSearchChange(searchTerm: string): void {
        this.SearchTerm = searchTerm;
        this.publishAgentContext();
        this.cdr.markForCheck();
    }

    public OnDomainFilterChange(domainFilter: string): void {
        this.DomainFilter = domainFilter;
        this.publishAgentContext();
        this.cdr.markForCheck();
    }

    public OnResetFilters(): void {
        if (!this.DomainFilter) {
            return;
        }
        this.DomainFilter = '';
        this.publishAgentContext();
        this.cdr.markForCheck();
    }

    public async OnRefresh(): Promise<void> {
        this.IsRefreshing = true;
        this.publishAgentContext();
        try {
            await Promise.all([
                this.sharingCenter?.Refresh() ?? Promise.resolve(),
                this.loadTransparencyData(true),
            ]);
        } finally {
            this.IsRefreshing = false;
            this.publishAgentContext();
            this.cdr.markForCheck();
        }
    }

    public OnSharesLoaded(tab: SharingCenterTab): void {
        if (tab === 'shared-with-me') {
            this.hasLoadedSharedWithMe = true;
        } else {
            this.hasLoadedSharedByMe = true;
        }
        this.publishAgentContext();
        this.cdr.markForCheck();
    }

    public async OnResourceClicked(row: NormalizedPermission): Promise<void> {
        await OpenSharedResourceInExplorer(row, this.navigationService, this.appManager);
    }

    public OnAccessGroupExpandedChange(group: PermissionsDomainGroup, expanded: boolean): void {
        const sourceGroup = this.MyAccessGroups.find((candidate) => candidate.DomainName === group.DomainName);
        if (sourceGroup) {
            sourceGroup.Expanded = expanded;
        }
        this.cdr.markForCheck();
    }

    public AccessSourceLabel(row: NormalizedPermission): string {
        return getSharingCenterAccessSourceLabel(getSharingCenterAccessSource(row));
    }

    public AccessSourceClass(row: NormalizedPermission): string {
        return `sharing-center-dashboard__source sharing-center-dashboard__source--${getSharingCenterAccessSource(row).toLocaleLowerCase()}`;
    }

    public ActionsLabel(actions: PermissionAction[]): string {
        return actions.join(', ');
    }

    public ChangeIcon(changeType: PermissionAuditEntry['ChangeType']): string {
        switch (changeType) {
            case 'Create':
                return 'fa-solid fa-plus';
            case 'Update':
                return 'fa-solid fa-pen';
            case 'Delete':
                return 'fa-solid fa-trash';
            case 'Snapshot':
                return 'fa-solid fa-camera';
        }
    }

    public TrackByDomain(_index: number, group: PermissionsDomainGroup): string {
        return group.DomainName;
    }

    public TrackByPermission(_index: number, row: NormalizedPermission): string {
        return row.SourceRecordID ?? `${row.DomainName}|${row.ResourceType}|${row.ResourceID ?? ''}|${row.GranteeID ?? ''}`;
    }

    public TrackByActivity(_index: number, entry: PermissionAuditEntry): string {
        return entry.SourceRecordChangeID;
    }

    private async loadTransparencyData(force: boolean): Promise<void> {
        await Promise.all([this.loadMyAccess(force), this.loadActivity(force)]);
    }

    private loadMyAccess(force: boolean): Promise<void> {
        if (this.myAccessRequest) {
            return this.myAccessRequest;
        }
        if (this.HasLoadedMyAccess && !force) {
            return Promise.resolve();
        }

        this.myAccessRequest = this.fetchMyAccess().finally(() => {
            this.myAccessRequest = null;
        });
        return this.myAccessRequest;
    }

    private async fetchMyAccess(): Promise<void> {
        const user = this.Provider?.CurrentUser ?? this.ProviderToUse?.CurrentUser;
        if (!user) {
            return;
        }

        this.IsLoadingMyAccess = true;
        this.TransparencyErrorMessage = null;
        this.cdr.markForCheck();
        try {
            const rows = await PermissionEngine.Instance.GetAllUserPermissions(user);
            this.MyAccessGroups = groupPermissionsByDomain(rows, this.getDomainOrderMap());
            this.HasLoadedMyAccess = true;
        } catch (error) {
            this.MyAccessGroups = [];
            this.TransparencyErrorMessage = `Unable to load your access report: ${
                error instanceof Error ? error.message : 'an unexpected error occurred'
            }`;
        } finally {
            this.IsLoadingMyAccess = false;
            this.publishAgentContext();
            this.cdr.markForCheck();
        }
    }

    private loadActivity(force: boolean): Promise<void> {
        if (this.activityRequest) {
            return this.activityRequest;
        }
        if (this.HasLoadedActivity && !force) {
            return Promise.resolve();
        }

        this.activityRequest = this.fetchActivity().finally(() => {
            this.activityRequest = null;
        });
        return this.activityRequest;
    }

    private async fetchActivity(): Promise<void> {
        const user = this.Provider?.CurrentUser ?? this.ProviderToUse?.CurrentUser;
        if (!user) {
            return;
        }

        this.IsLoadingActivity = true;
        this.TransparencyErrorMessage = null;
        this.cdr.markForCheck();
        try {
            // The audit API is organization-wide when unfiltered. Restricting to
            // the current actor keeps this self-service tab user-scoped.
            this.ActivityEntries = await PermissionEngine.Instance.GetAuditTimeline({
                ChangedByUserID: user.ID,
                MaxRows: 100,
            });
            this.HasLoadedActivity = true;
        } catch (error) {
            this.ActivityEntries = [];
            this.TransparencyErrorMessage = `Unable to load recent activity: ${
                error instanceof Error ? error.message : 'an unexpected error occurred'
            }`;
        } finally {
            this.IsLoadingActivity = false;
            this.publishAgentContext();
            this.cdr.markForCheck();
        }
    }

    private getDomainOrderMap(): Map<string, number> {
        const orderMap = new Map<string, number>();
        for (const domain of PermissionEngine.Instance.Domains) {
            orderMap.set(domain.Name, domain.DisplayOrder ?? 999);
        }
        return orderMap;
    }

    private countShareRows(groups: SharingCenterDomainGroup[]): number {
        return groups.reduce((sum, group) => sum + group.Rows.length, 0);
    }

    /**
     * Implements the dashboard-agent contract without exposing grant, revoke,
     * or other permission mutations. Those remain explicit human UI actions.
     */
    private publishAgentContext(): void {
        this.navigationService.SetAgentContext(
            this,
            buildSharingCenterAgentContext({
                ActiveTab: this.ActiveTab,
                IsRefreshing: this.IsRefreshing,
                SearchTerm: this.SearchTerm,
                DomainFilter: this.DomainFilter,
                MyAccessCount: this.MyAccessCount,
                ActivityEntryCount: this.ActivityEntries.length,
                AvailableDomainNames: this.AvailableDomains,
            })
        );
        this.navigationService.SetAgentClientTools(this, [
            {
                Name: 'SwitchSharingCenterTab',
                Description: 'Switch the Sharing Center tab. This only changes the visible section.',
                ParameterSchema: {
                    type: 'object',
                    properties: {
                        tab: {
                            type: 'string',
                            enum: ['shared-with-me', 'shared-by-me', 'my-access', 'activity'],
                            description: 'The Sharing Center tab to show.',
                        },
                    },
                    required: ['tab'],
                },
                Handler: async (params) => {
                    const value = params['tab'];
                    const tab = typeof value === 'string' ? resolveSharingCenterTab(value) : null;
                    if (!tab) {
                        return { Success: false, ErrorMessage: 'tab must name a Sharing Center tab.' };
                    }
                    this.OnTabChange(tab);
                    return { Success: true, Data: { ActiveTab: tab } };
                },
            },
            {
                Name: 'SearchSharingCenter',
                Description: 'Search the Sharing Center data currently loaded in each tab. Read-only — does not change access.',
                ParameterSchema: {
                    type: 'object',
                    properties: { query: { type: 'string', description: 'Search text; empty clears the search.' } },
                    required: ['query'],
                },
                Handler: async (params) => {
                    const value = params['query'];
                    if (typeof value !== 'string') {
                        return { Success: false, ErrorMessage: 'query must be a string.' };
                    }
                    this.OnSearchChange(value);
                    return { Success: true, Data: { SearchTerm: this.SearchTerm } };
                },
            },
            {
                Name: 'FilterSharingCenterDomain',
                Description: 'Filter the Sharing Center to an available permission domain, or use an empty value to clear it. Read-only.',
                ParameterSchema: {
                    type: 'object',
                    properties: { domainName: { type: 'string', description: 'Exact domain name, or empty to clear.' } },
                    required: ['domainName'],
                },
                Handler: async (params) => {
                    const value = params['domainName'];
                    if (typeof value !== 'string') {
                        return { Success: false, ErrorMessage: 'domainName must be a string.' };
                    }
                    const requestedDomain = value.trim();
                    if (!requestedDomain) {
                        this.OnDomainFilterChange('');
                        return { Success: true, Data: { DomainFilter: '' } };
                    }
                    const domain = this.AvailableDomains.find(
                        (candidate) => candidate.toLocaleLowerCase() === requestedDomain.toLocaleLowerCase()
                    );
                    if (!domain) {
                        return { Success: false, ErrorMessage: `Unknown permission domain: ${requestedDomain}.` };
                    }
                    this.OnDomainFilterChange(domain);
                    return { Success: true, Data: { DomainFilter: domain } };
                },
            },
            {
                Name: 'RefreshSharingCenter',
                Description: 'Refresh the loaded Sharing Center reports. Does not change any access.',
                ParameterSchema: { type: 'object', properties: {} },
                Handler: async () => {
                    await this.OnRefresh();
                    return { Success: true };
                },
            },
        ]);
    }
}
