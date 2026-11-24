import { BaseAgent } from '../../base-agent';
import type { ActionCompactMode } from '../../ActionLifecycleResolver';
import type { ActionResultSpilloverManager } from '../../ActionResultSpilloverManager';
import type { ArtifactToolManager, ArtifactToolCall, StoredToolResult } from '../../ArtifactToolManager';
import { LoopAgentType } from '../../agent-types/loop-agent-type';
import { PipelineExecutor, type PipelineExecutionResult, type PipelineStage, type PipelineToolRegistry } from '../../pipeline';
import type { MJActionEntityExtended } from '@memberjunction/actions-base';
import type { ChatMessage } from '@memberjunction/ai';
import type { MJAIAgentActionEntity, MJActionEntity_IActionConfiguration } from '@memberjunction/core-entities';
import type {
    AgentChatMessage,
    AgentChatMessageMetadata,
    AgentConfiguration,
    AgentSubAgentRequest,
    AIPromptRunResult,
    BaseAgentNextStep,
    ExecuteAgentParams,
    MJAIAgentEntityExtended,
    MJAIAgentRunEntityExtended,
    MJAIAgentRunStepEntityExtended,
    MJAIPromptEntityExtended,
} from '@memberjunction/ai-core-plus';

export const SAGE_AGENT_ID = '55499C80-7596-46A9-9A91-B90B1A69A006';
export const RUN_ADHOC_QUERY_ID = '4B92BDED-4AD6-497A-B16E-BAE85BAB7563';

export function makeActionEntity(
    id: string,
    name: string,
    config?: MJActionEntity_IActionConfiguration,
    defaultCompactPromptId?: string
): MJActionEntityExtended {
    return {
        ID: id,
        Name: name,
        Config_: config ? JSON.stringify(config) : null,
        Config_Object: config ?? null,
        DefaultCompactPromptID: defaultCompactPromptId ?? null,
    } as Partial<MJActionEntityExtended> as MJActionEntityExtended;
}

export function makeAgentAction(overrides: Partial<MJAIAgentActionEntity>): MJAIAgentActionEntity {
    return {
        AgentID: SAGE_AGENT_ID,
        ActionID: RUN_ADHOC_QUERY_ID,
        Status: 'Active',
        ...overrides,
    } as Partial<MJAIAgentActionEntity> as MJAIAgentActionEntity;
}

export function makeExecuteParams(overrides?: Partial<ExecuteAgentParams>): ExecuteAgentParams {
    return {
        agent: { ID: SAGE_AGENT_ID, Name: 'Sage' } as Partial<MJAIAgentEntityExtended> as MJAIAgentEntityExtended,
        conversationMessages: [],
        payload: {},
        ...overrides,
    } as Partial<ExecuteAgentParams> as ExecuteAgentParams;
}

export function makeAgentConfig(): AgentConfiguration {
    return {} as Partial<AgentConfiguration> as AgentConfiguration;
}

export function makeAgentRun(overrides?: Partial<MJAIAgentRunEntityExtended>): MJAIAgentRunEntityExtended {
    return {
        ID: 'run-test-1',
        Success: true,
        ...overrides,
    } as Partial<MJAIAgentRunEntityExtended> as MJAIAgentRunEntityExtended;
}

export function makeLargeRows(count = 40): Array<{ RowNum: number; CustomerName: string; Category: string; Revenue: number }> {
    return Array.from({ length: count }, (_, i) => ({
        RowNum: i + 1,
        CustomerName: `Customer ${i + 1}`,
        Category: i % 2 === 0 ? 'Enterprise' : 'SMB',
        Revenue: (i + 1) * 1000,
    }));
}

/**
 * Exposes pre-existing protected BaseAgent lifecycle entry points for focused unit testing
 * without broadening private methods solely for tests.
 */
export class UnifiedActionPathwayProbeAgent extends BaseAgent {
    private _stubbedActions: MJActionEntityExtended[] | undefined;
    private _stubStepPersistence = false;
    private _stubLoopAgentType: LoopAgentType | undefined;
    private _forceNativeOnly = false;

    constructor(workspaceEnabled = true) {
        super();
        this.ArtifactManager.Initialize([], { workspaceEnabled });
    }

    public SetForceNativeOnly(enabled: boolean): void {
        this._forceNativeOnly = enabled;
    }

    protected override GetNativeControlConfig(params: ExecuteAgentParams): ReturnType<BaseAgent['GetNativeControlConfig']> {
        const base = super.GetNativeControlConfig(params);
        return this._forceNativeOnly ? { ...base, NativeOnly: true } : base;
    }

    public SetStubbedEffectiveActions(actions?: MJActionEntityExtended[]): void {
        this._stubbedActions = actions;
    }

    public EnableNoOpStepPersistence(): void {
        this._stubStepPersistence = true;
    }

    public UseStubLoopAgentType(): void {
        this._stubLoopAgentType = new LoopAgentType();
    }

    public override get AgentTypeInstance(): LoopAgentType {
        return this._stubLoopAgentType ?? (super.AgentTypeInstance as LoopAgentType);
    }

    protected override getEffectiveActionsForValidation(agentId: string): MJActionEntityExtended[] {
        return this._stubbedActions ?? super.getEffectiveActionsForValidation(agentId);
    }

    protected override async createStepEntity(
        params: Parameters<BaseAgent['createStepEntity']>[0]
    ): Promise<MJAIAgentRunStepEntityExtended> {
        if (this._stubStepPersistence) {
            return { ID: 'step-id', StepNumber: 1 } as Partial<MJAIAgentRunStepEntityExtended> as MJAIAgentRunStepEntityExtended;
        }
        return super.createStepEntity(params);
    }

    protected override async finalizeStepEntity(
        stepEntity: MJAIAgentRunStepEntityExtended,
        success: boolean,
        errorMessage?: string,
        outputData?: Parameters<BaseAgent['finalizeStepEntity']>[3]
    ): Promise<void> {
        if (this._stubStepPersistence) {
            return;
        }
        return super.finalizeStepEntity(stepEntity, success, errorMessage, outputData);
    }

    protected override async createCompactionStep(
        prompt: MJAIPromptEntityExtended,
        message: AgentChatMessage,
        params: ExecuteAgentParams
    ): Promise<MJAIAgentRunStepEntityExtended> {
        if (this._stubStepPersistence) {
            return { ID: 'compact-step-id', StepNumber: 1 } as Partial<MJAIAgentRunStepEntityExtended> as MJAIAgentRunStepEntityExtended;
        }
        return super.createCompactionStep(prompt, message, params);
    }

    protected override async updateCompactionStep(
        step: MJAIAgentRunStepEntityExtended,
        result: AIPromptRunResult<{ summary: string }>,
        message: AgentChatMessage,
        params: ExecuteAgentParams
    ): Promise<void> {
        if (this._stubStepPersistence) {
            return;
        }
        return super.updateCompactionStep(step, result, message, params);
    }

    public GetArtifactManager(): ArtifactToolManager {
        return this.ArtifactManager;
    }

    public GetSpilloverManager(): ActionResultSpilloverManager {
        return this.ActionSpilloverManager;
    }

    public QueueSpillover(
        metadata: AgentChatMessageMetadata,
        input: Parameters<ActionResultSpilloverManager['QueueDeferred']>[1]
    ): boolean {
        return this.ActionSpilloverManager.QueueDeferred(metadata, input, this.ArtifactManager);
    }

    public InjectArtifactResults(params: ExecuteAgentParams, toolResults: StoredToolResult[]): void {
        this.injectArtifactToolResultsMessage(params, toolResults);
    }

    public RunNativeArtifactTool(call: ArtifactToolCall): Promise<{ Content: string; IsError?: boolean }> {
        return this.ExecuteNativeArtifactTool(call);
    }

    public CreatePipelineRegistry(params: ExecuteAgentParams): PipelineToolRegistry {
        return this.buildPipelineRegistry(params);
    }

    public InjectPipelineResult(params: ExecuteAgentParams, result: PipelineExecutionResult): void {
        this.injectPipelineResultMessage(params, result);
    }

    public async ExecuteAndInjectPipeline(params: ExecuteAgentParams, stages: PipelineStage[]): Promise<void> {
        this.SetStubbedEffectiveActions([]);
        const registry = this.buildPipelineRegistry(params);
        const result = await new PipelineExecutor(registry).Execute(stages);
        this.injectPipelineResultMessage(params, result);
    }

    public FormatMarkdown(summaries: Parameters<BaseAgent['formatActionResultsAsMarkdown']>[0]): string {
        return this.formatActionResultsAsMarkdown(summaries);
    }

    public Compact(
        message: AgentChatMessage,
        metadata: {
            compactMode: ActionCompactMode;
            compactLength: number;
            compactPromptId: string;
            originalLength: number;
        },
        params: ExecuteAgentParams
    ): Promise<string> {
        return this.compactMessage(message, metadata, params);
    }

    public PruneExpired(params: ExecuteAgentParams, currentTurn: number): Promise<void> {
        return this.pruneAndCompactExpiredMessages(params, currentTurn);
    }

    public RunRemoveRecovery(
        params: ExecuteAgentParams,
        tokensToSave: number,
        currentStepCount: number,
        minAge: number
    ): { tokensSaved: number; strategyName: string } {
        return this.recoveryStrategy_RemoveOldestToolResults(params, tokensToSave, currentStepCount, minAge);
    }

    public RunCompactRecovery(
        params: ExecuteAgentParams,
        tokensToSave: number,
        currentStepCount: number,
        minAge: number
    ): Promise<{ tokensSaved: number; strategyName: string }> {
        return this.recoveryStrategy_CompactOldToolResults(params, tokensToSave, currentStepCount, minAge);
    }

    public RunCompactAllRecovery(
        params: ExecuteAgentParams,
        tokensToSave: number
    ): Promise<{ tokensSaved: number; strategyName: string }> {
        return this.recoveryStrategy_CompactAllToolResults(params, tokensToSave);
    }

    public PushToolTurn(params: ExecuteAgentParams, results: AgentChatMessage): void {
        this.PushToolResultTurn(params, results);
    }

    public ExecuteStep(
        params: ExecuteAgentParams,
        previousDecision: BaseAgentNextStep,
        stepCount = 0
    ): Promise<BaseAgentNextStep> {
        return this.executeNextStep(params, makeAgentConfig(), previousDecision, stepCount);
    }

    public PrepareSubMessages(
        params: ExecuteAgentParams,
        subAgentRequest: AgentSubAgentRequest,
        subAgent: MJAIAgentEntityExtended,
        contextMessage?: ChatMessage,
        consultQuestion?: string | null
    ): ChatMessage[] {
        return this.prepareSubAgentMessages(params, subAgentRequest, subAgent, contextMessage, consultQuestion);
    }

    public RunPostCompaction(
        params: ExecuteAgentParams,
        agentRun: MJAIAgentRunEntityExtended
    ): Promise<void> {
        return this.runPostRunCompaction(params, agentRun);
    }
}
