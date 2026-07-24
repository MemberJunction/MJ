import { AfterViewInit, ChangeDetectionStrategy, ChangeDetectorRef, Component, Input, OnDestroy, ViewChild, inject } from '@angular/core';
import { IMetadataProvider, NormalizedPermission } from '@memberjunction/core';
import { ResourceData } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { ApplicationManager } from '@memberjunction/ng-base-application';
import { UserSharingCenterComponent } from '@memberjunction/ng-resource-permissions';
import { BaseDashboard, OpenSharedResourceInExplorer } from '@memberjunction/ng-shared';
import { TabConfig } from '@memberjunction/ng-ui-components';
import {
    buildSharingCenterAgentContext,
    resolveSharingCenterTab,
    SharingCenterDashboardTab,
} from './sharing-center-agent-context';

interface SharingCenterDashboardState {
    activeTab?: SharingCenterDashboardTab;
}

/**
 * Full-page host for a user's direct shares. The generic child owns the actual
 * share grouping and revoke write, while this dashboard owns Explorer chrome,
 * URL state, navigation, and agent integration.
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
    public IsRefreshing = false;

    private readonly cdr = inject(ChangeDetectorRef);
    private readonly appManager = inject(ApplicationManager);

    public readonly Tabs: TabConfig[] = [
        { key: 'shared-with-me', label: 'Inbox', icon: 'fa-solid fa-inbox' },
        { key: 'shared-by-me', label: 'Shared by me', icon: 'fa-solid fa-paper-plane' },
    ];

    async GetResourceDisplayName(_data: ResourceData): Promise<string> {
        return 'Sharing Center';
    }

    protected override initDashboard(): void {
        const savedState: SharingCenterDashboardState | undefined = this.Config?.userState;
        const savedTab = resolveSharingCenterTab(savedState?.activeTab);
        const queryTab = resolveSharingCenterTab(this.GetQueryParams()['tab']);
        this.ActiveTab = queryTab ?? savedTab ?? 'shared-with-me';
    }

    protected override loadData(): void {
        // The embedded generic component owns the permission-engine queries.
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
        this.publishAgentContext();
        this.cdr.markForCheck();
    }

    public async OnRefresh(): Promise<void> {
        this.IsRefreshing = true;
        this.publishAgentContext();
        try {
            await this.sharingCenter?.Refresh();
        } finally {
            this.IsRefreshing = false;
            this.publishAgentContext();
            this.cdr.markForCheck();
        }
    }

    public async OnResourceClicked(row: NormalizedPermission): Promise<void> {
        await OpenSharedResourceInExplorer(row, this.navigationService, this.appManager);
    }

    /**
     * Implements the dashboard-agent contract without exposing grant, revoke,
     * or other permission mutations. Those remain explicit human UI actions.
     */
    private publishAgentContext(): void {
        this.navigationService.SetAgentContext(
            this,
            buildSharingCenterAgentContext({ ActiveTab: this.ActiveTab, IsRefreshing: this.IsRefreshing })
        );
        this.navigationService.SetAgentClientTools(this, [
            {
                Name: 'SwitchSharingCenterTab',
                Description: 'Switch the Sharing Center between Inbox and Shared by me. This only changes the visible tab.',
                ParameterSchema: {
                    type: 'object',
                    properties: {
                        tab: {
                            type: 'string',
                            enum: ['shared-with-me', 'shared-by-me'],
                            description: 'The Sharing Center tab to show.',
                        },
                    },
                    required: ['tab'],
                },
                Handler: async (params) => {
                    const value = params['tab'];
                    const tab = typeof value === 'string' ? resolveSharingCenterTab(value) : null;
                    if (!tab) {
                        return { Success: false, ErrorMessage: 'tab must be shared-with-me or shared-by-me.' };
                    }
                    this.OnTabChange(tab);
                    return { Success: true, Data: { ActiveTab: tab } };
                },
            },
            {
                Name: 'RefreshSharingCenter',
                Description: 'Refresh the permission list displayed on the active Sharing Center tab. Does not change any access.',
                ParameterSchema: { type: 'object', properties: {} },
                Handler: async () => {
                    await this.OnRefresh();
                    return { Success: true };
                },
            },
        ]);
    }
}
