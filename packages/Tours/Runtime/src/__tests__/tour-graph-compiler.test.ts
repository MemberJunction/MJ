import { describe, expect, it } from 'vitest';
import { SelectOutgoingEdges } from '@memberjunction/graph';
import {
    CompileTourGraph,
    ComputeTourGraphLayout,
    EvaluateTourCondition,
    TourGraphConditionEvaluator,
    ValidateTourGraph,
} from '../tour-graph-compiler';
import { ResolveLocalizedStepCopy, ResolveLocalizedTourCopy } from '../localization';
import type { TourDefinition } from '../types';

function makeLinearTour(): TourDefinition {
    return {
        TourKey: 'core.welcome',
        Name: 'Welcome to MJ',
        Description: 'Orientation tour',
        Status: 'Active',
        Configuration: {
            localizations: {
                es: { Name: 'Bienvenido a MJ', Description: 'Tour de orientación' },
                'es-MX': { Name: 'Bienvenido a MJ (MX)' },
            },
        },
        Steps: [
            {
                StepKey: 'welcome',
                Sequence: 10,
                StepType: 'Modal',
                Title: 'Welcome',
                Body: 'Let us get started.',
                Configuration: {
                    localizations: {
                        es: { Title: 'Bienvenido', Body: 'Empecemos.' },
                    },
                },
            },
            {
                StepKey: 'switcher',
                Sequence: 20,
                StepType: 'Spotlight',
                Title: 'App Switcher',
                Anchor: { Strategy: 'Registered', Key: 'core.shell.app-switcher' },
            },
            {
                StepKey: 'omnibar',
                Sequence: 30,
                StepType: 'Spotlight',
                Title: 'Omnibar',
                Anchor: { Strategy: 'Registered', Key: 'core.shell.omnibar' },
            },
        ],
    };
}

describe('tour-graph-compiler', () => {
    it('synthesizes sequential edges for linear tours ordered by Sequence', () => {
        const tour = makeLinearTour();
        const compiled = CompileTourGraph(tour);

        expect(compiled.Nodes).toHaveLength(3);
        expect(compiled.Edges).toHaveLength(2);
        expect(compiled.Repository.GetStartNodes().map((n) => n.id)).toEqual(['welcome']);
        expect(compiled.Repository.GetOutgoingEdges('welcome').map((e) => e.destinationNodeId)).toEqual(['switcher']);
        expect(compiled.Repository.GetOutgoingEdges('switcher').map((e) => e.destinationNodeId)).toEqual(['omnibar']);
        expect(compiled.Repository.GetOutgoingEdges('omnibar')).toEqual([]);
    });

    it('branches on choice keys, CompositeFilter JSON, and SafeExpressionEvaluator', () => {
        const tour: TourDefinition = {
            TourKey: 'core.branching',
            Name: 'Branching Tour',
            Status: 'Active',
            Steps: [
                { StepKey: 'pick', Sequence: 10, StepType: 'Choice', Title: 'What next?' },
                { StepKey: 'records-path', Sequence: 20, StepType: 'Spotlight', Title: 'Records' },
                { StepKey: 'admin-path', Sequence: 30, StepType: 'Spotlight', Title: 'Admin' },
                { StepKey: 'fallback-path', Sequence: 40, StepType: 'Modal', Title: 'Default' },
            ],
            Paths: [
                { FromStepKey: 'pick', ToStepKey: 'records-path', Condition: 'explore-records', Priority: 200 },
                {
                    FromStepKey: 'pick',
                    ToStepKey: 'admin-path',
                    Condition: {
                        logic: 'and',
                        filters: [{ field: 'record.IsAdmin', operator: 'eq', value: true }],
                    },
                    Priority: 150,
                },
                { FromStepKey: 'pick', ToStepKey: 'fallback-path', Condition: null, IsDefault: true, Priority: 10 },
            ],
        };

        const compiled = CompileTourGraph(tour);
        const evaluator = new TourGraphConditionEvaluator();

        const choiceSel = SelectOutgoingEdges('pick', compiled.Repository, evaluator, {
            lastChoiceKey: 'explore-records',
            record: { IsAdmin: false },
        });
        expect(choiceSel.Edges[0]?.destinationNodeId).toBe('records-path');

        const filterSel = SelectOutgoingEdges('pick', compiled.Repository, evaluator, {
            lastChoiceKey: 'other',
            record: { IsAdmin: true },
        });
        expect(filterSel.Edges[0]?.destinationNodeId).toBe('admin-path');

        const fallbackSel = SelectOutgoingEdges('pick', compiled.Repository, evaluator, {
            lastChoiceKey: 'other',
            record: { IsAdmin: false },
        });
        expect(fallbackSel.Edges[0]?.destinationNodeId).toBe('fallback-path');
    });

    it('evaluates JSON string CompositeFilter and SafeExpressionEvaluator expressions', () => {
        const jsonFilter = JSON.stringify({
            logic: 'and',
            filters: [{ field: 'deal.Amount', operator: 'gt', value: 1000 }],
        });
        expect(EvaluateTourCondition(jsonFilter, { deal: { Amount: 2500 } })).toEqual({
            Success: true,
            Value: true,
        });
        expect(EvaluateTourCondition(jsonFilter, { deal: { Amount: 500 } })).toEqual({
            Success: true,
            Value: false,
        });

        expect(EvaluateTourCondition('stepCount >= 2 && isReady === true', { stepCount: 3, isReady: true })).toEqual({
            Success: true,
            Value: true,
        });
        expect(EvaluateTourCondition('Choice:sales', { lastChoiceKey: 'sales' })).toEqual({
            Success: true,
            Value: true,
        });
    });

    it('detects cycles and dangling step references via ValidateTourGraph', () => {
        const cyclicTour: TourDefinition = {
            TourKey: 'bad.cycle',
            Name: 'Cyclic',
            Status: 'Draft',
            Steps: [
                { StepKey: 'a', Sequence: 10, StepType: 'Modal', Title: 'A' },
                { StepKey: 'b', Sequence: 20, StepType: 'Modal', Title: 'B' },
            ],
            Paths: [
                { FromStepKey: 'a', ToStepKey: 'b' },
                { FromStepKey: 'b', ToStepKey: 'a' },
            ],
        };

        const validation = ValidateTourGraph(cyclicTour);
        expect(validation.Valid).toBe(false);
        expect(validation.CycleResult.hasCycle).toBe(true);

        const danglingTour: TourDefinition = {
            TourKey: 'bad.dangling',
            Name: 'Dangling',
            Status: 'Draft',
            Steps: [{ StepKey: 'a', Sequence: 10, StepType: 'Modal', Title: 'A' }],
            Paths: [{ FromStepKey: 'a', ToStepKey: 'missing' }],
        };
        const danglingValidation = ValidateTourGraph(danglingTour);
        expect(danglingValidation.Valid).toBe(false);
        expect(danglingValidation.UnknownStepRefs).toEqual([{ FromStepKey: 'a', ToStepKey: 'missing' }]);
    });

    it('computes deterministic layered layout coordinates and bounds', () => {
        const tour = makeLinearTour();
        const layout = ComputeTourGraphLayout(tour, { Direction: 'LR' });

        expect(layout.Positions.size).toBe(3);
        const pos1 = layout.Positions.get('welcome')!;
        const pos2 = layout.Positions.get('switcher')!;
        const pos3 = layout.Positions.get('omnibar')!;
        expect(pos1.X).toBeLessThan(pos2.X);
        expect(pos2.X).toBeLessThan(pos3.X);
        expect(layout.Bounds.Width).toBeGreaterThan(0);
        expect(layout.Ranks.get('welcome')).toBe(0);
        expect(layout.Ranks.get('omnibar')).toBe(2);
    });

    it('resolves localized tour and step copy with exact -> primary subtag -> base fallback', () => {
        const tour = makeLinearTour();
        expect(ResolveLocalizedTourCopy(tour, 'es-MX')).toEqual({
            Name: 'Bienvenido a MJ (MX)',
            Description: 'Orientation tour',
        });
        expect(ResolveLocalizedTourCopy(tour, 'es-AR')).toEqual({
            Name: 'Bienvenido a MJ',
            Description: 'Tour de orientación',
        });
        expect(ResolveLocalizedTourCopy(tour, 'fr')).toEqual({
            Name: 'Welcome to MJ',
            Description: 'Orientation tour',
        });

        expect(ResolveLocalizedStepCopy(tour.Steps[0], 'es-ES')).toEqual(
            expect.objectContaining({ Title: 'Bienvenido', Body: 'Empecemos.' }),
        );
    });
});
