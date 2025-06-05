import { LogError, Metadata, UserInfo } from '@memberjunction/core';
import { MJGlobal, RegisterClass } from '@memberjunction/global';
import { AIAgentEntityExtended } from '@memberjunction/core-entities';
import { AIEngine } from '@memberjunction/aiengine';
import { BaseAgent, IAgentFactory } from './base-agent';

/**
 * Factory class for creating and managing AI Agent instances.
 * 
 * This factory provides a centralized way to instantiate AI agents by loading their
 * metadata from the database and creating the appropriate agent class (either a
 * custom subclass or the base agent). It integrates with MemberJunction's ClassFactory
 * system to support dynamic agent class registration and instantiation.
 * 
 * This class can be subclassed and registered with a higher priority to override
 * the default factory behavior.
 * 
 * Example usage:
 * ```typescript
 * // Register a custom agent
 * @RegisterClass(BaseAgent, "Code")
 * export class WriteScriptAgent extends BaseAgent {
 *   // Custom implementation
 * }
 * 
 * // Create an agent instance using the global factory function
 * const factory = GetAgentFactory();
 * const agent = await factory.CreateAgent("Code", contextUser);
 * ```
 */
@RegisterClass(AgentFactory, null)
export class AgentFactory implements IAgentFactory {
  private _metadata: Metadata;

  constructor() {
    this._metadata = new Metadata();
  }

  /**
   * Creates an AI agent instance by name.
   * 
   * This method:
   * 1. Loads the AIAgentEntity metadata from the database by name
   * 2. Uses the ClassFactory to instantiate the appropriate agent class
   * 3. Falls back to BaseAgent if no custom subclass is registered
   * 
   * @param agentName The name of the agent as defined in the AIAgent entity
   * @param contextUser User context for database access and permissions
   * @param additionalParams Optional additional parameters to pass to the agent constructor
   * @returns Promise<BaseAgent> The instantiated agent, or null if the agent is not found
   * @throws Error if the agent cannot be loaded or instantiated
   */
  public async CreateAgent(
    agentName: string, 
    contextUser?: UserInfo,
    ...additionalParams: any[]
  ): Promise<BaseAgent | null> {
    try {
      if (!agentName || agentName.trim().length === 0) {
        throw new Error('Agent name is required');
      }

      // Load AI Engine to get access to agents metadata
      await AIEngine.Instance.Config(false, contextUser);

      // Find the agent by name
      const agentEntity = AIEngine.Instance.GetAgentByName(agentName.trim());
      if (!agentEntity) {
        LogError(`Agent with name '${agentName}' not found`);
        return null;
      }

      // Use ClassFactory to create the agent instance
      // The key is the agent name, which allows for agent-specific subclasses
      const agentInstance = MJGlobal.Instance.ClassFactory.CreateInstance<BaseAgent>(
        BaseAgent,
        agentEntity.Name,
        agentEntity,
        this, // Pass the factory instance
        contextUser,
        ...additionalParams
      );

      if (!agentInstance) {
        throw new Error(`Failed to create agent instance for '${agentName}'`);
      }

      return agentInstance;
    } catch (error) {
      LogError(`Error creating agent '${agentName}': ${error.message}`);
      throw error;
    }
  }

  /**
   * Creates an AI agent instance directly from an AIAgentEntity.
   * 
   * This is useful when you already have the agent entity loaded and want to avoid
   * the database lookup.
   * 
   * @param agentEntity The AIAgentEntity to create an agent from
   * @param additionalParams Optional additional parameters to pass to the agent constructor
   * @returns BaseAgent The instantiated agent
   * @throws Error if the agent cannot be instantiated
   */
  public CreateAgentFromEntity(
    agentEntity: AIAgentEntityExtended,
    ...additionalParams: any[]
  ): BaseAgent {
    try {
      if (!agentEntity) {
        throw new Error('Agent entity is required');
      }

      // Use ClassFactory to create the agent instance
      const agentInstance = MJGlobal.Instance.ClassFactory.CreateInstance<BaseAgent>(
        BaseAgent,
        agentEntity.Name,
        agentEntity,
        this, // Pass the factory instance
        ...additionalParams
      );

      if (!agentInstance) {
        throw new Error(`Failed to create agent instance for '${agentEntity.Name}'`);
      }

      return agentInstance;
    } catch (error) {
      LogError(`Error creating agent from entity '${agentEntity.Name}': ${error.message}`);
      throw error;
    }
  }

  /**
   * Lists all available agents from the metadata.
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
   * Gets agent metadata by name without instantiating the agent.
   * 
   * @param agentName The name of the agent
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

      await AIEngine.Instance.Config(false, contextUser);
      return AIEngine.Instance.GetAgentByName(agentName.trim());
    } catch (error) {
      LogError(`Error getting agent entity '${agentName}': ${error.message}`);
      return null;
    }
  }
}

/**
 * Helper function that gets an instance of the AgentFactory class or any registered subclass of AgentFactory.
 * This follows the MemberJunction pattern for using the global class factory to support extensibility.
 * 
 * @returns AgentFactory instance (or subclass instance if one is registered with higher priority)
 * @throws Error if the AgentFactory class cannot be instantiated
 */
export function GetAgentFactory(): AgentFactory {
  const factory = MJGlobal.Instance.ClassFactory.CreateInstance<AgentFactory>(AgentFactory);
  if (factory) {
    return factory;
  } else {
    throw new Error('Could not instantiate AgentFactory class');
  }
}

export function LoadAgentFactory() {
  // This function ensures the class isn't tree-shaken
}