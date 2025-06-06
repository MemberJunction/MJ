import { BaseEntity } from '@memberjunction/core';
import { AIAgentTypeEntity, AIPromptEntityExtended } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';

@RegisterClass(BaseEntity, 'MJ: AI Agent Types')
export class AIAgentTypeEntityExtended extends AIAgentTypeEntity {
  private _systemPrompt: AIPromptEntityExtended | null = null;
  public get SystemPrompt(): AIPromptEntityExtended | null {
    return this._systemPrompt;
  }
  public set SystemPrompt(value: AIPromptEntityExtended | null) {
    if (value.ID !== this.SystemPromptID) {
      throw new Error(`Cannot set SystemPrompt to a different ID (${value.ID}) than the configured SystemPromptID (${this.SystemPromptID})`);
    }
    this._systemPrompt = value;
  }
  
  // /**
  //  * Cached reference to the system prompt entity for this agent type.
  //  * This is loaded lazily when first accessed and cached for subsequent use.
  //  */
  // private _systemPrompt: AIPromptEntity | null = null;
  
  // /**
  //  * Indicates whether the system prompt has been loaded and cached.
  //  */
  // private _systemPromptLoaded: boolean = false;

  // /**
  //  * Gets the system prompt entity for this agent type.
  //  * Loads and caches the prompt on first access.
  //  * 
  //  * @returns Promise<AIPromptEntity | null> The system prompt entity, or null if not found
  //  */
  // public async GetSystemPrompt(): Promise<AIPromptEntity | null> {
  //   if (!this._systemPromptLoaded) {
  //     await this.loadSystemPrompt();
  //   }
  //   return this._systemPrompt;
  // }

  // /**
  //  * Gets the system prompt template text for this agent type.
  //  * This is the rendered template content that can be used for LLM system messages.
  //  * 
  //  * @returns Promise<string> The system prompt template text, or a fallback prompt if not available
  //  */
  // public async GetSystemPromptTemplate(): Promise<string> {
  //   try {
  //     const systemPrompt = await this.GetSystemPrompt();
  //     if (!systemPrompt) {
  //       return this.getFallbackSystemPrompt();
  //     }

  //     // Get the template engine to load the prompt template
  //     const templateEngine = TemplateEngineServer.Instance;
  //     const template = templateEngine.FindTemplate(systemPrompt.Name);
      
  //     if (!template) {
  //       LogError(`Template not found for system prompt: ${systemPrompt.Name}`);
  //       return this.getFallbackSystemPrompt();
  //     }

  //     // Get the highest priority content
  //     const templateContent = template.GetHighestPriorityContent();
  //     if (!templateContent?.TemplateText) {
  //       LogError(`No template content found for system prompt: ${systemPrompt.Name}`);
  //       return this.getFallbackSystemPrompt();
  //     }

  //     return templateContent.TemplateText;
  //   } catch (error) {
  //     LogError(`Error loading system prompt template for agent type '${this.Name}': ${error.message}`);
  //     return this.getFallbackSystemPrompt();
  //   }
  // }

  // /**
  //  * Validates that this agent type is compatible with the given agent entity.
  //  * 
  //  * @param agentEntityTypeId The TypeID from an AIAgentEntity
  //  * @returns boolean True if compatible, false otherwise
  //  */
  // public IsCompatibleWithAgentEntity(agentEntityTypeId: string): boolean {
  //   return this.ID === agentEntityTypeId;
  // }

  // /**
  //  * Gets a descriptive name for this agent type that can be used in logging and error messages.
  //  * 
  //  * @returns string The display name for this agent type
  //  */
  // public GetDisplayName(): string {
  //   return this.Name || 'Unknown Agent Type';
  // }

  // /**
  //  * Checks if this agent type is properly configured and ready for use.
  //  * 
  //  * @returns Promise<boolean> True if the agent type is properly configured
  //  */
  // public async IsProperlyConfigured(): Promise<boolean> {
  //   try {
  //     // Check basic properties
  //     if (!this.IsActive) {
  //       return false;
  //     }

  //     // Verify system prompt is available
  //     const systemPrompt = await this.GetSystemPrompt();
  //     if (!systemPrompt) {
  //       LogStatus(`Agent type '${this.Name}' has no system prompt configured`);
  //       return true; // This is still valid, just using fallback
  //     }

  //     // Could add more validation logic here in the future
  //     return true;
  //   } catch (error) {
  //     LogError(`Error validating configuration for agent type '${this.Name}': ${error.message}`);
  //     return false;
  //   }
  // }

  // /**
  //  * Loads the system prompt from the database and caches it.
  //  * This is called automatically when the system prompt is first accessed.
  //  */
  // private async loadSystemPrompt(): Promise<void> {
  //   try {
  //     this._systemPromptLoaded = true; // Set this first to prevent infinite recursion
      
  //     if (!this.SystemPromptID) {
  //       LogStatus(`Agent type '${this.Name}' has no SystemPromptID configured`);
  //       this._systemPrompt = null;
  //       return;
  //     }

  //     // Find the system prompt in the AI Engine
  //     const systemPrompt = AIEngine.Instance.Prompts.find(p => p.ID === this.SystemPromptID);
  //     if (!systemPrompt) {
  //       LogError(`System prompt with ID '${this.SystemPromptID}' not found for agent type '${this.Name}'`);
  //       this._systemPrompt = null;
  //       return;
  //     }

  //     this._systemPrompt = systemPrompt;
  //     LogStatus(`Loaded system prompt '${systemPrompt.Name}' for agent type '${this.Name}'`);
  //   } catch (error) {
  //     LogError(`Error loading system prompt for agent type '${this.Name}': ${error.message}`);
  //     this._systemPrompt = null;
  //   }
  // }

  // /**
  //  * Gets a fallback system prompt when the configured prompt is not available.
  //  * 
  //  * @returns string A basic fallback system prompt
  //  */
  // private getFallbackSystemPrompt(): string {
  //   return `You are an AI agent of type "${this.Name}". ${this.Description || 'Please assist the user with their request.'}`;
  // }

  // /**
  //  * Clears the cached system prompt, forcing it to be reloaded on next access.
  //  * This can be useful when the system prompt has been updated in the database.
  //  */
  // public ClearSystemPromptCache(): void {
  //   this._systemPrompt = null;
  //   this._systemPromptLoaded = false;
  // }

  // // Future methods that could be added to delegate agent-type-specific behavior:
  
  // /**
  //  * TODO: Future method for agent-type-specific decision validation
  //  * 
  //  * public ValidateAgentDecision(decision: AgentDecisionResponse): boolean {
  //  *   // Agent type specific validation logic
  //  *   return true;
  //  * }
  //  */

  // /**
  //  * TODO: Future method for filtering available actions based on agent type
  //  * 
  //  * public FilterAvailableActions(actions: ActionDescription[]): ActionDescription[] {
  //  *   // Agent type specific action filtering
  //  *   return actions;
  //  * }
  //  */

  // /**
  //  * TODO: Future method for agent-type-specific context processing
  //  * 
  //  * public ProcessExecutionContext(context: AgentExecutionContext): AgentExecutionContext {
  //  *   // Agent type specific context processing
  //  *   return context;
  //  * }
  //  */
}