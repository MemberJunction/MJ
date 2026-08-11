/**
 * The projections, run against REAL run trees.
 *
 * The fixture is the literal output of `LoadAgentRunTree` for the two shipped demo workflows,
 * captured from a live database. Hand-built fixtures test what I *believe* the query returns; this
 * one tests what it actually returned — including the parts that were wrong the first several
 * times, like a task whose kind is `While` and a prompt task carrying real cost.
 *
 * Regenerate with the dump script described in the workflow guide if the demo agents change shape.
 */
import { describe, expect, it } from 'vitest';
import { BuildAgentRunTree, type AgentRunTreeRow } from '@memberjunction/ai-core-plus';
import { ProjectRunTreeToTimeline } from '../run-tree-timeline-projection';
import { buildFlowModelFromTree } from '../flow/run-tree-flow-projection';
import fixture from './real-run-trees.fixture.json';

type Fixture = Record<string, { runID: string; rows: AgentRunTreeRow[] }>;
const REAL = fixture as unknown as Fixture;

/** Rows come back from JSON with string dates; the loader hands the UI real Dates. */
function rehydrate(rows: AgentRunTreeRow[]): AgentRunTreeRow[] {
    return rows.map((r) => ({
        ...r,
        StartedAt: r.StartedAt ? new Date(r.StartedAt as unknown as string) : null,
        CompletedAt: r.CompletedAt ? new Date(r.CompletedAt as unknown as string) : null,
    }));
}

function treeFor(agent: string) {
    const entry = REAL[agent];
    expect(entry, `no captured run for ${agent}`).toBeTruthy();
    return BuildAgentRunTree(rehydrate(entry.rows));
}

describe('real Content Pipeline run', () => {
    it('assembles every captured node into one tree', () => {
        const root = treeFor('Content Pipeline');
        expect(root).not.toBeNull();
        expect(ProjectRunTreeToTimeline(root)).toHaveLength(REAL['Content Pipeline'].rows.length);
    });

    it('shows the workflow steps as timeline rows, at their real depth', () => {
        const items = ProjectRunTreeToTimeline(treeFor('Content Pipeline'));
        const byTitle = new Map(items.map((i) => [i.title, i]));

        // These are MJ: Tasks rows. Before the tree they appeared in NO timeline at all; then they
        // appeared with row types of their own ('prompt', 'action'), which got the icon right and
        // missed everything keyed on `type === 'step'` — the detail panel, the action link, loop
        // expansion. They are STEPS now, carrying the step vocabulary in `data`.
        expect(byTitle.get('Draft the piece')?.type).toBe('step');
        expect(byTitle.get('Draft the piece')?.data?.StepType).toBe('Prompt');
        expect(byTitle.get('Research: broad')?.data?.StepType).toBe('Actions');
        // What marks them as dispatcher work is provenance, not a different row type.
        expect(byTitle.get('Draft the piece')?.provenance).toBe('workflow');
        expect(byTitle.get('Review against brand rules')?.provenance).toBe('workflow');
        expect(byTitle.get('Draft the piece')!.level).toBeGreaterThan(byTitle.get('Content Pipeline')!.level);
    });

    it('keeps the branch that was not taken visible, as Skipped', () => {
        const items = ProjectRunTreeToTimeline(treeFor('Content Pipeline'));
        const approved = items.find((i) => i.title === 'Close out: approved');

        // The exclusive pair is the most interesting thing this run did; a viewer that dropped the
        // losing branch would hide which way it went.
        expect(approved?.status).toBe('Skipped');
    });

    it('surfaces the prompt-step cost the run steps cannot reach', () => {
        const items = ProjectRunTreeToTimeline(treeFor('Content Pipeline'));
        const draft = items.find((i) => i.title === 'Draft the piece')!;

        // A Prompt task has no agent run — its spend is only reachable through the promptRunID
        // recorded in Configuration.runtime, which is the whole reason that slice exists.
        expect(draft.subtitle).toMatch(/\$/);
    });

    it('gives the visualizations a typed node for every step', () => {
        const model = buildFlowModelFromTree(
            treeFor('Content Pipeline'), 'Content Pipeline', 'Completed',
            { iconClass: 'fa-robot', logoUrl: null },
        )!;

        expect(model.nodes.length).toBe(REAL['Content Pipeline'].rows.length);
        // 'other' is the undifferentiated fallback — a node with it is invisible in the renderers.
        expect(model.nodes.filter((n) => n.type === 'other')).toEqual([]);
        expect(model.nodes.some((n) => n.type === 'loop')).toBe(true);     // the While
        expect(model.nodes.some((n) => n.type === 'prompt')).toBe(true);   // the drafting prompts
        expect(model.nodes.some((n) => n.type === 'action')).toBe(true);   // the research search
    });
});

describe('real Schema Documentation Sweep run', () => {
    it('shows the Get Records step and its ForEach as rows', () => {
        const items = ProjectRunTreeToTimeline(treeFor('Schema Documentation Sweep'));
        const titles = items.map((i) => i.title);

        expect(titles).toContain('Find undocumented fields');
        expect(titles).toContain('Propose a description for each field');
    });

    it('types the loop as a loop so it renders distinctly', () => {
        const model = buildFlowModelFromTree(
            treeFor('Schema Documentation Sweep'), 'Schema Documentation Sweep', 'Completed',
            { iconClass: 'fa-robot', logoUrl: null },
        )!;
        const loop = model.nodes.find((n) => n.name === 'Propose a description for each field');

        expect(loop?.type).toBe('loop');
    });
});
