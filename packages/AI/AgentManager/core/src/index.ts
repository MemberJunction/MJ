/**
 * @module @memberjunction/agent-manager-core
 *
 * Core interfaces and types for the MemberJunction Agent Manager system
 */

// Export all interfaces
export * from './old/agent-definition.interface';

export * from './agent-spec-sync';

// Export agent implementations
export * from './agents/architect-agent';
export * from './agents/builder-agent';
export * from './agents/planning-designer-agent';
export * from './agents/audio-sage-agent';

/**
 * Loads the Agent Manager Core module and ensures all agent classes are registered.
 * This function prevents tree shaking from removing the agent class registrations.
 *
 * The function itself doesn't need to do anything - importing the module is enough
 * to trigger the @RegisterClass decorators on AgentArchitectAgent, AgentBuilderAgent,
 * and PlanningDesignerAgent.
 */
export function LoadAgentManagerCore() {
    // Forces module to load and decorators to execute
    // Classes are already exported and decorators run on import
}

// Auto-load on import to ensure decorators execute
LoadAgentManagerCore();