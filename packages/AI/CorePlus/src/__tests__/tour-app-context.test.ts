import { describe, it, expect } from 'vitest';
import {
    BuildAppContextSnapshot,
    DiffAppContextSnapshot,
    FormatAppContextNote,
    type ActiveTourContextSnapshot,
    type AppContextSnapshot,
    type AvailableTourSummary,
} from '../app-context';
import type {
    ActionableCommand,
    AutomaticCommand,
    StartTourCommand,
} from '../ui-commands';

const activeTourSample: ActiveTourContextSnapshot = {
    TourKey: 'sales.close-won',
    Name: 'Closing your first deal',
    StepKey: 'pick-stage',
    StepTitle: 'Pick the winning stage',
    StepIndex: 2,
    StepCount: 5,
    Mode: 'Visual',
    DirectorType: 'Visual',
    StartedAt: '2026-11-24T12:00:00.000Z',
};

const availableToursSample: AvailableTourSummary[] = [
    {
        TourKey: 'core.welcome',
        Name: 'Welcome to MJ',
        Description: 'Quick orientation',
        EstimatedMinutes: 2,
    },
    {
        TourKey: 'sales.pipeline',
        Name: 'Pipeline basics',
        Description: 'Track deals',
        EstimatedMinutes: 3,
    },
];

describe('AppContextSnapshot Guided Tour integration', () => {
    it('passes ActiveTour and AvailableTours through BuildAppContextSnapshot', () => {
        const snap = BuildAppContextSnapshot({
            App: { Name: 'Sales' },
            ActiveTour: activeTourSample,
            AvailableTours: availableToursSample,
        });

        expect(snap.ActiveTour).toEqual(activeTourSample);
        expect(snap.AvailableTours).toEqual(availableToursSample);
    });

    it('omits ActiveTour and AvailableTours when not provided', () => {
        const snap = BuildAppContextSnapshot({ App: { Name: 'Sales' } });
        expect(snap.ActiveTour).toBeUndefined();
        expect(snap.AvailableTours).toBeUndefined();
    });

    it('formats ActiveTour as "User is on step X of Y of the tour *<Name>* (<Mode>)" in FormatAppContextNote', () => {
        const snap = BuildAppContextSnapshot({
            App: { Name: 'Sales' },
            ActiveNavItem: { Name: 'Deals', ResourceType: 'Records' },
            ActiveTour: activeTourSample,
            AvailableTours: availableToursSample,
        });

        const note = FormatAppContextNote(snap);
        expect(note).toContain('User is on step 3 of 5 of the tour *Closing your first deal* (Visual)');
        expect(note).toContain('active tour step: Pick the winning stage (pick-stage), director: Visual');
        expect(note).toContain('available tours (StartTour TourKey): Welcome to MJ [core.welcome] (~2m), Pipeline basics [sales.pipeline] (~3m)');
    });

    it('emits delta when ActiveTour starts, advances, or ends in DiffAppContextSnapshot', () => {
        const base: AppContextSnapshot = BuildAppContextSnapshot({
            App: { Name: 'Sales' },
            ActiveNavItem: { Name: 'Deals' },
        });
        const started: AppContextSnapshot = BuildAppContextSnapshot({
            App: { Name: 'Sales' },
            ActiveNavItem: { Name: 'Deals' },
            ActiveTour: activeTourSample,
        });

        // No change returns null
        expect(DiffAppContextSnapshot(started, { ...started })).toBeNull();

        // Tour started
        const startDelta = DiffAppContextSnapshot(base, started);
        expect(startDelta?.ActiveTour).toEqual(activeTourSample);
        expect(FormatAppContextNote(startDelta!)).toContain(
            'User is on step 3 of 5 of the tour *Closing your first deal* (Visual)',
        );

        // Tour advances step
        const advanced: AppContextSnapshot = {
            ...started,
            ActiveTour: {
                ...activeTourSample,
                StepKey: 'confirm-close',
                StepTitle: 'Confirm close',
                StepIndex: 3,
            },
        };
        const advanceDelta = DiffAppContextSnapshot(started, advanced);
        expect(advanceDelta?.ActiveTour?.StepIndex).toBe(3);
        expect(FormatAppContextNote(advanceDelta!)).toContain(
            'User is on step 4 of 5 of the tour *Closing your first deal* (Visual)',
        );

        // Tour cleared emits observable location delta
        const ended: AppContextSnapshot = {
            ...started,
            ActiveTour: null,
        };
        const clearDelta = DiffAppContextSnapshot(started, ended);
        expect(clearDelta).not.toBeNull();
        expect(FormatAppContextNote(clearDelta!)).toContain('location: Sales › Deals');
    });

    it('emits delta when AvailableTours changes', () => {
        const prev = BuildAppContextSnapshot({
            App: { Name: 'Sales' },
            AvailableTours: [availableToursSample[0]],
        });
        const next = BuildAppContextSnapshot({
            App: { Name: 'Sales' },
            AvailableTours: availableToursSample,
        });

        const delta = DiffAppContextSnapshot(prev, next);
        expect(delta?.AvailableTours).toEqual(availableToursSample);
    });
});

describe('StartTourCommand (start:tour UI command)', () => {
    it('supports start:tour as both ActionableCommand and AutomaticCommand', () => {
        const actionable: ActionableCommand = {
            type: 'start:tour',
            TourKey: 'sales.close-won',
            Mode: 'Chat',
            StartAtStepKey: 'pick-stage',
            Label: 'Show me how to close a deal',
            icon: 'fa-route',
        };
        const automatic: AutomaticCommand = {
            type: 'start:tour',
            TourKey: 'core.welcome',
            Mode: 'Visual',
        };

        expect(actionable.type).toBe('start:tour');
        if (actionable.type === 'start:tour') {
            expect(actionable.TourKey).toBe('sales.close-won');
            expect(actionable.Mode).toBe('Chat');
            expect(actionable.StartAtStepKey).toBe('pick-stage');
            expect(actionable.Label).toBe('Show me how to close a deal');
        }

        expect(automatic.type).toBe('start:tour');
        if (automatic.type === 'start:tour') {
            expect(automatic.TourKey).toBe('core.welcome');
            expect(automatic.Mode).toBe('Visual');
        }
    });

    it('round-trips StartTourCommand through JSON', () => {
        const cmd: StartTourCommand = {
            type: 'start:tour',
            TourKey: 'sales.close-won',
            Mode: 'Voice',
            StartAtStepKey: 'step-1',
            Label: 'Walk me through it',
        };
        const parsed = JSON.parse(JSON.stringify(cmd)) as StartTourCommand;
        expect(parsed).toEqual(cmd);
    });
});
