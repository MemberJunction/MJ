import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {
    BuildBlueprintSvgLayout,
    BuildRunSparkBars,
    BuildWaterfallBars,
} from '../workflow-blueprint.util';
import { WORKFLOW_STARTER_RECIPES } from '../workflows.types';

const HERE = path.dirname(new URL(import.meta.url).pathname);
const DASHBOARD_HTML = path.join(HERE, '..', 'workflows-dashboard.component.html');

describe('Workflow Blueprint SVG, Spark-Barcode & Waterfall Helpers', () => {
    it('lays out branching & looping steps into distinct topological columns for Blueprint cards', () => {
        const layout = BuildBlueprintSvgLayout(
            [
                { ID: 's1', StepType: 'Action' },
                { ID: 's2', StepType: 'ForEach', LoopType: 'Action' },
                { ID: 's3', StepType: 'Human' },
            ],
            [
                { OriginStepID: 's1', DestinationStepID: 's2' },
                { OriginStepID: 's2', DestinationStepID: 's3' },
            ],
        );

        expect(layout.Steps).toHaveLength(3);
        expect(layout.Paths).toHaveLength(2);
        const [n1, n2, n3] = layout.Steps;
        expect(n1.X).toBeLessThan(n2.X);
        expect(n2.X).toBeLessThan(n3.X);
        expect(n2.IsLoop).toBe(true);
        expect(n3.Kind).toBe('human');
    });

    it('builds a 10-run health spark-barcode with accurate success rate and p50 duration', () => {
        const base = new Date('2026-01-01T10:00:00Z').getTime();
        const runs = [
            { ID: 'r1', Status: 'Complete' as const, StartedAt: new Date(base), CompletedAt: new Date(base + 4000) },
            { ID: 'r2', Status: 'Failed' as const, StartedAt: new Date(base), CompletedAt: new Date(base + 2000) },
            { ID: 'r3', Status: 'Complete' as const, StartedAt: new Date(base), CompletedAt: new Date(base + 6000) },
            { ID: 'r4', Status: 'Complete' as const, StartedAt: new Date(base), CompletedAt: new Date(base + 4000) },
        ];
        const summary = BuildRunSparkBars(runs);
        expect(summary.RecentBars).toHaveLength(4);
        expect(summary.HealthPercent).toBe(75);
        expect(summary.P50Duration).toBe('4s');
        expect(summary.LastRunStatus).toBe('Complete');
    });

    it('computes normalized waterfall offsets and widths correlated to step timestamps', () => {
        const t0 = new Date('2026-01-01T10:00:00Z').getTime();
        const bars = BuildWaterfallBars([
            {
                ID: 'st1',
                Name: 'Fetch Tickets',
                Status: 'Complete',
                StepType: 'Action',
                StartedAt: new Date(t0),
                CompletedAt: new Date(t0 + 2000),
            },
            {
                ID: 'st2',
                Name: 'Summarize',
                Status: 'Complete',
                StepType: 'Prompt',
                StartedAt: new Date(t0 + 2000),
                CompletedAt: new Date(t0 + 10000),
            },
        ]);
        expect(bars).toHaveLength(2);
        expect(bars[0].LeftPct).toBe(0);
        expect(bars[0].WidthPct).toBe(20);
        expect(bars[1].LeftPct).toBe(20);
        expect(bars[1].WidthPct).toBe(80);
        expect(bars[1].DurationLabel).toBe('8s');
    });

    it('keeps all starter recipes compliant with D18 vocabulary', () => {
        expect(WORKFLOW_STARTER_RECIPES.length).toBeGreaterThanOrEqual(4);
        for (const recipe of WORKFLOW_STARTER_RECIPES) {
            const copy = `${recipe.Label} ${recipe.Name} ${recipe.Prompt}`;
            expect(copy).not.toMatch(/\b(graphs?|DAGs?|nodes?|flow agents?)\b/i);
        }
    });

    it('wires Run and Debug actions in Studio, Blueprint Cards, and Ops Table without redundant Advanced Record button', () => {
        const html = fs.readFileSync(DASHBOARD_HTML, 'utf-8');
        expect(html).not.toContain('Advanced Record');
        expect(html).toContain('<article class="wf-bp-card"');
        expect((html.match(/OnRunWorkflow\(/g) ?? []).length).toBeGreaterThanOrEqual(3);
        expect((html.match(/OnDebugWorkflow\(/g) ?? []).length).toBeGreaterThanOrEqual(3);
        expect(html).toContain("OnSelectStudioTab('runs')");
    });
});
