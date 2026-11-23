// Angular components in this package are partial-compiled — load the JIT compiler first
// (same convention as the other component suites in this node test environment).
import '@angular/compiler';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Subject } from 'rxjs';
import { BaseEntity, IMetadataProvider, RunView, RunViewResult } from '@memberjunction/core';
import { MJGlobal, MJEventType, UUIDMap } from '@memberjunction/global';
import { MJNotificationService } from '@memberjunction/ng-notifications';
import {
    UserInfoEngine,
    type MJAIAgentUserPolicyEntity,
    type MJAgentChannelEntity,
} from '@memberjunction/core-entities';
import { ChiefOfStaffGovernanceComponent } from '../ChiefOfStaff/chief-of-staff-governance.component';
import { ChiefOfStaffAgentChannelsComponent } from '../ChiefOfStaff/chief-of-staff-agent-channels.component';
import { ChiefOfStaffOverviewComponent } from '../ChiefOfStaff/chief-of-staff-overview.component';
import {
    BuildPolicyDraftFromEntity,
    CalculateChiefOfStaffMetrics,
    MY_AGENTS_PREFERENCES_SETTING_KEY,
    ParseMyAgentsDashboardPreferences,
    type EmailApprovalDraft,
    type SelectableGovernanceAgent,
} from '../ChiefOfStaff/chief-of-staff-agent-context';
import type { ChiefOfStaffClientTool } from '../ChiefOfStaff/chief-of-staff-page-base';

const AGENT_COS: SelectableGovernanceAgent = {
    ID: 'A0000000-0000-0000-0000-000000000001',
    Name: 'Chief of Staff',
};
const AGENT_SF: SelectableGovernanceAgent = {
    ID: 'A0000000-0000-0000-0000-000000000002',
    Name: 'Software Factory',
};

interface GovernanceInternalShape {
    _loadGeneration: number;
    chiefOfStaffAgentId: string | null;
    requestedAgentQueryParam: string | null;
    agentQueryParamInitialized: boolean;
    liveReloadPending: boolean;
    emailDraftsByRequest: UUIDMap<EmailApprovalDraft>;
    destroy$: Subject<void>;
    cdr: { markForCheck: () => void; detectChanges: () => void };
    confirmService: { Confirm: (opts: { title: string; message: string }) => Promise<boolean> } | null;
    navigationService: {
        IsResourceDetached: () => boolean;
        SetAgentContext: () => void;
        ResourceReattached$: Subject<ChiefOfStaffGovernanceComponent>;
    };
    resolveSelectedAgent: () => Promise<SelectableGovernanceAgent | null>;
    subscribeToLiveEntityChanges: () => void;
    coreAgentTools: () => ChiefOfStaffClientTool[];
    UpdateQueryParams: (params: Record<string, string | null>) => void;
    showBanner: (type: 'success' | 'error', message: string) => void;
    OnQueryParamsChanged: (params: Record<string, string>, source: 'popstate' | 'deeplink') => void;
}

function okRunView<T>(results: T[]): RunViewResult<T> {
    return {
        Success: true,
        Results: results,
        RowCount: results.length,
        TotalRowCount: results.length,
        ExecutionTime: 0,
        ErrorMessage: '',
        UserViewRunID: '',
    };
}

function createGovernanceHarness(): {
    component: ChiefOfStaffGovernanceComponent;
    internal: GovernanceInternalShape;
    markForCheck: ReturnType<typeof vi.fn>;
} {
    const rawInstance: object = Object.create(ChiefOfStaffGovernanceComponent.prototype) as object;
    const component = rawInstance as ChiefOfStaffGovernanceComponent;
    const internal = rawInstance as GovernanceInternalShape;

    const markForCheck = vi.fn();
    internal._loadGeneration = 0;
    internal.chiefOfStaffAgentId = AGENT_COS.ID;
    internal.requestedAgentQueryParam = null;
    internal.agentQueryParamInitialized = false;
    internal.liveReloadPending = false;
    internal.emailDraftsByRequest = new UUIDMap<EmailApprovalDraft>();
    internal.destroy$ = new Subject<void>();
    internal.cdr = { markForCheck, detectChanges: vi.fn() };
    internal.confirmService = null;
    internal.navigationService = {
        IsResourceDetached: () => false,
        SetAgentContext: vi.fn(),
        ResourceReattached$: new Subject<ChiefOfStaffGovernanceComponent>(),
    };
    internal.UpdateQueryParams = vi.fn();

    component.IsLoading = false;
    component.IsSavingPolicy = false;
    component.PolicyDirty = false;
    component.FeedbackBanner = null;
    component.SearchText = '';
    component.AvailableAgents = [AGENT_COS, AGENT_SF];
    component.SelectedAgentID = AGENT_COS.ID;
    component.SelectedAgentName = AGENT_COS.Name;
    component.PolicyEntity = null;
    component.DraftPolicy = BuildPolicyDraftFromEntity(null, AGENT_COS.Name);
    component.Routines = [];
    component.Requests = [];
    component.Metrics = CalculateChiefOfStaffMetrics([], []);

    Object.defineProperty(component, 'ProviderToUse', {
        get: () =>
            ({
                CurrentUser: { ID: 'U0000000-0000-0000-0000-000000000099' },
            }) as Partial<IMetadataProvider> as IMetadataProvider,
        configurable: true,
    });

    return { component, internal, markForCheck };
}

describe('ChiefOfStaffGovernanceComponent — generation token, agent mismatch guard, and dirty-edit protection', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it('discards out-of-order LoadChiefOfStaffData responses via _loadGeneration when switching agents mid-flight', async () => {
        const { component, internal } = createGovernanceHarness();

        let resolveFirstRunViews!: (value: RunViewResult[]) => void;
        const firstRunViewsPromise = new Promise<RunViewResult[]>((resolve) => {
            resolveFirstRunViews = resolve;
        });

        const cosPolicy = {
            ID: 'P-COS',
            AgentID: AGENT_COS.ID,
            Status: 'Active',
            CoordinationMode: 'Coordinator',
        } as Partial<MJAIAgentUserPolicyEntity> as MJAIAgentUserPolicyEntity;

        const sfPolicy = {
            ID: 'P-SF',
            AgentID: AGENT_SF.ID,
            Status: 'Active',
            CoordinationMode: 'Autonomous',
        } as Partial<MJAIAgentUserPolicyEntity> as MJAIAgentUserPolicyEntity;

        let callIndex = 0;
        vi.spyOn(RunView, 'FromMetadataProvider').mockImplementation(() => {
            callIndex += 1;
            const currentCall = callIndex;
            return {
                RunViews: vi.fn(() => {
                    if (currentCall === 1) {
                        return firstRunViewsPromise;
                    }
                    return Promise.resolve([
                        okRunView([sfPolicy]),
                        okRunView([]),
                        okRunView([]),
                    ]);
                }),
            } as Partial<RunView> as RunView;
        });

        internal.resolveSelectedAgent = vi
            .fn<() => Promise<SelectableGovernanceAgent | null>>()
            .mockResolvedValueOnce(AGENT_COS)
            .mockResolvedValueOnce(AGENT_SF);

        // Start load #1 for Chief of Staff (remains pending on RunViews)
        const load1 = component.LoadChiefOfStaffData();
        // Start load #2 for Software Factory (completes immediately)
        component.SelectedAgentID = AGENT_SF.ID;
        component.SelectedAgentName = AGENT_SF.Name;
        const load2 = component.LoadChiefOfStaffData();
        await load2;

        expect(component.PolicyEntity?.ID).toBe('P-SF');
        expect(component.SelectedAgentID).toBe(AGENT_SF.ID);

        // Now resolve stale load #1 — must NOT overwrite Software Factory's policy or selection
        resolveFirstRunViews([
            okRunView([cosPolicy]),
            okRunView([]),
            okRunView([]),
        ]);
        await load1;

        expect(component.PolicyEntity?.ID).toBe('P-SF');
        expect(component.SelectedAgentID).toBe(AGENT_SF.ID);
        expect(component.SelectedAgentName).toBe(AGENT_SF.Name);
        expect(component.DraftPolicy.CoordinationMode).toBe('Autonomous');
    });

    it('refuses SaveGovernancePolicy when PolicyEntity.AgentID belongs to a different agent than SelectedAgentID', async () => {
        const { component } = createGovernanceHarness();
        const saveSpy = vi.fn().mockResolvedValue(true);

        component.SelectedAgentID = AGENT_SF.ID;
        component.SelectedAgentName = AGENT_SF.Name;
        component.PolicyEntity = {
            ID: 'P-STALE-COS',
            AgentID: AGENT_COS.ID,
            Save: saveSpy,
        } as Partial<MJAIAgentUserPolicyEntity> as MJAIAgentUserPolicyEntity;

        await component.SaveGovernancePolicy();

        expect(saveSpy).not.toHaveBeenCalled();
        expect(component.FeedbackBanner?.Type).toBe('error');
        expect(component.FeedbackBanner?.Message).toMatch(/different agent/i);
    });

    it('guards unsaved PolicyDirty edits against silent loss across agent picker switches, SelectGovernedAgent tool, and live entity broadcasts', async () => {
        vi.useFakeTimers();
        const { component, internal } = createGovernanceHarness();
        const loadSpy = vi.fn(async () => undefined);
        component.LoadChiefOfStaffData = loadSpy;
        internal.subscribeToLiveEntityChanges();

        component.MarkPolicyDirty();
        expect(component.PolicyDirty).toBe(true);

        // 1. Live remote-invalidate event defers reload instead of wiping DraftPolicy
        MJGlobal.Instance.RaiseEvent({
            event: MJEventType.ComponentEvent,
            eventCode: BaseEntity.BaseEventCode,
            component: {},
            args: {
                type: 'remote-invalidate',
                entityName: 'MJ: AI Agent User Policies',
                baseEntity: null,
                payload: { action: 'save' },
            },
        });
        await vi.advanceTimersByTimeAsync(2000);
        expect(loadSpy).not.toHaveBeenCalled();
        expect(internal.liveReloadPending).toBe(true);

        // 2. SelectGovernedAgent client tool refuses to switch while PolicyDirty is true
        const selectTool = internal
            .coreAgentTools()
            .find((t: ChiefOfStaffClientTool) => t.Name === 'SelectGovernedAgent');
        expect(selectTool).toBeDefined();
        const toolResult = (await selectTool!.Handler({ agent: AGENT_SF.Name })) as {
            Success: boolean;
            Error?: string;
        };
        expect(toolResult.Success).toBe(false);
        expect(toolResult.Error).toMatch(/unsaved governance policy changes/i);
        expect(component.SelectedAgentID).toBe(AGENT_COS.ID);

        // 3. UI picker switch prompts confirmService and keeps AGENT_COS when user cancels
        const confirmMock = vi.fn(async () => false);
        internal.confirmService = { Confirm: confirmMock };
        component.OnSelectedAgentChange(AGENT_SF.ID);
        await vi.advanceTimersByTimeAsync(0);

        expect(confirmMock).toHaveBeenCalledTimes(1);
        expect(component.SelectedAgentID).toBe(AGENT_COS.ID);
        expect(component.PolicyDirty).toBe(true);
        expect(loadSpy).not.toHaveBeenCalled();

        // 4. When confirmService is absent, switching agents refuses to silently discard dirty edits
        internal.confirmService = null;
        component.OnSelectedAgentChange(AGENT_SF.ID);
        await vi.advanceTimersByTimeAsync(0);

        expect(component.SelectedAgentID).toBe(AGENT_COS.ID);
        expect(component.PolicyDirty).toBe(true);
        expect(component.FeedbackBanner?.Type).toBe('error');
        expect(component.FeedbackBanner?.Message).toMatch(/unsaved governance policy changes/i);
        expect(loadSpy).not.toHaveBeenCalled();
    });

    it('routes showBanner feedback to auto-dismissing MJNotificationService toasts (3500ms success / 6000ms error)', async () => {
        const { internal } = createGovernanceHarness();
        const createSimpleNotification = vi.fn();
        vi.spyOn(MJNotificationService, 'Instance', 'get').mockReturnValue({
            CreateSimpleNotification: createSimpleNotification,
        } as Partial<MJNotificationService> as MJNotificationService);

        internal.showBanner('success', 'Default Chat Agent set to Pepper.');
        internal.showBanner('error', 'Failed to save governance policy.');

        expect(createSimpleNotification).toHaveBeenNthCalledWith(
            1,
            'Default Chat Agent set to Pepper.',
            'success',
            3500,
        );
        expect(createSimpleNotification).toHaveBeenNthCalledWith(
            2,
            'Failed to save governance policy.',
            'error',
            6000,
        );
    });

    it('manages mobile drill-down transitions in Agents Master-Detail and Agent Channels', async () => {
        const { component, internal } = createGovernanceHarness();
        component.MobileShowingDetail = false;
        component.OnSelectedAgentChange = vi.fn();

        // Tapping an agent in the roster opens mobile detail view
        component.SelectRosterAgent(AGENT_SF);
        expect(component.MobileShowingDetail).toBe(true);
        expect(component.OnSelectedAgentChange).toHaveBeenCalledWith(AGENT_SF.ID);

        // Tapping "All Agents" back button returns to roster list
        component.ShowMobileRoster();
        expect(component.MobileShowingDetail).toBe(false);

        // Deep-linking via ?agentId= transitions straight into mobile detail view
        internal.OnQueryParamsChanged({ agentId: AGENT_SF.ID }, 'deeplink');
        expect(component.MobileShowingDetail).toBe(true);

        // Agent Channels mobile drill-down stays on thread list during initial auto-select and opens on user tap
        const channelsRaw: object = Object.create(ChiefOfStaffAgentChannelsComponent.prototype) as object;
        const channelsComp = channelsRaw as ChiefOfStaffAgentChannelsComponent;
        const channelsInternal = channelsRaw as {
            cdr: { markForCheck: () => void };
            publishAgentContext: () => void;
            LoadMessagesForChannel: (id: string) => Promise<void>;
        };
        channelsInternal.cdr = { markForCheck: vi.fn() };
        channelsInternal.publishAgentContext = vi.fn();
        channelsInternal.LoadMessagesForChannel = vi.fn(async () => undefined);
        channelsComp.MobileShowingDetail = false;

        const stubChannel = {
            ID: 'C0000000-0000-0000-0000-000000000001',
            Topic: 'Q4 Launch Sync',
            ChannelStatus: 'Open',
        } as Partial<MJAgentChannelEntity> as MJAgentChannelEntity;

        await channelsComp.SelectChannel(stubChannel, false);
        expect(channelsComp.MobileShowingDetail).toBe(false);

        await channelsComp.SelectChannel(stubChannel);
        expect(channelsComp.MobileShowingDetail).toBe(true);

        channelsComp.ShowMobileThreadList();
        expect(channelsComp.MobileShowingDetail).toBe(false);
    });

    it('simplifies Shared left rail by default, persists roster & Overview layout prefs via UserInfoEngine, and opens Personalize on hover icon click', () => {
        const setSettingDebounced = vi.fn();
        vi.spyOn(UserInfoEngine, 'Instance', 'get').mockReturnValue({
            SetSettingDebounced: setSettingDebounced,
            GetSetting: vi.fn(() => undefined),
            Config: vi.fn(async () => undefined),
        } as Partial<UserInfoEngine> as UserInfoEngine);

        const { component } = createGovernanceHarness();
        const pepperAgent: SelectableGovernanceAgent = {
            ID: 'A0000000-0000-0000-0000-000000000010',
            Name: 'Pepper',
            BaseAgentID: AGENT_COS.ID,
            BaseAgentName: 'Chief of Staff',
            IsDerivedInstance: true,
            IsOwnedByCurrentUser: true,
            IsPrimaryInstance: true,
        };
        const demoAgent: SelectableGovernanceAgent = {
            ID: 'A0000000-0000-0000-0000-000000000011',
            Name: 'Demo Loop Agent',
            Category: 'Demo',
            IsSystemOrDemo: true,
        };
        component.AvailableAgents = [pepperAgent, AGENT_SF, demoAgent];
        component.SelectedAgentID = pepperAgent.ID;
        component.RosterSearchText = '';

        // Default: Shared collapsed, My Agents expanded, System/Demo hidden
        expect(component.MyAgentsSectionExpanded).toBe(true);
        expect(component.SharedSectionExpanded).toBe(false);
        expect(component.HiddenSystemAndDemoCount).toBe(1);
        expect(component.FilteredSharedAgents.map((a) => a.Name)).toEqual(['Software Factory']);

        // Expanding Shared and toggling Show System & Demo persists via UserInfoEngine
        component.ToggleSharedSection();
        expect(component.SharedSectionExpanded).toBe(true);
        component.ToggleShowSystemAndDemo();
        expect(component.ShowSystemAndDemo).toBe(true);
        expect(component.FilteredSharedAgents.map((a) => a.Name)).toEqual([
            'Software Factory',
            'Demo Loop Agent',
        ]);

        component.SetActiveSubTab('persona');
        expect(setSettingDebounced).toHaveBeenCalledTimes(3);
        const lastArgs = setSettingDebounced.mock.calls[2];
        expect(lastArgs[0]).toBe(MY_AGENTS_PREFERENCES_SETTING_KEY);
        const savedPrefs = ParseMyAgentsDashboardPreferences(lastArgs[1] as string);
        expect(savedPrefs.sharedExpanded).toBe(true);
        expect(savedPrefs.showSystemAndDemo).toBe(true);
        expect(savedPrefs.activeAgentSubTab).toBe('persona');

        // Hover Personalize icon button stops propagation and opens edit modal for that agent
        const stopProp = vi.fn();
        const stubPepperEntity = { ID: pepperAgent.ID, Name: 'Pepper', BaseAgentID: AGENT_COS.ID };
        component.GetAgentById = vi.fn(
            () => stubPepperEntity as ReturnType<ChiefOfStaffGovernanceComponent['GetAgentById']>,
        );
        component.OpenEditInstanceModal = vi.fn();
        component.OnRosterPersonalizeClick(pepperAgent, {
            stopPropagation: stopProp,
        } as Partial<Event> as Event);
        expect(stopProp).toHaveBeenCalledTimes(1);
        expect(component.OpenEditInstanceModal).toHaveBeenCalledWith(stubPepperEntity);

        // Overview dashboard layout density & collapsed panels also persist via UserInfoEngine
        const overviewRaw: object = Object.create(ChiefOfStaffOverviewComponent.prototype) as object;
        const overviewComp = overviewRaw as ChiefOfStaffOverviewComponent;
        (overviewRaw as { cdr: { markForCheck: () => void } }).cdr = { markForCheck: vi.fn() };
        Object.defineProperty(overviewComp, 'ProviderToUse', {
            get: () =>
                ({
                    CurrentUser: { ID: 'U0000000-0000-0000-0000-000000000099' },
                }) as Partial<IMetadataProvider> as IMetadataProvider,
            configurable: true,
        });
        expect(overviewComp.StripDensity).toBe('cards');
        overviewComp.SetStripDensity('compact');
        overviewComp.ToggleOverviewPanel('channels');
        expect(overviewComp.StripDensity).toBe('compact');
        expect(overviewComp.IsOverviewPanelCollapsed('channels')).toBe(true);
    });
});
