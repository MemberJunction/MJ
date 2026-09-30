/**
 * Publishes one agent run's live status on the caller's session.
 *
 * `RunAIAgentResolver` uses this for every status it sends. A host whose
 * `AgentTurnHandler` answers with an In-Progress reply uses the same publisher,
 * on that caller's session, so the chat follows the turn: significant-step
 * progress, streamed text, the partial result, and the completion.
 */
import type { PubSubEngine } from 'type-graphql';
import type {
    AgentExecutionProgressCallback,
    AgentExecutionStreamingCallback,
    ExecuteAgentResult,
} from '@memberjunction/ai-core-plus';
import type { UserPayload } from '../types.js';
import { PublishStatusUpdate } from '../generic/PushStatusResolver.js';

const SIGNIFICANT_STEPS = ['prompt_execution', 'action_execution', 'subagent_execution', 'decision_processing'];

/** The run fields the published messages read. Entities and test fakes both satisfy this. */
interface StatusRun {
    ID?: string;
    ConversationDetailID?: string;
    ErrorMessage?: string;
    Steps?: Array<{ StepName?: string }>;
    GetAll?: () => unknown;
}

export class AgentRunStatusPublisher {
    private run: StatusRun | null = null;

    /**
     * @param sessionId Session stamped on the message body. Defaults to the payload's session.
     *   The push itself is always addressed to `userPayload.sessionId`, matching the resolver.
     */
    constructor(
        private readonly pubSub: PubSubEngine,
        private readonly userPayload: UserPayload,
        private readonly sessionId: string = userPayload.sessionId,
    ) {}

    /** Latest run observed from a progress event, including steps that are not published. */
    public get AgentRun(): StatusRun | null {
        return this.run;
    }

    /** AgentRunner's progress callback. Noise steps are kept for {@link AgentRun} and not published. */
    public get OnProgress(): AgentExecutionProgressCallback {
        return (progress) => {
            const fromEvent = progress.metadata?.agentRun as StatusRun | undefined;
            if (fromEvent) {
                this.run = fromEvent;
            }
            if (!SIGNIFICANT_STEPS.includes(progress.step)) {
                return;
            }
            const agentRun = fromEvent || this.run;
            if (!agentRun?.ID) {
                // A host that streams before the first progress event otherwise sees nothing and no reason.
                console.error('❌ No agent run available for progress callback');
                return;
            }
            this.publish('ExecutionProgress', {
                sessionId: this.sessionId,
                agentRunId: agentRun.ID,
                type: 'progress',
                agentRun: agentRun.GetAll ? agentRun.GetAll() : agentRun,
                progress: {
                    currentStep: progress.step,
                    percentage: progress.percentage,
                    message: progress.message,
                    agentName: progress.metadata?.agentName,
                    agentType: progress.metadata?.agentType,
                    stepCount: progress.metadata?.stepCount,
                    hierarchicalStep: progress.metadata?.hierarchicalStep,
                },
                timestamp: new Date(),
            });
        };
    }

    /** AgentRunner's streaming callback. Publishes nothing until a progress event has carried the run. */
    public get OnStreaming(): AgentExecutionStreamingCallback {
        return (chunk) => {
            const agentRun = this.run;
            if (!agentRun?.ID) {
                console.error('❌ No agent run available for streaming callback');
                return;
            }
            this.publish('StreamingContent', {
                sessionId: this.sessionId,
                agentRunId: agentRun.ID,
                type: 'streaming',
                agentRun: agentRun.GetAll ? agentRun.GetAll() : agentRun,
                streaming: {
                    content: chunk.content,
                    isPartial: !chunk.isComplete,
                    stepName: chunk.stepType,
                    agentName: chunk.modelName,
                    kind: chunk.kind,
                },
                timestamp: new Date(),
            });
        };
    }

    /**
     * The partial result, then the completion. `conversationDetailId` is the reply row the
     * chat should update. When omitted, the completion uses the run's own detail id.
     */
    public PublishFinal(result: ExecuteAgentResult, conversationDetailId?: string, resultJson?: string): void {
        const agentRun = result.agentRun as StatusRun | undefined;
        if (agentRun?.ID) {
            let lastStep = 'Completed';
            const steps = agentRun.Steps;
            if (steps && steps.length > 0) {
                lastStep = steps[steps.length - 1]?.StepName || 'Completed';
            }
            this.publish('StreamingContent', {
                sessionId: this.sessionId,
                agentRunId: agentRun.ID,
                type: 'partial_result',
                partialResult: {
                    currentStep: lastStep,
                    partialOutput: result.payload || undefined,
                },
                timestamp: new Date(),
            });
        }
        this.publish('StreamingContent', {
            sessionId: this.sessionId,
            agentRunId: agentRun?.ID || 'unknown',
            type: 'complete',
            timestamp: new Date(),
            conversationDetailId: conversationDetailId || agentRun?.ConversationDetailID,
            success: result.success,
            errorMessage: agentRun?.ErrorMessage || undefined,
            result: resultJson || undefined,
        });
    }

    /**
     * Completion for a failure that has no run. The fire-and-forget path uses this when
     * `executeAIAgent` rejects, which is the only message that tells the client the run failed.
     */
    public PublishFailure(conversationDetailId: string | undefined, errorMessage: string): void {
        this.publish('StreamingContent', {
            sessionId: this.sessionId,
            agentRunId: 'unknown',
            type: 'complete',
            timestamp: new Date(),
            conversationDetailId,
            success: false,
            errorMessage,
            result: JSON.stringify({ success: false, errorMessage }),
        });
    }

    private publish(type: 'ExecutionProgress' | 'StreamingContent', data: unknown): void {
        PublishStatusUpdate(this.pubSub, {
            sessionId: this.userPayload.sessionId,
            ownerUserId: this.userPayload?.userRecord?.ID ?? '',
            message: JSON.stringify({
                resolver: 'RunAIAgentResolver',
                type,
                status: 'ok',
                data,
            }),
        });
    }
}
