/**
 * @fileoverview Agent type implementations for the MemberJunction AI Agent framework.
 * 
 * This module exports all available agent type implementations that extend
 * the BaseAgentType class. Each agent type defines a specific pattern for
 * agent execution and decision-making.
 * 
 * @module @memberjunction/ai-agents/agent-types
 * @author MemberJunction.com
 * @since 2.49.0
 */

export * from './LoopAgentType';

// Ensure classes are loaded and registered with the ClassFactory
import { LoadLoopAgentType } from './LoopAgentType';
LoadLoopAgentType();