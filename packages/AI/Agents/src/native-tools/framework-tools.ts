/**
 * @fileoverview The framework's own capabilities as native tools, for the native-only control
 * plane (`NativeControl.NativeOnly`).
 *
 * Under the hybrid prompt the scratchpad, durable memory, artifact tools, conversation-history
 * tools and decisions are fields of the JSON envelope. A turn that calls a tool skips envelope
 * parsing, so a model that is calling tools cannot use any of them on that turn, and it is taught
 * two protocols at once. Native-only mode declares each enabled capability as a tool instead, and
 * every call is answered by its own tool result on the same turn.
 *
 * The tools are built on the agent-tool contract ({@link AgentToolDefinition}); the agent supplies
 * the capability behind each through {@link FrameworkToolHost}.
 * @module @memberjunction/ai-agents
 */
import type { AgentDecisionRequest, AgentScratchpad, AgentTask } from '@memberjunction/ai-core-plus';
import type { AgentToolDefinition, AgentToolResult } from './agent-tools';

export const SCRATCHPAD_TOOL = 'scratchpad_write';
export const MEMORY_WRITE_TOOL = 'memory_write';
export const ARTIFACT_TOOL = 'artifact_tool';
export const CONVERSATION_TOOL = 'conversation_tool';
export const DECISION_TOOL = 'ask_decisions';
/** Every framework tool name — reserved, like the control tools. */
export const FRAMEWORK_TOOL_NAMES: readonly string[] = [SCRATCHPAD_TOOL, MEMORY_WRITE_TOOL, ARTIFACT_TOOL, CONVERSATION_TOOL, DECISION_TOOL];

/** Which framework capabilities this turn offers. */
export interface FrameworkToolAvailability {
    Scratchpad: boolean;
    MemoryWrites: boolean;
    ArtifactTools: boolean;
    ConversationTools: boolean;
    Decisions: boolean;
}

/** The capabilities behind the framework tools, supplied by the running agent. Each returns the text the model reads. */
export interface FrameworkToolHost {
    ApplyScratchpad(changes: AgentScratchpad): string;
    WriteMemory(note: string, type: 'Preference' | 'Context', scopeHint: 'user' | 'agent' | undefined): Promise<AgentToolResult>;
    RunArtifactTool(artifactId: string, tool: string, input: Record<string, unknown>): Promise<AgentToolResult>;
    RunConversationTool(tool: string, input: Record<string, unknown>): Promise<AgentToolResult>;
    RunDecisions(requests: AgentDecisionRequest[], payload: object): Promise<AgentToolResult>;
}

const isRecord = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value);
const fail = (Content: string): AgentToolResult => ({ Content, IsError: true });

function scratchpadTool(host: FrameworkToolHost): AgentToolDefinition {
    return {
        Name: SCRATCHPAD_TOOL,
        Description: 'Write to your private scratchpad: working notes and a task list that persist across your turns and are never shared. '
            + 'Call this to record reasoning you will need later or to track work items. Keep it lean: it is shown to you on every turn.',
        InputSchema: {
            type: 'object',
            properties: {
                notes: { type: 'string', description: 'Replaces your notes. Omit to leave them as they are.' },
                taskList: {
                    type: 'object',
                    description: 'Task changes: `upsert` adds or updates tasks by id; `remove` deletes tasks by id.',
                    properties: {
                        upsert: {
                            type: 'array',
                            items: {
                                type: 'object',
                                properties: {
                                    id: { type: 'string' },
                                    title: { type: 'string' },
                                    status: { type: 'string', enum: ['pending', 'in_progress', 'completed', 'blocked'] },
                                    notes: { type: 'string' }
                                },
                                required: ['id', 'title', 'status']
                            }
                        },
                        remove: { type: 'array', items: { type: 'string' } }
                    }
                }
            }
        },
        Execute: async (args) => {
            const changes = readScratchpadChanges(args);
            return typeof changes === 'string' ? fail(changes) : { Content: host.ApplyScratchpad(changes), IsError: false };
        }
    };
}

const TASK_STATUSES: readonly string[] = ['pending', 'in_progress', 'completed', 'blocked'];

/** One task from `taskList.upsert`, or undefined when it lacks an id, a title or a known status. */
function readTask(raw: unknown): AgentTask | undefined {
    if (!isRecord(raw) || typeof raw.id !== 'string' || typeof raw.title !== 'string' || typeof raw.status !== 'string') {
        return undefined;
    }
    const status = TASK_STATUSES.find((s) => s === raw.status) as AgentTask['status'] | undefined;
    if (!status) {
        return undefined;
    }
    return { id: raw.id, title: raw.title, status, ...(typeof raw.notes === 'string' ? { notes: raw.notes } : {}) };
}

/** The scratchpad changes in a call's arguments, or a message saying what is wrong with them. */
function readScratchpadChanges(args: Record<string, unknown>): AgentScratchpad | string {
    if (args.notes !== undefined && typeof args.notes !== 'string') {
        return 'scratchpad_write.notes must be a string.';
    }
    const list = isRecord(args.taskList) ? args.taskList : {};
    const upsertRaw = Array.isArray(list.upsert) ? list.upsert : [];
    const upsert = upsertRaw.map(readTask);
    if (upsert.some((t) => t === undefined)) {
        return "Every task in taskList.upsert needs an id, a title and a status of 'pending', 'in_progress', 'completed' or 'blocked'.";
    }
    const remove = Array.isArray(list.remove) ? list.remove.filter((id): id is string => typeof id === 'string') : [];
    return {
        ...(typeof args.notes === 'string' ? { notes: args.notes } : {}),
        ...(upsert.length || remove.length ? { taskList: { upsert: upsert as AgentTask[], remove } } : {})
    };
}

function memoryTool(host: FrameworkToolHost): AgentToolDefinition {
    return {
        Name: MEMORY_WRITE_TOOL,
        Description: 'Record one durable memory that persists across runs: an atomic, third-person fact such as "User prefers bar charts over pie charts." '
            + 'Call this the moment the user states a lasting preference or fact. Not for task state (use the scratchpad) and not for instructions.',
        InputSchema: {
            type: 'object',
            properties: {
                note: { type: 'string', description: 'The fact, as one declarative sentence.' },
                type: { type: 'string', enum: ['Preference', 'Context'], description: 'Preference: likes, dislikes, choices. Context: situational facts.' },
                scopeHint: { type: 'string', enum: ['user', 'agent'], description: "Optional. 'agent' stores it without tying it to the current user." }
            },
            required: ['note', 'type']
        },
        Execute: async (args) => {
            const type = args.type === 'Preference' || args.type === 'Context' ? args.type : undefined;
            if (typeof args.note !== 'string' || !args.note.trim() || !type) {
                return fail("memory_write needs a non-empty note and a type of 'Preference' or 'Context'.");
            }
            const scope = args.scopeHint === 'user' || args.scopeHint === 'agent' ? args.scopeHint : undefined;
            return host.WriteMemory(args.note, type, scope);
        }
    };
}

function artifactTool(host: FrameworkToolHost): AgentToolDefinition {
    return {
        Name: ARTIFACT_TOOL,
        Description: 'Run one artifact tool on an artifact listed in Available Artifacts, to explore or inspect it. '
            + 'Call this with the artifact id (A, B, …), the tool name and its input; the result is returned to you on this turn.',
        InputSchema: {
            type: 'object',
            properties: {
                artifactId: { type: 'string', description: 'The artifact id from Available Artifacts, such as "A".' },
                tool: { type: 'string', description: 'The artifact tool to run, as listed under Artifact Tools.' },
                input: { type: 'object', description: "The tool's input parameters." }
            },
            required: ['artifactId', 'tool']
        },
        Execute: async (args) => {
            if (typeof args.artifactId !== 'string' || typeof args.tool !== 'string') {
                return fail('artifact_tool needs an artifactId and a tool name.');
            }
            return host.RunArtifactTool(args.artifactId, args.tool, isRecord(args.input) ? args.input : {});
        }
    };
}

function conversationTool(host: FrameworkToolHost): AgentToolDefinition {
    return {
        Name: CONVERSATION_TOOL,
        Description: 'Read stored conversation history: page exact messages back in by sequence number, search the history, or summarize a range. '
            + 'Call this when you need exact wording, identifiers or numbers that a summary may have lost.',
        InputSchema: {
            type: 'object',
            properties: {
                tool: { type: 'string', enum: ['getMessageBySequence', 'getMessagesByRange', 'searchConversation', 'summarizeRange'] },
                input: { type: 'object', description: 'The input for that tool, as listed under Conversation History Tools.' }
            },
            required: ['tool', 'input']
        },
        Execute: async (args) => {
            if (typeof args.tool !== 'string') {
                return fail('conversation_tool needs a tool name.');
            }
            return host.RunConversationTool(args.tool, isRecord(args.input) ? args.input : {});
        }
    };
}

function decisionTool(host: FrameworkToolHost): AgentToolDefinition {
    return {
        Name: DECISION_TOOL,
        Description: 'Ask typed decision questions (Likelihood, Choice, Score) answered by a fast decision model; the answers are returned to you on this turn. '
            + 'Call this for classification, triage, relevance or threshold judgments over a small answer space — not for writing or open-ended reasoning.',
        InputSchema: {
            type: 'object',
            properties: {
                decisions: {
                    type: 'array',
                    description: 'Decision requests, the same shape as described under Decisions.',
                    items: { type: 'object' }
                }
            },
            required: ['decisions']
        },
        Execute: async (args, context) => {
            if (!Array.isArray(args.decisions) || args.decisions.length === 0) {
                return fail('ask_decisions needs a non-empty decisions array.');
            }
            return host.RunDecisions(args.decisions as AgentDecisionRequest[], context.CurrentPayload);
        }
    };
}

/**
 * The framework tools this turn offers, in a fixed order.
 *
 * @param host The capabilities behind the tools
 * @param availability Which capabilities are enabled for this agent and turn
 */
export function BuildFrameworkTools(host: FrameworkToolHost, availability: FrameworkToolAvailability): AgentToolDefinition[] {
    const tools: AgentToolDefinition[] = [];
    if (availability.Scratchpad) tools.push(scratchpadTool(host));
    if (availability.MemoryWrites) tools.push(memoryTool(host));
    if (availability.ArtifactTools) tools.push(artifactTool(host));
    if (availability.ConversationTools) tools.push(conversationTool(host));
    if (availability.Decisions) tools.push(decisionTool(host));
    return tools;
}
