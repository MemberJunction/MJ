/**
 * Unit tests for Agent Type Prompt Parameters functionality.
 *
 * These tests verify the core logic for building and merging agent type prompt params:
 * - extractSchemaDefaults(): Extracts default values from JSON Schema
 * - buildAgentTypePromptParams(): Merges schema defaults, agent config, and runtime overrides
 *
 * To run these tests, you can use ts-node:
 *   npx ts-node src/__tests__/agent-type-prompt-params.test.ts
 *
 * @since 2.131.0
 */

import { LoopAgentTypePromptParams, DEFAULT_LOOP_AGENT_PROMPT_PARAMS } from '../agent-types/loop-agent-prompt-params';

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

    return merged;
}

// ============================================================================
// Test Framework (simple assertion-based)
// ============================================================================

let testsPassed = 0;
let testsFailed = 0;

function assert(condition: boolean, message: string): void {
    if (condition) {
        console.log(`  ✅ ${message}`);
        testsPassed++;
    } else {
        console.log(`  ❌ ${message}`);
        testsFailed++;
    }
}

function assertDeepEqual<T>(actual: T, expected: T, message: string): void {
    const actualStr = JSON.stringify(actual, null, 2);
    const expectedStr = JSON.stringify(expected, null, 2);
    if (actualStr === expectedStr) {
        console.log(`  ✅ ${message}`);
        testsPassed++;
    } else {
        console.log(`  ❌ ${message}`);
        console.log(`     Expected: ${expectedStr}`);
        console.log(`     Actual: ${actualStr}`);
        testsFailed++;
    }
}

function testGroup(name: string, fn: () => void): void {
    console.log(`\n📋 ${name}`);
    fn();
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
            "type": "boolean",
            "default": true,
            "description": "Include full LoopAgentResponse TypeScript definition."
        },
        "includeForEachDocs": {
            "type": "boolean",
            "default": true,
            "description": "Include ForEach operation documentation."
        },
        "includeWhileDocs": {
            "type": "boolean",
            "default": true,
            "description": "Include While loop documentation."
        },
        "includeResponseFormDocs": {
            "type": "boolean",
            "default": true,
            "description": "Include response form documentation."
        },
        "includeCommandDocs": {
            "type": "boolean",
            "default": true,
            "description": "Include actionable commands documentation."
        },
        "includeMessageExpansionDocs": {
            "type": "boolean",
            "default": true,
            "description": "Include message expansion documentation."
        },
        "includeVariableRefsDocs": {
            "type": "boolean",
            "default": true,
            "description": "Include variable references documentation."
        },
        "includePayloadInPrompt": {
            "type": "boolean",
            "default": true,
            "description": "Include current payload state in prompt."
        },
        "maxSubAgentsInPrompt": {
            "type": "integer",
            "default": -1,
            "description": "Max sub-agents to include in prompt."
        },
        "maxActionsInPrompt": {
            "type": "integer",
            "default": -1,
            "description": "Max actions to include in prompt."
        }
    }
});

// ============================================================================
// Tests for extractSchemaDefaults
// ============================================================================

testGroup('extractSchemaDefaults - null/undefined input', () => {
    assertDeepEqual(
        extractSchemaDefaults(null),
        {},
        'null input returns empty object'
    );
    assertDeepEqual(
        extractSchemaDefaults(undefined),
        {},
        'undefined input returns empty object'
    );
    assertDeepEqual(
        extractSchemaDefaults(''),
        {},
        'empty string returns empty object'
    );
});

testGroup('extractSchemaDefaults - invalid JSON', () => {
    assertDeepEqual(
        extractSchemaDefaults('not valid json'),
        {},
        'invalid JSON returns empty object'
    );
    assertDeepEqual(
        extractSchemaDefaults('{broken: json}'),
        {},
        'malformed JSON returns empty object'
    );
});

testGroup('extractSchemaDefaults - schema without properties', () => {
    const schema = JSON.stringify({
        "$schema": "http://json-schema.org/draft-07/schema#",
        "type": "object"
    });
    assertDeepEqual(
        extractSchemaDefaults(schema),
        {},
        'schema without properties returns empty object'
    );
});

testGroup('extractSchemaDefaults - schema with properties but no defaults', () => {
    const schema = JSON.stringify({
        "type": "object",
        "properties": {
            "name": { "type": "string" },
            "count": { "type": "integer" }
        }
    });
    assertDeepEqual(
        extractSchemaDefaults(schema),
        {},
        'properties without defaults return empty object'
    );
});

testGroup('extractSchemaDefaults - schema with defaults', () => {
    const schema = JSON.stringify({
        "type": "object",
        "properties": {
            "enabled": { "type": "boolean", "default": true },
            "maxItems": { "type": "integer", "default": 100 },
            "name": { "type": "string" }  // No default
        }
    });
    assertDeepEqual(
        extractSchemaDefaults(schema),
        { enabled: true, maxItems: 100 },
        'extracts defaults from properties that have them'
    );
});

testGroup('extractSchemaDefaults - Loop Agent Type schema', () => {
    const defaults = extractSchemaDefaults(LOOP_AGENT_TYPE_SCHEMA);

    assert(defaults.includeResponseTypeDefinition === true, 'includeResponseTypeDefinition defaults to true');
    assert(defaults.includeForEachDocs === true, 'includeForEachDocs defaults to true');
    assert(defaults.includeWhileDocs === true, 'includeWhileDocs defaults to true');
    assert(defaults.includeResponseFormDocs === true, 'includeResponseFormDocs defaults to true');
    assert(defaults.includeCommandDocs === true, 'includeCommandDocs defaults to true');
    assert(defaults.includeMessageExpansionDocs === true, 'includeMessageExpansionDocs defaults to true');
    assert(defaults.includeVariableRefsDocs === true, 'includeVariableRefsDocs defaults to true');
    assert(defaults.includePayloadInPrompt === true, 'includePayloadInPrompt defaults to true');
    assert(defaults.maxSubAgentsInPrompt === -1, 'maxSubAgentsInPrompt defaults to -1');
    assert(defaults.maxActionsInPrompt === -1, 'maxActionsInPrompt defaults to -1');
});

// ============================================================================
// Tests for buildAgentTypePromptParams
// ============================================================================

testGroup('buildAgentTypePromptParams - no schema, no agent config, no runtime overrides', () => {
    const agentType: MockAgentType = {
        ID: 'type-1',
        Name: 'Test Type',
        PromptParamsSchema: null
    };
    const agent: MockAgent = {
        ID: 'agent-1',
        Name: 'Test Agent',
        TypeID: 'type-1',
        AgentTypePromptParams: null
    };

    const result = buildAgentTypePromptParams(agentType, agent, undefined);

    assertDeepEqual(result, {}, 'returns empty object when nothing is configured');
});

testGroup('buildAgentTypePromptParams - schema defaults only', () => {
    const agentType: MockAgentType = {
        ID: 'type-1',
        Name: 'Loop',
        PromptParamsSchema: LOOP_AGENT_TYPE_SCHEMA
    };
    const agent: MockAgent = {
        ID: 'agent-1',
        Name: 'Test Agent',
        TypeID: 'type-1',
        AgentTypePromptParams: null
    };

    const result = buildAgentTypePromptParams(agentType, agent, undefined);

    assert(result.includeForEachDocs === true, 'includeForEachDocs from schema default');
    assert(result.maxSubAgentsInPrompt === -1, 'maxSubAgentsInPrompt from schema default');
});

testGroup('buildAgentTypePromptParams - agent config overrides schema defaults', () => {
    const agentType: MockAgentType = {
        ID: 'type-1',
        Name: 'Loop',
        PromptParamsSchema: LOOP_AGENT_TYPE_SCHEMA
    };
    const agent: MockAgent = {
        ID: 'agent-1',
        Name: 'Optimized Agent',
        TypeID: 'type-1',
        AgentTypePromptParams: JSON.stringify({
            includeForEachDocs: false,
            includeWhileDocs: false,
            maxActionsInPrompt: 5
        })
    };

    const result = buildAgentTypePromptParams(agentType, agent, undefined);

    // Overridden by agent config
    assert(result.includeForEachDocs === false, 'includeForEachDocs overridden to false');
    assert(result.includeWhileDocs === false, 'includeWhileDocs overridden to false');
    assert(result.maxActionsInPrompt === 5, 'maxActionsInPrompt overridden to 5');

    // Still from schema defaults
    assert(result.includeResponseFormDocs === true, 'includeResponseFormDocs still from schema default');
    assert(result.includeCommandDocs === true, 'includeCommandDocs still from schema default');
    assert(result.maxSubAgentsInPrompt === -1, 'maxSubAgentsInPrompt still from schema default');
});

testGroup('buildAgentTypePromptParams - runtime overrides agent config', () => {
    const agentType: MockAgentType = {
        ID: 'type-1',
        Name: 'Loop',
        PromptParamsSchema: LOOP_AGENT_TYPE_SCHEMA
    };
    const agent: MockAgent = {
        ID: 'agent-1',
        Name: 'Optimized Agent',
        TypeID: 'type-1',
        AgentTypePromptParams: JSON.stringify({
            includeForEachDocs: false,
            includeWhileDocs: false
        })
    };
    const runtimeOverrides = {
        includeForEachDocs: true,  // Override agent config back to true
        includeCommandDocs: false  // Override schema default
    };

    const result = buildAgentTypePromptParams(agentType, agent, runtimeOverrides);

    // Runtime override
    assert(result.includeForEachDocs === true, 'includeForEachDocs runtime override to true');
    assert(result.includeCommandDocs === false, 'includeCommandDocs runtime override to false');

    // Agent config (not overridden at runtime)
    assert(result.includeWhileDocs === false, 'includeWhileDocs from agent config');

    // Schema default (not overridden)
    assert(result.includeResponseFormDocs === true, 'includeResponseFormDocs from schema default');
});

testGroup('buildAgentTypePromptParams - invalid agent JSON handled gracefully', () => {
    const agentType: MockAgentType = {
        ID: 'type-1',
        Name: 'Loop',
        PromptParamsSchema: LOOP_AGENT_TYPE_SCHEMA
    };
    const agent: MockAgent = {
        ID: 'agent-1',
        Name: 'Bad Config Agent',
        TypeID: 'type-1',
        AgentTypePromptParams: 'not valid json'  // Invalid JSON
    };

    const result = buildAgentTypePromptParams(agentType, agent, undefined);

    // Should fall back to schema defaults
    assert(result.includeForEachDocs === true, 'falls back to schema default when agent config invalid');
    assert(result.maxSubAgentsInPrompt === -1, 'falls back to schema default for integer');
});

testGroup('buildAgentTypePromptParams - undefined agentType handled gracefully', () => {
    const agent: MockAgent = {
        ID: 'agent-1',
        Name: 'Orphan Agent',
        TypeID: 'nonexistent-type',
        AgentTypePromptParams: JSON.stringify({
            includeForEachDocs: false
        })
    };

    const result = buildAgentTypePromptParams(undefined, agent, undefined);

    // Should use agent config since no schema
    assert(result.includeForEachDocs === false, 'uses agent config when agentType undefined');
    assert(result.includeWhileDocs === undefined, 'no default when agentType undefined');
});

testGroup('buildAgentTypePromptParams - merge precedence (schema < agent < runtime)', () => {
    const agentType: MockAgentType = {
        ID: 'type-1',
        Name: 'Loop',
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
        ID: 'agent-1',
        Name: 'Test Agent',
        TypeID: 'type-1',
        AgentTypePromptParams: JSON.stringify({
            value2: "agent",
            value3: "agent"
        })
    };
    const runtimeOverrides = {
        value3: "runtime"
    };

    const result = buildAgentTypePromptParams(agentType, agent, runtimeOverrides);

    assert(result.value1 === "schema", 'value1 from schema (not overridden)');
    assert(result.value2 === "agent", 'value2 from agent (overrides schema)');
    assert(result.value3 === "runtime", 'value3 from runtime (overrides agent and schema)');
});

// ============================================================================
// Tests for DEFAULT_LOOP_AGENT_PROMPT_PARAMS constant
// ============================================================================

testGroup('DEFAULT_LOOP_AGENT_PROMPT_PARAMS matches schema defaults', () => {
    const schemaDefaults = extractSchemaDefaults(LOOP_AGENT_TYPE_SCHEMA);

    // Verify the constant matches what we'd extract from the schema
    assert(
        DEFAULT_LOOP_AGENT_PROMPT_PARAMS.includeResponseTypeDefinition === schemaDefaults.includeResponseTypeDefinition,
        'includeResponseTypeDefinition matches'
    );
    assert(
        DEFAULT_LOOP_AGENT_PROMPT_PARAMS.includeForEachDocs === schemaDefaults.includeForEachDocs,
        'includeForEachDocs matches'
    );
    assert(
        DEFAULT_LOOP_AGENT_PROMPT_PARAMS.includeWhileDocs === schemaDefaults.includeWhileDocs,
        'includeWhileDocs matches'
    );
    assert(
        DEFAULT_LOOP_AGENT_PROMPT_PARAMS.includeResponseFormDocs === schemaDefaults.includeResponseFormDocs,
        'includeResponseFormDocs matches'
    );
    assert(
        DEFAULT_LOOP_AGENT_PROMPT_PARAMS.includeCommandDocs === schemaDefaults.includeCommandDocs,
        'includeCommandDocs matches'
    );
    assert(
        DEFAULT_LOOP_AGENT_PROMPT_PARAMS.includeMessageExpansionDocs === schemaDefaults.includeMessageExpansionDocs,
        'includeMessageExpansionDocs matches'
    );
    assert(
        DEFAULT_LOOP_AGENT_PROMPT_PARAMS.includeVariableRefsDocs === schemaDefaults.includeVariableRefsDocs,
        'includeVariableRefsDocs matches'
    );
    assert(
        DEFAULT_LOOP_AGENT_PROMPT_PARAMS.includePayloadInPrompt === schemaDefaults.includePayloadInPrompt,
        'includePayloadInPrompt matches'
    );
    assert(
        DEFAULT_LOOP_AGENT_PROMPT_PARAMS.maxSubAgentsInPrompt === schemaDefaults.maxSubAgentsInPrompt,
        'maxSubAgentsInPrompt matches'
    );
    assert(
        DEFAULT_LOOP_AGENT_PROMPT_PARAMS.maxActionsInPrompt === schemaDefaults.maxActionsInPrompt,
        'maxActionsInPrompt matches'
    );
});

// ============================================================================
// Tests for Nunjucks template conditional pattern
// ============================================================================

testGroup('Nunjucks conditional pattern: != false defaults to include', () => {
    // This test verifies the pattern used in the template: {% if param != false %}
    // When param is undefined, the condition should evaluate to true (include section)

    function simulateNunjucksCondition(value: boolean | undefined): boolean {
        // Nunjucks: {% if value != false %} => include section
        return value !== false;
    }

    assert(
        simulateNunjucksCondition(true) === true,
        'true != false => include section'
    );
    assert(
        simulateNunjucksCondition(false) === false,
        'false != false => exclude section'
    );
    assert(
        simulateNunjucksCondition(undefined) === true,
        'undefined != false => include section (backward compatible)'
    );
});

testGroup('Backward compatibility: empty params includes all sections', () => {
    // When an agent has no AgentTypePromptParams configured,
    // all sections should be included (all booleans should be treated as true)

    const agentType: MockAgentType = {
        ID: 'type-1',
        Name: 'Loop',
        PromptParamsSchema: LOOP_AGENT_TYPE_SCHEMA
    };
    const agent: MockAgent = {
        ID: 'agent-1',
        Name: 'Default Agent',
        TypeID: 'type-1',
        AgentTypePromptParams: null  // No customization
    };

    const result = buildAgentTypePromptParams(agentType, agent, undefined);

    // All boolean flags should be true (include all sections)
    const booleanFlags = [
        'includeResponseTypeDefinition',
        'includeForEachDocs',
        'includeWhileDocs',
        'includeResponseFormDocs',
        'includeCommandDocs',
        'includeMessageExpansionDocs',
        'includeVariableRefsDocs',
        'includePayloadInPrompt'
    ];

    for (const flag of booleanFlags) {
        assert(
            result[flag] === true,
            `${flag} should be true for backward compatibility`
        );
    }
});

// ============================================================================
// Test Summary
// ============================================================================

console.log('\n' + '='.repeat(60));
console.log(`📊 Test Results: ${testsPassed} passed, ${testsFailed} failed`);
console.log('='.repeat(60));

if (testsFailed > 0) {
    process.exit(1);
}
