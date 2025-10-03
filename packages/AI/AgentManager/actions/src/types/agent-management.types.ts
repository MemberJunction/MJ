import { ActionResultSimple } from "@memberjunction/actions-base";
import { AIAgentEntity, AIAgentTypeEntity } from "@memberjunction/core-entities";

/**
 * Result type for parameter extraction operations
 */
export interface ParameterResult<T> {
    value?: T;
    error?: ActionResultSimple;
}

/**
 * Result type for entity loading operations
 */
export interface EntityLoadResult<T> {
    entity?: T;
    error?: ActionResultSimple;
}

/**
 * Result type for agent loading operations
 */
export interface AgentLoadResult extends EntityLoadResult<AIAgentEntity> {
    agent?: AIAgentEntity;
}

/**
 * Result type for agent type validation operations
 */
export interface AgentTypeValidationResult extends EntityLoadResult<AIAgentTypeEntity> {
    type?: AIAgentTypeEntity;
}

/**
 * Result type for prompt creation operations
 */
export interface PromptCreationResult {
    success: boolean;
    promptId?: string;
    error?: string;
}

/**
 * Generic object parameter type with string keys
 */
export type ObjectParameter = Record<string, unknown>;