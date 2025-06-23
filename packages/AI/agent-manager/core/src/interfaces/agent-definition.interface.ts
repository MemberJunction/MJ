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
 */
export interface AIAgentDefinition {
  // Basic Information
  name: string;
  description: string;
  readonly type: 'Loop' // ONLY LOOP FOR NOW | 'Sequential' | 'Graph';
  purpose: string;
  
  // Requirements & Specifications
  requirements: {
    businessGoal: string;
    functionalRequirements: string;
    technicalRequirements: string;
    dataRequirements: string;
    integrationRequirements: string;
    assumptions: string;
    risks: string;
    outOfScope: string;
  };
  
  successCriteria: string;
  
  // Design & Architecture
  design: {
    actions: [
      {
        id: string, // id of the action from the available actions in our system
        name: string, // name of the action
        reason: string // Why this action is needed
      }
    ];
    // Sub-Agents (recursive structure for n-level depth)
    subAgents?: AIAgentDefinition[];
  };
  
  // Prompt Configuration
  prompt: {
    systemPrompt: string;
    templateVariables: string;
    promptNotes: string;
  };
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