import { AgentPayloadChangeRequest, ForEachOperation, WhileOperation, AgentResponseForm, ActionableCommand, AutomaticCommand, AgentScratchpad, AgentPipelineRequest } from "@memberjunction/ai-core-plus";
import { ArtifactToolCall } from "../ArtifactToolManager";
import { MemoryWriteRequest } from "../MemoryWriteManager";

// Re-export universal types for backward compatibility
export type { ForEachOperation, WhileOperation, ArtifactToolCall, MemoryWriteRequest };

/**
 * Response structure for Loop Agent Type
 */
export interface LoopAgentResponse<P = any> {
    /**
     * Task completion status. true = terminate loop, false = continue
     */
    taskComplete?: boolean;
    
    /**
     * Plain text message (<100 words). Required for 'Chat' type, omit for others
     */
    message?: string;

    /**
     * Optional response form to collect structured user input.
     * When present, UI will render appropriate input controls.
     * @since 2.116.0
     */
    responseForm?: AgentResponseForm;

    /**
     * Optional actionable commands shown as clickable buttons/links.
     * Typically used after completing work to provide navigation to created/modified resources.
     * @since 2.116.0
     */
    actionableCommands?: ActionableCommand[];

    /**
     * Optional automatic commands executed immediately when received.
     * Used for refreshing data, showing notifications, and updating UI state.
     * @since 2.116.0
     */
    automaticCommands?: AutomaticCommand[];

    /**
     * Payload changes. Omit if no changes needed
     */
    payloadChangeRequest?: AgentPayloadChangeRequest<P>;
    
    /**
     * Private working memory — not shared with parent or sub-agents.
     * Processed inline on the same turn as other response fields (zero turn cost).
     * Use for internal reasoning notes and structured task tracking.
     * @since 2.46.0
     */
    scratchpad?: AgentScratchpad;

    /**
     * Artifact tool invocations — explore input artifacts without
     * dumping full content into context. Processed inline on the same
     * turn as other response fields (zero turn cost). Results are
     * injected into the next turn's prompt via _ARTIFACT_TOOL_RESULTS.
     */
    artifactToolCalls?: ArtifactToolCall[];

    /**
     * Durable memory writes — record facts/preferences that persist across
     * runs. Processed inline on the same turn as other response fields (zero
     * turn cost). Each write lands as a Provisional agent note — immediately
     * injectable into future runs, later hardened or pruned by the Memory
     * Manager. Only honored when the agent has AllowMemoryWrite enabled; the
     * framework enforces type restriction, scope clamping, deduplication,
     * and per-run caps.
     */
    memoryWrites?: MemoryWriteRequest[];

    /**
     * Internal reasoning for debugging
     */
    reasoning?: string;
    
    /**
     * Confidence level (0.0-1.0)
     */
    confidence?: number;

    /**
     * Next action. Required when taskComplete=false
     */
    nextStep?: {
        /**
         * Operation type: 'Actions' | 'ClientTools' | 'Sub-Agent' | 'Chat' | 'Retry' | 'ForEach' | 'While' | 'Pipeline'
         */
        type: 'Actions' | 'ClientTools' | 'Sub-Agent' | 'Chat' | 'Retry' | 'ForEach' | 'While' | 'Pipeline';

        /**
         * Actions to execute (when type='Actions')
         */
        actions?: Array<{
            name: string;
            params: Record<string, unknown>;
        }>;

        /**
         * Tool pipeline to run server-side (when type='Pipeline'). Like client tools, it is a
         * yield/await action: the agent cannot know the result until it executes, so the loop runs
         * the pipeline inline, injects the final output, and forces one more turn. Only the final
         * step's output enters the context window. Modeling it as a `nextStep.type` (rather than a
         * top-level field) makes it structurally mutually exclusive with Actions/Chat/etc. — the LLM
         * cannot accidentally request a pipeline AND another step in the same turn.
         */
        pipeline?: AgentPipelineRequest;

        /**
         * Index of a compacted message to expand (when type='Retry').
         * The message is restored to full content and the prompt re-runs.
         */
        messageIndex?: number;

        /**
         * Reason for expanding the message (when type='Retry')
         */
        reason?: string;

        /**
         * Sub-agent details (when type='Sub-Agent')
         */
        subAgent?: {
            name: string;

            /**
             * Instructions for the sub-agent, NOT the payload, that is handled elsewhere
             */
            message: string;

            /**
             * Extra parameters - NOT the payload, only use these if the sub-agent
             * specifically **defines** parameters in its metadata, otherwise these will be
             * ignored and waste tokens!
             */
            templateParameters?: Record<string, any>;

            /**
             * true=end parent, false=continue
             */
            terminateAfter: boolean;
        };

        /**
         * Multiple sub-agents to run in parallel (when type='Sub-Agent')
         */
        subAgents?: Array<{
            name: string;
            message: string;
            templateParameters?: Record<string, any>;
            terminateAfter: boolean;
        }>;

        /**
         * Client tools to invoke (when type='ClientTools').
         * Supports both PascalCase (spec) and camelCase (LLM convenience).
         */
        clientTools?: Array<{
            Name?: string;
            name?: string;
            Params?: Record<string, unknown>;
            params?: Record<string, unknown>;
            TimeoutMs?: number;
            timeoutMs?: number;
            Description?: string;
            description?: string;
        }>;

        /**
         * ForEach operation details (when type='ForEach')
         */
        forEach?: ForEachOperation;

        /**
         * While operation details (when type='While')
         */
        while?: WhileOperation;
    };
}

//\n{@include ../../../CorePlus/src/agent-payload-change-request.ts}
//\n{@include ../../../CorePlus/src/response-forms.ts}