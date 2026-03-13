/**
 * Unit tests for Agent Type Prompt Parameters functionality.
 *
 * These tests verify the core logic for building and merging agent type prompt params:
 * - extractSchemaDefaults(): Extracts default values from JSON Schema
 * - buildAgentTypePromptParams(): Merges schema defaults, agent config, and runtime overrides
 *
 * @since 2.131.0
 */

import { describe, it, expect } from 'vitest';
import { LoopAgentTypePromptParams, DEFAULT_LOOP_AGENT_PROMPT_PARAMS, ResponseTypeInclusionRules, DEFAULT_RESPONSE_TYPE_INCLUSION_RULES } from '../agent-types/loop-agent-prompt-params';

// ============================================================================
// Test Helpers - Standalone implementations of the methods for testing
// These mirror the implementations in BaseAgent but without class dependencies
// ============================================================================

/**
 * Extracts default values from a JSON Schema definition.
 * Mirrors BaseAgent.extractSchemaDefaults()
 */
function extractSchemaDefaults(schemaJson: string | null | undefined): Record<string, unknown> {
    if (!schemaJson) return {};

    try {
        const schema = JSON.parse(schemaJson);
        const defaults: Record<string, unknown> = {};

        if (schema.properties) {
            for (const [key, prop] of Object.entries(schema.properties)) {
                const propDef = prop as { default?: unknown };
                if (propDef.default !== undefined) {
                    defaults[key] = propDef.default;
                }
            }
        }

        return defaults;
    } catch {
        return {};
    }
}

/**
 * Mock agent type entity for testing
 */
interface MockAgentType {
    ID: string;
    Name: string;
    PromptParamsSchema: string | null;
}

/**
 * Mock agent entity for testing
 */
interface MockAgent {
    ID: string;
    Name: string;
    TypeID: string;
    AgentTypePromptParams: string | null;
}

/**
 * Builds merged agent type prompt params from schema defaults,
 * agent config, and runtime overrides.
 * Mirrors BaseAgent.buildAgentTypePromptParams()
 */
function buildAgentTypePromptParams(
    agentType: MockAgentType | undefined,
    agent: MockAgent,
    runtimeOverrides?: Record<string, unknown>
): Record<string, unknown> {
    // 1. Extract defaults from schema
    const schemaDefaults = extractSchemaDefaults(agentType?.PromptParamsSchema);

    // 2. Parse agent-level config
    let agentParams: Record<string, unknown> = {};
    if (agent.AgentTypePromptParams) {
        try {
            agentParams = JSON.parse(agent.AgentTypePromptParams);
        } catch {
            // Silently handle parse errors (just like BaseAgent does)
        }
    }

    // 3. Merge all layers (lowest to highest precedence)
    const merged = {
        ...schemaDefaults,
        ...agentParams,
        ...(runtimeOverrides || {})
    };

    // 4. Apply auto-alignment for includeResponseTypeDefinition
    const explicitResponseType = (runtimeOverrides?.includeResponseTypeDefinition as Record<string, unknown> | undefined) ||
                                 (agentParams.includeResponseTypeDefinition as Record<string, unknown> | undefined);
    applyResponseTypeAutoAlignment(merged, explicitResponseType);

    return merged;
}

/**
 * Applies auto-alignment rules to includeResponseTypeDefinition based on other flags.
 * Mirrors BaseAgent.applyResponseTypeAutoAlignment()
 */
function applyResponseTypeAutoAlignment(
    params: Record<string, unknown>,
    explicitResponseType?: Record<string, unknown>
): void {
    // Ensure includeResponseTypeDefinition is an object
    if (!params.includeResponseTypeDefinition || typeof params.includeResponseTypeDefinition !== 'object') {
        params.includeResponseTypeDefinition = {
            payload: true,
            responseForms: true,
            commands: true,
            forEach: true,
            while: true
        };
    }

    const responseType = params.includeResponseTypeDefinition as Record<string, unknown>;

    // Auto-alignment mappings: docs flag -> response type property
    const alignmentMappings: Array<{ docsFlag: string; responseTypeKey: string }> = [
        { docsFlag: 'includePayloadInPrompt', responseTypeKey: 'payload' },
        { docsFlag: 'includeResponseFormDocs', responseTypeKey: 'responseForms' },
        { docsFlag: 'includeCommandDocs', responseTypeKey: 'commands' },
        { docsFlag: 'includeForEachDocs', responseTypeKey: 'forEach' },
        { docsFlag: 'includeWhileDocs', responseTypeKey: 'while' }
    ];

    for (const { docsFlag, responseTypeKey } of alignmentMappings) {
        const wasExplicitlySet = explicitResponseType &&
            Object.prototype.hasOwnProperty.call(explicitResponseType, responseTypeKey);

        if (params[docsFlag] === false && !wasExplicitlySet) {
            responseType[responseTypeKey] = false;
        }
        else if (responseType[responseTypeKey] === undefined) {
            responseType[responseTypeKey] = true;
        }
    }
}

// ============================================================================
// Sample Loop Agent Type Schema (matches the migration)
// ============================================================================

const LOOP_AGENT_TYPE_SCHEMA = JSON.stringify({
    "$schema": "http://json-schema.org/draft-07/schema#",
    "type": "object",
    "description": "Prompt parameters for Loop Agent Type.",
    "properties": {
        "includeResponseTypeDefinition": {
            "type": "object",
            "description": "Control response type definition inclusion.",
            "default": { "payload": true, "responseForms": true, "commands": true, "forEach": true, "while": true },
            "properties": {
                "payload": { "type": "boolean", "default": true },
                "responseForms": { "type": "boolean", "default": true },
                "commands": { "type": "boolean", "default": true },
                "forEach": { "type": "boolean", "default": true },
                "while": { "type": "boolean", "default": true }
            }
        },
        "includeForEachDocs": { "type": "boolean", "default": true, "description": "Include ForEach operation documentation." },
        "includeWhileDocs": { "type": "boolean", "default": true, "description": "Include While loop documentation." },
        "includeResponseFormDocs": { "type": "boolean", "default": true, "description": "Include response form documentation." },
        "includeCommandDocs": { "type": "boolean", "default": true, "description": "Include actionable commands documentation." },
        "includeMessageExpansionDocs": { "type": "boolean", "default": true, "description": "Include message expansion documentation." },
        "includeVariableRefsDocs": { "type": "boolean", "default": true, "description": "Include variable references documentation." },
        "includePayloadInPrompt": { "type": "boolean", "default": true, "description": "Include current payload state in prompt." },
        "maxSubAgentsInPrompt": { "type": "integer", "default": -1, "description": "Max sub-agents to include in prompt." },
        "maxActionsInPrompt": { "type": "integer", "default": -1, "description": "Max actions to include in prompt." }
    }
});

// ============================================================================
// Tests for extractSchemaDefaults
// ============================================================================

describe('extractSchemaDefaults', () => {
    it('null/undefined/empty input returns empty object', () => {
        expect(extractSchemaDefaults(null)).toEqual({});
        expect(extractSchemaDefaults(undefined)).toEqual({});
        expect(extractSchemaDefaults('')).toEqual({});
    });

    it('invalid JSON returns empty object', () => {
        expect(extractSchemaDefaults('not valid json')).toEqual({});
        expect(extractSchemaDefaults('{broken: json}')).toEqual({});
    });

    it('schema without properties returns empty object', () => {
        const schema = JSON.stringify({ "$schema": "http://json-schema.org/draft-07/schema#", "type": "object" });
        expect(extractSchemaDefaults(schema)).toEqual({});
    });

    it('schema with properties but no defaults returns empty object', () => {
        const schema = JSON.stringify({ "type": "object", "properties": { "name": { "type": "string" }, "count": { "type": "integer" } } });
        expect(extractSchemaDefaults(schema)).toEqual({});
    });

    it('schema with defaults extracts them', () => {
        const schema = JSON.stringify({
            "type": "object",
            "properties": {
                "enabled": { "type": "boolean", "default": true },
                "maxItems": { "type": "integer", "default": 100 },
                "name": { "type": "string" }
            }
        });
        expect(extractSchemaDefaults(schema)).toEqual({ enabled: true, maxItems: 100 });
    });

    it('Loop Agent Type schema extracts all defaults', () => {
        const defaults = extractSchemaDefaults(LOOP_AGENT_TYPE_SCHEMA);

        const responseTypeDef = defaults.includeResponseTypeDefinition as ResponseTypeInclusionRules;
        expect(responseTypeDef).toBeDefined();
        expect(responseTypeDef.payload).toBe(true);
        expect(responseTypeDef.responseForms).toBe(true);
        expect(responseTypeDef.commands).toBe(true);
        expect(responseTypeDef.forEach).toBe(true);
        expect(responseTypeDef.while).toBe(true);

        expect(defaults.includeForEachDocs).toBe(true);
        expect(defaults.includeWhileDocs).toBe(true);
        expect(defaults.includeResponseFormDocs).toBe(true);
        expect(defaults.includeCommandDocs).toBe(true);
        expect(defaults.includeMessageExpansionDocs).toBe(true);
        expect(defaults.includeVariableRefsDocs).toBe(true);
        expect(defaults.includePayloadInPrompt).toBe(true);
        expect(defaults.maxSubAgentsInPrompt).toBe(-1);
        expect(defaults.maxActionsInPrompt).toBe(-1);
    });
});

// ============================================================================
// Tests for buildAgentTypePromptParams
// ============================================================================

describe('buildAgentTypePromptParams', () => {
    it('no schema, no agent config, no runtime overrides', () => {
        const agentType: MockAgentType = { ID: 'type-1', Name: 'Test Type', PromptParamsSchema: null };
        const agent: MockAgent = { ID: 'agent-1', Name: 'Test Agent', TypeID: 'type-1', AgentTypePromptParams: null };

        const result = buildAgentTypePromptParams(agentType, agent, undefined);

        const responseTypeDef = result.includeResponseTypeDefinition as ResponseTypeInclusionRules;
        expect(responseTypeDef).toBeDefined();
        expect(responseTypeDef.payload).toBe(true);
        expect(responseTypeDef.responseForms).toBe(true);
        expect(responseTypeDef.commands).toBe(true);
        expect(responseTypeDef.forEach).toBe(true);
        expect(responseTypeDef.while).toBe(true);
    });

    it('schema defaults only', () => {
        const agentType: MockAgentType = { ID: 'type-1', Name: 'Loop', PromptParamsSchema: LOOP_AGENT_TYPE_SCHEMA };
        const agent: MockAgent = { ID: 'agent-1', Name: 'Test Agent', TypeID: 'type-1', AgentTypePromptParams: null };

        const result = buildAgentTypePromptParams(agentType, agent, undefined);

        expect(result.includeForEachDocs).toBe(true);
        expect(result.maxSubAgentsInPrompt).toBe(-1);
    });

    it('agent config overrides schema defaults', () => {
        const agentType: MockAgentType = { ID: 'type-1', Name: 'Loop', PromptParamsSchema: LOOP_AGENT_TYPE_SCHEMA };
        const agent: MockAgent = {
            ID: 'agent-1', Name: 'Optimized Agent', TypeID: 'type-1',
            AgentTypePromptParams: JSON.stringify({ includeForEachDocs: false, includeWhileDocs: false, maxActionsInPrompt: 5 })
        };

        const result = buildAgentTypePromptParams(agentType, agent, undefined);

        expect(result.includeForEachDocs).toBe(false);
        expect(result.includeWhileDocs).toBe(false);
        expect(result.maxActionsInPrompt).toBe(5);
        expect(result.includeResponseFormDocs).toBe(true);
        expect(result.includeCommandDocs).toBe(true);
        expect(result.maxSubAgentsInPrompt).toBe(-1);
    });

    it('runtime overrides agent config', () => {
        const agentType: MockAgentType = { ID: 'type-1', Name: 'Loop', PromptParamsSchema: LOOP_AGENT_TYPE_SCHEMA };
        const agent: MockAgent = {
            ID: 'agent-1', Name: 'Optimized Agent', TypeID: 'type-1',
            AgentTypePromptParams: JSON.stringify({ includeForEachDocs: false, includeWhileDocs: false })
        };
        const runtimeOverrides = { includeForEachDocs: true, includeCommandDocs: false };

        const result = buildAgentTypePromptParams(agentType, agent, runtimeOverrides);

        expect(result.includeForEachDocs).toBe(true);
        expect(result.includeCommandDocs).toBe(false);
        expect(result.includeWhileDocs).toBe(false);
        expect(result.includeResponseFormDocs).toBe(true);
    });

    it('invalid agent JSON handled gracefully', () => {
        const agentType: MockAgentType = { ID: 'type-1', Name: 'Loop', PromptParamsSchema: LOOP_AGENT_TYPE_SCHEMA };
        const agent: MockAgent = { ID: 'agent-1', Name: 'Bad Config Agent', TypeID: 'type-1', AgentTypePromptParams: 'not valid json' };

        const result = buildAgentTypePromptParams(agentType, agent, undefined);

        expect(result.includeForEachDocs).toBe(true);
        expect(result.maxSubAgentsInPrompt).toBe(-1);
    });

    it('undefined agentType handled gracefully', () => {
        const agent: MockAgent = {
            ID: 'agent-1', Name: 'Orphan Agent', TypeID: 'nonexistent-type',
            AgentTypePromptParams: JSON.stringify({ includeForEachDocs: false })
        };

        const result = buildAgentTypePromptParams(undefined, agent, undefined);

        expect(result.includeForEachDocs).toBe(false);
        expect(result.includeWhileDocs).toBeUndefined();
    });

    it('merge precedence (schema < agent < runtime)', () => {
        const agentType: MockAgentType = {
            ID: 'type-1', Name: 'Loop',
            PromptParamsSchema: JSON.stringify({
                "type": "object",
                "properties": {
                    "value1": { "type": "string", "default": "schema" },
                    "value2": { "type": "string", "default": "schema" },
                    "value3": { "type": "string", "default": "schema" }
                }
            })
        };
        const agent: MockAgent = {
            ID: 'agent-1', Name: 'Test Agent', TypeID: 'type-1',
            AgentTypePromptParams: JSON.stringify({ value2: "agent", value3: "agent" })
        };
        const runtimeOverrides = { value3: "runtime" };

        const result = buildAgentTypePromptParams(agentType, agent, runtimeOverrides);

        expect(result.value1).toBe("schema");
        expect(result.value2).toBe("agent");
        expect(result.value3).toBe("runtime");
    });
});

// ============================================================================
// Tests for DEFAULT_LOOP_AGENT_PROMPT_PARAMS constant
// ============================================================================

describe('DEFAULT_LOOP_AGENT_PROMPT_PARAMS', () => {
    it('matches schema defaults', () => {
        const schemaDefaults = extractSchemaDefaults(LOOP_AGENT_TYPE_SCHEMA);

        const defaultResponseType = DEFAULT_LOOP_AGENT_PROMPT_PARAMS.includeResponseTypeDefinition;
        const schemaResponseType = schemaDefaults.includeResponseTypeDefinition as ResponseTypeInclusionRules;

        expect(defaultResponseType.payload).toBe(schemaResponseType.payload);
        expect(defaultResponseType.responseForms).toBe(schemaResponseType.responseForms);
        expect(defaultResponseType.commands).toBe(schemaResponseType.commands);
        expect(defaultResponseType.forEach).toBe(schemaResponseType.forEach);
        expect(defaultResponseType.while).toBe(schemaResponseType.while);

        expect(DEFAULT_LOOP_AGENT_PROMPT_PARAMS.includeForEachDocs).toBe(schemaDefaults.includeForEachDocs);
        expect(DEFAULT_LOOP_AGENT_PROMPT_PARAMS.includeWhileDocs).toBe(schemaDefaults.includeWhileDocs);
        expect(DEFAULT_LOOP_AGENT_PROMPT_PARAMS.includeResponseFormDocs).toBe(schemaDefaults.includeResponseFormDocs);
        expect(DEFAULT_LOOP_AGENT_PROMPT_PARAMS.includeCommandDocs).toBe(schemaDefaults.includeCommandDocs);
        expect(DEFAULT_LOOP_AGENT_PROMPT_PARAMS.includeMessageExpansionDocs).toBe(schemaDefaults.includeMessageExpansionDocs);
        expect(DEFAULT_LOOP_AGENT_PROMPT_PARAMS.includeVariableRefsDocs).toBe(schemaDefaults.includeVariableRefsDocs);
        expect(DEFAULT_LOOP_AGENT_PROMPT_PARAMS.includePayloadInPrompt).toBe(schemaDefaults.includePayloadInPrompt);
        expect(DEFAULT_LOOP_AGENT_PROMPT_PARAMS.maxSubAgentsInPrompt).toBe(schemaDefaults.maxSubAgentsInPrompt);
        expect(DEFAULT_LOOP_AGENT_PROMPT_PARAMS.maxActionsInPrompt).toBe(schemaDefaults.maxActionsInPrompt);
    });
});

// ============================================================================
// Tests for Nunjucks template conditional pattern
// ============================================================================

describe('Nunjucks conditional pattern', () => {
    function simulateNunjucksCondition(value: boolean | undefined): boolean {
        return value !== false;
    }

    it('true != false => include section', () => {
        expect(simulateNunjucksCondition(true)).toBe(true);
    });

    it('false != false => exclude section', () => {
        expect(simulateNunjucksCondition(false)).toBe(false);
    });

    it('undefined != false => include section (backward compatible)', () => {
        expect(simulateNunjucksCondition(undefined)).toBe(true);
    });
});

// ============================================================================
// Backward compatibility tests
// ============================================================================

describe('Backward compatibility', () => {
    it('empty params includes all sections', () => {
        const agentType: MockAgentType = { ID: 'type-1', Name: 'Loop', PromptParamsSchema: LOOP_AGENT_TYPE_SCHEMA };
        const agent: MockAgent = { ID: 'agent-1', Name: 'Default Agent', TypeID: 'type-1', AgentTypePromptParams: null };

        const result = buildAgentTypePromptParams(agentType, agent, undefined);

        const booleanFlags = [
            'includeForEachDocs', 'includeWhileDocs', 'includeResponseFormDocs',
            'includeCommandDocs', 'includeMessageExpansionDocs', 'includeVariableRefsDocs',
            'includePayloadInPrompt'
        ];

        for (const flag of booleanFlags) {
            expect(result[flag]).toBe(true);
        }

        const responseTypeDef = result.includeResponseTypeDefinition as ResponseTypeInclusionRules;
        expect(responseTypeDef.payload).toBe(true);
        expect(responseTypeDef.responseForms).toBe(true);
        expect(responseTypeDef.commands).toBe(true);
        expect(responseTypeDef.forEach).toBe(true);
        expect(responseTypeDef.while).toBe(true);
    });
});

// ============================================================================
// Tests for Auto-Alignment Logic
// ============================================================================

describe('Auto-alignment', () => {
    it('docs flags auto-align response type sections', () => {
        const agentType: MockAgentType = { ID: 'type-1', Name: 'Loop', PromptParamsSchema: LOOP_AGENT_TYPE_SCHEMA };
        const agent: MockAgent = {
            ID: 'agent-1', Name: 'Minimal Agent', TypeID: 'type-1',
            AgentTypePromptParams: JSON.stringify({
                includeForEachDocs: false, includeWhileDocs: false,
                includeResponseFormDocs: false, includeCommandDocs: false
            })
        };

        const result = buildAgentTypePromptParams(agentType, agent, undefined);
        const responseTypeDef = result.includeResponseTypeDefinition as ResponseTypeInclusionRules;

        expect(responseTypeDef.forEach).toBe(false);
        expect(responseTypeDef.while).toBe(false);
        expect(responseTypeDef.responseForms).toBe(false);
        expect(responseTypeDef.commands).toBe(false);
        expect(responseTypeDef.payload).toBe(true);
    });

    it('explicit response type overrides auto-alignment', () => {
        const agentType: MockAgentType = { ID: 'type-1', Name: 'Loop', PromptParamsSchema: LOOP_AGENT_TYPE_SCHEMA };
        const agent: MockAgent = {
            ID: 'agent-1', Name: 'Override Agent', TypeID: 'type-1',
            AgentTypePromptParams: JSON.stringify({
                includeResponseTypeDefinition: { forEach: true, while: false },
                includeForEachDocs: false, includeWhileDocs: false
            })
        };

        const result = buildAgentTypePromptParams(agentType, agent, undefined);
        const responseTypeDef = result.includeResponseTypeDefinition as ResponseTypeInclusionRules;

        expect(responseTypeDef.forEach).toBe(true);
        expect(responseTypeDef.while).toBe(false);
        expect(responseTypeDef.payload).toBe(true);
        expect(responseTypeDef.responseForms).toBe(true);
        expect(responseTypeDef.commands).toBe(true);
    });
});
