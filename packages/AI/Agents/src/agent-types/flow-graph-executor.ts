/**
 * @fileoverview The seam where a Flow agent stops being walked and starts being dispatched (C1.3).
 *
 * **What this replaces.** A Flow agent used to execute inside its own agent run: one program
 * counter, one step at a time, `AIAgentRunStep` rows, and nothing durable — a page reload lost the
 * work, a server restart orphaned it, and no channel other than the one that started it could see
 * it. The traversal semantics lived in `FlowAgentType` and were reachable from nowhere else, which
 * is why the dispatcher grew a second, subtly different implementation of the same rules.
 *
 * **What it becomes.** The flow's persisted metadata compiles to a `TaskGraphSpec`
 * ({@link CompileFlowToTaskGraph}) and is handed to the same submitter every emitted task graph
 * uses. From that point a Flow agent is not special: it is Task rows owned by a server-side
 * dispatcher, with the same claiming, retry, skip and failure semantics as any other graph.
 *
 * This module is deliberately thin — it resolves what the compiler cannot see (names behind IDs)
 * and nothing else. Every traversal rule lives in the compiler or the dispatcher, because a rule
 * that lives here is a rule the two executors no longer share, which is the drift this whole track
 * exists to end.
 *
 * @module @memberjunction/ai-agents
 */
import { UUIDsEqual } from '@memberjunction/global';
import {
    CompileFlowToTaskGraph,
    type FlowCompileResult,
    type FlowCompilerOptions,
    type FlowCompilerPath,
    type FlowCompilerStep,
} from '@memberjunction/ai-core-plus';
import { AIEngine } from '@memberjunction/aiengine';
import { ActionEngineServer } from '@memberjunction/actions';
import type { MJAIAgentStepEntity, MJAIAgentStepPathEntity } from '@memberjunction/core-entities';

/** Projects a step entity onto the compiler's input shape. */
function toCompilerStep(step: MJAIAgentStepEntity): FlowCompilerStep {
    return {
        ID: step.ID,
        Name: step.Name,
        Description: step.Description,
        StepType: step.StepType,
        StartingStep: step.StartingStep === true,
        Status: step.Status,
        ActionID: step.ActionID,
        SubAgentID: step.SubAgentID,
        PromptID: step.PromptID,
        LoopBodyType: step.LoopBodyType,
        Configuration: step.Configuration,
        ActionInputMapping: step.ActionInputMapping,
        ActionOutputMapping: step.ActionOutputMapping,
        TimeoutSeconds: step.TimeoutSeconds,
        RetryCount: step.RetryCount,
        OnErrorBehavior: step.OnErrorBehavior,
        PositionX: step.PositionX,
        PositionY: step.PositionY,
        Width: step.Width,
        Height: step.Height,
    };
}

/** Projects a step-path entity onto the compiler's input shape. */
function toCompilerPath(path: MJAIAgentStepPathEntity): FlowCompilerPath {
    return {
        ID: path.ID,
        OriginStepID: path.OriginStepID,
        DestinationStepID: path.DestinationStepID,
        Condition: path.Condition,
        Priority: path.Priority,
        PathPoints: path.PathPoints,
    };
}

/**
 * Reads a Flow agent's design-time graph out of `AIEngine`'s caches and compiles it.
 *
 * Synchronous by nature — `GetAgentSteps` / `GetPathsFromStep` are filters over already-loaded
 * arrays — so compilation costs nothing beyond the walk itself and can happen on the agent's
 * critical path without a round trip.
 *
 * Name resolution is the one thing the compiler cannot do for itself: a step stores `SubAgentID`,
 * `ActionID`, `PromptID`, while a `TaskGraphSpec` addresses all three **by name** so a graph stays
 * readable and portable. An ID that resolves to nothing is reported by the compiler as an
 * `UnresolvedReference`, never silently emitted as a task pointing at nothing.
 *
 * @param agentID  the Flow agent whose steps and paths to compile
 * @param agentName  becomes the compiled graph's `workflowName`, and the parent Task's name
 * @param reasoning  optional provenance carried onto the parent task's description
 */
export function CompileFlowAgentToTaskGraph(
    agentID: string,
    agentName: string,
    reasoning?: string,
): FlowCompileResult {
    const stepEntities = AIEngine.Instance.GetAgentSteps(agentID) ?? [];
    const pathEntities = stepEntities.flatMap((s) => AIEngine.Instance.GetPathsFromStep(s.ID) ?? []);

    const options: FlowCompilerOptions = {
        WorkflowName: agentName,
        Reasoning: reasoning,
        ResolveAgentName: (id) => AIEngine.Instance.Agents.find((a) => UUIDsEqual(a.ID, id))?.Name ?? null,
        ResolveActionName: (id) => ActionEngineServer.Instance.Actions.find((a) => UUIDsEqual(a.ID, id))?.Name ?? null,
        ResolvePromptName: (id) => AIEngine.Instance.Prompts.find((p) => UUIDsEqual(p.ID, id))?.Name ?? null,
        // Flows have always been walked by a single program counter, so a fan-out is an exclusive
        // choice rather than a parallel start. Compiling as 'parallel' would begin executing
        // branches these flows have never executed. See the compiler's TraversalMode doc.
        TraversalMode: 'sequential',
    };

    return CompileFlowToTaskGraph(stepEntities.map(toCompilerStep), pathEntities.map(toCompilerPath), options);
}

/**
 * Renders compile failures for a person, in workflow vocabulary (D18 — never graph/DAG/node).
 *
 * A flow that cannot compile is an authoring problem the user can fix in the editor, so the message
 * has to name the step and say what is wrong with it. "Compilation failed" would send them to us.
 */
export function FormatFlowCompileErrors(result: FlowCompileResult): string {
    if (result.Errors.length === 0) return '';
    return result.Errors.map((e) => `[${e.Code}] ${e.Message}`).join('\n');
}
