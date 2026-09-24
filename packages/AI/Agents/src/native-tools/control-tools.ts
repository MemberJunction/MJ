/**
 * @fileoverview Control-flow tools for the implicit protocol (spec §2.2, §4): one tool per
 * sub-agent, `payload_change_request`, `ask_user`. Built beside the Action tools so the reverse map
 * resolves every call the model can make.
 *
 * The agent declares these without knowing which model will answer. The prompt runner keeps them
 * only when the selected model's `LLM.NativeControlFlow` resolves to `'implicit'` and strips them
 * otherwise — see `AIPromptParams.controlFlowToolNames`.
 * @module @memberjunction/ai-agents
 */
import type { ChatTool } from '@memberjunction/ai';
import type { MJAIAgentEntityExtended } from '@memberjunction/ai-core-plus';
import { SanitizeToolName, MAX_TOOL_DESCRIPTION_LENGTH, type ActionToolBinding, type ActionToolSet } from './action-tool-builder';

export const PAYLOAD_CHANGE_TOOL = 'payload_change_request';
export const ASK_USER_TOOL = 'ask_user';
export const SUB_AGENT_TOOL_PREFIX = 'delegate_to_';
/** The fixed control tools. Sub-agent tools are recognised by {@link SUB_AGENT_TOOL_PREFIX}. */
export const NATIVE_CONTROL_TOOL_NAMES: readonly string[] = [PAYLOAD_CHANGE_TOOL, ASK_USER_TOOL];
/** Providers cap tool names at 64 characters. */
const MAX_TOOL_NAME_LENGTH = 64;

/** Every tool the agent can declare, and what a call to it means. Discriminated on `kind`. */
export type NativeToolBinding =
    | ActionToolBinding
    | { kind: 'subAgent'; toolName: string; agent: MJAIAgentEntityExtended; tool: ChatTool }
    | { kind: 'payloadChange'; toolName: string; tool: ChatTool }
    | { kind: 'askUser'; toolName: string; tool: ChatTool };

export interface NativeToolSet {
    tools: ChatTool[];
    /** Keyed by the declared tool name. */
    byToolName: Map<string, NativeToolBinding>;
    /** Every declared name that is NOT an Action — what the runner strips for hybrid models. */
    controlToolNames: string[];
}

const clip = (text: string, max: number): string => (text.length <= max ? text : `${text.slice(0, max - 1)}…`);

/** `payload_change_request` — a state write that continues the loop (spec §3). */
export function BuildPayloadChangeTool(): ChatTool {
    const section = (what: string) => ({ type: 'object' as const, description: what });
    return {
        name: PAYLOAD_CHANGE_TOOL,
        description: clip(
            'Write to the shared payload. Call this when your work has produced results the payload contract says to store ' +
            '(findings, code, results, drafts). Use newElements for keys that do not exist yet, updateElements for surgical ' +
            'changes to keys that do (only the changing parts; arrays keep unchanged items as {}), replaceElements to swap a whole ' +
            'object, removeElements to delete keys. The change is applied and the loop continues — when the task is then finished, ' +
            'reply in plain text. Do not call this to report progress; only to store data.', MAX_TOOL_DESCRIPTION_LENGTH),
        inputSchema: {
            type: 'object',
            properties: {
                newElements: section('Keys and values to ADD that are not in the payload yet.'),
                updateElements: section('Existing keys to UPDATE — only the parts that change.'),
                replaceElements: section('Existing objects to REPLACE entirely.'),
                removeElements: section('Keys to REMOVE (value ignored).'),
                reasoning: { type: 'string', description: 'One sentence on why this change.' }
            },
            required: []
        }
    };
}

/** @deprecated Use {@link BuildPayloadChangeTool}. */
export function buildPayloadChangeTool(): ChatTool {
    return BuildPayloadChangeTool();
}

/** `ask_user` — the one explicit control tool: the run pauses as `Chat` / `AwaitingFeedback` (spec §1). */
export function BuildAskUserTool(): ChatTool {
    return {
        name: ASK_USER_TOOL,
        description: clip(
            'Stop and ask the user. Use only when you need something only the user can give you — a choice between ' +
            'options only they can make, a value that exists nowhere in the payload, conversation or tools, permission. ' +
            'If a declared sub-agent or an Action can supply what you need, use it instead of asking. The run pauses ' +
            'until the user answers. Do NOT use this to report results or say you are done: for that, reply in plain ' +
            'text with no tool call.', MAX_TOOL_DESCRIPTION_LENGTH),
        inputSchema: {
            type: 'object',
            properties: {
                message: { type: 'string', description: 'The question or request for the user, in plain language.' },
                responseForm: {
                    type: 'object',
                    description:
                        'Optional. A structured form for the answer — the same shape as `responseForm` in the Response Forms ' +
                        'section of your instructions: { title?, description?, submitLabel?, questions: [{ id, label, type, … }] }. ' +
                        'Use it when the user should pick from options or fill in fields; omit it for a free-text question.',
                    properties: {
                        title: { type: 'string' },
                        description: { type: 'string' },
                        submitLabel: { type: 'string' },
                        questions: { type: 'array', items: { type: 'object' } }
                    }
                }
            },
            required: ['message']
        }
    };
}

/** @deprecated Use {@link BuildAskUserTool}. */
export function buildAskUserTool(): ChatTool {
    return BuildAskUserTool();
}

/** One tool per sub-agent: `delegate_to_<sanitized name>`, described by the agent's own description. */
export function BuildSubAgentTool(agent: MJAIAgentEntityExtended): ChatTool {
    const name = `${SUB_AGENT_TOOL_PREFIX}${SanitizeToolName(agent.Name)}`.slice(0, MAX_TOOL_NAME_LENGTH);
    return {
        name,
        description: clip(`Delegate to the ${agent.Name} sub-agent. ${agent.Description ?? ''}`.trim(), MAX_TOOL_DESCRIPTION_LENGTH),
        inputSchema: {
            type: 'object',
            properties: {
                message: { type: 'string', description: 'Instructions for the sub-agent — what to do. Not the payload; it receives that separately.' },
                terminateAfter: { type: 'boolean', description: 'true to end your own run when the sub-agent finishes; false (default) to continue with its result.' }
            },
            required: ['message']
        }
    };
}

/** @deprecated Use {@link BuildSubAgentTool}. */
export function buildSubAgentTool(agent: MJAIAgentEntityExtended): ChatTool {
    return BuildSubAgentTool(agent);
}

/**
 * Actions, then sub-agents, then the fixed control tools — one reverse map for all of them.
 * Collisions and reserved-name clashes are hard errors, exactly as Action/Action collisions are.
 */
export function BuildNativeToolSet(actionSet: ActionToolSet, subAgents: readonly MJAIAgentEntityExtended[]): NativeToolSet {
    const byToolName = new Map<string, NativeToolBinding>(actionSet.byToolName);
    const tools: ChatTool[] = [...actionSet.tools];
    const controlToolNames: string[] = [];
    for (const reserved of NATIVE_CONTROL_TOOL_NAMES) {
        const clash = actionSet.byToolName.get(reserved);
        if (clash) {
            throw new Error(`Action '${clash.action.Name}' sanitizes to '${reserved}', which is a reserved control-tool name. Rename the Action.`);
        }
    }
    for (const agent of subAgents) {
        const tool = BuildSubAgentTool(agent);
        const existing = byToolName.get(tool.name);
        if (existing) {
            const other = existing.kind === 'action' ? `Action '${existing.action.Name}'`
                : existing.kind === 'subAgent' ? `sub-agent '${existing.agent.Name}'` : `'${existing.toolName}'`;
            throw new Error(`Tool name collision: sub-agent '${agent.Name}' and ${other} both declare '${tool.name}'. Rename one.`);
        }
        byToolName.set(tool.name, { kind: 'subAgent', toolName: tool.name, agent, tool });
        tools.push(tool);
        controlToolNames.push(tool.name);
    }
    const payload = BuildPayloadChangeTool();
    const ask = BuildAskUserTool();
    byToolName.set(payload.name, { kind: 'payloadChange', toolName: payload.name, tool: payload });
    byToolName.set(ask.name, { kind: 'askUser', toolName: ask.name, tool: ask });
    tools.push(payload, ask);
    controlToolNames.push(payload.name, ask.name);
    return { tools, byToolName, controlToolNames };
}

/** @deprecated Use {@link BuildNativeToolSet}. */
export function buildNativeToolSet(actionSet: ActionToolSet, subAgents: readonly MJAIAgentEntityExtended[]): NativeToolSet {
    return BuildNativeToolSet(actionSet, subAgents);
}
