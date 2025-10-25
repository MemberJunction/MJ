/**
 * Agent Definition Interface for MemberJunction Agent Manager
 * 
 * This interface defines the complete structure for AI agents at any level
 * of hierarchy. All text fields support markdown formatting for rich documentation.
 * 
 * @module @memberjunction/agent-manager-core
 */

/**
 * Complete agent definition that supports n-levels of sub-agent hierarchy
 * All text fields support markdown formatting for rich documentation
 * @deprecated
 */
export interface AIAgentDefinition {
  // Basic Information
  name: string;
  description: string;
  readonly type: 'Loop'; // ONLY LOOP FOR NOW | 'Sequential' | 'Graph';
  purpose: string;
  
  // Actions this agent can use
  actions: {
    /** Action ID from the system action library */
    id: string;
    /** Human-readable name of the action */
    name: string;
    /** Justification for why this action is needed */
    reason: string;
  }[];
  
  // Prompt Configuration
  prompt: {
    /** System prompt for this agent */
    systemPrompt?: string;
    /** Template variables documentation */
    templateVariables?: string;
    /** Prompt analysis and notes */
    promptNotes?: string;
  };
  
  // Payload access control
  payloadDownstreamPaths?: string[];
  payloadUpstreamPaths?: string[];
  
  // Recursive sub-agents
  subAgents?: AIAgentDefinition[];
  
  // Execution configuration
  executionOrder?: number;
  exposeAsAction?: boolean;
  iconClass?: string;
  
  // Final payload validation
  finalPayloadValidation?: string; // JSON validation schema
  finalPayloadValidationMode?: 'Retry' | 'Fail' | 'Warn';
  finalPayloadValidationMaxRetries?: number;
}

/**
 * Root context for the Agent Manager that tracks the entire creation process
 */
export interface AIAgentManagerContext {
  // The main agent being created/edited
  agent: AIAgentDefinition;
  
  // Process tracking
  processStage: 'requirements' | 'design' | 'prompting' | 'implementation' | 'validation' | 'complete';
  
  // Session information
  session: {
    id: string;
    startedAt: string;
    userId: string;
    userName: string;
    purpose: string;
    notes: string;
  };
  
  // Validation results
  validation?: {
    isValid: boolean;
    report: string;
  };
}

/**
 * Agent Manager Payload Definition
 * This type defines the structure for data passed between Agent Manager sub-agents
 */
export interface AgentManagerPayload {
  /**
   * Metadata about the agent creation process
   */
  metadata: {
    /** Unique identifier for this agent creation session */
    sessionId: string;
    /** Current status of the agent creation process */
    status: 'requirements' | 'design' | 'prompting' | 'implementation' | 'validation' | 'complete';
    /** Original user request for agent creation */
    originalRequest: string;
    /** The agent who last modified the payload */
    lastModifiedBy: string;
  };

  /**
   * Requirements Analyst agent section
   */
  requirements?: {
    /** High-level business objective this agent will serve */
    businessGoal: string;
    /** Specific functional capabilities the agent must have */
    functionalRequirements: string;
    /** Technical constraints and requirements */
    technicalRequirements: string;
    /** Data sources and data handling requirements */
    dataRequirements: string;
    /** System integration requirements */
    integrationRequirements: string;
    /** Key assumptions made during requirements gathering */
    assumptions: string;
    /** Identified risks and mitigation strategies */
    risks: string;
    /** Explicitly defined scope boundaries */
    outOfScope: string;
    /** Measurable criteria for success */
    successCriteria: string;
  };

  /**
   * Planning Designer agent section
   */
  design?: {
    /** Complete agent hierarchy structure */
    agentHierarchy: AIAgentDefinition;
    /** Architecture documentation */
    architecture: {
      /** How agents will execute in sequence/parallel */
      executionFlow: string;
      /** How data flows between agents */
      dataFlow: string;
      /** Error handling and recovery strategies */
      errorHandling: string;
    };
  };

  /**
   * Prompt Designer agent section
   */
  prompts?: {
    /** Map of agent names to their prompt configurations */
    [agentName: string]: {
      /** Complete system prompt for the agent */
      systemPrompt: string;
      /** Documentation of template variables used */
      templateVariables: string;
      /** Analysis and optimization notes */
      promptNotes: string;
    };
  };

  /**
   * Agent Manager implementation section
   */
  implementation?: {
    /** Agents that have been created in the system */
    createdAgents: {
      /** Database ID of the created agent */
      id: string;
      /** Name of the agent */
      name: string;
      /** Current status of the agent */
      status: 'created' | 'configured' | 'validated' | 'active';
    }[];
    /** Validation results for the created agent system */
    validationResults: {
      /** ID of the agent that was validated */
      agentId: string;
      /** Whether the agent passed validation */
      isValid: boolean;
      /** Any issues found during validation */
      issues: string[];
    }[];
  };

  /**
   * Agent Loader section - for modification workflow
   * Contains the loaded agent when modifying an existing agent
   */
  loadedAgent?: {
    /** Full AgentSpec loaded from database with all nested structure */
    agentSpec: any; // AgentSpec type from CorePlus
    /** Copy of original spec for comparison during modification */
    originalSpec: any; // AgentSpec type from CorePlus
    /** When the agent was last modified in database */
    lastModified: string;
    /** Agent's current status */
    status: string;
  };

  /**
   * Modification Planner section - for modification workflow
   * Contains the detailed plan for modifying an existing agent
   */
  modificationPlan?: {
    /** High-level summary of all changes to be made */
    changeSummary: string;
    /** Fields that will be updated (field name -> old/new values) */
    fieldsToUpdate?: Record<string, { old: any; new: any }>;
    /** Actions to add (with action IDs from Find Candidate Actions) */
    actionsToAdd?: Array<{ id: string; name: string; reason: string }>;
    /** Action IDs to remove from the agent */
    actionsToRemove?: string[];
    /** Sub-agents modifications (add/remove/update) */
    subAgentsToModify?: Array<{
      operation: 'add' | 'remove' | 'update';
      subAgentName?: string;
      subAgentId?: string;
      details?: any;
    }>;
    /** Prompts to update or add */
    promptsToUpdate?: Array<{
      operation: 'add' | 'update' | 'remove';
      agentName: string;
      promptText?: string;
      promptRole?: string;
      promptPosition?: string;
    }>;
    /** Steps modifications for Flow agents only */
    stepsToModify?: Array<{
      operation: 'add' | 'remove' | 'update';
      stepName?: string;
      stepType?: string;
      details?: any;
    }>;
    /** Paths modifications for Flow agents only */
    pathsToModify?: Array<{
      operation: 'add' | 'remove' | 'update';
      from?: string;
      to?: string;
      details?: any;
    }>;
  };
}