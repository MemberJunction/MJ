/**
 * @fileoverview Compiles a `TourDefinition` (steps + optional branch paths) into an
 * `IGraphRepository` for `@memberjunction/graph`, evaluates branch conditions via
 * `CompositeFilter` / choice-key shorthand / `SafeExpressionEvaluator`, validates
 * cycles via `DetectCycle`, and computes layered graph layout via `LayoutGraphNodes`.
 * @module @memberjunction/tours-runtime
 */

import {
    CompositeFilter,
    IsCompositeFilter,
    IsSimpleFilter,
    type CompositeFilterDescriptor,
    type FilterDescriptor,
    type FilterEvalContext,
} from '@memberjunction/core';
import { DefaultExpressionEvaluator } from '@memberjunction/global';
import {
    DetectCycle,
    GraphLayoutBounds,
    LayoutGraphNodes,
    RankGraphNodes,
    type CycleDetectionResult,
    type GraphEdge,
    type GraphLayoutBox,
    type GraphLayoutEdge,
    type GraphLayoutOptions,
    type GraphNode,
    type GraphNodePosition,
    type IConditionEvaluator,
    type IGraphRepository,
    type TaskGraphEdge,
    type TaskGraphNode,
    type TraversalContext,
} from '@memberjunction/graph';
import type { TourDefinition, TourStepDefinition, TourStepPathDefinition } from './types';

export interface TourConditionContext extends Record<string, unknown> {
    lastChoiceKey?: string;
    choices?: Record<string, string>;
    roles?: string[];
    record?: Record<string, unknown>;
    predicates?: Record<string, boolean>;
    completedSteps?: string[];
    custom?: Record<string, unknown>;
}

/**
 * Builds a `FilterEvalContext` compatible with `CompositeFilter.Evaluate`.
 * Top-level object properties are exposed as named sources (`record.Amount`, `user.Role`),
 * and primitive/flat fields are exposed on `context['']` for bare-name rules.
 */
export function BuildFilterEvalContext(context: Record<string, unknown>): FilterEvalContext {
    const flat: Record<string, unknown> = {};
    const evalCtx: FilterEvalContext = { '': flat };

    for (const [key, value] of Object.entries(context)) {
        if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
            evalCtx[key] = value as Record<string, unknown>;
        } else {
            flat[key] = value;
        }
    }

    return evalCtx;
}

function isPlainChoiceToken(expression: string): boolean {
    return /^[A-Za-z0-9_-]+$/.test(expression) && expression !== 'true' && expression !== 'false';
}

/**
 * Evaluates a tour branch condition (`CompositeFilter`, `ChoiceKey` shorthand, or
 * `SafeExpressionEvaluator` boolean expression).
 */
export function EvaluateTourCondition(
    condition: string | CompositeFilterDescriptor | FilterDescriptor | null | undefined,
    context: TraversalContext,
): { Success: boolean; Value: boolean; ErrorMessage?: string } {
    if (condition == null) {
        return { Success: true, Value: true };
    }

    if (typeof condition === 'object') {
        if (IsCompositeFilter(condition) || IsSimpleFilter(condition)) {
            const cf = CompositeFilter.FromDescriptor(condition);
            return { Success: true, Value: cf.Evaluate(BuildFilterEvalContext(context)) };
        }
        return { Success: false, Value: false, ErrorMessage: 'Invalid filter object condition.' };
    }

    const trimmed = condition.trim();
    if (!trimmed) {
        return { Success: true, Value: true };
    }

    // 1. JSON CompositeFilter string
    if (trimmed.startsWith('{')) {
        try {
            const parsed = JSON.parse(trimmed) as CompositeFilterDescriptor | FilterDescriptor;
            if (!IsCompositeFilter(parsed) && !IsSimpleFilter(parsed)) {
                return { Success: false, Value: false, ErrorMessage: 'JSON condition is not a valid CompositeFilter.' };
            }
            const cf = CompositeFilter.FromDescriptor(parsed);
            return { Success: true, Value: cf.Evaluate(BuildFilterEvalContext(context)) };
        } catch (err) {
            return {
                Success: false,
                Value: false,
                ErrorMessage: err instanceof Error ? err.message : String(err),
            };
        }
    }

    // 2. Explicit Choice:key shorthand
    const lastChoiceKey = typeof context['lastChoiceKey'] === 'string' ? context['lastChoiceKey'] : undefined;
    if (trimmed.startsWith('Choice:')) {
        const expected = trimmed.slice('Choice:'.length).trim();
        return { Success: true, Value: lastChoiceKey === expected };
    }

    // 3. Bare ChoiceKey identifier shorthand (e.g. "explore-data" or "sales")
    if (isPlainChoiceToken(trimmed)) {
        const hasBooleanContextKey =
            Object.prototype.hasOwnProperty.call(context, trimmed) && typeof context[trimmed] === 'boolean';
        if (!hasBooleanContextKey) {
            return { Success: true, Value: lastChoiceKey === trimmed };
        }
    }

    // 4. SafeExpressionEvaluator boolean expression
    const res = DefaultExpressionEvaluator.Evaluate(trimmed, context);
    if (!res.success) {
        return {
            Success: false,
            Value: false,
            ErrorMessage: res.error ?? 'Expression evaluation failed.',
        };
    }
    return { Success: true, Value: Boolean(res.value) };
}

/** `@memberjunction/graph` `IConditionEvaluator` implementation for compiled tour graphs. */
export class TourGraphConditionEvaluator implements IConditionEvaluator {
    public Evaluate(
        expression: string,
        context: TraversalContext,
    ): { Success: boolean; Value?: unknown; ErrorMessage?: string } {
        const result = EvaluateTourCondition(expression, context);
        return {
            Success: result.Success,
            Value: result.Value,
            ErrorMessage: result.ErrorMessage,
        };
    }
}

export interface CompiledTourGraph {
    TourKey: string;
    Nodes: GraphNode[];
    Edges: GraphEdge[];
    Repository: IGraphRepository;
    StepByKey: ReadonlyMap<string, TourStepDefinition>;
    PathByEdgeId: ReadonlyMap<string, TourStepPathDefinition>;
}

/**
 * Compiles a `TourDefinition`'s `Steps` (ordered by `Sequence`) and optional `Paths`
 * into a `@memberjunction/graph` `IGraphRepository`.
 *
 * For any step with zero explicit outgoing `Paths` (and not explicitly terminal),
 * a sequential edge is synthesized to the next step by `Sequence`.
 */
export function CompileTourGraph(tour: TourDefinition): CompiledTourGraph {
    const orderedSteps = [...tour.Steps].sort((a, b) => a.Sequence - b.Sequence);
    const stepByKey = new Map<string, TourStepDefinition>();
    for (const step of orderedSteps) {
        stepByKey.set(step.StepKey, step);
    }

    const explicitPaths = tour.Paths ?? [];
    const outgoingCountByOrigin = new Map<string, number>();
    const incomingCountByDest = new Map<string, number>();

    for (const path of explicitPaths) {
        outgoingCountByOrigin.set(path.FromStepKey, (outgoingCountByOrigin.get(path.FromStepKey) ?? 0) + 1);
        incomingCountByDest.set(path.ToStepKey, (incomingCountByDest.get(path.ToStepKey) ?? 0) + 1);
    }

    const edges: GraphEdge[] = [];
    const pathByEdgeId = new Map<string, TourStepPathDefinition>();

    // Add explicit paths first
    explicitPaths.forEach((path, index) => {
        const edgeId = path.ID ?? `path:${path.FromStepKey}->${path.ToStepKey}#${index}`;
        const condition =
            path.Condition == null
                ? null
                : typeof path.Condition === 'string'
                  ? path.Condition
                  : JSON.stringify(path.Condition);

        // Explicit default paths get lower priority than conditional branches unless explicitly prioritized
        const priority =
            typeof path.Priority === 'number'
                ? path.Priority
                : path.IsDefault || condition == null || condition.trim() === ''
                  ? 0
                  : 100;

        edges.push({
            id: edgeId,
            originNodeId: path.FromStepKey,
            destinationNodeId: path.ToStepKey,
            condition,
            priority,
        });
        pathByEdgeId.set(edgeId, path);
    });

    // Synthesize sequential edges for linear steps with no explicit outgoing paths
    for (let i = 0; i < orderedSteps.length - 1; i++) {
        const current = orderedSteps[i];
        const next = orderedSteps[i + 1];
        if ((outgoingCountByOrigin.get(current.StepKey) ?? 0) === 0) {
            const edgeId = `seq:${current.StepKey}->${next.StepKey}`;
            edges.push({
                id: edgeId,
                originNodeId: current.StepKey,
                destinationNodeId: next.StepKey,
                condition: null,
                priority: 0,
            });
            incomingCountByDest.set(next.StepKey, (incomingCountByDest.get(next.StepKey) ?? 0) + 1);
        }
    }

    const firstStepKey = orderedSteps[0]?.StepKey;
    const nodes: GraphNode[] = orderedSteps.map((step) => ({
        id: step.StepKey,
        name: step.Title,
        type: step.StepType,
        status: 'Active',
        isStartNode: step.StepKey === firstStepKey || (incomingCountByDest.get(step.StepKey) ?? 0) === 0,
    }));

    const nodeMap = new Map<string, GraphNode>(nodes.map((n) => [n.id, n]));
    const outgoingMap = new Map<string, GraphEdge[]>();
    const incomingMap = new Map<string, GraphEdge[]>();

    for (const edge of edges) {
        const outList = outgoingMap.get(edge.originNodeId) ?? [];
        outList.push(edge);
        outgoingMap.set(edge.originNodeId, outList);

        const inList = incomingMap.get(edge.destinationNodeId) ?? [];
        inList.push(edge);
        incomingMap.set(edge.destinationNodeId, inList);
    }

    const startNodes = nodes.filter((n) => n.id === firstStepKey);
    const repository: IGraphRepository = {
        GetNode(nodeId: string): GraphNode | null {
            return nodeMap.get(nodeId) ?? null;
        },
        GetOutgoingEdges(nodeId: string): GraphEdge[] {
            return outgoingMap.get(nodeId) ?? [];
        },
        GetIncomingEdges(nodeId: string): GraphEdge[] {
            return incomingMap.get(nodeId) ?? [];
        },
        GetStartNodes(): GraphNode[] {
            return startNodes.length > 0 ? startNodes : nodes.filter((n) => n.isStartNode);
        },
    };

    return {
        TourKey: tour.TourKey,
        Nodes: nodes,
        Edges: edges,
        Repository: repository,
        StepByKey: stepByKey,
        PathByEdgeId: pathByEdgeId,
    };
}

export interface TourGraphValidationResult {
    Valid: boolean;
    CycleResult: CycleDetectionResult;
    UnknownStepRefs: Array<{ FromStepKey: string; ToStepKey: string }>;
    DuplicateStepKeys: string[];
}

/** Validates a tour's pathway for cycles, dangling step references, and duplicate step keys. */
export function ValidateTourGraph(tour: TourDefinition): TourGraphValidationResult {
    const compiled = CompileTourGraph(tour);
    const seenKeys = new Set<string>();
    const duplicateKeys: string[] = [];

    for (const step of tour.Steps) {
        if (seenKeys.has(step.StepKey)) {
            duplicateKeys.push(step.StepKey);
        } else {
            seenKeys.add(step.StepKey);
        }
    }

    const unknownStepRefs: Array<{ FromStepKey: string; ToStepKey: string }> = [];
    for (const path of tour.Paths ?? []) {
        if (!seenKeys.has(path.FromStepKey) || !seenKeys.has(path.ToStepKey)) {
            unknownStepRefs.push({ FromStepKey: path.FromStepKey, ToStepKey: path.ToStepKey });
        }
    }

    const taskNodes: TaskGraphNode[] = compiled.Nodes.map((n) => ({
        id: n.id,
        status: 'Pending',
    }));
    const taskEdges: TaskGraphEdge[] = compiled.Edges.map((e) => ({
        taskId: e.destinationNodeId,
        dependsOnTaskId: e.originNodeId,
        dependencyType: 'Prerequisite',
    }));

    const cycleResult = DetectCycle(taskNodes, taskEdges);

    return {
        Valid: !cycleResult.hasCycle && unknownStepRefs.length === 0 && duplicateKeys.length === 0,
        CycleResult: cycleResult,
        UnknownStepRefs: unknownStepRefs,
        DuplicateStepKeys: duplicateKeys,
    };
}

export interface TourGraphLayoutResult {
    Positions: Map<string, GraphNodePosition>;
    Bounds: GraphLayoutBox;
    Ranks: Map<string, number>;
}

/** Computes deterministic layered graph coordinates for Tour Studio using `@memberjunction/graph`. */
export function ComputeTourGraphLayout(
    tour: TourDefinition,
    options: GraphLayoutOptions = {},
): TourGraphLayoutResult {
    const compiled = CompileTourGraph(tour);
    const nodeIds = compiled.Nodes.map((n) => n.id);
    const layoutEdges: GraphLayoutEdge[] = compiled.Edges.map((e) => ({
        From: e.originNodeId,
        To: e.destinationNodeId,
    }));

    const Positions = LayoutGraphNodes(nodeIds, layoutEdges, options);
    const Bounds = GraphLayoutBounds(Positions, options);
    const Ranks = RankGraphNodes(nodeIds, layoutEdges);

    return { Positions, Bounds, Ranks };
}
