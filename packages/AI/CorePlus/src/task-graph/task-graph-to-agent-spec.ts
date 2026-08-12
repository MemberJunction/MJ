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
import { ConfigOf, NormalizeDependency, type TaskGraphSpec, type TaskGraphSpecNode } from './task-graph-spec';

/** What the caller must supply that a runtime graph does not carry. */
export type SaveAsWorkflowOptions = {
    /** Deterministic id for the agent. Callers pass a fresh uuid. */
    AgentID: string;
    /** Resolves an agent name to its ID; a node naming an unknown agent is reported, not dropped. */
    ResolveAgentID: (agentName: string) => string | null;
    /**
     * Resolves an action name to its ID.
     *
     * Required for a graph containing Action steps: the spec addresses actions by NAME, but a step
     * stores an `ActionID`. Without it the saved step would carry no action at all — it would
     * reopen as a step that resolves to nothing.
     */
    ResolveActionID?: (actionName: string) => string | null;
    /** Resolves a prompt name to its ID. Same reasoning as {@link ResolveActionID}. */
    ResolvePromptID?: (promptName: string) => string | null;
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
        // Human and External have no design-time equivalent — reported, never emitted as an empty
        // step, which would look like a workflow that runs unattended. Every OTHER kind maps to a
        // step type: reading only `agentName` used to mislabel action, prompt and loop nodes as
        // "human task" losses and drop them.
        if (node.kind === 'Human' || node.kind === 'External') {
            losses.push({
                Kind: 'HumanTask',
                TempId: node.tempId,
                Detail: node.kind === 'Human'
                    ? `"${node.name}" is a person's step and has no design-time equivalent yet; it is omitted from the workflow.`
                    : `"${node.name}" is completed by an external system and has no design-time equivalent; it is omitted from the workflow.`,
            });
            continue;
        }

        const agentName = ConfigOf(node, 'Agent')?.agentName;
        const subAgentID = agentName ? options.ResolveAgentID(agentName) : null;
        // An Agent node that names nothing, or names something unresolvable, cannot become a step:
        // emitting one with an empty SubAgentID would produce a workflow with a step that does
        // nothing, which is worse than declining to convert it.
        if (node.kind === 'Agent' && !subAgentID) {
            losses.push({
                Kind: 'UnknownAgent',
                TempId: node.tempId,
                Detail: `Agent "${agentName ?? "(none chosen)"}" could not be resolved; "${node.name}" is omitted.`,
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
            StartingStep: !hasDependency.has(node.tempId),
            ...stepShapeFor(node, subAgentID, options),
            // Policy and geometry are presentation/execution settings the graph carries; dropping
            // them here would make Save-as-Workflow quietly lossy.
            TimeoutSeconds: node.policy?.timeoutSeconds,
            RetryCount: node.policy?.retryCount,
            OnErrorBehavior: node.policy?.onError,
            PositionX: node.layout?.x,
            PositionY: node.layout?.y,
            Width: node.layout?.width,
            Height: node.layout?.height,
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

            // An Optional/Corequisite edge has no design-time equivalent — a flow path always
            // gates. Previously dropped in silence; now reported, because a workflow whose join
            // rule changed is not the workflow the user saved.
            if (dep.dependencyType && dep.dependencyType !== 'Prerequisite') {
                losses.push({
                    Kind: 'InputPayload',
                    TempId: node.tempId,
                    Detail: `The link into "${node.name}" was optional; in a workflow every incoming link must complete first.`,
                });
            }

            paths.push({
                ID: options.NextID(),
                // The direction flip: dependsOn points backwards, a flow path points forwards.
                OriginStepID: originStepID,
                DestinationStepID: destinationStepID,
                Condition: dep.condition,
                // The graph's own ranking, carried through. Hardcoding 0 here used to flatten every
                // branch to equal priority, so a saved workflow could take a different branch than
                // the graph it came from. `exclusiveGroup`/`sequence` are deliberately NOT carried:
                // they are compiler artifacts, reconstructed from the fan-out shape itself.
                Priority: dep.priority ?? 0,
                PathPoints: dep.pathPoints,
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
 * The step fields that depend on a node's kind.
 *
 * One place where `kind` becomes `StepType`, so a new kind is a compile error here rather than a
 * step that silently converts to the wrong type.
 */
function stepShapeFor(
    node: TaskGraphSpecNode,
    subAgentID: string | null,
    options: SaveAsWorkflowOptions,
): Partial<AgentStep> & Pick<AgentStep, 'StepType'> {
    switch (node.kind) {
        case 'Agent':
            return { StepType: 'Sub-Agent', SubAgentID: subAgentID ?? undefined };
        case 'Action': {
            const cfg = ConfigOf(node, 'Action');
            return {
                StepType: 'Action',
                // Name → ID. A step stores the ID; leaving it unset produces a step that reopens
                // pointing at nothing.
                ActionID: cfg?.actionName ? options.ResolveActionID?.(cfg.actionName) ?? undefined : undefined,
                ActionInputMapping: cfg?.inputMapping,
                ActionOutputMapping: cfg?.outputMapping,
            };
        }
        case 'Prompt': {
            const promptName = ConfigOf(node, 'Prompt')?.promptName;
            return {
                StepType: 'Prompt',
                PromptID: promptName ? options.ResolvePromptID?.(promptName) ?? undefined : undefined,
                PromptName: promptName,
            };
        }
        case 'ForEach':
            return {
                StepType: 'ForEach',
                LoopBodyType: ConfigOf(node, 'ForEach')?.action ? 'Action' : 'Sub-Agent',
                Configuration: JSON.stringify(ConfigOf(node, 'ForEach') ?? {}),
            };
        case 'While':
            return {
                StepType: 'While',
                LoopBodyType: ConfigOf(node, 'While')?.action ? 'Action' : 'Sub-Agent',
                Configuration: JSON.stringify(ConfigOf(node, 'While') ?? {}),
            };
        default:
            // Human/External are filtered out before this point; the fallback keeps the function
            // total rather than letting a future kind fall through as undefined.
            return { StepType: 'Sub-Agent', SubAgentID: subAgentID ?? undefined };
    }
}
