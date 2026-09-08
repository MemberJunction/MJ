/**
 * @fileoverview Adapters binding the pure traversal engine to MJ's design-time flow storage.
 *
 * `GraphTraversalEngine` knows nothing about entities, `AIEngine`, or expression evaluators — that
 * is what lets the durable dispatcher share it. These two adapters supply the missing halves for
 * the in-run executor: where the graph lives, and how a condition is evaluated.
 *
 * Both are deliberately thin. Any logic that creeps in here is logic the two executors no longer
 * share, which is the exact drift the extraction was meant to end.
 *
 * @module @memberjunction/ai-agents
 */
import { SafeExpressionEvaluator } from '@memberjunction/global';
import type { GraphEdge, GraphNode, IConditionEvaluator, IGraphRepository } from '@memberjunction/ai-core-plus';
import { AIEngine } from '@memberjunction/aiengine';
import type { MJAIAgentStepEntity, MJAIAgentStepPathEntity } from '@memberjunction/core-entities';

/** Projects a step entity onto the engine's node shape. */
function toNode(step: MJAIAgentStepEntity): GraphNode {
    return {
        id: step.ID,
        name: step.Name,
        type: step.StepType,
        status: step.Status,
        isStartNode: step.StartingStep === true,
    };
}

/** Projects a step-path entity onto the engine's edge shape. */
function toEdge(path: MJAIAgentStepPathEntity): GraphEdge {
    return {
        id: path.ID,
        originNodeId: path.OriginStepID,
        destinationNodeId: path.DestinationStepID,
        condition: path.Condition,
        priority: path.Priority,
    };
}

/**
 * Serves a design-time flow's structure out of `AIEngine`'s preloaded caches.
 *
 * Synchronous, which is not a simplification — `AIEngine.GetAgentSteps` / `GetPathsFromStep` are
 * array filters over already-loaded arrays, so the `await`s that surrounded every traversal decision
 * in the original code were ceremony around an in-memory read.
 *
 * `GetIncomingEdges` has no `AIEngine` counterpart because single-program-counter traversal never
 * needed to look backwards; joins do, so it is derived by filtering the agent's paths. The agent's
 * path set is small (tens of edges), and this runs once per completed node, so the linear scan is
 * not worth an index.
 */
export class AIEngineGraphRepository implements IGraphRepository {
    private readonly steps: MJAIAgentStepEntity[];
    private readonly paths: MJAIAgentStepPathEntity[];

    constructor(private readonly agentId: string) {
        this.steps = AIEngine.Instance.GetAgentSteps(agentId) ?? [];
        this.paths = this.steps.flatMap((s) => AIEngine.Instance.GetPathsFromStep(s.ID) ?? []);
    }

    public GetNode(nodeId: string): GraphNode | null {
        const step = AIEngine.Instance.GetAgentStepByID(nodeId);
        return step ? toNode(step) : null;
    }

    public GetOutgoingEdges(nodeId: string): GraphEdge[] {
        return (AIEngine.Instance.GetPathsFromStep(nodeId) ?? []).map(toEdge);
    }

    public GetIncomingEdges(nodeId: string): GraphEdge[] {
        return this.paths.filter((p) => p.DestinationStepID === nodeId).map(toEdge);
    }

    public GetStartNodes(): GraphNode[] {
        // Sorted by name, preserving the original's tiebreak. It is an arbitrary rule, but it is a
        // STABLE arbitrary rule, and changing it would silently re-point every multi-start flow.
        return this.steps
            .filter((s) => s.StartingStep === true && s.Status === 'Active')
            .sort((a, b) => a.Name.localeCompare(b.Name))
            .map(toNode);
    }

    /** The underlying entity for a node, for callers that need more than the projection. */
    public GetStepEntity(nodeId: string): MJAIAgentStepEntity | null {
        return AIEngine.Instance.GetAgentStepByID(nodeId) ?? null;
    }
}

/**
 * Wraps `SafeExpressionEvaluator` in the engine's evaluator contract.
 *
 * A thrown error becomes a reported failure rather than an escaped exception. The engine treats
 * that as `ConditionError` — the edge is not followed, but the reason survives, which is what lets
 * a stalled graph explain itself instead of looking like a normal completion.
 */
export class SafeConditionEvaluator implements IConditionEvaluator {
    private readonly evaluator = new SafeExpressionEvaluator();

    public Evaluate(expression: string, context: Record<string, unknown>): { Success: boolean; Value?: unknown; ErrorMessage?: string } {
        try {
            const result = this.evaluator.evaluate(expression, context);
            return result.success
                ? { Success: true, Value: result.value }
                : { Success: false, ErrorMessage: String(result.error ?? 'condition evaluation failed') };
        } catch (e) {
            return { Success: false, ErrorMessage: e instanceof Error ? e.message : String(e) };
        }
    }
}
