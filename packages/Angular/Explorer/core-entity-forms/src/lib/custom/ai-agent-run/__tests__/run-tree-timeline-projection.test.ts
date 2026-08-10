/**
 * Tests for the run-tree → timeline projection.
 *
 * The defect this replaces was an ordering bug: a child's indent was computed from its parent's
 * indent at the moment the child was visited, so a row that arrived before its parent got the wrong
 * level and every descendant inherited the error. It reproduced only when rows came back in a
 * particular order — invisible on screen most of the time, and trivial to pin here.
 */
import { describe, expect, it } from 'vitest';
import type { AgentRunTreeNode } from '@memberjunction/ai-core-plus';
import { ProjectRunTreeToTimeline } from '../run-tree-timeline-projection';

function node(partial: Partial<AgentRunTreeNode> & { NodeID: string }): AgentRunTreeNode {
    return {
        NodeID: partial.NodeID,
        ParentNodeID: partial.ParentNodeID ?? null,
        Depth: partial.Depth ?? 0,
        Sequence: partial.Sequence ?? 0,
        NodeType: partial.NodeType ?? 'Step',
        Name: partial.Name ?? partial.NodeID,
        Status: partial.Status ?? 'Complete',
        StartedAt: partial.StartedAt ?? null,
        CompletedAt: partial.CompletedAt ?? null,
        DurationMs: partial.DurationMs ?? null,
        Cost: partial.Cost ?? null,
        Tokens: partial.Tokens ?? null,
        SourceEntity: partial.SourceEntity ?? 'MJ: AI Agent Run Steps',
        SourceKind: partial.SourceKind ?? null,
        SourceID: partial.SourceID ?? partial.NodeID,
        Children: partial.Children ?? [],
    } as AgentRunTreeNode;
}

/** run → graph-step → graph → two tasks, one of which started a sub-run. */
function sampleTree(): AgentRunTreeNode {
    return node({
        NodeID: 'run',
        NodeType: 'Run',
        Name: 'Demo Flow Agent',
        Children: [
            node({
                NodeID: 'step',
                NodeType: 'Step',
                Name: 'Task Graph: Demo',
                Children: [
                    node({
                        NodeID: 'graph',
                        NodeType: 'TaskGraph',
                        Name: 'Demo Flow Agent',
                        Children: [
                            node({ NodeID: 'task-a', NodeType: 'Task', Name: 'Get Price' }),
                            node({
                                NodeID: 'task-b',
                                NodeType: 'Task',
                                Name: 'Summarize',
                                Children: [node({ NodeID: 'subrun', NodeType: 'Run', Name: 'Copywriter' })],
                            }),
                        ],
                    }),
                ],
            }),
        ],
    });
}

describe('ProjectRunTreeToTimeline', () => {
    it('returns nothing for a null tree', () => {
        expect(ProjectRunTreeToTimeline(null)).toEqual([]);
    });

    it('flattens depth-first, which is reading order', () => {
        const items = ProjectRunTreeToTimeline(sampleTree());

        expect(items.map((i) => i.id)).toEqual(['run', 'step', 'graph', 'task-a', 'task-b', 'subrun']);
    });

    it('derives level from tree structure, not from visit order', () => {
        const items = ProjectRunTreeToTimeline(sampleTree());
        const levels = Object.fromEntries(items.map((i) => [i.id, i.level]));

        expect(levels).toEqual({ run: 0, step: 1, graph: 2, 'task-a': 3, 'task-b': 3, subrun: 4 });
    });

    it('keeps levels correct however the children are ordered', () => {
        // The old code derived a child's level from whatever its parent's level happened to be when
        // the child was reached. Reversing sibling order must change nothing about indentation.
        const tree = sampleTree();
        const graph = tree.Children[0].Children[0];
        graph.Children = [...graph.Children].reverse();

        const items = ProjectRunTreeToTimeline(tree);
        const subrun = items.find((i) => i.id === 'subrun');

        expect(subrun?.level).toBe(4);
    });

    it('maps each node kind to its own row type, so provenance is styleable', () => {
        const items = ProjectRunTreeToTimeline(sampleTree());
        const types = Object.fromEntries(items.map((i) => [i.id, i.type]));

        // Tasks map onto the SAME row vocabulary as run steps, so they pick up the same displayers.
        // These fixtures carry no SourceKind, so they fall back to the generic row type.
        expect(types).toEqual({
            run: 'subrun',
            step: 'step',
            graph: 'taskgraph',
            'task-a': 'task',
            'task-b': 'task',
            subrun: 'subrun',
        });
    });

    it('renders a task by its KIND, so an action gets the action displayer', () => {
        const tree = node({
            NodeID: 'g', NodeType: 'TaskGraph', Name: 'Graph',
            Children: [
                node({ NodeID: 'a', NodeType: 'Task', Name: 'Search', SourceKind: 'Action' }),
                node({ NodeID: 'p', NodeType: 'Task', Name: 'Draft', SourceKind: 'Prompt' }),
                node({ NodeID: 's', NodeType: 'Task', Name: 'Delegate', SourceKind: 'Agent' }),
            ],
        });
        const items = ProjectRunTreeToTimeline(tree);
        const typeOf = (id: string) => items.find((i) => i.id === id)?.type;

        expect(typeOf('a')).toBe('action');
        expect(typeOf('p')).toBe('prompt');
        expect(typeOf('s')).toBe('subrun');
        // …while still being marked as dispatcher work.
        expect(items.filter((i) => i.provenance === 'workflow')).toHaveLength(4);
    });

    it('can splice a subtree under an existing row', () => {
        const tree = sampleTree();
        const step = tree.Children[0];

        const items = ProjectRunTreeToTimeline(step, 5, true);

        expect(items[0].id).toBe('graph');
        expect(items[0].level).toBe(5);
        expect(items.find((i) => i.id === 'task-a')?.level).toBe(6);
        expect(items.some((i) => i.id === 'step')).toBe(false);
    });

    it('leaves duration undefined while a node is still running', () => {
        const items = ProjectRunTreeToTimeline(node({ NodeID: 'x', DurationMs: null }));

        // Not "0ms" — a step that has not stopped has no duration, and zero reads as instant.
        expect(items[0].duration).toBeUndefined();
    });

    it('formats a sub-second duration in milliseconds', () => {
        const items = ProjectRunTreeToTimeline(node({ NodeID: 'x', DurationMs: 346 }));
        expect(items[0].duration).toBe('346ms');
    });

    it('formats a multi-minute duration in minutes and seconds', () => {
        const items = ProjectRunTreeToTimeline(node({ NodeID: 'x', DurationMs: 125_000 }));
        expect(items[0].duration).toBe('2m 5s');
    });

    it('shows small costs at enough precision to be visible', () => {
        const items = ProjectRunTreeToTimeline(node({ NodeID: 'x', Cost: 0.0004 }));

        // Two decimals would render most real steps as "$0.00", which reads as free.
        expect(items[0].subtitle).toContain('$0.0004');
    });

    it('omits cost entirely when there is none, rather than showing zero', () => {
        const items = ProjectRunTreeToTimeline(node({ NodeID: 'x', Cost: null }));
        expect(items[0].subtitle).not.toContain('$');
    });

    it('marks every projected row as already loaded', () => {
        // The whole tree arrives in one query, so no row is ever "expanded but still fetching".
        const items = ProjectRunTreeToTimeline(sampleTree());

        expect(items.every((i) => i.childrenLoaded)).toBe(true);
        expect(items.every((i) => i.isExpanded)).toBe(true);
    });

    it('flags leaves as having no children', () => {
        const items = ProjectRunTreeToTimeline(sampleTree());

        expect(items.find((i) => i.id === 'task-a')?.hasNoChildren).toBe(true);
        expect(items.find((i) => i.id === 'graph')?.hasNoChildren).toBe(false);
    });

    it('sorts an unstarted node last rather than to the epoch', () => {
        const items = ProjectRunTreeToTimeline(node({ NodeID: 'x', StartedAt: null, CompletedAt: null }));

        expect(items[0].startTime.getTime()).toBeGreaterThan(Date.now());
    });

    it('gives each task kind its OWN icon, instead of one glyph for every workflow step', () => {
        // The row `type` was already correct — and then the icon was set from a map keyed by node
        // TYPE, so every Task resolved to the same generic diagram glyph and painted over it. On a
        // real run a prompt step, a loop and an approval were visually identical, which is how a
        // workflow reads as undifferentiated boxes even though the projection knew better.
        const items = ProjectRunTreeToTimeline(node({
            NodeID: 'graph', NodeType: 'TaskGraph', Name: 'Content Pipeline',
            Children: [
                node({ NodeID: 't1', NodeType: 'Task', SourceKind: 'Action', Name: 'Research' }),
                node({ NodeID: 't2', NodeType: 'Task', SourceKind: 'Prompt', Name: 'Draft' }),
                node({ NodeID: 't3', NodeType: 'Task', SourceKind: 'While', Name: 'Review' }),
                node({ NodeID: 't4', NodeType: 'Task', SourceKind: 'Human', Name: 'Approve' }),
            ],
        }));
        const iconOf = (id: string) => items.find((i) => i.id === id)!.icon;

        expect(new Set([iconOf('t1'), iconOf('t2'), iconOf('t3'), iconOf('t4')]).size).toBe(4);
        expect(iconOf('t2')).toContain('comment-dots');   // a prompt looks like a prompt
        expect(iconOf('t3')).toContain('rotate');         // a loop looks like a loop
    });

    it('still marks kind-iconed tasks as workflow provenance', () => {
        // Differentiating the icon must not cost the grouping that says "this ran on the
        // dispatcher" — that is what tells a reader where to go when a step fails.
        const items = ProjectRunTreeToTimeline(node({
            NodeID: 'graph', NodeType: 'TaskGraph',
            Children: [node({ NodeID: 't', NodeType: 'Task', SourceKind: 'Prompt', Name: 'Draft' })],
        }));

        expect(items.find((i) => i.id === 't')?.provenance).toBe('workflow');
    });

    it('falls back to the generic task icon for a kind it has never seen', () => {
        // A new node kind should render as a plain workflow step rather than as nothing.
        const items = ProjectRunTreeToTimeline(
            node({ NodeID: 't', NodeType: 'Task', SourceKind: 'SomethingNew', Name: 'Future' }),
        );

        expect(items[0].icon).toContain('diagram-next');
    });
});
