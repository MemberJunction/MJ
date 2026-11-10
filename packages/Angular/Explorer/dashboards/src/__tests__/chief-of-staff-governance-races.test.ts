// Angular components in this package are partial-compiled — load the JIT compiler first
// (same convention as the other component suites in this node test environment).
import '@angular/compiler';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Subject } from 'rxjs';
import { BaseEntity, IMetadataProvider, RunView, RunViewResult } from '@memberjunction/core';
import { MJGlobal, MJEventType, UUIDMap } from '@memberjunction/global';
import type { MJAIAgentUserPolicyEntity } from '@memberjunction/core-entities';
import { ChiefOfStaffGovernanceComponent } from '../ChiefOfStaff/chief-of-staff-governance.component';
import {
    BuildPolicyDraftFromEntity,
    CalculateChiefOfStaffMetrics,
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
    });
});
