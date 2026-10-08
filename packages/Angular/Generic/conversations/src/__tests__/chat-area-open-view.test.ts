// Angular components in this package are partial-compiled — load the JIT compiler first.
import '@angular/compiler';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ConversationEngine, type ConversationBranchRow, type ForkSummary } from '@memberjunction/core-entities';
import { MJNotificationService } from '@memberjunction/ng-notifications';
import { ConversationChatAreaComponent } from '../lib/components/conversation/conversation-chat-area.component';
import { MAIN_OPEN_VIEW, type ConversationOpenView } from '../lib/utils/conversation-forks';
import type { RealtimeSessionService } from '../lib/services/realtime-session.service';

/**
 * The open view: what this chat area shows of the active conversation. Changing it ends a voice
 * session of the conversation first, then reloads everything on the view's path. Built via
 * `Object.create(prototype)` with stubbed collaborators, as the other chat-area suites.
 */

const T1_ROW: ConversationBranchRow = { ID: 'T1', ConversationID: 'CONV-1', ParentBranchID: null, ForkFromSequence: 2, Name: null, Kind: 'Fork' };

interface Harness {
    component: ConversationChatAreaComponent;
    open: Record<string, unknown>;
    reload: ReturnType<typeof vi.fn>;
    realtime: { IsActiveFor: ReturnType<typeof vi.fn>; EndRealtimeSession: ReturnType<typeof vi.fn> };
    order: string[];
}

function createHarness(opts: { view?: ConversationOpenView; sessionFor?: string; reloaded?: boolean; readOnly?: boolean } = {}): Harness {
    const component = Object.create(ConversationChatAreaComponent.prototype) as ConversationChatAreaComponent;
    const open = component as unknown as Record<string, unknown>;
    const order: string[] = [];
    const reload = vi.fn(async () => {
        order.push(`reload:${(open['openView'] as ConversationOpenView).Kind}`);
        return opts.reloaded ?? true;
    });
    const realtime = {
        IsActiveFor: vi.fn((id: string) => id === opts.sessionFor),
        EndRealtimeSession: vi.fn(async () => { order.push('ended'); }),
    };
    open['_conversationId'] = 'CONV-1';
    open['CurrentUser'] = { ID: 'USER-1' };
    open['ReadOnly'] = opts.readOnly ?? false;
    open['openView'] = opts.view ?? MAIN_OPEN_VIEW;
    open['viewChangeInFlight'] = false;
    open['reloadWindowForView'] = reload;
    open['RealtimeSession'] = realtime;
    open['isActiveConversation'] = (id: string | null | undefined) => id === 'CONV-1';
    open['cdr'] = { detectChanges: vi.fn(), markForCheck: vi.fn() };
    return { component, open, reload, realtime, order };
}

describe('ConversationChatAreaComponent open view', () => {
    let notify: ReturnType<typeof vi.fn>;

    beforeEach(() => {
        notify = vi.fn();
        vi.spyOn(MJNotificationService, 'Instance', 'get').mockReturnValue({ CreateSimpleNotification: notify } as unknown as MJNotificationService);
        vi.spyOn(console, 'error').mockImplementation(() => undefined);
        vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('starts on Main', () => {
        const h = createHarness();
        delete h.open['openView'];
        expect(h.component.OpenView).toEqual(MAIN_OPEN_VIEW);
        expect(h.component.OpenViewBranchId).toBeNull();
    });

    it('OpenFork shows the fork and reloads on its path', async () => {
        const h = createHarness();

        expect(await h.component.OpenFork('T1')).toBe(true);

        expect(h.component.OpenView).toEqual({ Kind: 'Fork', BranchID: 'T1' });
        expect(h.reload).toHaveBeenCalledOnce();
    });

    it('ends a voice session of the conversation before the view changes, with a notice', async () => {
        const h = createHarness({ sessionFor: 'CONV-1' });
        notify.mockImplementation((text: string) => h.order.push(text));

        await h.component.OpenFork('T1');

        expect(h.order).toEqual(['ended', 'Voice session ended to change the view', 'reload:Fork']);
    });

    it('changes the view even when the voice session fails to end', async () => {
        const h = createHarness({ sessionFor: 'CONV-1' });
        h.realtime.EndRealtimeSession.mockRejectedValue(new Error('close failed'));

        expect(await h.component.OpenFork('T1')).toBe(true);
        expect(h.reload).toHaveBeenCalledOnce();
    });

    it('reloads nothing when the view is already shown', async () => {
        const h = createHarness({ view: { Kind: 'Fork', BranchID: 'T1' } });

        expect(await h.component.OpenFork('t1')).toBe(true);
        expect(h.reload).not.toHaveBeenCalled();
    });

    it('ignores a view change while another one runs', async () => {
        const h = createHarness();
        h.open['viewChangeInFlight'] = true;

        expect(await h.component.OpenFork('T1')).toBe(false);
        expect(h.reload).not.toHaveBeenCalled();
    });

    it('BackToMain shows Main', async () => {
        const h = createHarness({ view: { Kind: 'Fork', BranchID: 'T1' } });

        expect(await h.component.BackToMain()).toBe(true);
        expect(h.component.OpenView).toEqual(MAIN_OPEN_VIEW);
    });

    it('lets a read-only person open forks (the view is never stored)', async () => {
        const h = createHarness({ readOnly: true });

        expect(await h.component.OpenFork('T1')).toBe(true);
        expect(h.reload).toHaveBeenCalledOnce();
    });

    it('reports a failed reload as false', async () => {
        const h = createHarness({ reloaded: false });
        expect(await h.component.OpenFork('T1')).toBe(false);
    });

    it('targets the open fork for the active conversation only', () => {
        const h = createHarness({ view: { Kind: 'Fork', BranchID: 'T1' } });
        expect(h.component.TargetBranchIdFor('CONV-1')).toBe('T1');
        expect(h.component.TargetBranchIdFor('CONV-2')).toBeNull();
        expect(createHarness().component.TargetBranchIdFor('CONV-1')).toBeNull();
    });

    it("answers the composer's branch question from the open view", async () => {
        const resolve = (h: Harness) => (h.open['resolveComposerBranch'] as () => Promise<string | null | undefined>).call(h.component);
        expect(await resolve(createHarness())).toBeNull();
        expect(await resolve(createHarness({ view: { Kind: 'Fork', BranchID: 'T1' } }))).toBe('T1');
    });

    it('scopes the artifact viewer and the export to the open fork, and to Main until its rows are loaded', () => {
        const h = createHarness({ view: { Kind: 'Fork', BranchID: 'T1' } });
        h.open['scopeFallbackLogged'] = null;

        expect(h.component.ExportScope).toEqual(ConversationEngine.TrunkScope('CONV-1'));

        (h.open['setBranchRows'] as (id: string, rows: ConversationBranchRow[]) => void).call(h.component, 'CONV-1', [T1_ROW]);
        expect(h.component.ExportScope).toEqual({ ConversationID: 'CONV-1', BranchID: 'T1', Branches: [T1_ROW] });
        expect(h.component.ArtifactViewerScope).toEqual(h.component.ExportScope);
    });

    it('does not show a new row of another view, and refreshes the fork summaries for a fork row', async () => {
        const h = createHarness();
        const applyLocal = vi.fn();
        const schedule = vi.fn();
        const clearDraft = vi.fn();
        Object.assign(h.open, {
            draftStore: { ClearDraft: clearDraft },
            initialDraftSnapshots: new Map<string, string>(),
            PendingMessage: null,
            windowStore: { ApplyLocalDetail: applyLocal },
            messages: [],
            scheduleForkSummaryRefresh: schedule,
        });

        await h.component.OnMessageSent({ ID: 'R1', ConversationID: 'CONV-1', BranchID: 'T1' } as never);

        expect(applyLocal).not.toHaveBeenCalled();
        expect(h.open['messages']).toEqual([]);
        expect(schedule).toHaveBeenCalledOnce();
        expect(clearDraft).not.toHaveBeenCalled();
    });

    it('takes a streamed frame of another view out of the full send path: no send, no draft change, no zone run', () => {
        const h = createHarness();
        const sent = vi.fn(async () => undefined);
        const clearDraft = vi.fn();
        const zone = { run: vi.fn((fn: () => void) => fn()), runOutsideAngular: vi.fn((fn: () => void) => fn()) };
        const schedule = vi.fn();
        Object.assign(h.open, {
            messages: [],
            draftStore: { ClearDraft: clearDraft },
            ngZone: zone,
            messageListComponent: { RefreshRenderedMessage: vi.fn(() => false) },
            OnMessageSent: sent,
            scheduleForkSummaryRefresh: schedule,
        });

        h.component.OnMessageStreamed({ ID: 'R1', ConversationID: 'CONV-1', BranchID: 'T1', Status: 'In-Progress' } as never);
        h.component.OnMessageStreamed({ ID: 'R2', ConversationID: 'CONV-1', BranchID: 'T1', Status: 'In-Progress' } as never);

        expect(sent).not.toHaveBeenCalled();
        expect(clearDraft).not.toHaveBeenCalled();
        expect(zone.run).not.toHaveBeenCalled();
        expect(schedule).toHaveBeenCalledTimes(2);
    });

    it('streams a Main frame in Main through the full path when the bubble is not rendered yet', () => {
        const h = createHarness();
        const sent = vi.fn(async () => undefined);
        const zone = { run: vi.fn((fn: () => void) => fn()), runOutsideAngular: vi.fn((fn: () => void) => fn()) };
        Object.assign(h.open, {
            messages: [],
            ngZone: zone,
            messageListComponent: { RefreshRenderedMessage: vi.fn(() => false) },
            OnMessageSent: sent,
            scheduleForkSummaryRefresh: vi.fn(),
        });

        h.component.OnMessageStreamed({ ID: 'R1', ConversationID: 'CONV-1', BranchID: null, Status: 'In-Progress' } as never);

        expect(zone.run).toHaveBeenCalledOnce();
        expect(sent).toHaveBeenCalledOnce();
    });

    describe('a row of the open fork', () => {
        const ROW = { ID: 'R1', ConversationID: 'CONV-1', BranchID: 't1', Status: 'Complete' };

        function forkHarness(): { h: Harness; applyLocal: ReturnType<typeof vi.fn>; schedule: ReturnType<typeof vi.fn> } {
            const h = createHarness({ view: { Kind: 'Fork', BranchID: 'T1' } });
            const applyLocal = vi.fn();
            const schedule = vi.fn();
            Object.assign(h.open, {
                draftStore: { ClearDraft: vi.fn() },
                initialDraftSnapshots: new Map<string, string>(),
                PendingMessage: null,
                windowStore: { ApplyLocalDetail: applyLocal },
                messages: [],
                InProgressMessageIds: [],
                scheduleForkSummaryRefresh: schedule,
                ensureCurrentUserInAvatarMap: vi.fn(),
                resetComponentState: vi.fn(),
                loadAttachmentsForMessage: vi.fn(async () => undefined),
                followTranscript: vi.fn(),
                snapshotArtifactPanelBaseline: vi.fn(() => ({})),
                reloadArtifactsForMessage: vi.fn(async () => undefined),
                decideAndApplyArtifactPanel: vi.fn(async () => undefined),
            });
            return { h, applyLocal, schedule };
        }

        it('is shown when it arrives as a send', async () => {
            const { h, applyLocal, schedule } = forkHarness();

            await h.component.OnMessageSent(ROW as never);

            expect(applyLocal).toHaveBeenCalledOnce();
            expect(h.open['messages']).toEqual([ROW]);
            expect(schedule).toHaveBeenCalledOnce();
        });

        it('is shown when it arrives as an agent response', async () => {
            const { h, applyLocal, schedule } = forkHarness();

            await h.component.OnAgentResponse({ message: ROW as never, agentResult: null });

            expect(applyLocal).toHaveBeenCalledOnce();
            expect(h.open['messages']).toEqual([ROW]);
            expect(schedule).toHaveBeenCalledOnce();
        });
    });

    it('returns to Main and clears the fork summaries and the refresh timer when the conversation changes', async () => {
        vi.useFakeTimers();
        try {
            const h = createHarness({ view: { Kind: 'Fork', BranchID: 'T1' } });
            const refresh = vi.fn(async () => undefined);
            Object.assign(h.open, {
                ForkSummaries: [{ Branch: T1_ROW }],
                forkSummaryRefreshTimer: null,
                RefreshForkSummaries: refresh,
                clearTurnTracking: vi.fn(),
                branchRowsConversationId: null,
                IsArtifactPaneMaximized: false,
            });
            (h.open['scheduleForkSummaryRefresh'] as () => void).call(h.component);

            (h.open['resetConversationScopedViewState'] as () => void).call(h.component);
            await vi.advanceTimersByTimeAsync(1000);

            expect(h.component.OpenView).toEqual(MAIN_OPEN_VIEW);
            expect(h.component.ForkSummaries).toEqual([]);
            expect(h.open['forkSummaryRefreshTimer']).toBeNull();
            expect(refresh).not.toHaveBeenCalled();
        } finally {
            vi.useRealTimers();
        }
    });

    it('starts a resumed voice session on the open fork, and on Main for another conversation', async () => {
        const h = createHarness({ view: { Kind: 'Fork', BranchID: 'T1' } });
        const start = vi.fn(async (..._args: Parameters<RealtimeSessionService['StartRealtimeSession']>) => undefined);
        Object.assign(h.open, {
            RealtimeSession: { StartRealtimeSession: start },
            RealtimeReview: null,
            ApplicationId: 'APP-1',
            AppContext: null,
        });

        await h.component.OnReviewStartLive({ TargetAgentId: 'AGENT-1', ConversationId: 'CONV-1', LastSessionId: 'S-1' });
        await h.component.OnReviewStartLive({ TargetAgentId: 'AGENT-1', ConversationId: 'CONV-2', LastSessionId: 'S-2' });

        expect(start.mock.calls.map(call => call[12])).toEqual(['T1', null]);
    });

    it('does not start a resumed voice session while a draft fork is open, and keeps the review', async () => {
        const draft: ConversationOpenView = { Kind: 'DraftFork', ParentBranchID: 'T1', ForkFromSequence: 3, AnchorDetailID: 'ROW-3', SourceDetailID: 'ROW-4' };
        const h = createHarness({ view: draft });
        const start = vi.fn(async (..._args: Parameters<RealtimeSessionService['StartRealtimeSession']>) => undefined);
        const reviewed = { AgentName: 'Voice Co-Agent' };
        Object.assign(h.open, {
            RealtimeSession: { StartRealtimeSession: start },
            RealtimeReview: reviewed,
            ApplicationId: 'APP-1',
            AppContext: null,
        });

        await h.component.OnReviewStartLive({ TargetAgentId: 'AGENT-1', ConversationId: 'CONV-1', LastSessionId: 'S-1' });

        expect(start).not.toHaveBeenCalled();
        expect(h.component.RealtimeReview).toBe(reviewed);
        expect(h.component.CanStartVoiceFromReview).toBe(false);
    });

    it('offers a resumed voice session from the review on Main and in a fork', () => {
        expect(createHarness().component.CanStartVoiceFromReview).toBe(true);
        expect(createHarness({ view: { Kind: 'Fork', BranchID: 'T1' } }).component.CanStartVoiceFromReview).toBe(true);
    });

    describe('fork summaries', () => {
        const SUMMARY = { Branch: T1_ROW, DisplayName: 'Pricing' } as unknown as ForkSummary;
        /** `ProviderToUse` is a getter over the `Provider` input, so the harness sets the input. */
        const PROVIDER = { Name: 'test-provider' };

        function summaryHarness(): Harness {
            const h = createHarness();
            h.open['ForkSummaries'] = [];
            h.open['forkSummaryReadSequence'] = 0;
            h.open['forkSummaryShownSequence'] = 0;
            h.open['isActiveConversationLoad'] = (id: string, token: number) => id === 'CONV-1' && token === 1;
            h.open['Provider'] = PROVIDER;
            return h;
        }

        function load(h: Harness, token: number): Promise<void> {
            return (h.open['loadForkSummaries'] as (c: string, b: ConversationBranchRow[], t: number) => Promise<void>).call(h.component, 'CONV-1', [T1_ROW], token);
        }

        it('keeps the summaries of the current conversation load', async () => {
            const spy = vi.spyOn(ConversationEngine, 'LoadForkSummaries').mockResolvedValue([SUMMARY]);
            const h = summaryHarness();

            await load(h, 1);

            expect(spy).toHaveBeenCalledWith('CONV-1', { ID: 'USER-1' }, PROVIDER, [T1_ROW]);
            expect(h.component.ForkSummaries).toEqual([SUMMARY]);
        });

        it('drops the summaries of a replaced load and keeps the old ones when the read fails', async () => {
            const h = summaryHarness();
            vi.spyOn(ConversationEngine, 'LoadForkSummaries').mockResolvedValue([SUMMARY]);
            await load(h, 0);
            expect(h.component.ForkSummaries).toEqual([]);

            h.open['ForkSummaries'] = [SUMMARY];
            vi.spyOn(ConversationEngine, 'LoadForkSummaries').mockRejectedValue(new Error('boom'));
            await load(h, 1);
            expect(h.component.ForkSummaries).toEqual([SUMMARY]);
        });

        it('RefreshForkSummaries reads the fork rows again, keeps them and loads the summaries', async () => {
            const h = summaryHarness();
            const rows = vi.fn(async () => [T1_ROW]);
            const keep = vi.fn();
            const loadSummaries = vi.fn(async () => undefined);
            Object.assign(h.open, { loadBranchesOrNull: rows, setBranchRows: keep, loadForkSummaries: loadSummaries, conversationLoadToken: 1 });

            await h.component.RefreshForkSummaries();

            expect(keep).toHaveBeenCalledWith('CONV-1', [T1_ROW]);
            expect(loadSummaries).toHaveBeenCalledWith('CONV-1', [T1_ROW], 1);
        });

        it('RefreshForkSummaries keeps the earlier rows and the summaries when the rows cannot be read', async () => {
            const h = summaryHarness();
            h.open['openView'] = { Kind: 'Fork', BranchID: 'T1' };
            const read = vi.spyOn(ConversationEngine, 'LoadForkSummaries');
            vi.spyOn(ConversationEngine, 'LoadBranchesFresh').mockRejectedValue(new Error('offline'));
            Object.assign(h.open, { scopeFallbackLogged: null, branches: [T1_ROW], branchRowsConversationId: 'CONV-1', ForkSummaries: [SUMMARY], conversationLoadToken: 1 });

            await h.component.RefreshForkSummaries();

            expect(read).not.toHaveBeenCalled();
            expect(h.component.ForkSummaries).toEqual([SUMMARY]);
            expect(h.open['branches']).toEqual([T1_ROW]);
            expect(h.component.ExportScope).toEqual({ ConversationID: 'CONV-1', BranchID: 'T1', Branches: [T1_ROW] });
        });

        it('reads an empty list of fork rows for a conversation load when the rows cannot be read', async () => {
            const h = summaryHarness();
            vi.spyOn(ConversationEngine, 'LoadBranchesFresh').mockRejectedValue(new Error('offline'));

            expect(await (h.open['loadBranchesOrEmpty'] as (c: string) => Promise<ConversationBranchRow[]>).call(h.component, 'CONV-1')).toEqual([]);
            expect(await (h.open['loadBranchesOrNull'] as (c: string) => Promise<ConversationBranchRow[] | null>).call(h.component, 'CONV-1')).toBeNull();
        });

        it('does not let an older summary read overwrite a newer one', async () => {
            const h = summaryHarness();
            const OLDER = { Branch: T1_ROW, DisplayName: 'older' } as unknown as ForkSummary;
            const NEWER = { Branch: T1_ROW, DisplayName: 'newer' } as unknown as ForkSummary;
            const pending: Array<(value: ForkSummary[]) => void> = [];
            vi.spyOn(ConversationEngine, 'LoadForkSummaries').mockImplementation(() => new Promise(resolve => { pending.push(resolve); }));

            const older = load(h, 1);
            const newer = load(h, 1);
            pending[1]([NEWER]);
            await newer;
            pending[0]([OLDER]);
            await older;

            expect(h.component.ForkSummaries).toEqual([NEWER]);
        });

        it('shows an older summary read that ends before a newer one, then the newer one', async () => {
            const h = summaryHarness();
            const OLDER = { Branch: T1_ROW, DisplayName: 'older' } as unknown as ForkSummary;
            const NEWER = { Branch: T1_ROW, DisplayName: 'newer' } as unknown as ForkSummary;
            const pending: Array<(value: ForkSummary[]) => void> = [];
            vi.spyOn(ConversationEngine, 'LoadForkSummaries').mockImplementation(() => new Promise(resolve => { pending.push(resolve); }));

            const older = load(h, 1);
            const newer = load(h, 1);
            pending[0]([OLDER]);
            await older;
            expect(h.component.ForkSummaries).toEqual([OLDER]);
            pending[1]([NEWER]);
            await newer;

            expect(h.component.ForkSummaries).toEqual([NEWER]);
        });
    });
});
