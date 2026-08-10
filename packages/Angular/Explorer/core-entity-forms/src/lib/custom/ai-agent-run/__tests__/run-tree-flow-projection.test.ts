/**
 * Tests for the run-tree → FlowModel projection.
 *
 * The three visualizations (Flame Cascade, Subway Lines, Constellation) share one model, so what
 * matters here is that the model is correct — each renderer is then correct by construction. The
 * assertions that earn their keep are the ones about *kind*: a renderer colours and icons by type,
 * and a task-graph node typed 'other' is invisible in exactly the way this projection exists to fix.
 */
import { describe, expect, it } from 'vitest';
import type { AgentRunTreeNode } from '@memberjunction/ai-core-plus';
import { buildFlowModelFromTree } from '../flow/run-tree-flow-projection';

function node(p: Partial<AgentRunTreeNode> & { NodeID: string }): AgentRunTreeNode {
    return {
        NodeID: p.NodeID,
        ParentNodeID: p.ParentNodeID ?? null,
        Depth: p.Depth ?? 0,
        Sequence: p.Sequence ?? 0,
        NodeType: p.NodeType ?? 'Step',
        Name: p.Name ?? p.NodeID,
        Status: p.Status ?? 'Complete',
        StartedAt: p.StartedAt ?? null,
        CompletedAt: p.CompletedAt ?? null,
        DurationMs: p.DurationMs ?? null,
        Cost: p.Cost ?? null,
        Tokens: p.Tokens ?? null,
        SourceEntity: p.SourceEntity ?? 'MJ: AI Agent Run Steps',
        SourceKind: p.SourceKind ?? null,
        SourceID: p.SourceID ?? p.NodeID,
        Children: p.Children ?? [],
    } as AgentRunTreeNode;
}

const ICON = { iconClass: 'fa-robot', logoUrl: null };

/** The real shape of a Content Pipeline run: run → steps → graph → tasks. */
function pipelineTree(): AgentRunTreeNode {
    return node({
        NodeID: 'run', NodeType: 'Run', Name: 'Content Pipeline', SourceEntity: 'MJ: AI Agent Runs',
        Children: [
            node({ NodeID: 'v', NodeType: 'Step', Name: 'Agent Validation', SourceKind: 'Validation', DurationMs: 10 }),
            node({
                NodeID: 'tg', NodeType: 'Step', Name: 'Task Graph', SourceKind: 'TaskGraph', DurationMs: 300,
                Children: [
                    node({
                        NodeID: 'graph', NodeType: 'TaskGraph', Name: 'Content Pipeline',
                        SourceEntity: 'MJ: Tasks', SourceKind: 'TaskGraph',
                        Children: [
                            node({ NodeID: 't1', NodeType: 'Task', Name: 'Research', SourceEntity: 'MJ: Tasks', SourceKind: 'Action', DurationMs: 1373 }),
                            node({ NodeID: 't2', NodeType: 'Task', Name: 'Draft', SourceEntity: 'MJ: Tasks', SourceKind: 'Prompt', DurationMs: 2254, Cost: 0.0006 }),
                            node({ NodeID: 't3', NodeType: 'Task', Name: 'Review', SourceEntity: 'MJ: Tasks', SourceKind: 'While', DurationMs: 5372 }),
                            node({ NodeID: 't4', NodeType: 'Task', Name: 'Approve', SourceEntity: 'MJ: Tasks', SourceKind: 'Human', Status: 'Skipped' }),
                        ],
                    }),
                ],
            }),
        ],
    });
}

describe('buildFlowModelFromTree', () => {
    it('returns null for no tree, so a caller can keep its previous model', () => {
        expect(buildFlowModelFromTree(null, 'x', 'Complete', ICON)).toBeNull();
    });

    it('includes task-graph work, which the step-based model cannot see at all', () => {
        const model = buildFlowModelFromTree(pipelineTree(), 'Content Pipeline', 'Completed', ICON)!;
        const names = model.nodes.map((n) => n.name);

        expect(names).toContain('Research');
        expect(names).toContain('Draft');
        expect(names).toContain('Review');
    });

    it('maps each kind to its visual type, in BOTH vocabularies', () => {
        const model = buildFlowModelFromTree(pipelineTree(), 'Content Pipeline', 'Completed', ICON)!;
        const typeOf = (name: string) => model.nodes.find((n) => n.name === name)?.type;

        // A run step says 'Actions'/'Validation'; a task says 'Action'/'While'/'Human'.
        expect(typeOf('Agent Validation')).toBe('validation');
        expect(typeOf('Research')).toBe('action');
        expect(typeOf('Draft')).toBe('prompt');
        expect(typeOf('Review')).toBe('loop');
        expect(typeOf('Approve')).toBe('decision');
    });

    it('never leaves a known kind as the undifferentiated fallback', () => {
        const model = buildFlowModelFromTree(pipelineTree(), 'Content Pipeline', 'Completed', ICON)!;
        const untyped = model.nodes.filter((n) => n.type === 'other').map((n) => n.name);

        // 'other' is what makes a node invisible in the renderers — it is the bug being fixed.
        expect(untyped).toEqual([]);
    });

    it('carries a source reference for every node, whatever entity it lives in', () => {
        const model = buildFlowModelFromTree(pipelineTree(), 'Content Pipeline', 'Completed', ICON)!;
        const draft = model.nodes.find((n) => n.name === 'Draft');

        // `raw` is typed to a run STEP and cannot hold a Task — this is why `source` exists.
        expect(draft?.raw).toBeNull();
        expect(draft?.source).toEqual({ entity: 'MJ: Tasks', id: 't2' });
    });

    it('preserves the tree depth so renderers indent correctly', () => {
        const model = buildFlowModelFromTree(pipelineTree(), 'Content Pipeline', 'Completed', ICON)!;
        const depthOf = (name: string) => model.nodes.find((n) => n.name === name)?.depth;

        expect(depthOf('Agent Validation')).toBe(1);
        expect(depthOf('Draft')).toBe(3);

        // The run and its graph share a name, so the graph is found by its ENTITY rather than by
        // label — which is exactly why every node carries a source reference.
        const graph = model.nodes.find((n) => n.source?.entity === 'MJ: Tasks' && n.source.id === 'graph');
        expect(graph?.depth).toBe(2);
    });

    it('rolls child durations into containers', () => {
        const model = buildFlowModelFromTree(pipelineTree(), 'Content Pipeline', 'Completed', ICON)!;
        const graph = model.nodes.find((n) => n.name === 'Content Pipeline' && n.depth === 2)!;

        // 1373 + 2254 + 5372 ms of task work, in seconds.
        expect(graph.realDur).toBeCloseTo(8.999, 2);
    });

    it('treats an unfinished node as zero rather than inventing elapsed time', () => {
        const model = buildFlowModelFromTree(
            node({ NodeID: 'r', NodeType: 'Run', Children: [node({ NodeID: 's', DurationMs: null })] }),
            'run', 'Running', ICON,
        )!;
        expect(model.nodes.find((n) => n.name === 's')?.realDur).toBe(0);
    });

    it('keeps a skipped branch in the model', () => {
        const model = buildFlowModelFromTree(pipelineTree(), 'Content Pipeline', 'Completed', ICON)!;
        const approve = model.nodes.find((n) => n.name === 'Approve');

        // Skipped is a normal outcome, not an absence — dropping it would hide which branch was
        // not taken, which is usually the question someone opened the visualization to answer.
        expect(approve?.status).toBe('Skipped');
    });
});
