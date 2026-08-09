/**
 * @fileoverview Save as Workflow — promoting a runtime task graph into a design-time Flow (D17).
 *
 * **Why this is nearly free.** Phase 4's convergence made both graph models the same model: nodes
 * with conditional, prioritized edges and AND/OR joins, traversed by one engine. Once that is true,
 * turning a graph an agent produced at runtime into a Flow a human can rerun, schedule, or hand to
 * the Agent Manager is a *projection*, not a translation — which is exactly the test of whether the
 * convergence was real. If this needed a semantic mapping layer, the two models had not actually
 * converged.
 *
 * **The moment this serves.** An agent decomposes a request, the work runs, and it was good. Today
 * that is where it ends: the decomposition was ephemeral, so the next person to want the same thing
 * asks an agent to invent it again. This is the seam where a one-off agent plan becomes reusable
 * organizational automation.
 *
 * Pure and dependency-free, like everything else in this folder. Persistence is the caller's job —
 * `AgentSpecSync` already owns atomic multi-entity agent writes and the mutation audit, and
 * duplicating any of that here would be a second way to write an agent.
 *
 * @module @memberjunction/ai-core-plus
 */
import type { AgentSpec, AgentStep, AgentStepPath } from '../agent-spec';
import { ConfigOf, NormalizeDependency, TaskNode, type TaskGraphSpec } from './task-graph-spec';

/** What the caller must supply that a runtime graph does not carry. */
export type SaveAsWorkflowOptions = {
    /** Deterministic id for the agent. Callers pass a fresh uuid. */
    AgentID: string;
    /** Resolves an agent name to its ID; a node naming an unknown agent is reported, not dropped. */
    ResolveAgentID: (agentName: string) => string | null;
    /** Deterministic ids for the generated steps and paths, in creation order. */
    NextID: () => string;
    /** Flow agent-type id, so the persisted agent is a Flow rather than a Loop. */
    FlowAgentTypeID?: string;
    /** Overrides the workflow's name. Defaults to the graph's own. */
    Name?: string;
};

/** What the conversion could not carry over, stated rather than silently dropped. */
export type SaveAsWorkflowLoss =
    | { Kind: 'HumanTask'; TempId: string; Detail: string }
    | { Kind: 'UnknownAgent'; TempId: string; Detail: string }
    | { Kind: 'Continuation'; Detail: string }
    | { Kind: 'InputPayload'; TempId: string; Detail: string };

export type SaveAsWorkflowResult = {
    Success: boolean;
    Spec?: AgentSpec;
    /** Everything the projection could not represent. Empty means a lossless conversion. */
    Losses: SaveAsWorkflowLoss[];
    ErrorMessage?: string;
};

/**
 * Projects a `TaskGraphSpec` onto an `AgentSpec` of type Flow.
 *
 * Node → Step, dependency → Step Path, edge condition → path condition. The one inversion worth
 * noting: a task graph's edges point *backwards* (`dependsOn`: "I wait for X"), while a flow's paths
 * point *forwards* (`OriginStepID → DestinationStepID`: "after X, do me"). Same edge, opposite
 * authoring convention — the graph is written by whoever knows the prerequisites, the flow by
 * whoever is drawing arrows. This reverses them.
 *
 * **Losses are returned, never swallowed.** A conversion that quietly dropped a human step would
 * hand the user a workflow that skips an approval they thought they had saved — which is worse than
 * refusing to convert. Every unrepresentable element is reported so the caller can show it before
 * the user commits.
 */
export function ConvertTaskGraphToAgentSpec(
    graph: TaskGraphSpec,
    options: SaveAsWorkflowOptions,
): SaveAsWorkflowResult {
    const losses: SaveAsWorkflowLoss[] = [];

    if (!graph?.tasks?.length) {
        return { Success: false, Losses: losses, ErrorMessage: 'Cannot save an empty graph as a workflow.' };
    }

    const stepIdByTempId = new Map<string, string>();
    const steps: AgentStep[] = [];

    // Nodes with no dependencies are the flow's entry points — the same rule the traversal engine
    // uses, so a saved workflow starts where the graph started.
    const hasDependency = new Set(
        graph.tasks.filter((t) => (t.dependsOn ?? []).length > 0).map((t) => t.tempId),
    );

    for (const node of graph.tasks) {
        // Only an Agent node becomes a Sub-Agent step. Every other kind is reported as a loss below
        // rather than silently dropped.
        const agentName = ConfigOf(node, 'Agent')?.agentName;
        if (!agentName) {
            // Human steps have no Flow equivalent until assignment lands (#3524). Reported rather
            // than emitted as an empty step, which would look like a workflow that runs unattended.
            losses.push({
                Kind: 'HumanTask',
                TempId: node.tempId,
                Detail: `"${node.name}" is a human task and has no design-time equivalent yet; it is omitted from the workflow.`,
            });
            continue;
        }

        const subAgentID = options.ResolveAgentID(agentName);
        if (!subAgentID) {
            losses.push({
                Kind: 'UnknownAgent',
                TempId: node.tempId,
                Detail: `Agent "${agentName}" could not be resolved; "${node.name}" is omitted.`,
            });
            continue;
        }

        if (node.inputPayload && Object.keys(node.inputPayload).length > 0) {
            // A runtime input payload is a literal captured from one execution. Replaying it verbatim
            // would bake that run's specifics into a reusable workflow — the saved artifact would
            // answer last week's question forever. Flagged so the user can parameterize it.
            losses.push({
                Kind: 'InputPayload',
                TempId: node.tempId,
                Detail: `"${node.name}" carried run-specific input that is not replayed; parameterize it in the workflow editor.`,
            });
        }

        const stepID = options.NextID();
        stepIdByTempId.set(node.tempId, stepID);
        steps.push({
            ID: stepID,
            Name: node.name,
            Description: node.description,
            StepType: 'Sub-Agent',
            StartingStep: !hasDependency.has(node.tempId),
            SubAgentID: subAgentID,
        });
    }

    if (steps.length === 0) {
        return {
            Success: false,
            Losses: losses,
            ErrorMessage: 'No task in this graph can be represented as a workflow step.',
        };
    }

    const paths: AgentStepPath[] = [];
    for (const node of graph.tasks) {
        const destinationStepID = stepIdByTempId.get(node.tempId);
        if (!destinationStepID) continue; // node was dropped above; its edges go with it

        for (const raw of node.dependsOn ?? []) {
            const dep = NormalizeDependency(raw);
            const originStepID = stepIdByTempId.get(dep.tempId);
            if (!originStepID) continue; // predecessor was dropped; the edge cannot be drawn

            paths.push({
                ID: options.NextID(),
                // The direction flip: dependsOn points backwards, a flow path points forwards.
                OriginStepID: originStepID,
                DestinationStepID: destinationStepID,
                Condition: dep.condition,
                // Flat priority. The graph expressed ordering through dependencies, not through
                // ranked alternatives, so inventing a ranking here would assert something the
                // original never said.
                Priority: 0,
            });
        }
    }

    if (graph.continuation && graph.continuation !== 'message') {
        // Continuation describes what happens when a *submitted* graph finishes. A saved workflow is
        // invoked, not continued, so the concept has no counterpart.
        losses.push({
            Kind: 'Continuation',
            Detail: `The graph's '${graph.continuation}' continuation does not apply to a saved workflow, which is invoked rather than continued.`,
        });
    }

    const spec: AgentSpec = {
        ID: options.AgentID,
        Name: options.Name?.trim() || graph.workflowName,
        Description: graph.reasoning || `Saved from a task graph: ${graph.workflowName}`,
        TypeID: options.FlowAgentTypeID,
        Status: 'Active',
        // A saved workflow inherits no payload contract from the graph it came from — a runtime
        // graph never had one. 'Warn' rather than 'Fail' so a first invocation surfaces a mismatch
        // instead of refusing to run something the user just watched succeed.
        StartingPayloadValidationMode: 'Warn',
        Steps: steps,
        Paths: paths,
    };

    return { Success: true, Spec: spec, Losses: losses };
}

/** Renders the losses for a confirmation dialog. Empty string when nothing was lost. */
export function FormatSaveAsWorkflowLosses(losses: SaveAsWorkflowLoss[]): string {
    return losses.map((l) => `[${l.Kind}] ${l.Detail}`).join('\n');
}

/**
 * The inverse projection: an existing Flow `AgentSpec` read back as a `TaskGraphSpec`.
 *
 * **Why the round-trip matters.** With only the forward direction, a graph could be *saved* as a
 * workflow but never *reopened* on the same canvas — the editor would need a second, flow-shaped
 * renderer, and MJ would be back to two graph UIs that can disagree. This is what lets one component
 * edit both provenances.
 *
 * Direction flips back: a flow path points forward (`Origin → Destination`), a `dependsOn` points at
 * the prerequisite. Conditions survive because both models store the same grammar — the point of
 * giving `TaskDependency.Condition` the same shape as `AIAgentStepPath.Condition` in Phase 4.
 *
 * A step whose type has no task-graph equivalent (`Prompt`, `Action`, the loop types) is carried
 * across as a node with no assignee rather than dropped: dropping it would silently change the
 * graph's shape on screen, and the validator will flag it as `NoAssignment` — which is the honest
 * report that this step needs attention, not that it never existed.
 */
export function ConvertAgentSpecToTaskGraph(
    spec: AgentSpec,
    resolveAgentName: (agentID: string) => string | null,
): TaskGraphSpec {
    const steps = spec.Steps ?? [];
    const paths = spec.Paths ?? [];

    // Flow paths point forward; dependsOn points back. Index by destination so each node can be
    // asked "what has to finish before me?" in one pass rather than rescanning the path list.
    const incoming = new Map<string, AgentStepPath[]>();
    for (const path of paths) {
        const list = incoming.get(path.DestinationStepID) ?? [];
        list.push(path);
        incoming.set(path.DestinationStepID, list);
    }

    const stepIds = new Set(steps.map((s) => s.ID));

    return {
        workflowName: spec.Name,
        reasoning: spec.Description,
        tasks: steps.map((step) => {
            const base = {
                tempId: step.ID,
                name: step.Name,
                description: step.Description ?? '',
                dependsOn: (incoming.get(step.ID) ?? [])
                    // A path from a step that is not in the spec cannot be drawn or executed; skipping
                    // it beats emitting a dependsOn the validator will reject as UnknownDependency.
                    .filter((p) => stepIds.has(p.OriginStepID))
                    .map((p) => (p.Condition?.trim() ? { tempId: p.OriginStepID, condition: p.Condition } : p.OriginStepID)),
            };
            // A step with no resolvable sub-agent becomes a Human node rather than an Agent one with
            // an empty name: the validator would reject the latter, and "nobody assigned yet" is
            // exactly what an unresolved step means.
            const agentName = step.SubAgentID ? resolveAgentName(step.SubAgentID) ?? undefined : undefined;
            return agentName ? TaskNode.Agent(base, { agentName }) : TaskNode.Human(base);
        }),
    };
}
