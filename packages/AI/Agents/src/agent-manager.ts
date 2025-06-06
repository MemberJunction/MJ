import { LogError, Metadata, UserInfo } from '@memberjunction/core';
import { MJGlobal, RegisterClass } from '@memberjunction/global';
import { AIAgentEntityExtended } from '@memberjunction/core-entities';
import { AIAgentTypeEntityExtended } from '@memberjunction/ai-engine-base';
import { AIEngine } from '@memberjunction/aiengine';
import { AgentRunner } from './agent-runner';
import { ActionEngineServer } from '@memberjunction/actions';
import { TemplateEngineServer } from '@memberjunction/templates';

/**
 * Manager class for AI Agent entities and AgentRunner instances.
 * 
 * This manager provides centralized functionality for:
 * - Retrieving AIAgentEntity metadata from the database
 * - Instantiating AgentRunner instances using the MemberJunction ClassFactory system
 * - Managing the relationship between AIAgentType and AgentRunner subclasses
 * 
 * Unlike the previous AgentFactory, this class separates concerns:
 * - AgentManager handles entity retrieval and runner instantiation
 * - AgentRunner handles execution logic (similar to AIPromptRunner pattern)
 * - AIAgentEntity contains agent data/configuration
 * - AIAgentTypeEntity defines agent type and system prompts
 * 
 * Example usage:
 * ```typescript
 * // Get an agent entity by name
 * const manager = GetAgentManager();
 * const agentEntity = await manager.GetAgentEntity("My Customer Support Agent", contextUser);
 * 
 * // Get an agent runner for a specific type
 * const runner = await manager.GetAgentRunner("CustomerSupport", contextUser);
 * 
 * // Execute an agent
 * const result = await runner.Execute({
 *   agentEntity: agentEntity,
 *   contextUser: contextUser,
 *   data: { customerQuery: "Help me with my order" }
 * });
 * ```
 */
@RegisterClass(AgentManager, null)
export class AgentManager {
  private static BASE_AGENT_TYPE_NAME = "Base Agent";

  private _metadata: Metadata;

  constructor() {
    this._metadata = new Metadata();
  }

  /**
   * Gets an AIAgentEntity by name without instantiating a runner.
   * 
   * This method loads the agent metadata from the database and returns the entity
   * for use with AgentRunner.Execute().
   * 
   * @param agentName The name of the agent as defined in the AIAgent entity
   * @param contextUser User context for database access and permissions
   * @returns Promise<AIAgentEntityExtended | null> The agent entity or null if not found
   */
  public async GetAgentEntity(
    agentName: string, 
    contextUser?: UserInfo
  ): Promise<AIAgentEntityExtended | null> {
    try {
      if (!agentName || agentName.trim().length === 0) {
        return null;
      }

      // Load AI Engine to get access to agents metadata
      await AIEngine.Instance.Config(false, contextUser);

      // Find the agent by name
      const agentEntity = AIEngine.Instance.GetAgentByName(agentName.trim());
      return agentEntity;
    } catch (error) {
      LogError(`Error getting agent entity '${agentName}': ${error.message}`);
      return null;
    }
  }

  /**
   * Gets an AgentRunner instance for the specified agent type.
   * 
   * This method:
   * 1. Loads the AIAgentTypeEntity from the database by name
   * 2. Uses the ClassFactory to instantiate the appropriate AgentRunner subclass
   * 3. Falls back to base AgentRunner if no custom subclass is registered
   * 4. Validates that the agent type is compatible with the runner class
   * 
   * @param agentTypeName The name of the agent type (e.g., "Base Agent", "Customer Support", "Data Analysis")
   * @param contextUser User context for database access and permissions
   * @param additionalParams Optional additional parameters to pass to the runner constructor
   * @returns Promise<AgentRunner | null> The instantiated runner, or null if the agent type is not found
   * @throws Error if the agent type cannot be loaded or runner cannot be instantiated
   */
  public async GetAgentRunner(
    agentTypeName: string = AgentManager.BASE_AGENT_TYPE_NAME,
    contextUser?: UserInfo,
    key?: string,
    ...additionalParams: any[]
  ): Promise<AgentRunner | null> {
    try {
      if (!agentTypeName || agentTypeName.trim().length === 0) {
        agentTypeName = AgentManager.BASE_AGENT_TYPE_NAME; // Default to base agent type if not provided
      }

      if (!contextUser) {
        contextUser = this._metadata.CurrentUser; // Use current user from metadata if not provided
      }

      // Find the agent type by name
      const agentType = await this.GetAgentTypeEntity(agentTypeName.trim(), contextUser);
      if (!agentType) {
        LogError(`Agent type with name '${agentTypeName}' not found`);
        return null;
      }

      // Config all dependent engines to ensure they are loaded
      await AIEngine.Instance.Config(false, contextUser);
      await ActionEngineServer.Instance.Config(false, contextUser);
      await TemplateEngineServer.Instance.Config(false, contextUser);

      // Use ClassFactory to create the runner instance
      // The key is the agent type name, which allows for agent-type-specific subclasses
      const runnerInstance = MJGlobal.Instance.ClassFactory.CreateInstance<AgentRunner>(
        AgentRunner,
        key,            
        agentType,      // Pass the agent type entity
        contextUser,    // Pass the user context
        ...additionalParams
      );

      if (!runnerInstance) {
        throw new Error(`Failed to create agent runner instance for type '${agentTypeName}'`);
      }

      return runnerInstance;
    } catch (error) {
      LogError(`Error creating agent runner for type '${agentTypeName}': ${error.message}`);
      throw error;
    }
  }

  /**
   * Gets an AIAgentTypeEntity by name.
   * 
   * @param agentTypeName The name of the agent type
   * @param contextUser User context for database access and permissions
   * @returns Promise<AIAgentTypeEntityExtended | null> The agent type entity or null if not found
   */
  public async GetAgentTypeEntity(
    agentTypeName: string, 
    contextUser?: UserInfo
  ): Promise<AIAgentTypeEntityExtended | null> {
    try {
      if (!agentTypeName || agentTypeName.trim().length === 0) {
        return null;
      }

      await AIEngine.Instance.Config(false, contextUser);
      
      // Look for agent type by name
      const agentType = AIEngine.Instance.AgentTypes?.find(at => 
        at.Name.toLowerCase() === agentTypeName.trim().toLowerCase() && at.IsActive
      );
      
      return agentType || null;
    } catch (error) {
      LogError(`Error getting agent type entity '${agentTypeName}': ${error.message}`);
      return null;
    }
  }

  /**
   * Lists all available agent entities from the metadata.
   * 
   * @param contextUser User context for database access and permissions
   * @returns Promise<AIAgentEntityExtended[]> Array of all available agents
   */
  public async GetAvailableAgents(contextUser?: UserInfo): Promise<AIAgentEntityExtended[]> {
    try {
      // Load AI Engine to get access to agents metadata
      await AIEngine.Instance.Config(false, contextUser);
      return AIEngine.Instance.Agents;
    } catch (error) {
      LogError(`Error getting available agents: ${error.message}`);
      throw error;
    }
  }

  /**
   * Lists all available agent types from the metadata.
   * 
   * @param contextUser User context for database access and permissions
   * @returns Promise<AIAgentTypeEntityExtended[]> Array of all available agent types
   */
  public async GetAvailableAgentTypes(contextUser?: UserInfo): Promise<AIAgentTypeEntityExtended[]> {
    try {
      await AIEngine.Instance.Config(false, contextUser);
      return AIEngine.Instance.AgentTypes?.filter(at => at.IsActive) || [];
    } catch (error) {
      LogError(`Error getting available agent types: ${error.message}`);
      throw error;
    }
  }

  /**
   * Checks if an agent with the specified name exists.
   * 
   * @param agentName The name of the agent to check
   * @param contextUser User context for database access and permissions
   * @returns Promise<boolean> True if the agent exists, false otherwise
   */
  public async AgentExists(agentName: string, contextUser?: UserInfo): Promise<boolean> {
    try {
      if (!agentName || agentName.trim().length === 0) {
        return false;
      }

      await AIEngine.Instance.Config(false, contextUser);
      const agentEntity = AIEngine.Instance.GetAgentByName(agentName.trim());
      return agentEntity !== null && agentEntity !== undefined;
    } catch (error) {
      LogError(`Error checking if agent '${agentName}' exists: ${error.message}`);
      return false;
    }
  }

  /**
   * Checks if an agent type with the specified name exists.
   * 
   * @param agentTypeName The name of the agent type to check
   * @param contextUser User context for database access and permissions
   * @returns Promise<boolean> True if the agent type exists, false otherwise
   */
  public async AgentTypeExists(agentTypeName: string, contextUser?: UserInfo): Promise<boolean> {
    try {
      if (!agentTypeName || agentTypeName.trim().length === 0) {
        return false;
      }

      const agentType = await this.GetAgentTypeEntity(agentTypeName, contextUser);
      return agentType !== null;
    } catch (error) {
      LogError(`Error checking if agent type '${agentTypeName}' exists: ${error.message}`);
      return false;
    }
  }
}

/**
 * Helper function that gets an instance of the AgentManager class or any registered subclass of AgentManager.
 * This follows the MemberJunction pattern for using the global class factory to support extensibility.
 * 
 * @returns AgentManager instance (or subclass instance if one is registered with higher priority)
 * @throws Error if the AgentManager class cannot be instantiated
 */
export function GetAgentManager(): AgentManager {
  const manager = MJGlobal.Instance.ClassFactory.CreateInstance<AgentManager>(AgentManager);
  if (manager) {
    return manager;
  } else {
    throw new Error('Could not instantiate AgentManager class');
  }
}

export function LoadAgentManager() {
  // This function ensures the class isn't tree-shaken
}