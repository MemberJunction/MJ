/**
 * @fileoverview Pluggable base token class for the Iteration Constructs seam (`s5`):
 * `ForEach` loops, `While` loops, `Pipeline` tool chains, template/path resolution,
 * and bounded-concurrency mapping.
 *
 * Downstream packages can replace this helper globally via
 * `@RegisterClass(BaseAgentIterationHelper, 'Default')` or per-agent via
 * `AIAgent.Configuration.helperPlugins` (`seam: 'iteration'`).
 *
 * @module @memberjunction/ai-agents
 */

import type {
    AgentChatMessageMetadata,
    AgentConfiguration,
    AgentPipelineRequest,
    BaseAgentNextStep,
    ExecuteAgentParams,
    ForEachOperation,
    MJAIAgentRunStepEntityExtended,
    WhileOperation,
} from '@memberjunction/ai-core-plus';
import type { LoopIterationError } from '../../AgentStepDispatcher';
import type { PipelineExecutionResult, PipelineToolRegistry } from '../../pipeline';
import type { AgentRunContext } from '../AgentRunContext';
import type {
    ForEachIterationResult,
    ForEachLoopResults,
    WhileIterationResult,
    WhileLoopResults,
} from '../base-agent-types';

/**
 * Pluggable base token class for `BaseAgent`'s `ForEach`, `While`, `Pipeline`,
 * template/path resolution, and concurrency utilities.
 */
export class BaseAgentIterationHelper {
    // --- Pipelines ---

    public BuildPipelineRegistry(_ctx: AgentRunContext, _params: ExecuteAgentParams): PipelineToolRegistry {
        throw new Error('BaseAgentIterationHelper.BuildPipelineRegistry must be implemented by a registered subclass.');
    }

    public ExecutePipelineAsStep(
        _ctx: AgentRunContext,
        _pipeline: AgentPipelineRequest,
        _params: ExecuteAgentParams
    ): Promise<PipelineExecutionResult> {
        throw new Error('BaseAgentIterationHelper.ExecutePipelineAsStep must be implemented by a registered subclass.');
    }

    // --- Concurrency & template/path utilities ---

    public MapWithConcurrency<T, R>(
        _ctx: AgentRunContext,
        _items: T[],
        _limit: number,
        _worker: (item: T, index: number) => Promise<R>
    ): Promise<R[]> {
        throw new Error('BaseAgentIterationHelper.MapWithConcurrency must be implemented by a registered subclass.');
    }

    public ResolveLoopParams(
        _ctx: AgentRunContext,
        _params: Record<string, unknown>,
        _item: unknown,
        _index: number,
        _payload: unknown
    ): Record<string, unknown> {
        throw new Error('BaseAgentIterationHelper.ResolveLoopParams must be implemented by a registered subclass.');
    }

    public ResolveTemplates(
        _ctx: AgentRunContext,
        _obj: Record<string, unknown>,
        _context: Record<string, unknown>,
        _itemVariable: string
    ): Record<string, unknown> {
        throw new Error('BaseAgentIterationHelper.ResolveTemplates must be implemented by a registered subclass.');
    }

    public ResolveValueFromContext(
        _ctx: AgentRunContext,
        _value: string,
        _context: Record<string, unknown>,
        _itemVariable: string
    ): unknown {
        throw new Error('BaseAgentIterationHelper.ResolveValueFromContext must be implemented by a registered subclass.');
    }

    public ResolveInlineTemplateExpressions(
        _ctx: AgentRunContext,
        _template: string,
        _context: Record<string, unknown>,
        _itemVariable: string
    ): string {
        throw new Error('BaseAgentIterationHelper.ResolveInlineTemplateExpressions must be implemented by a registered subclass.');
    }

    public GetValueFromPath(_ctx: AgentRunContext, _obj: unknown, _path: string): unknown {
        throw new Error('BaseAgentIterationHelper.GetValueFromPath must be implemented by a registered subclass.');
    }

    // --- ForEach loops ---

    public ExecuteForEachLoop(
        _ctx: AgentRunContext,
        _params: ExecuteAgentParams,
        _config: AgentConfiguration,
        _previousDecision: BaseAgentNextStep
    ): Promise<BaseAgentNextStep> {
        throw new Error('BaseAgentIterationHelper.ExecuteForEachLoop must be implemented by a registered subclass.');
    }

    public ValidateWhileOperation(
        _ctx: AgentRunContext,
        _whileOp: WhileOperation,
        _agentId?: string
    ): string | null {
        throw new Error('BaseAgentIterationHelper.ValidateWhileOperation must be implemented by a registered subclass.');
    }

    public ValidateForEachHeader(_ctx: AgentRunContext, _forEach: ForEachOperation): string | null {
        throw new Error('BaseAgentIterationHelper.ValidateForEachHeader must be implemented by a registered subclass.');
    }

    public ValidateLoopBodyOperation(
        _ctx: AgentRunContext,
        _kind: 'ForEach' | 'While',
        _op: ForEachOperation | WhileOperation,
        _agentId?: string
    ): string | null {
        throw new Error('BaseAgentIterationHelper.ValidateLoopBodyOperation must be implemented by a registered subclass.');
    }

    public GetCollectionFromPayload(_ctx: AgentRunContext, _payload: unknown, _path: string): unknown[] | null {
        throw new Error('BaseAgentIterationHelper.GetCollectionFromPayload must be implemented by a registered subclass.');
    }

    public ExecuteForEachIterations(
        _ctx: AgentRunContext,
        _forEach: ForEachOperation,
        _collection: unknown[],
        _initialPayload: unknown,
        _parentStepId: string,
        _params: ExecuteAgentParams,
        _config: AgentConfiguration
    ): Promise<ForEachLoopResults> {
        throw new Error('BaseAgentIterationHelper.ExecuteForEachIterations must be implemented by a registered subclass.');
    }

    public ApplyForEachResultsSequentially(
        _ctx: AgentRunContext,
        _sortedResults: Array<{
            index: number;
            result?: BaseAgentNextStep;
            error?: LoopIterationError;
            payload?: unknown;
            appliedFolds?: Array<{ output: Record<string, unknown>; mapping: string }>;
        }>,
        _initialPayload: unknown,
        _continueOnError: boolean
    ): { results: BaseAgentNextStep[]; errors: LoopIterationError[]; finalPayload: unknown } {
        throw new Error('BaseAgentIterationHelper.ApplyForEachResultsSequentially must be implemented by a registered subclass.');
    }

    public ApplyLoopOutputFold(
        _ctx: AgentRunContext,
        _basePayload: unknown,
        _output: Record<string, unknown>,
        _mapping: string
    ): Record<string, unknown> {
        throw new Error('BaseAgentIterationHelper.ApplyLoopOutputFold must be implemented by a registered subclass.');
    }

    public ExecuteSingleForEachIteration(
        _ctx: AgentRunContext,
        _forEach: ForEachOperation,
        _item: unknown,
        _index: number,
        _currentPayload: unknown,
        _parentStepId: string,
        _params: ExecuteAgentParams,
        _config: AgentConfiguration
    ): Promise<ForEachIterationResult> {
        throw new Error('BaseAgentIterationHelper.ExecuteSingleForEachIteration must be implemented by a registered subclass.');
    }

    public FormatLoopErrors(_ctx: AgentRunContext, _errors: LoopIterationError[]): string {
        throw new Error('BaseAgentIterationHelper.FormatLoopErrors must be implemented by a registered subclass.');
    }

    public FormatLoopResultsAsMarkdown(
        _ctx: AgentRunContext,
        _results: BaseAgentNextStep[],
        _errors: LoopIterationError[]
    ): string {
        throw new Error('BaseAgentIterationHelper.FormatLoopResultsAsMarkdown must be implemented by a registered subclass.');
    }

    public ResolveLoopExpirationMetadata(
        _ctx: AgentRunContext,
        _params: ExecuteAgentParams,
        _actionNames?: string | readonly string[]
    ): AgentChatMessageMetadata {
        throw new Error('BaseAgentIterationHelper.ResolveLoopExpirationMetadata must be implemented by a registered subclass.');
    }

    // --- While loops ---

    public ExecuteWhileLoop(
        _ctx: AgentRunContext,
        _params: ExecuteAgentParams,
        _config: AgentConfiguration,
        _previousDecision: BaseAgentNextStep
    ): Promise<BaseAgentNextStep> {
        throw new Error('BaseAgentIterationHelper.ExecuteWhileLoop must be implemented by a registered subclass.');
    }

    public ExecuteWhileIterations(
        _ctx: AgentRunContext,
        _whileOp: WhileOperation,
        _initialPayload: unknown,
        _parentStepId: string,
        _params: ExecuteAgentParams,
        _config: AgentConfiguration
    ): Promise<WhileLoopResults> {
        throw new Error('BaseAgentIterationHelper.ExecuteWhileIterations must be implemented by a registered subclass.');
    }

    public ExecuteSingleWhileIteration(
        _ctx: AgentRunContext,
        _whileOp: WhileOperation,
        _attemptContext: { attemptNumber: number; totalAttempts: number },
        _index: number,
        _currentPayload: unknown,
        _parentStepId: string,
        _params: ExecuteAgentParams,
        _config: AgentConfiguration
    ): Promise<WhileIterationResult> {
        throw new Error('BaseAgentIterationHelper.ExecuteSingleWhileIteration must be implemented by a registered subclass.');
    }

    public CompleteWhileLoop(
        _ctx: AgentRunContext,
        _whileOp: WhileOperation,
        _loopStepEntity: MJAIAgentRunStepEntityExtended,
        _loopResults: WhileLoopResults,
        _previousDecision: BaseAgentNextStep,
        _params: ExecuteAgentParams
    ): Promise<BaseAgentNextStep> {
        throw new Error('BaseAgentIterationHelper.CompleteWhileLoop must be implemented by a registered subclass.');
    }
}
