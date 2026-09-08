import { z } from 'zod';
import { UserInfo } from '@memberjunction/core';
import { UUIDsEqual } from '@memberjunction/global';
import { AIEngine } from '@memberjunction/aiengine';
import { ActionEngineBase } from '@memberjunction/actions-base';
import { AgentSpecSync } from '@memberjunction/ai-agent-manager';
import { AgentSpec, MJAIAgentEntityExtended } from '@memberjunction/ai-core-plus';
import type { AddToolFn, MCPSessionContext } from '../Server.js';
import {
    AgentManagementToolsOptions,
    DEFAULT_BUILDER_AGENTS,
    matchesNamePattern,
    validateCreateSpec,
    validateUpdateSpec
} from './agentManagementHelpers.js';

/**
 * Registers the agent-management tool vocabulary with the MCP server. These
 * tools wrap the {@link AgentSpecSync} object model so MCP clients can browse,
 * introspect, create, and edit complete agent definitions — hierarchy, actions,
 * prompts, sub-agents, flow steps — as one JSON document, without knowing the
 * underlying entity schema.
 *
 * Tools registered (all subject to the server's include/exclude filters):
 * - `Get_Agent_Catalog`     — list agents with summary metadata
 * - `Get_Agent_Spec`        — full AgentSpec for one agent (recursive)
 * - `Create_Agent`          — create an agent (and hierarchy) from a spec
 * - `Update_Agent`          — full-replace update of an agent from a spec
 * - `Get_Agent_Type_List`   — available agent types (Loop, Flow, Realtime, …)
 * - `Get_Action_Catalog`    — available actions to wire into agent specs
 * - `Execute_<Builder>_Agent` — always-on execute tools for the builder agents
 *
 * @param addTool - Tool registration function (applies filtering + authorization)
 * @param systemUser - System user for engine warm-up at registration time
 * @param sessionContext - Authenticated session; tool executions run as this user
 * @param registerAgentExecuteTool - Callback that registers a standard
 *        Execute_<Name>_Agent tool for one agent (supplied by Server.ts so the
 *        builder-agent tools are identical to config-driven agent tools)
 * @param options - Optional configuration from mcpServerSettings.agentManagementTools
 */
export async function loadAgentManagementTools(
    addTool: AddToolFn,
    systemUser: UserInfo,
    sessionContext: MCPSessionContext,
    registerAgentExecuteTool: (agent: MJAIAgentEntityExtended) => void,
    options?: AgentManagementToolsOptions
): Promise<void> {
    if (options?.enabled === false) {
        return;
    }

    await AIEngine.Instance.Config(false, systemUser);

    registerAgentCatalogTool(addTool, sessionContext);
    registerAgentSpecTool(addTool, sessionContext);
    registerCreateAgentTool(addTool, sessionContext);
    registerUpdateAgentTool(addTool, sessionContext);
    registerAgentTypeListTool(addTool, sessionContext);
    registerActionCatalogTool(addTool, sessionContext);
    registerBuilderAgentTools(options?.builderAgents ?? [...DEFAULT_BUILDER_AGENTS], registerAgentExecuteTool);
}

function registerAgentCatalogTool(addTool: AddToolFn, sessionContext: MCPSessionContext): void {
    addTool({
        name: 'Get_Agent_Catalog',
        description: 'List AI agents with summary metadata (id, name, description, type, status, invocation mode). Use Get_Agent_Spec to retrieve the full definition of any agent.',
        parameters: z.object({
            pattern: z.string().optional().default('*').describe('Name pattern to match agents (supports wildcards: *, prefix*, *suffix, *contains*)'),
            topLevelOnly: z.boolean().optional().default(false).describe('When true, exclude child sub-agents (agents with a ParentID)'),
            // 'Disabled', not 'Inactive' — AIAgent.Status has never accepted 'Inactive', so that
            // filter option could only ever return an empty list.
            status: z.enum(['Active', 'Disabled', 'Pending', 'all']).optional().default('Active').describe('Filter by agent status')
        }),
        scopeInfo: { scopePath: 'agent:read', resource: '*' },
        async execute(props) {
            const aiEngine = AIEngine.Instance;
            await aiEngine.Config(false, sessionContext.user);

            const pattern = props.pattern as string;
            const topLevelOnly = props.topLevelOnly as boolean;
            const status = props.status as string;

            const agents = aiEngine.Agents
                .filter(a => matchesNamePattern(a.Name, pattern))
                .filter(a => !topLevelOnly || !a.ParentID)
                .filter(a => status === 'all' || a.Status === status);

            return JSON.stringify(agents.map(agent => ({
                id: agent.ID,
                name: agent.Name,
                description: agent.Description || '',
                type: resolveAgentTypeName(agent.TypeID),
                status: agent.Status,
                parentId: agent.ParentID,
                invocationMode: agent.InvocationMode
            })));
        }
    });
}

function registerAgentSpecTool(addTool: AddToolFn, sessionContext: MCPSessionContext): void {
    addTool({
        name: 'Get_Agent_Spec',
        description: 'Retrieve the complete AgentSpec for one agent as a single JSON document: core configuration, actions, prompts, sub-agent hierarchy (recursive), and flow steps/paths. This is the same shape Create_Agent and Update_Agent accept.',
        parameters: z.object({
            agentId: z.string().optional().describe('ID of the agent to load'),
            agentName: z.string().optional().describe('Exact name of the agent to load (used when agentId is not provided)'),
            includeSubAgents: z.boolean().optional().default(true).describe('Recursively include full specs for all sub-agents')
        }),
        scopeInfo: (props) => ({
            scopePath: 'agent:read',
            resource: (props.agentName as string) || (props.agentId as string) || '*'
        }),
        async execute(props) {
            const sessionUser = sessionContext.user;
            const agentId = props.agentId as string | undefined;
            const agentName = props.agentName as string | undefined;
            const includeSubAgents = props.includeSubAgents as boolean;

            if (!agentId && !agentName) {
                return JSON.stringify({ success: false, error: 'Either agentId or agentName must be provided' });
            }

            try {
                const sync = agentId
                    ? await AgentSpecSync.LoadFromDatabase(agentId, sessionUser, includeSubAgents)
                    : await AgentSpecSync.LoadByName(agentName as string, sessionUser, includeSubAgents);
                return JSON.stringify({ success: true, spec: sync.toJSON() });
            } catch (error) {
                return JSON.stringify({
                    success: false,
                    error: error instanceof Error ? error.message : String(error)
                });
            }
        }
    });
}

function registerCreateAgentTool(addTool: AddToolFn, sessionContext: MCPSessionContext): void {
    addTool({
        name: 'Create_Agent',
        description: 'Create a new AI agent (including nested sub-agents, actions, and prompts) from an AgentSpec JSON document. Omit ID fields — the server assigns them. Use Get_Agent_Type_List for TypeID values and Get_Action_Catalog for ActionID values. Returns the new agent ID and every database mutation performed.',
        parameters: z.object({
            spec: z.record(z.unknown()).describe('AgentSpec JSON document. Minimum: { "Name": "..." }. See Get_Agent_Spec output for the full shape.')
        }),
        scopeInfo: (props) => ({
            scopePath: 'agent:manage',
            resource: ((props.spec as Partial<AgentSpec> | undefined)?.Name) || '*'
        }),
        async execute(props) {
            const spec = props.spec as AgentSpec;
            const validationError = validateCreateSpec(spec);
            if (validationError) {
                return JSON.stringify({ success: false, error: validationError });
            }

            try {
                spec.ID = '';
                const sync = AgentSpecSync.FromRawSpec(spec, sessionContext.user);
                sync.markDirty();
                const result = await sync.SaveToDatabase();
                return JSON.stringify({
                    success: result.success,
                    agentId: result.agentId,
                    mutations: result.mutations
                });
            } catch (error) {
                return JSON.stringify({
                    success: false,
                    error: error instanceof Error ? error.message : String(error)
                });
            }
        }
    });
}

function registerUpdateAgentTool(addTool: AddToolFn, sessionContext: MCPSessionContext): void {
    addTool({
        name: 'Update_Agent',
        description: 'Update an existing AI agent from a complete AgentSpec JSON document (full replace: related records missing from the spec are removed). Fetch the current spec with Get_Agent_Spec, modify it, then pass it back with the ID intact. Returns every database mutation performed.',
        parameters: z.object({
            spec: z.record(z.unknown()).describe('Complete AgentSpec JSON document including the ID of the agent to update')
        }),
        scopeInfo: (props) => ({
            scopePath: 'agent:manage',
            resource: ((props.spec as Partial<AgentSpec> | undefined)?.Name) || '*'
        }),
        async execute(props) {
            const spec = props.spec as AgentSpec;
            const validationError = validateUpdateSpec(spec);
            if (validationError) {
                return JSON.stringify({ success: false, error: validationError });
            }

            try {
                // Confirm the target exists (and the session user can read it)
                // before running the full-replace save with its orphan cleanup.
                await AgentSpecSync.LoadFromDatabase(spec.ID, sessionContext.user, false);

                const sync = AgentSpecSync.FromRawSpec(spec, sessionContext.user);
                sync.markDirty();
                sync.markLoaded();
                const result = await sync.SaveToDatabase();
                return JSON.stringify({
                    success: result.success,
                    agentId: result.agentId,
                    mutations: result.mutations
                });
            } catch (error) {
                return JSON.stringify({
                    success: false,
                    error: error instanceof Error ? error.message : String(error)
                });
            }
        }
    });
}

function registerAgentTypeListTool(addTool: AddToolFn, sessionContext: MCPSessionContext): void {
    addTool({
        name: 'Get_Agent_Type_List',
        description: 'List available AI agent types (e.g. Loop for iterative LLM-driven agents, Flow for deterministic graph workflows). Use the returned IDs as TypeID in AgentSpec documents.',
        parameters: z.object({}),
        scopeInfo: { scopePath: 'agent:read', resource: '*' },
        async execute() {
            const aiEngine = AIEngine.Instance;
            await aiEngine.Config(false, sessionContext.user);
            return JSON.stringify(aiEngine.AgentTypes.map(t => ({
                id: t.ID,
                name: t.Name,
                description: t.Description || '',
                driverClass: t.DriverClass
            })));
        }
    });
}

function registerActionCatalogTool(addTool: AddToolFn, sessionContext: MCPSessionContext): void {
    addTool({
        name: 'Get_Action_Catalog',
        description: 'List available actions (tools agents can invoke) with id, name, description, and category. Use the returned IDs as ActionID values when wiring actions into AgentSpec documents. New actions can be built conversationally with the ActionSmith agent.',
        parameters: z.object({
            pattern: z.string().optional().default('*').describe('Name pattern to match actions (supports wildcards: *, prefix*, *suffix, *contains*)'),
            category: z.string().optional().describe('Filter by action category name (exact, case-insensitive)'),
            includeInactive: z.boolean().optional().default(false).describe('Include actions whose status is not Active')
        }),
        scopeInfo: { scopePath: 'action:read', resource: '*' },
        async execute(props) {
            const actionEngine = ActionEngineBase.Instance;
            await actionEngine.Config(false, sessionContext.user);

            const pattern = props.pattern as string;
            const category = props.category as string | undefined;
            const includeInactive = props.includeInactive as boolean;

            const actions = actionEngine.Actions
                .filter(a => matchesNamePattern(a.Name, pattern))
                .filter(a => includeInactive || a.Status === 'Active')
                .filter(a => !category || (a.Category || '').toLowerCase() === category.toLowerCase());

            return JSON.stringify(actions.map(action => ({
                id: action.ID,
                name: action.Name,
                description: action.Description || '',
                category: action.Category,
                type: action.Type,
                status: action.Status
            })));
        }
    });
}

/**
 * Registers standard Execute_<Name>_Agent tools for the configured builder
 * agents so they are always available to MCP clients, independent of the
 * pattern-driven `agentTools` configuration. Server-level duplicate guards
 * make this safe when a config entry also matches the same agent.
 */
function registerBuilderAgentTools(
    builderAgentNames: string[],
    registerAgentExecuteTool: (agent: MJAIAgentEntityExtended) => void
): void {
    for (const name of builderAgentNames) {
        const agent = AIEngine.Instance.Agents.find(
            a => a.Name?.toLowerCase() === name.toLowerCase()
        );
        if (agent) {
            registerAgentExecuteTool(agent);
        } else {
            console.warn(`[MCP] Builder agent '${name}' not found in metadata — skipping its execute tool`);
        }
    }
}

/**
 * Resolves an agent TypeID to the type's display name via the AIEngine cache.
 */
function resolveAgentTypeName(typeId: string | null): string | null {
    if (!typeId) {
        return null;
    }
    const type = AIEngine.Instance.AgentTypes.find(t => UUIDsEqual(t.ID, typeId));
    return type?.Name ?? null;
}
