/**
 * @fileoverview Reading a running graph back as a `TaskGraphSpec`.
 *
 * **Why this direction exists.** Everything upstream converts *into* Task rows: a flow compiles to a
 * spec, the spec is submitted, and rows are written. But a run view has only the rows — the spec was
 * never persisted, and by the time anyone watches the graph the producer is long gone. To render a
 * run on the same canvas the author drew on, the rows have to become a spec again.
 *
 * **This is a projection, not a reconstruction.** It recovers exactly what the renderer needs —
 * structure, kind, names, geometry — and deliberately not what it does not: the parent's
 * continuation, the reinvoke depth, resolved agent and action IDs. A caller that wants those reads
 * the rows directly. Pretending to rebuild the original spec would invite someone to submit the
 * result, and a graph submitted from a projection would quietly lose whatever the projection dropped.
 *
 * Pure and dependency-free, like everything else in this folder — which is what lets a browser
 * component use it without dragging the entity layer along.
 *
 * @module @memberjunction/ai-core-plus
 */
import type { MJTaskEntity } from '@memberjunction/core-entities';
import { TaskNode, type TaskGraphSpec, type TaskGraphSpecNode, type TaskNodeBase } from './task-graph-spec';
import type { GraphNodePosition } from './graph-layout';
import type { TaskGraphNodeKind } from './task-graph-spec';

/**
 * The Task columns a run view reads.
 *
 * Structural rather than the entity itself, so a caller can pass rows from a `RunView`, a GraphQL
 * result, or a test fixture. Field types are derived from the entity so a CodeGen widening flows
 * through instead of silently failing to match.
 */
export type TaskRunRow = {
    ID: string;
    Name: string;
    Description?: string | null;
    Status: MJTaskEntity['Status'];
    StepType?: MJTaskEntity['StepType'];
    /** The typed configuration bag, still as stored JSON. */
    Configuration?: string | null;
    AgentRunID?: string | null;
    ActionID?: string | null;
    AgentID?: string | null;
    UserID?: string | null;
    ErrorMessage?: string | null;
    OutputPayload?: string | null;
    StartedAt?: Date | null;
    CompletedAt?: Date | null;
};

/** The dependency columns a run view reads. */
export type TaskRunEdge = {
    TaskID: string;
    DependsOnTaskID: string;
    Condition?: string | null;
    ExclusiveGroup?: string | null;
    Priority?: number | null;
    Sequence?: number | null;
};

/** What a projection yields: a renderable graph plus the geometry its author chose, if any. */
export type TaskRunProjection = {
    Spec: TaskGraphSpec;
    /**
     * Positions recovered from `Configuration.layout`, keyed by task ID — the author's own
     * arrangement.
     *
     * **Empty means "compute one", not "put everything at the origin".** A graph nobody drew has no
     * geometry anywhere, which is the normal case for an agent-emitted graph. The caller runs the
     * layout algorithm for the nodes missing here.
     */
    AuthoredPositions: Map<string, GraphNodePosition>;
};

/** The task ID is the node's identity, because a run has no tempIds — those died at submission. */
export function ProjectTaskRowsToSpec(
    workflowName: string,
    rows: readonly TaskRunRow[],
    edges: readonly TaskRunEdge[],
): TaskRunProjection {
    const known = new Set(rows.map((r) => r.ID));
    const dependsOnByTask = new Map<string, TaskGraphSpecNode['dependsOn']>();

    for (const edge of edges) {
        if (!known.has(edge.TaskID) || !known.has(edge.DependsOnTaskID)) continue;
        const list = dependsOnByTask.get(edge.TaskID) ?? [];
        list.push({
            tempId: edge.DependsOnTaskID,
            condition: edge.Condition ?? undefined,
            exclusiveGroup: edge.ExclusiveGroup ?? undefined,
            priority: edge.Priority ?? undefined,
            sequence: edge.Sequence ?? undefined,
        });
        dependsOnByTask.set(edge.TaskID, list);
    }

    const authored = new Map<string, GraphNodePosition>();
    const tasks: TaskGraphSpecNode[] = [];

    for (const row of rows) {
        const config = parseConfiguration(row.Configuration);
        const base: TaskNodeBase = {
            tempId: row.ID,
            name: row.Name,
            description: row.Description ?? '',
            dependsOn: dependsOnByTask.get(row.ID) ?? [],
        };

        const layout = config?.layout;
        if (layout && typeof layout.x === 'number' && typeof layout.y === 'number') {
            authored.set(row.ID, { X: layout.x, Y: layout.y });
        }

        tasks.push(nodeFor(row, base, config));
    }

    return {
        Spec: { workflowName, reasoning: '', tasks },
        AuthoredPositions: authored,
    };
}

/**
 * Rebuilds a node of the right kind.
 *
 * `StepType` is the discriminator, and a row without one is a task created outside a workflow — a
 * hand-authored to-do that wandered into the same parent. It renders as a person's step rather than
 * being dropped, because a node the viewer can see and question beats one that silently vanished.
 */
function nodeFor(
    row: TaskRunRow,
    base: TaskNodeBase,
    config: StoredConfiguration | null,
): TaskGraphSpecNode {
    switch (row.StepType as TaskGraphNodeKind | null | undefined) {
        case 'Agent':
            return TaskNode.Agent(base, { agentName: row.Name, message: config?.agent?.message });
        case 'Action':
            return TaskNode.Action(base, {
                actionName: row.Name,
                inputMapping: config?.inputMapping,
                outputMapping: config?.outputMapping,
            });
        case 'Prompt':
            return TaskNode.Prompt(base, { promptName: row.Name });
        case 'ForEach':
            return TaskNode.ForEach(base, config?.forEach ?? { collectionPath: '' });
        case 'While':
            return TaskNode.While(base, config?.while ?? { condition: '' });
        case 'External':
            return TaskNode.External(base, config?.external ?? { domain: 'external' });
        case 'Human':
        default:
            return TaskNode.Human(base, {
                assignToUserID: row.UserID ?? undefined,
                instructions: config?.human?.instructions,
            });
    }
}

/** The parts of `Task.Configuration` this projection reads. */
type StoredConfiguration = {
    agent?: { message?: string };
    human?: { instructions?: string };
    forEach?: { collectionPath: string };
    while?: { condition: string };
    external?: { domain: string; ref?: string };
    inputMapping?: string;
    outputMapping?: string;
    layout?: { x?: number; y?: number; width?: number; height?: number };
};

/**
 * Parses the configuration bag, yielding `null` for anything unusable.
 *
 * Silent by design: a step with no settings stores NULL, which is the common case, and a malformed
 * bag should cost the viewer that one node's detail rather than the whole graph's drawing.
 */
function parseConfiguration(raw: string | null | undefined): StoredConfiguration | null {
    if (!raw?.trim()) return null;
    try {
        const parsed: unknown = JSON.parse(raw);
        return parsed && typeof parsed === 'object' ? (parsed as StoredConfiguration) : null;
    } catch {
        return null;
    }
}
