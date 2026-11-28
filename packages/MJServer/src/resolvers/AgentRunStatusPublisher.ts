/**
 * Publishes one agent run's live status on the caller's session.
 *
 * `RunAIAgentResolver` uses this for every status it sends. A host whose
 * `AgentTurnHandler` answers with an In-Progress reply uses the same publisher,
 * on that caller's session, so the chat follows the turn: significant-step
 * progress, streamed text, the partial result, and the completion. When the
 * turn throws instead of returning a result, call `PublishFailure` with the
 * reply row's id and the error.
 */
import type { PubSubEngine } from 'type-graphql';
import type {
    AgentExecutionProgressCallback,
    AgentExecutionStreamingCallback,
    ExecuteAgentResult,
} from '@memberjunction/ai-core-plus';
import type { EntityInfo } from '@memberjunction/core';
import { UUIDsEqual } from '@memberjunction/global';
import type { UserPayload } from '../types.js';
import { PublishStatusUpdate, StatusUpdateOwnerID } from '../generic/PushStatusResolver.js';
import { ProjectEntityObjectForCaller, ProjectValuesForCaller } from '../generic/fieldSecurityTransport.js';

const SIGNIFICANT_STEPS = ['prompt_execution', 'action_execution', 'subagent_execution', 'decision_processing'];

/** Default coalescing window (ms) for high-frequency `OnStreaming` token chunks (~40 fps ceiling). */
export const DEFAULT_STREAMING_COALESCE_MS = 25;

/** The run fields the published messages read. Entities and test fakes both satisfy this. */
interface StatusRun {
    ID?: string;
    AgentID?: string;
    Agent?: string | null;
    ParentRunID?: string | null;
    Status?: string;
    ConversationID?: string | null;
    ConversationDetailID?: string;
    ErrorMessage?: string;
    Steps?: Array<{ StepName?: string }>;
    EntityInfo?: EntityInfo | null;
    GetAll?: () => Record<string, unknown>;
}

/** The run fields a streamed chunk carries. */
type RunSummary = Pick<StatusRun, 'ID' | 'AgentID' | 'Agent' | 'ParentRunID' | 'Status' | 'ConversationID' | 'ConversationDetailID'>;

interface BufferedStreamingChunk {
    agentRunId: string;
    run: StatusRun;
    content: string;
    isPartial: boolean;
    stepType?: string;
    modelName?: string;
    kind?: string;
}

export class AgentRunStatusPublisher {
    private run: StatusRun | null = null;
    private streamBuffer: BufferedStreamingChunk | null = null;
    private streamTimer: ReturnType<typeof setTimeout> | null = null;
    private lastStreamPublishMs: number = -Infinity;
    private cachedSummary: {
        run: StatusRun;
        status: string | undefined;
        detailId: string | undefined;
        summary: RunSummary;
    } | null = null;

    /**
     * @param sessionId Session stamped on the message body. Defaults to the payload's session.
     *   The push itself is always addressed to `userPayload.sessionId`, matching the resolver.
     * @param conversationDetailId The run's reply row. When set, every message carries it as
     *   `conversationDetailId`, not only the completion, so a client that reconnects mid-run can
     *   find its row. When omitted, messages are as before.
     * @param coalesceMs Minimum interval (ms) between consecutive `StreamingContent` publishes
     *   for rapid partial chunks. Defaults to {@link DEFAULT_STREAMING_COALESCE_MS} (25 ms).
     */
    constructor(
        private readonly pubSub: PubSubEngine,
        private readonly userPayload: UserPayload,
        private readonly sessionId: string = userPayload.sessionId,
        private readonly conversationDetailId?: string,
        private readonly coalesceMs: number = DEFAULT_STREAMING_COALESCE_MS,
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
                if (this.streamBuffer && fromEvent.ID && !UUIDsEqual(fromEvent.ID, this.streamBuffer.agentRunId)) {
                    this.Flush();
                }
                this.run = fromEvent;
                this.cachedSummary = null;
            }
            if (!SIGNIFICANT_STEPS.includes(progress.step)) {
                return;
            }
            // Preserve strict chronological ordering: flush any buffered tokens before emitting a step progress event.
            this.Flush();
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
                ...this.replyRow(),
                agentRun: this.runValues(agentRun),
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

    /**
     * AgentRunner's streaming callback. Publishes nothing until a progress event has carried the run.
     * Coalesces high-frequency partial chunks within {@link coalesceMs} while preserving leading-edge
     * delivery and ordered concatenation, flushing immediately on completion or metadata change.
     */
    public get OnStreaming(): AgentExecutionStreamingCallback {
        return (chunk) => {
            const agentRun = this.run;
            if (!agentRun?.ID) {
                console.error('❌ No agent run available for streaming callback');
                return;
            }

            if (this.streamBuffer && !this.matchesBufferMetadata(this.streamBuffer, agentRun.ID, chunk)) {
                this.Flush();
            }

            if (chunk.isComplete) {
                if (this.streamBuffer) {
                    this.streamBuffer.content += chunk.content;
                    this.streamBuffer.isPartial = false;
                    this.Flush();
                } else {
                    this.publishStreamingChunk(agentRun, chunk.content, false, chunk.stepType, chunk.modelName, chunk.kind);
                }
                return;
            }

            const now = Date.now();
            if (!this.streamBuffer && (this.coalesceMs <= 0 || now - this.lastStreamPublishMs >= this.coalesceMs)) {
                this.publishStreamingChunk(agentRun, chunk.content, true, chunk.stepType, chunk.modelName, chunk.kind);
                return;
            }

            if (!this.streamBuffer) {
                this.streamBuffer = {
                    agentRunId: agentRun.ID,
                    run: agentRun,
                    content: chunk.content,
                    isPartial: true,
                    stepType: chunk.stepType,
                    modelName: chunk.modelName,
                    kind: chunk.kind,
                };
            } else {
                this.streamBuffer.content += chunk.content;
                this.streamBuffer.run = agentRun;
            }

            if (!this.streamTimer) {
                const delayMs = Math.max(1, this.coalesceMs - (now - this.lastStreamPublishMs));
                this.streamTimer = setTimeout(() => {
                    this.streamTimer = null;
                    this.Flush();
                }, delayMs);
                this.streamTimer.unref?.();
            }
        };
    }

    /** Synchronously flushes any buffered streaming tokens and cancels the pending coalesce timer. */
    public Flush(): void {
        if (this.streamTimer) {
            clearTimeout(this.streamTimer);
            this.streamTimer = null;
        }
        if (!this.streamBuffer) {
            return;
        }
        const buffered = this.streamBuffer;
        this.streamBuffer = null;
        this.publishStreamingChunk(
            buffered.run,
            buffered.content,
            buffered.isPartial,
            buffered.stepType,
            buffered.modelName,
            buffered.kind,
        );
    }

    /** Flushes any pending streaming chunks and clears timers (safe on disconnect/cancellation). */
    public Dispose(): void {
        this.Flush();
    }

    /**
     * The partial result, then the completion. `conversationDetailId` is the reply row the
     * chat should update. When omitted, the completion uses the run's own detail id.
     */
    public PublishFinal(result: ExecuteAgentResult, conversationDetailId?: string, resultJson?: string): void {
        this.Flush();
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
                ...this.replyRow(),
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
            conversationDetailId: conversationDetailId || agentRun?.ConversationDetailID || this.conversationDetailId,
            success: result.success,
            errorMessage: agentRun?.ErrorMessage || undefined,
            result: resultJson || undefined,
        });
    }

    /**
     * Completion for a failure that has no run result. `executeAIAgent` sends it when the run
     * throws (the agent could not start, the run failed, or its reply could not be saved), so a
     * fire-and-forget client learns the reason. A host uses it the same way: when the turn throws
     * instead of returning a result, call `PublishFailure` with the reply row's id
     * and the error. That completion is what tells the chat the reply finished.
     */
    public PublishFailure(conversationDetailId: string | undefined, errorMessage: string): void {
        this.Flush();
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

    private matchesBufferMetadata(
        buffer: BufferedStreamingChunk,
        agentRunId: string,
        chunk: Parameters<AgentExecutionStreamingCallback>[0],
    ): boolean {
        return (
            UUIDsEqual(buffer.agentRunId, agentRunId) &&
            buffer.stepType === chunk.stepType &&
            buffer.kind === chunk.kind &&
            buffer.modelName === chunk.modelName
        );
    }

    private publishStreamingChunk(
        agentRun: StatusRun,
        content: string,
        isPartial: boolean,
        stepType?: string,
        modelName?: string,
        kind?: string,
    ): void {
        if (!agentRun.ID) {
            return;
        }
        this.lastStreamPublishMs = Date.now();
        this.publish('StreamingContent', {
            sessionId: this.sessionId,
            agentRunId: agentRun.ID,
            type: 'streaming',
            ...this.replyRow(),
            agentRun: this.runSummary(agentRun),
            streaming: {
                content,
                isPartial,
                stepName: stepType,
                agentName: modelName,
                kind,
            },
            timestamp: new Date(),
        });
    }

    /** `{ conversationDetailId }` when this run has a reply row, otherwise nothing, so the message keeps its old shape. */
    private replyRow(): { conversationDetailId?: string } {
        return this.conversationDetailId ? { conversationDetailId: this.conversationDetailId } : {};
    }

    /**
     * The run's field values as the recipient may read them. The run object comes from the agent
     * engine, which is not bound to this session's user, so it is projected here.
     */
    private runValues(agentRun: StatusRun): unknown {
        if (!agentRun.GetAll) {
            return agentRun;
        }
        const getAll = agentRun.GetAll;
        return ProjectEntityObjectForCaller({ EntityInfo: agentRun.EntityInfo, GetAll: () => getAll.call(agentRun) }, this.userPayload?.userRecord);
    }

    /**
     * The run's identifying fields as the recipient may read them. A streamed chunk carries only
     * these: the run's `GetAll()` holds every step and prompt run, and a run streams many chunks.
     */
    private runSummary(agentRun: StatusRun): RunSummary {
        if (
            this.cachedSummary &&
            this.cachedSummary.run === agentRun &&
            this.cachedSummary.status === agentRun.Status &&
            this.cachedSummary.detailId === agentRun.ConversationDetailID
        ) {
            return this.cachedSummary.summary;
        }
        const summary: RunSummary = {
            ID: agentRun.ID,
            AgentID: agentRun.AgentID,
            Agent: agentRun.Agent,
            ParentRunID: agentRun.ParentRunID,
            Status: agentRun.Status,
            ConversationID: agentRun.ConversationID,
            ConversationDetailID: agentRun.ConversationDetailID,
        };
        const projected = ProjectValuesForCaller(agentRun.EntityInfo, summary, this.userPayload?.userRecord);
        this.cachedSummary = {
            run: agentRun,
            status: agentRun.Status,
            detailId: agentRun.ConversationDetailID,
            summary: projected,
        };
        return projected;
    }

    private publish(type: 'ExecutionProgress' | 'StreamingContent', data: unknown): void {
        PublishStatusUpdate(this.pubSub, {
            sessionId: this.userPayload.sessionId,
            ownerUserId: StatusUpdateOwnerID(this.userPayload),
            message: JSON.stringify({
                resolver: 'RunAIAgentResolver',
                type,
                status: 'ok',
                data,
            }),
        });
    }
}
