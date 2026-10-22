/**
 * @fileoverview Agent-local tools: native tools an agent class defines for itself, which read and
 * write the agent's own state — `write_section` / `edit_section`, `write_file` / `edit_file`,
 * `set_component_hierarchy`.
 *
 * An Action is a boundary to the rest of the system and cannot change the payload; the payload's
 * only native write path was `payload_change_request`, which puts large content back into JSON
 * inside a JSON string. An agent tool returns its result to the model as that call's tool result
 * and its state change as a {@link AgentToolResult.PayloadChange}, which the loop applies through
 * PayloadManager under the agent's `PayloadSelfWritePaths` — one logged write path, no side channel.
 *
 * A driver class supplies its tools by overriding `BaseAgent.GetAgentTools`.
 * @module @memberjunction/ai-agents
 */
import type { ChatTool } from '@memberjunction/ai';
import type { UserInfo } from '@memberjunction/core';
import type { AgentPayloadChangeRequest, ExecuteAgentParams } from '@memberjunction/ai-core-plus';
import { MAX_TOOL_DESCRIPTION_LENGTH, SanitizeToolName } from './action-tool-builder';

/** What an agent tool sees when it runs. */
export interface AgentToolContext<P = object> {
    /**
     * A copy of the payload as it stands when this call runs — after every earlier call on the
     * turn. Changing it changes nothing: return the change as {@link AgentToolResult.PayloadChange}.
     */
    CurrentPayload: P;
    Params: ExecuteAgentParams;
    ContextUser: UserInfo;
}

/** What an agent tool hands back. */
export interface AgentToolResult<P = object> {
    /** What the model reads, as the call's tool result. */
    Content: string;
    /** True when the call failed; the model sees the result as an error and can correct itself. */
    IsError: boolean;
    /**
     * The state change this call makes, applied before the next call on the turn runs. Ignored
     * when `IsError` is true. A change outside the agent's `PayloadSelfWritePaths` is rejected
     * whole and reported to the model as an error.
     */
    PayloadChange?: AgentPayloadChangeRequest<P>;
}

/** One agent-local tool. */
export interface AgentToolDefinition<P = object> {
    /**
     * The tool name the model calls: lowercase letters, digits and underscores, at most 64
     * characters. Must not be a control-tool name or start with `delegate_to_`.
     */
    Name: string;
    /** "Call this when…" — what the tool does and when to use it. At most 1024 characters. */
    Description: string;
    /** JSON Schema for the arguments, in the cross-provider subset. */
    InputSchema: Record<string, unknown>;
    /** Runs the call. A thrown error is reported to the model as an error result. */
    Execute(args: Record<string, unknown>, context: AgentToolContext<P>): Promise<AgentToolResult<P>>;
}

/**
 * Checks an agent tool's name and describes it as a {@link ChatTool}.
 *
 * @param definition The tool
 * @param reservedNames Names the tool may not take (the control tools)
 * @param reservedPrefix A prefix it may not start with (the sub-agent tools)
 * @throws When the name is not already a valid tool name, or is reserved
 */
export function BuildAgentTool(definition: AgentToolDefinition, reservedNames: readonly string[], reservedPrefix: string): ChatTool {
    const name = definition.Name;
    if (!name || SanitizeToolName(name) !== name) {
        throw new Error(`Agent tool '${name}' is not a valid tool name; use lowercase letters, digits and underscores (for example '${SanitizeToolName(name)}').`);
    }
    if (reservedNames.includes(name) || name.startsWith(reservedPrefix)) {
        throw new Error(`Agent tool '${name}' uses a name reserved for the control tools. Rename it.`);
    }
    if (definition.Description.length > MAX_TOOL_DESCRIPTION_LENGTH) {
        throw new Error(`Agent tool '${name}' has a description over ${MAX_TOOL_DESCRIPTION_LENGTH} characters.`);
    }
    return { name, description: definition.Description, inputSchema: definition.InputSchema };
}
