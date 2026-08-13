/**
 * Tests for the run-tree → timeline projection.
 *
 * The defect this replaces was an ordering bug: a child's indent was computed from its parent's
 * indent at the moment the child was visited, so a row that arrived before its parent got the wrong
 * level and every descendant inherited the error. It reproduced only when rows came back in a
 * particular order — invisible on screen most of the time, and trivial to pin here.
 */
import { describe, expect, it } from 'vitest';
import type { AgentRunTreeNode, AgentRunTreeStatus } from '@memberjunction/ai-core-plus';
import { ProjectRunTreeToTimeline } from '../run-tree-timeline-projection';
import type { TimelineItem } from '../ai-agent-run-timeline.component';

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

/**
 * The rows in reading order.
 *
 * The projection returns a NESTED structure — each row carrying its own children — because the
 * timeline's expand affordance is gated on `children.length`, and a flat list left every workflow
 * row permanently open with no way to collapse it. Depth-first order is still the property most of
 * these assertions are about, so they read it back through here.
 */
function flatten(items: TimelineItem[]): TimelineItem[] {
    return items.flatMap((item) => [item, ...flatten(item.children ?? [])]);
}

describe('ProjectRunTreeToTimeline', () => {
    it('nests children so a row can be collapsed', () => {
        const [run] = ProjectRunTreeToTimeline(sampleTree());

        expect(run.children?.map((c) => c.id)).toEqual(['step']);
        expect(run.children?.[0].children?.map((c) => c.id)).toEqual(['graph']);
        expect(run.children?.[0].children?.[0].children?.map((c) => c.id)).toEqual(['task-a', 'task-b']);
    });

    it('returns nothing for a null tree', () => {
        expect(ProjectRunTreeToTimeline(null)).toEqual([]);
    });

    it('flattens depth-first, which is reading order', () => {
        const items = flatten(ProjectRunTreeToTimeline(sampleTree()));

        expect(items.map((i) => i.id)).toEqual(['run', 'step', 'graph', 'task-a', 'task-b', 'subrun']);
    });

    it('derives level from tree structure, not from visit order', () => {
        const items = flatten(ProjectRunTreeToTimeline(sampleTree()));
        const levels = Object.fromEntries(items.map((i) => [i.id, i.level]));

        expect(levels).toEqual({ run: 0, step: 1, graph: 2, 'task-a': 3, 'task-b': 3, subrun: 4 });
    });

    it('keeps levels correct however the children are ordered', () => {
        // The old code derived a child's level from whatever its parent's level happened to be when
        // the child was reached. Reversing sibling order must change nothing about indentation.
        const tree = sampleTree();
        const graph = tree.Children[0].Children[0];
        graph.Children = [...graph.Children].reverse();

        const items = flatten(ProjectRunTreeToTimeline(tree));
        const subrun = items.find((i) => i.id === 'subrun');

        expect(subrun?.level).toBe(4);
    });

    it('renders a task as a STEP, because that is what every existing branch keys on', () => {
        const items = flatten(ProjectRunTreeToTimeline(sampleTree()));
        const types = Object.fromEntries(items.map((i) => [i.id, i.type]));

        // A task is a `step`, not a type of its own. The run timeline routes on `type === 'step'`
        // plus `data.StepType`, so a task that claimed a distinct row type got the right icon and
        // then missed the detail panel, the action link and loop expansion — everything that makes
        // the row useful. Provenance is what marks it as workflow work; the type does not.
        expect(types).toEqual({
            run: 'subrun',
            step: 'step',
            graph: 'taskgraph',
            'task-a': 'step',
            'task-b': 'step',
            subrun: 'subrun',
        });
    });

    it('translates a task into the STEP vocabulary the run timeline speaks', () => {
        const tree = node({
            NodeID: 'g', NodeType: 'TaskGraph', Name: 'Graph',
            Children: [
                node({ NodeID: 'a', NodeType: 'Task', Name: 'Search', SourceKind: 'Action' }),
                node({ NodeID: 'p', NodeType: 'Task', Name: 'Draft', SourceKind: 'Prompt' }),
                node({ NodeID: 's', NodeType: 'Task', Name: 'Delegate', SourceKind: 'Agent' }),
            ],
        });
        const items = flatten(ProjectRunTreeToTimeline(tree));
        const stepTypeOf = (id: string) => items.find((i) => i.id === id)?.data?.StepType;

        // The graph says 'Action'; a run step says 'Actions'. Translating is what lets one set of
        // branches serve both, instead of the panel needing to learn a second vocabulary.
        expect(stepTypeOf('a')).toBe('Actions');
        expect(stepTypeOf('p')).toBe('Prompt');
        expect(stepTypeOf('s')).toBe('Sub-Agent');
        // …while still being marked as dispatcher work.
        expect(items.filter((i) => i.provenance === 'workflow')).toHaveLength(4);
    });

    it('can splice a subtree under an existing row', () => {
        const tree = sampleTree();
        const step = tree.Children[0];

        const items = flatten(ProjectRunTreeToTimeline(step, 5, true));

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
        const items = flatten(ProjectRunTreeToTimeline(sampleTree()));

        expect(items.find((i) => i.id === 'task-a')?.hasNoChildren).toBe(true);
        expect(items.find((i) => i.id === 'graph')?.hasNoChildren).toBe(false);
    });

    it('reports NO start time for a node that has not started, rather than inventing one', () => {
        // This used to be the maximum Date, chosen so unstarted rows sorted last — and it RENDERED.
        // Every Pending task in a workflow showed the same fabricated clock time, identical on every
        // row and indistinguishable from real data. Ordering is the query's job.
        const items = ProjectRunTreeToTimeline(node({ NodeID: 'x', StartedAt: null, CompletedAt: null }));

        expect(items[0].startTime).toBeNull();
    });

    it('gives each task kind its OWN icon, instead of one glyph for every workflow step', () => {
        // The row `type` was already correct — and then the icon was set from a map keyed by node
        // TYPE, so every Task resolved to the same generic diagram glyph and painted over it. On a
        // real run a prompt step, a loop and an approval were visually identical, which is how a
        // workflow reads as undifferentiated boxes even though the projection knew better.
        const items = flatten(ProjectRunTreeToTimeline(node({
            NodeID: 'graph', NodeType: 'TaskGraph', Name: 'Content Pipeline',
            Children: [
                node({ NodeID: 't1', NodeType: 'Task', SourceKind: 'Action', Name: 'Research' }),
                node({ NodeID: 't2', NodeType: 'Task', SourceKind: 'Prompt', Name: 'Draft' }),
                node({ NodeID: 't3', NodeType: 'Task', SourceKind: 'While', Name: 'Review' }),
                node({ NodeID: 't4', NodeType: 'Task', SourceKind: 'Human', Name: 'Approve' }),
            ],
        })));
        const iconOf = (id: string) => items.find((i) => i.id === id)!.icon;

        expect(new Set([iconOf('t1'), iconOf('t2'), iconOf('t3'), iconOf('t4')]).size).toBe(4);
        expect(iconOf('t2')).toContain('comment-dots');   // a prompt looks like a prompt
        expect(iconOf('t3')).toContain('rotate');         // a loop looks like a loop
    });

    it('still marks kind-iconed tasks as workflow provenance', () => {
        // Differentiating the icon must not cost the grouping that says "this ran on the
        // dispatcher" — that is what tells a reader where to go when a step fails.
        const items = flatten(ProjectRunTreeToTimeline(node({
            NodeID: 'graph', NodeType: 'TaskGraph',
            Children: [node({ NodeID: 't', NodeType: 'Task', SourceKind: 'Prompt', Name: 'Draft' })],
        })));

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

/**
 * Status vocabulary and marker colour — two failures that were silent by construction.
 *
 * A task says `Complete`; a run step says `Completed`. Every branch in the timeline is keyed on the
 * step vocabulary, so a workflow row matched none of them and fell through to the unknown-status
 * glyph — a question mark on every row of every task graph.
 *
 * The marker colour was worse, because it looked correct in source: `color` is written to
 * `data-color` and matched by `.timeline-marker[data-color="info"]`, so emitting a CSS value like
 * `var(--mj-status-info)` matched no rule at all. No filled circle was drawn, the bare glyph
 * inherited `--mj-text-inverse`, and in dark mode it was nearly invisible. An unmatched attribute
 * selector is not an error and neither is a variable that resolves to nothing.
 */
describe('ProjectRunTreeToTimeline — status and marker colour', () => {
    const MARKER_COLORS = ['info', 'success', 'error', 'warning', 'secondary'];

    it('normalizes the task vocabulary onto the step vocabulary', () => {
        const [row] = ProjectRunTreeToTimeline(node({ NodeID: 't', NodeType: 'Task', Status: 'Complete' }));
        expect(row.status).toBe('Completed');
    });

    it('normalizes In Progress to Running', () => {
        const [row] = ProjectRunTreeToTimeline(node({ NodeID: 't', NodeType: 'Task', Status: 'In Progress' }));
        expect(row.status).toBe('Running');
    });

    it('leaves statuses that exist in both vocabularies alone', () => {
        const shared: AgentRunTreeStatus[] = ['Failed', 'Skipped', 'Blocked', 'Pending', 'Cancelled'];
        for (const status of shared) {
            const [row] = ProjectRunTreeToTimeline(node({ NodeID: 't', NodeType: 'Task', Status: status }));
            expect(row.status).toBe(status);
        }
    });

    it('emits a colour NAME the stylesheet can match, never a CSS value', () => {
        const tree = node({
            NodeID: 'run',
            NodeType: 'Run',
            Status: 'Completed',
            Children: [
                node({ NodeID: 'graph', NodeType: 'TaskGraph', Status: 'Complete' }),
                node({ NodeID: 'task', NodeType: 'Task', Status: 'Complete', SourceKind: 'Action' }),
                node({ NodeID: 'step', NodeType: 'Step', Status: 'Failed' }),
            ],
        });
        for (const row of flatten(ProjectRunTreeToTimeline(tree))) {
            expect(MARKER_COLORS).toContain(row.color);
            expect(row.color).not.toContain('var(');
        }
    });

    it('colours workflow work by provenance and everything else by status', () => {
        const tree = node({
            NodeID: 'run',
            NodeType: 'Run',
            Status: 'Completed',
            Children: [
                node({ NodeID: 'task', NodeType: 'Task', Status: 'Failed', SourceKind: 'Action' }),
                node({ NodeID: 'step', NodeType: 'Step', Status: 'Failed' }),
            ],
        });
        const rows = flatten(ProjectRunTreeToTimeline(tree));
        // A failed WORKFLOW step still reads as workflow — provenance first; its status is legible
        // elsewhere on the row.
        expect(rows.find((r) => r.id === 'task')?.color).toBe('info');
        // An ordinary run step is coloured by what happened to it.
        expect(rows.find((r) => r.id === 'step')?.color).toBe('error');
    });

    it('reverts to agent styling at the run boundary inside a graph', () => {
        // A sub-agent run nested under a task is ordinary agent work again — that is what tells a
        // reader where to look when it fails.
        const tree = node({
            NodeID: 'graph',
            NodeType: 'TaskGraph',
            Status: 'Complete',
            Children: [node({ NodeID: 'sub', NodeType: 'Run', Status: 'Completed' })],
        });
        const rows = flatten(ProjectRunTreeToTimeline(tree));
        expect(rows.find((r) => r.id === 'sub')?.color).toBe('success');
        expect(rows.find((r) => r.id === 'sub')?.provenance).toBeUndefined();
    });
});

/**
 * A dispatched workflow, exactly as the tree query returns it.
 *
 * `get-agent-run-tree.sql` joins the submit STEP to the graph it produced, so one workflow always
 * arrives as two rows. The step's status describes the SUBMISSION and its title names the GRAPH,
 * which is the contradiction these tests are about.
 */
function dispatchedWorkflow(overrides: { stepStatus?: string; graphStatus?: string } = {}): AgentRunTreeNode {
    return node({
        NodeID: 'run',
        NodeType: 'Run',
        Name: 'Demo Flow Agent',
        Status: 'Paused' as AgentRunTreeStatus,
        Children: [
            node({
                NodeID: 'submit-step',
                NodeType: 'Step',
                SourceKind: 'TaskGraph',
                Name: 'Task Graph: Demo Flow Agent',
                Status: (overrides.stepStatus ?? 'Completed') as AgentRunTreeStatus,
                DurationMs: 291,
                Children: [
                    node({
                        NodeID: 'graph',
                        NodeType: 'TaskGraph',
                        Name: 'Demo Flow Agent',
                        Status: (overrides.graphStatus ?? 'In Progress') as AgentRunTreeStatus,
                        SourceEntity: 'MJ: Tasks',
                        Children: [
                            node({ NodeID: 'step-1', NodeType: 'Task', Name: 'Get NVIDIA Stock Price', Status: 'Pending' as AgentRunTreeStatus }),
                            node({ NodeID: 'step-2', NodeType: 'Task', Name: 'Get Weather', Status: 'Pending' as AgentRunTreeStatus }),
                        ],
                    }),
                ],
            }),
        ],
    });
}

describe('a dispatched workflow is one row, not two', () => {
    it('does not report Completed above steps that have not run', () => {
        // The reported defect: "Task Graph: Demo Flow Agent — Completed" sitting above two Pending
        // steps, while the page header correctly said PAUSED / "Workflow still running". The step
        // row was telling the truth about the SUBMISSION under a title naming the GRAPH.
        const items = flatten(ProjectRunTreeToTimeline(dispatchedWorkflow()));
        const workflowRow = items.find((i) => i.title === 'Task Graph: Demo Flow Agent');

        expect(workflowRow?.status).toBe('Running');
        expect(items.some((i) => i.status === 'Completed')).toBe(false);
    });

    it('collapses the pair, so the workflow appears once', () => {
        const items = flatten(ProjectRunTreeToTimeline(dispatchedWorkflow()));

        expect(items.map((i) => i.id)).toEqual(['run', 'submit-step', 'step-1', 'step-2']);
        // The STEP's id survives, not the graph's: selection, deep links and the detail pane all
        // resolve against the row the timeline already addressed.
        expect(items[1].id).toBe('submit-step');
    });

    it('keeps the submission timing that the merge would otherwise discard', () => {
        // A slow submit is a slow validate-and-persist — a different problem from a slow workflow,
        // and the only place that number now exists.
        const [, workflowRow] = flatten(ProjectRunTreeToTimeline(dispatchedWorkflow()));

        expect(workflowRow.subtitle).toContain('dispatched in');
        expect(workflowRow.subtitle).toContain('291');
    });

    it('inherits the graph status once the graph finishes', () => {
        // Asserts the id list too: with both halves reading Completed, a status-only assertion
        // would pass whether or not the collapse happened, which is no evidence at all.
        const items = flatten(ProjectRunTreeToTimeline(dispatchedWorkflow({ graphStatus: 'Complete' })));

        expect(items.map((i) => i.id)).toEqual(['run', 'submit-step', 'step-1', 'step-2']);
        expect(items[1].status).toBe('Completed');
    });

    it('leaves a FAILED submission as its own row', () => {
        // There is no graph to inherit from, and the failure is the whole story. Collapsing here
        // would hide the only thing that happened.
        const tree = dispatchedWorkflow({ stepStatus: 'Failed' });
        const items = flatten(ProjectRunTreeToTimeline(tree));

        expect(items.map((i) => i.id)).toEqual(['run', 'submit-step', 'graph', 'step-1', 'step-2']);
        expect(items[1].status).toBe('Failed');
    });

    it('leaves a submission still in flight as its own row', () => {
        const items = flatten(ProjectRunTreeToTimeline(dispatchedWorkflow({ stepStatus: 'Running' })));

        expect(items.map((i) => i.id)).toContain('graph');
        expect(items[1].status).toBe('Running');
    });

    it('declines to collapse a shape it does not recognise', () => {
        // A projection that guesses when its assumption breaks is how a display invents a status
        // nobody wrote. Two graph children is not a shape this understands.
        const tree = dispatchedWorkflow();
        const step = tree.Children[0];
        step.Children = [...step.Children, node({ NodeID: 'graph-2', NodeType: 'TaskGraph', Name: 'Another' })];

        expect(flatten(ProjectRunTreeToTimeline(tree)).map((i) => i.id)).toContain('graph');
    });

    it('leaves an ordinary step alone', () => {
        // Guard against over-reach: only a TaskGraph-kind step with a graph under it collapses.
        const items = flatten(ProjectRunTreeToTimeline(sampleTree()));

        expect(items.map((i) => i.id)).toEqual(['run', 'step', 'graph', 'task-a', 'task-b', 'subrun']);
    });
});
