import { describe, expect, it, vi } from 'vitest';
import { AfterTourStartEventArgs, AfterTourStepEnterEventArgs, BeforeTourStartEventArgs, BeforeTourStepEnterEventArgs, type TourSessionEventArgs } from '../events';
import { VerifyTourDirector, RecorderTourDirector } from '../plugins/standard-directors';
import { TourSignals } from '../signals';
import { MemoryProgressStore } from '../stores';
import { TourSession } from '../tour-session';
import type { TourDefinition, TourRunRecord } from '../types';
import { MockAnchorBridge, MockTourHost } from './test-helpers';

function makeTwoStepTour(overrides: Partial<TourDefinition> = {}): TourDefinition {
    return {
        TourKey: 'sales.first-deal',
        Name: 'Create your first deal',
        Status: 'Active',
        CurrentVersionID: 'ver-1',
        VersionNumber: 1,
        Goal: {
            Type: 'EntityEvent',
            EntityName: 'Deals',
            EventType: 'save',
        },
        Steps: [
            {
                StepKey: 'open-deals',
                Sequence: 10,
                StepType: 'Spotlight',
                Title: 'Open Deals',
                Body: 'Navigate to Deals.',
                Prepare: {
                    ApplicationName: 'Sales',
                    NavItemKey: 'deals',
                    Announcement: 'Navigated to Sales Deals',
                },
                Anchor: { Strategy: 'Registered', Key: 'sales.deals.board' },
            },
            {
                StepKey: 'save-deal',
                Sequence: 20,
                StepType: 'Action',
                Title: 'Save Deal',
                Body: 'Save your deal.',
                Mode: 'Guide',
                Anchor: { Strategy: 'FormField', Entity: '{{Context.Record.EntityName}}', Field: 'Amount' },
                Completion: {
                    Checks: [{ Type: 'Signal', SignalKey: 'sales.deal.saved' }],
                    Match: 'All',
                },
            },
        ],
        ...overrides,
    };
}

describe('TourSession', () => {
    it('executes step lifecycle (Prepare -> Anchor -> Enter -> Signal completion -> GoalMet -> Complete)', async () => {
        const host = new MockTourHost({
            InitialLocation: { ApplicationName: 'Home', NavItemKey: 'home', EntityName: 'Deals' },
        });
        const bridge = new MockAnchorBridge();
        const store = new MemoryProgressStore();
        const tour = makeTwoStepTour();

        const session = new TourSession({
            Tour: tour,
            Host: host,
            ProgressStore: store,
            AnchorBridge: bridge,
            InitialConditionContext: { record: { EntityName: 'Deals' } },
        });
        const token = session.AttachDirector('Visual');

        const events: string[] = [];
        session.Events$.subscribe((e) => events.push(e.EventName));

        const started = await session.Start();
        expect(started).toBe(true);
        expect(session.Status).toBe('In Progress');
        expect(session.CurrentStepKey).toBe('open-deals');
        expect(host.NavigateCalls).toHaveLength(1);
        expect(session.CurrentStepView?.StatusMessage).toBe('Navigated to Sales Deals');

        await session.Advance(token);
        expect(session.CurrentStepKey).toBe('save-deal');
        // Context template interpolated on FormField anchor
        expect(session.CurrentStepView?.Anchor?.Entity).toBe('Deals');

        // Emit Signal to satisfy step 2 completion
        TourSignals.Instance.Emit('sales.deal.saved', { DealId: 'd-1' });
        // Emit matching EntityEvent to satisfy Tour Goal
        session.NotifyEntityEvent({ EntityName: 'Deals', EventType: 'save', Record: { ID: 'd-1' } });

        await vi.waitFor(() => {
            expect(session.Status).toBe('Completed');
        });

        expect(session.SessionView.GoalMet).toBe(true);
        expect(events).toContain('AfterTourStart');
        expect(events).toContain('AfterTourStepComplete');
        expect(events).toContain('AfterTourEnd');
        expect(store.GetEvents().some((e) => e.EventType === 'GoalMet')).toBe(true);
    });

    it('suppresses After* events when Before* events are canceled synchronously', async () => {
        const host = new MockTourHost();
        const store = new MemoryProgressStore();
        const observed: string[] = [];

        const session = new TourSession({
            Tour: makeTwoStepTour(),
            Host: host,
            ProgressStore: store,
            BeforeHook: (args: TourSessionEventArgs) => {
                if (args instanceof BeforeTourStartEventArgs) {
                    args.Cancel = true;
                    args.CancelReason = 'Blocked by app state';
                }
            },
        });
        session.Events$.subscribe((e) => observed.push(e.EventName));

        const started = await session.Start();
        expect(started).toBe(false);
        expect(observed).toContain('BeforeTourStart');
        expect(observed.some((n) => n === 'AfterTourStart')).toBe(false);

        // Now test BeforeTourStepEnter cancelation
        const observedStep: string[] = [];
        const session2 = new TourSession({
            Tour: makeTwoStepTour(),
            Host: host,
            ProgressStore: store,
            BeforeHook: (args: TourSessionEventArgs) => {
                if (args instanceof BeforeTourStepEnterEventArgs) {
                    args.Cancel = true;
                    args.CancelReason = 'Step vetoed';
                }
            },
        });
        session2.Events$.subscribe((e) => observedStep.push(e.EventName));
        const ok2 = await session2.Start();
        expect(ok2).toBe(true);
        expect(observedStep).toContain('BeforeTourStepEnter');
        expect(observedStep.some((n) => n === 'AfterTourStepEnter')).toBe(false);
        expect(AfterTourStartEventArgs).toBeDefined();
        expect(AfterTourStepEnterEventArgs).toBeDefined();
    });

    it('auto-skips steps whose SkipWhen condition is already satisfied', async () => {
        const host = new MockTourHost();
        const store = new MemoryProgressStore();
        const tour: TourDefinition = {
            TourKey: 'core.skip',
            Name: 'Skip Test',
            Status: 'Active',
            Steps: [
                {
                    StepKey: 'already-done',
                    Sequence: 10,
                    StepType: 'Spotlight',
                    Title: 'Already Done',
                    SkipWhen: {
                        logic: 'and',
                        filters: [{ field: 'user.HasProfile', operator: 'eq', value: true }],
                    },
                },
                {
                    StepKey: 'final',
                    Sequence: 20,
                    StepType: 'Modal',
                    Title: 'Final Step',
                },
            ],
        };

        const session = new TourSession({
            Tour: tour,
            Host: host,
            ProgressStore: store,
            InitialConditionContext: { user: { HasProfile: true } },
        });
        await session.Start();

        expect(session.CurrentStepKey).toBe('final');
        expect(store.GetEvents().some((e) => e.EventType === 'StepSkipped' && e.StepKey === 'already-done')).toBe(true);
    });

    it('handles OnMissing policies (Skip vs Center vs Stall)', async () => {
        const host = new MockTourHost();
        const bridge = new MockAnchorBridge();
        bridge.MissingKeys.add('missing.key');
        const store = new MemoryProgressStore();

        const skipTour: TourDefinition = {
            TourKey: 'missing.skip',
            Name: 'Missing Skip',
            Status: 'Active',
            Steps: [
                {
                    StepKey: 's1',
                    Sequence: 10,
                    StepType: 'Spotlight',
                    Title: 'Missing',
                    Anchor: { Strategy: 'Registered', Key: 'missing.key' },
                    OnMissing: 'Skip',
                },
                { StepKey: 's2', Sequence: 20, StepType: 'Modal', Title: 'Fallback Step' },
            ],
        };
        const s1 = new TourSession({ Tour: skipTour, Host: host, ProgressStore: store, AnchorBridge: bridge });
        await s1.Start();
        expect(s1.CurrentStepKey).toBe('s2');

        const centerTour: TourDefinition = {
            ...skipTour,
            TourKey: 'missing.center',
            Steps: [{ ...skipTour.Steps[0], OnMissing: 'Center' }],
        };
        const s2 = new TourSession({ Tour: centerTour, Host: host, ProgressStore: store, AnchorBridge: bridge });
        await s2.Start();
        expect(s2.CurrentStepKey).toBe('s1');
        expect(s2.CurrentStepView?.AnchorResolved).toBe(false);
        expect(s2.CurrentStepView?.AnchorResolution).toBe('Failed');

        const stallTour: TourDefinition = {
            ...skipTour,
            TourKey: 'missing.stall',
            Steps: [{ ...skipTour.Steps[0], OnMissing: 'Stall' }],
        };
        const s3 = new TourSession({ Tour: stallTour, Host: host, ProgressStore: store, AnchorBridge: bridge });
        await s3.Start();
        expect(s3.CurrentStepView?.WaitingForCompletion).toBe(false);
        expect(s3.SessionView.LastError).toContain('missing.key');
    });

    it('pins tour definition version from ExistingRun snapshot even if live definition changes', async () => {
        const host = new MockTourHost();
        const store = new MemoryProgressStore();
        const oldTour = makeTwoStepTour({ CurrentVersionID: 'ver-1', VersionNumber: 1 });
        const existingRun: TourRunRecord = {
            RunID: 'run-pinned-1',
            TourKey: 'sales.first-deal',
            TourVersionID: 'ver-1',
            VersionNumber: 1,
            DefinitionSnapshot: oldTour,
            Status: 'In Progress',
            GuideMode: 'Visual',
            DirectorType: 'Visual',
            CurrentStepKey: 'open-deals',
            PathTaken: ['open-deals'],
            LaunchSource: 'Launcher',
            StartedAt: new Date().toISOString(),
            Steps: [],
        };

        const newerTour: TourDefinition = {
            ...oldTour,
            CurrentVersionID: 'ver-2',
            VersionNumber: 2,
            Name: 'Rewritten v2 Tour',
            Steps: [{ StepKey: 'brand-new', Sequence: 10, StepType: 'Modal', Title: 'New v2' }],
        };

        const session = new TourSession({
            Tour: newerTour,
            ExistingRun: existingRun,
            Host: host,
            ProgressStore: store,
        });

        expect(session.TourVersionID).toBe('ver-1');
        expect(session.Tour.Name).toBe('Create your first deal');
        await session.Start();
        expect(session.CurrentStepKey).toBe('open-deals');
    });

    it('enforces director-only cursor guard and Do-mode confirmation + hard-banned action rejection', async () => {
        const host = new MockTourHost();
        const store = new MemoryProgressStore();
        const confirmations: string[] = [];
        const executedActions: string[] = [];

        const doTour: TourDefinition = {
            TourKey: 'sales.do-mode',
            Name: 'Do Mode Tour',
            Status: 'Active',
            AllowAgentActions: true,
            Steps: [
                {
                    StepKey: 'create-draft',
                    Sequence: 10,
                    StepType: 'Action',
                    Title: 'Create Draft Deal',
                    Mode: 'Do',
                    DoAction: {
                        Category: 'Create',
                        ToolName: 'CreateDealTool',
                        Description: 'Create draft deal',
                    },
                },
                {
                    StepKey: 'banned-step',
                    Sequence: 20,
                    StepType: 'Action',
                    Title: 'Delete Deal',
                    Mode: 'Do',
                    DoAction: {
                        Category: 'Delete',
                        Description: 'Delete a deal',
                    },
                },
            ],
        };

        const session = new TourSession({
            Tour: doTour,
            Host: host,
            ProgressStore: store,
            MutationConfirmer: {
                ConfirmMutation: async (req) => {
                    confirmations.push(req.StepKey);
                    return req.StepKey === 'create-draft';
                },
            },
            ActionExecutor: {
                ExecuteStepAction: async (req) => {
                    executedActions.push(req.Step.StepKey);
                    return { Success: true, Data: { CreatedId: 'deal-99' } };
                },
            },
        });

        const directorToken = session.AttachDirector('Chat');
        await session.Start();

        // Non-director caller MUST be rejected
        await expect(session.Advance('wrong-token')).rejects.toThrow(/Unauthorized director/);
        await expect(session.GoToStep('wrong-token', 'banned-step')).rejects.toThrow(/Unauthorized director/);
        await expect(session.PerformStep('wrong-token')).rejects.toThrow(/Unauthorized director/);

        // Director can pause/resume and perform permitted Do step with confirmation
        const perfOk = await session.PerformStep(directorToken);
        expect(perfOk.Success).toBe(true);
        expect(confirmations).toEqual(['create-draft']);
        expect(executedActions).toEqual(['create-draft']);
        expect(session.CurrentStepKey).toBe('banned-step');

        // Hard-banned category MUST be rejected even with directorToken and AllowAgentActions=true
        const bannedRes = await session.PerformStep(directorToken);
        expect(bannedRes.Success).toBe(false);
        expect(bannedRes.ErrorMessage).toContain('hard-banned');

        // Check all other banned categories
        for (const bannedCat of ['FinancialPosting', 'BatchDispatch', 'PermissionGrant', 'OutboundMessage']) {
            const res = await session.PerformStep(directorToken, { ActionCategory: bannedCat });
            expect(res.Success).toBe(false);
            expect(res.ErrorMessage).toContain('hard-banned');
        }
    });

    it('replays a tour cleanly with VerifyTourDirector and records captures with RecorderTourDirector', async () => {
        const host = new MockTourHost();
        const bridge = new MockAnchorBridge();
        const store = new MemoryProgressStore();
        const tour = makeTwoStepTour();

        const session = new TourSession({
            Tour: tour,
            Host: host,
            ProgressStore: store,
            AnchorBridge: bridge,
        });
        const verifyDirector = new VerifyTourDirector();
        session.AttachDirector(verifyDirector);

        const report = await verifyDirector.ReplayAll();
        expect(report.Passed).toBe(true);
        expect(report.VisitedStepKeys).toEqual(['open-deals', 'save-deal']);
        expect(session.Status).toBe('Completed');

        const recorder = new RecorderTourDirector();
        recorder.RecordInteraction({
            StepKey: 'click-new',
            Anchor: { Strategy: 'Registered', Key: 'sales.deals.new' },
            ActionKind: 'click',
            Label: 'Click New Deal',
        });
        const drafts = recorder.ToDraftSteps();
        expect(drafts).toHaveLength(1);
        expect(drafts[0].StepKey).toBe('click-new');
    });

    it('supports SelectChoice branching, GoBack, Pause/Resume, and Snooze', async () => {
        const host = new MockTourHost();
        const store = new MemoryProgressStore();
        const tour: TourDefinition = {
            TourKey: 'core.choice-flow',
            Name: 'Choice Flow',
            Status: 'Active',
            Steps: [
                { StepKey: 'start', Sequence: 10, StepType: 'Choice', Title: 'Choose path' },
                { StepKey: 'path-a', Sequence: 20, StepType: 'Modal', Title: 'Path A' },
                { StepKey: 'path-b', Sequence: 30, StepType: 'Modal', Title: 'Path B' },
            ],
            Paths: [
                { FromStepKey: 'start', ToStepKey: 'path-a', Condition: 'opt-a', Priority: 100 },
                { FromStepKey: 'start', ToStepKey: 'path-b', Condition: 'opt-b', Priority: 100 },
            ],
        };

        const session = new TourSession({ Tour: tour, Host: host, ProgressStore: store });
        const token = session.AttachDirector('Visual');
        await session.Start();

        await session.SelectChoice('opt-b', token);
        expect(session.CurrentStepKey).toBe('path-b');
        expect(session.PathTaken).toEqual(['start', 'path-b']);

        await session.GoBack(token);
        expect(session.CurrentStepKey).toBe('start');

        await session.Pause();
        expect(session.SessionView.IsPaused).toBe(true);
        await session.Resume();
        expect(session.SessionView.IsPaused).toBe(false);

        const snoozeDate = new Date(Date.now() + 86400_000).toISOString();
        await session.Snooze(snoozeDate);
        expect(session.Status).toBe('Snoozed');
        expect(session.GetRunRecord().SnoozedUntil).toBe(snoozeDate);
    });

    it('manages secondary PointerHighlight with auto-expiry and clears on step change / Stop / Dispose', async () => {
        vi.useFakeTimers();
        try {
            const host = new MockTourHost();
            const store = new MemoryProgressStore();
            const session = new TourSession({ Tour: makeTwoStepTour(), Host: host, ProgressStore: store });
            const token = session.AttachDirector('Visual');
            await session.Start();

            session.SetPointerHighlight('sales.deals.amount', 'Check Amount here', 4500);
            expect(session.SessionView.PointerHighlight).toEqual(
                expect.objectContaining({
                    AnchorKey: 'sales.deals.amount',
                    Caption: 'Check Amount here',
                }),
            );
            expect(session.SessionView.PointerHighlight?.ExpiresAt).toBeTypeOf('number');

            // Auto-clears after durationMs
            vi.advanceTimersByTime(4501);
            expect(session.SessionView.PointerHighlight).toBeNull();

            // Cleared on step change
            session.SetPointerHighlight('sales.deals.stage', 'Pick stage', 10000);
            expect(session.SessionView.PointerHighlight?.AnchorKey).toBe('sales.deals.stage');
            await session.Advance(token);
            expect(session.SessionView.PointerHighlight).toBeNull();

            // Cleared on Dispose
            session.SetPointerHighlight('sales.deals.close', 'Close date', 10000);
            expect(session.SessionView.PointerHighlight?.AnchorKey).toBe('sales.deals.close');
            session.Dispose();
            expect(session.SessionView.PointerHighlight).toBeNull();
        } finally {
            vi.useRealTimers();
        }
    });

    it('supports SelectChoice(choiceKey) convenience branching without passing directorToken', async () => {
        const host = new MockTourHost();
        const store = new MemoryProgressStore();
        const tour: TourDefinition = {
            TourKey: 'core.convenience-choice',
            Name: 'Convenience Choice',
            Status: 'Active',
            Steps: [
                { StepKey: 'pick', Sequence: 10, StepType: 'Choice', Title: 'Choose' },
                { StepKey: 'branch-a', Sequence: 20, StepType: 'Modal', Title: 'Branch A' },
                { StepKey: 'branch-b', Sequence: 30, StepType: 'Modal', Title: 'Branch B' },
            ],
            Paths: [
                { FromStepKey: 'pick', ToStepKey: 'branch-a', Condition: 'a', Priority: 100 },
                { FromStepKey: 'pick', ToStepKey: 'branch-b', Condition: 'b', Priority: 100 },
            ],
        };

        const session = new TourSession({ Tour: tour, Host: host, ProgressStore: store });
        await session.Start();
        const ok = await session.SelectChoice('a');
        expect(ok).toBe(true);
        expect(session.CurrentStepKey).toBe('branch-a');
    });

    it('enforces all 3 safety gate tiers on DemonstrateCurrentStep', async () => {
        // Tier 1: Verify Mode Lockout
        const verifyHost = new MockTourHost();
        const verifyStore = new MemoryProgressStore();
        const verifySession = new TourSession({
            Tour: makeTwoStepTour({ AllowAgentActions: true }),
            Host: verifyHost,
            ProgressStore: verifyStore,
        });
        verifySession.AttachDirector('Verify');
        await verifySession.Start();
        const verifyRes = await verifySession.DemonstrateCurrentStep({ UserInitiated: true, ConfirmedMutation: true });
        expect(verifyRes).toEqual({
            Success: false,
            ErrorCode: 'verify_mode_locked',
            ErrorMessage: 'Step demonstrations are disabled during Verify assessments.',
        });

        // Tier 2: Permission Check when !AllowAgentActions && Mode !== 'Show' && !UserInitiated
        const host2 = new MockTourHost();
        const bridge2 = new MockAnchorBridge();
        const store2 = new MemoryProgressStore();
        const restrictedTour: TourDefinition = {
            TourKey: 'demo.tiers',
            Name: 'Demo Tiers',
            Status: 'Active',
            AllowAgentActions: false,
            Steps: [
                {
                    StepKey: 'guide-step',
                    Sequence: 10,
                    StepType: 'Action',
                    Title: 'Guide Step',
                    Mode: 'Guide',
                    Anchor: { Strategy: 'Registered', Key: 'sales.deals.board' },
                    Configuration: {
                        RequiresMutationConfirmation: true,
                        ConfirmationPrompt: 'Save this sample deal?',
                    },
                },
                {
                    StepKey: 'host-confirm-step',
                    Sequence: 20,
                    StepType: 'Spotlight',
                    Title: 'Show Step',
                    Mode: 'Show',
                    Anchor: { Strategy: 'Registered', Key: 'sales.deals.stage' },
                },
            ],
        };

        const session2 = new TourSession({
            Tour: restrictedTour,
            Host: host2,
            ProgressStore: store2,
            AnchorBridge: bridge2,
        });
        session2.AttachDirector('Chat');
        await session2.Start();

        const deniedRes = await session2.DemonstrateCurrentStep();
        expect(deniedRes).toEqual({
            Success: false,
            ErrorCode: 'agent_actions_disabled',
            ErrorMessage: 'Agent actions are not enabled for this tour unless requested by the user.',
        });

        // Tier 3 (step config): UserInitiated passes Tier 2, hits Tier 3 confirmation gate
        const confirmPromptRes = await session2.DemonstrateCurrentStep({ UserInitiated: true });
        expect(confirmPromptRes).toEqual({
            Success: false,
            ErrorCode: 'confirmation_required',
            RequiresConfirmation: true,
            ConfirmationPrompt: 'Save this sample deal?',
        });
        expect(session2.SessionView.PendingDemonstrationConfirmation).toEqual({
            StepKey: 'guide-step',
            Prompt: 'Save this sample deal?',
        });

        // CancelPendingDemonstration clears pending state
        session2.CancelPendingDemonstration();
        expect(session2.SessionView.PendingDemonstrationConfirmation).toBeNull();

        // Confirming mutation executes Prepare + Host.DemonstrateStep + anchor pulse + advances
        const okRes = await session2.DemonstrateCurrentStep({
            UserInitiated: true,
            ConfirmedMutation: true,
        });
        expect(okRes).toEqual({ Success: true });
        expect(host2.DemonstrateStepCalls).toEqual([{ StepKey: 'guide-step', ConfirmedMutation: true }]);
        expect(bridge2.HighlightedCalls.some((c) => c.AnchorKey === 'sales.deals.board')).toBe(true);
        expect(session2.CurrentStepKey).toBe('host-confirm-step');
        expect(session2.SessionView.PendingDemonstrationConfirmation).toBeNull();

        // Tier 3 (host-driven dynamic RequiresConfirmation on Show step)
        host2.DemonstrateStepHandler = async (_step, ctx) => {
            if (!ctx.ConfirmedMutation) {
                return {
                    Success: false,
                    RequiresConfirmation: true,
                    ConfirmationPrompt: 'Host asks: proceed with update?',
                    MutatesData: true,
                };
            }
            return { Success: true };
        };

        const hostConfirmRes = await session2.DemonstrateCurrentStep();
        expect(hostConfirmRes).toEqual({
            Success: false,
            ErrorCode: 'confirmation_required',
            RequiresConfirmation: true,
            ConfirmationPrompt: 'Host asks: proceed with update?',
        });
        expect(session2.SessionView.PendingDemonstrationConfirmation).toEqual({
            StepKey: 'host-confirm-step',
            Prompt: 'Host asks: proceed with update?',
        });

        const hostConfirmedOk = await session2.DemonstrateCurrentStep({ ConfirmedMutation: true });
        expect(hostConfirmedOk).toEqual({ Success: true });
        expect(session2.Status).toBe('Completed');
    });
});
