import { describe, expect, it } from 'vitest';
import { TourAgentToolkit } from '../agent-toolkit';
import { InlineTourSource, MemoryProgressStore } from '../stores';
import type { TourDefinition } from '../types';
import { MockAnchorBridge, MockTourHost } from './test-helpers';

function makeToolkitFixture() {
    const host = new MockTourHost({
        InitialLocation: { ApplicationName: 'Sales', NavItemKey: 'deals' },
    });
    const anchorBridge = new MockAnchorBridge();
    anchorBridge.VisibleAnchors = [
        {
            AnchorKey: 'sales.deals.stage',
            Strategy: 'FormField',
            AccessibleName: 'Stage',
            IsVisible: true,
        },
    ];
    const store = new MemoryProgressStore();

    const tours: TourDefinition[] = [
        {
            TourKey: 'sales.close-won',
            Name: 'Closing your first deal',
            Description: 'Move a deal to Closed Won',
            ApplicationName: 'Sales',
            Status: 'Active',
            EstimatedMinutes: 3,
            AllowAgentActions: false,
            Steps: [
                {
                    StepKey: 'pick-stage',
                    Sequence: 10,
                    StepType: 'Spotlight',
                    Title: 'Pick winning stage',
                    Anchor: { Strategy: 'Registered', Key: 'sales.deals.stage' },
                    GuideNotes: 'Explain Stage field.',
                },
                {
                    StepKey: 'save-deal',
                    Sequence: 20,
                    StepType: 'Action',
                    Title: 'Save the deal',
                    IsOptional: true,
                },
                {
                    StepKey: 'hidden-secret',
                    Sequence: 30,
                    StepType: 'Modal',
                    Title: 'Unreachable via direct jump from step 1',
                },
            ],
        },
    ];

    const source = new InlineTourSource(tours);
    const toolkit = new TourAgentToolkit({
        Host: host,
        DefinitionSource: source,
        ProgressStore: store,
        AnchorBridge: anchorBridge,
    });

    return { host, anchorBridge, store, toolkit };
}

describe('TourAgentToolkit', () => {
    it('supports global tools (ListTours, StartTour, PauseTour, ResumeTour, StopTour) and AppContextSnapshot', async () => {
        const { toolkit } = makeToolkitFixture();
        const globals = toolkit.GetGlobalTools();
        const byName = new Map(globals.map((t) => [t.Name, t]));

        const listRes = await byName.get('ListTours')!.Handler({ Query: 'closing' });
        expect(listRes['Success']).toBe(true);
        expect((listRes['Tours'] as Array<{ TourKey: string }>).map((t) => t.TourKey)).toEqual(['sales.close-won']);

        const startRes = await byName.get('StartTour')!.Handler({
            TourKey: 'sales.close-won',
            Mode: 'Chat',
        });
        expect(startRes['Success']).toBe(true);
        expect(startRes['CurrentStepKey']).toBe('pick-stage');

        const snapshot = await toolkit.BuildActiveTourContextSnapshot();
        expect(snapshot.ActiveTour).toEqual(
            expect.objectContaining({
                TourKey: 'sales.close-won',
                Name: 'Closing your first deal',
                StepKey: 'pick-stage',
                StepIndex: 0,
                StepCount: 3,
                Mode: 'Chat',
                DirectorType: 'Chat',
            }),
        );
        expect(snapshot.AvailableTours).toHaveLength(1);

        await byName.get('PauseTour')!.Handler({});
        expect(toolkit.ActiveSession?.SessionView.IsPaused).toBe(true);

        await byName.get('ResumeTour')!.Handler({});
        expect(toolkit.ActiveSession?.SessionView.IsPaused).toBe(false);

        await byName.get('StopTour')!.Handler({ Reason: 'User done' });
        expect(toolkit.ActiveSession?.Status).toBe('Dismissed');
    });

    it('enforces TourGetVisibleAnchors citation guard and TourHighlight loud failure on invisible anchors', async () => {
        const { toolkit, anchorBridge } = makeToolkitFixture();
        const sessionTools = toolkit.GetSessionTools();
        const getAnchors = sessionTools.find((t) => t.Name === 'TourGetVisibleAnchors')!;
        const highlight = sessionTools.find((t) => t.Name === 'TourHighlight')!;

        const visibleRes = await getAnchors.Handler({});
        expect(visibleRes['Anchors']).toHaveLength(1);

        // Visible anchor succeeds
        const okRes = await highlight.Handler({ AnchorKey: 'sales.deals.stage', Caption: 'Pick stage' });
        expect(okRes['Success']).toBe(true);
        expect(anchorBridge.HighlightedCalls).toEqual([{ AnchorKey: 'sales.deals.stage', Caption: 'Pick stage' }]);

        // Invisible / invented anchor fails LOUDLY
        const badRes = await highlight.Handler({ AnchorKey: 'sales.deals.nonexistent' });
        expect(badRes['Success']).toBe(false);
        expect(String(badRes['Error'])).toContain('not currently visible');
    });

    it('enforces TourGoToStep authored-edges-only and completed-history guards', async () => {
        const { toolkit } = makeToolkitFixture();
        const startTool = toolkit.GetGlobalTools().find((t) => t.Name === 'StartTour')!;
        await startTool.Handler({ TourKey: 'sales.close-won', Mode: 'Chat' });

        const sessionTools = toolkit.GetSessionTools();
        const goToStep = sessionTools.find((t) => t.Name === 'TourGoToStep')!;

        // Reject skipping straight from step 1 to step 3 (not an authored outgoing edge)
        const jumpRes = await goToStep.Handler({ StepKey: 'hidden-secret' });
        expect(jumpRes['Success']).toBe(false);
        expect(String(jumpRes['Error'])).toContain('neither an authored outgoing edge');

        // Accept authored outgoing edge (pick-stage -> save-deal)
        const nextRes = await goToStep.Handler({ StepKey: 'save-deal' });
        expect(nextRes['Success']).toBe(true);
        expect(nextRes['CurrentStepKey']).toBe('save-deal');

        // Accept backtracking to a previously completed step (pick-stage)
        const backRes = await goToStep.Handler({ StepKey: 'pick-stage' });
        expect(backRes['Success']).toBe(true);
        expect(backRes['CurrentStepKey']).toBe('pick-stage');
    });

    it('supports TourHighlight pointer state, TourSelectChoice, TourAdvanceStep, TourGoBack, and TourDemonstrateStep', async () => {
        const host = new MockTourHost({
            InitialLocation: { ApplicationName: 'Sales', NavItemKey: 'deals' },
        });
        const anchorBridge = new MockAnchorBridge();
        anchorBridge.VisibleAnchors = [
            {
                AnchorKey: 'sales.deals.stage',
                Strategy: 'FormField',
                AccessibleName: 'Stage',
                IsVisible: true,
            },
        ];
        const store = new MemoryProgressStore();
        const tour: TourDefinition = {
            TourKey: 'sales.sage-tools',
            Name: 'Sage Tools Tour',
            Status: 'Active',
            AllowAgentActions: true,
            Steps: [
                {
                    StepKey: 'choice-1',
                    Sequence: 10,
                    StepType: 'Choice',
                    Title: 'Choose focus',
                    Configuration: {
                        Options: [
                            { Key: 'stage', Label: 'Stage' },
                            { Key: 'close', Label: 'Close' },
                        ],
                    },
                },
                {
                    StepKey: 'demo-stage',
                    Sequence: 20,
                    StepType: 'Action',
                    Title: 'Set Stage',
                    Mode: 'Do',
                    Anchor: { Strategy: 'Registered', Key: 'sales.deals.stage' },
                    RequiresMutationConfirmation: true,
                    ConfirmationPrompt: 'Update stage to Closed Won?',
                },
                {
                    StepKey: 'done-step',
                    Sequence: 30,
                    StepType: 'Modal',
                    Title: 'Done',
                },
            ],
            Paths: [
                { FromStepKey: 'choice-1', ToStepKey: 'demo-stage', Condition: 'stage', Priority: 100 },
                { FromStepKey: 'demo-stage', ToStepKey: 'done-step' },
            ],
        };

        const toolkit = new TourAgentToolkit({
            Host: host,
            DefinitionSource: new InlineTourSource([tour]),
            ProgressStore: store,
            AnchorBridge: anchorBridge,
        });

        await toolkit.GetGlobalTools().find((t) => t.Name === 'StartTour')!.Handler({
            TourKey: 'sales.sage-tools',
            Mode: 'Chat',
        });

        const tools = toolkit.GetSessionTools();
        // Deduplicated: only one TourSelectChoice tool
        expect(tools.filter((t) => t.Name === 'TourSelectChoice')).toHaveLength(1);

        const byName = new Map(tools.map((t) => [t.Name, t]));

        // TourHighlight sets session PointerHighlight
        const hlRes = await byName.get('TourHighlight')!.Handler({
            AnchorKey: 'sales.deals.stage',
            Caption: 'Look here',
            DurationMs: 3000,
        });
        expect(hlRes['Success']).toBe(true);
        expect(toolkit.ActiveSession?.SessionView.PointerHighlight?.AnchorKey).toBe('sales.deals.stage');

        // TourSelectChoice branches to demo-stage
        const choiceRes = await byName.get('TourSelectChoice')!.Handler({ ChoiceKey: 'stage' });
        expect(choiceRes['Success']).toBe(true);
        expect(choiceRes['CurrentStepKey']).toBe('demo-stage');

        // TourGoBack steps back to choice-1, then TourSelectChoice returns to demo-stage
        const backRes = await byName.get('TourGoBack')!.Handler({});
        expect(backRes['Success']).toBe(true);
        expect(backRes['CurrentStepKey']).toBe('choice-1');
        await byName.get('TourSelectChoice')!.Handler({ ChoiceKey: 'stage' });

        // TourDemonstrateStep requires confirmation first
        const needConfirm = await byName.get('TourDemonstrateStep')!.Handler({});
        expect(needConfirm['Success']).toBe(false);
        expect(needConfirm['RequiresConfirmation']).toBe(true);
        expect(needConfirm['ConfirmationPrompt']).toBe('Update stage to Closed Won?');

        // Confirmed demonstration succeeds and advances to done-step
        const confirmed = await byName.get('TourDemonstrateStep')!.Handler({ ConfirmedMutation: true });
        expect(confirmed['Success']).toBe(true);
        expect(confirmed['CurrentStepKey']).toBe('done-step');

        // TourAdvanceStep finishes the tour
        const adv = await byName.get('TourAdvanceStep')!.Handler({});
        expect(adv['Success']).toBe(true);
        expect(adv['Status']).toBe('Completed');
    });
});
