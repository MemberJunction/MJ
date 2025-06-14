import { Injectable } from '@angular/core';
import { DialogService, DialogRef, DialogSettings } from '@progress/kendo-angular-dialog';
import { AIAgentEntity, AIPromptEntity } from '@memberjunction/core-entities';
import { AIAgentTestHarnessDialogComponent, AIAgentTestHarnessDialogData } from './AIAgents/ai-agent-test-harness-dialog.component';
import { AIPromptTestHarnessDialogComponent, AIPromptTestHarnessDialogData } from './AIPrompts/ai-prompt-test-harness-dialog.component';

/**
 * Service for managing test harness dialogs for AI Agents and AI Prompts.
 * Provides a centralized way to open test harness dialogs with customizable options
 * including dialog dimensions, initial data, and runtime configuration.
 * 
 * @example
 * ```typescript
 * // Open AI Agent test harness
 * const dialogRef = this.testHarnessService.openAgentTestHarness({
 *   agentId: 'agent-123',
 *   title: 'Test My Agent',
 *   initialDataContext: { user: 'john', role: 'admin' }
 * });
 * 
 * // Open AI Prompt test harness
 * const dialogRef = this.testHarnessService.openPromptTestHarness({
 *   promptId: 'prompt-456',
 *   selectedModelId: 'gpt-4',
 *   initialTemplateVariables: { name: 'Alice', context: 'demo' }
 * });
 * ```
 */
@Injectable({
    providedIn: 'root'
})
export class TestHarnessDialogService {
    /**
     * Creates a new TestHarnessDialogService instance.
     * @param dialogService - Kendo Angular dialog service for managing dialogs
     */
    constructor(private dialogService: DialogService) {}
    
    /**
     * Opens the AI Agent Test Harness in a dialog with comprehensive configuration options.
     * Supports both loading by agent ID or passing an existing agent entity.
     * 
     * @param options - Configuration options for the dialog
     * @param options.agentId - ID of the AI agent to load (alternative to agent parameter)
     * @param options.agent - Pre-loaded AI agent entity (alternative to agentId parameter)
     * @param options.title - Custom title for the dialog (defaults to agent name)
     * @param options.width - Dialog width (CSS units or viewport percentage, defaults to '90vw')
     * @param options.height - Dialog height (CSS units or viewport percentage, defaults to '90vh')
     * @param options.initialDataContext - Initial data context variables for agent execution
     * @param options.initialTemplateData - Initial template data variables for agent execution
     * @param options.preventClose - Whether to prevent dialog closure (currently unused)
     * @returns Reference to the opened dialog for further control
     * 
     * @example
     * ```typescript
     * // Load agent by ID with initial context
     * const dialogRef = this.openAgentTestHarness({
     *   agentId: 'agent-123',
     *   initialDataContext: { 
     *     userId: 'user-456',
     *     department: 'Engineering'
     *   },
     *   width: '80vw',
     *   height: '75vh'
     * });
     * 
     * // Use existing agent entity
     * const dialogRef = this.openAgentTestHarness({
     *   agent: myAgentEntity,
     *   title: 'Custom Test Session'
     * });
     * ```
     */
    openAgentTestHarness(options: {
        agentId?: string;
        agent?: AIAgentEntity;
        title?: string;
        width?: string | number;
        height?: string | number;
        initialDataContext?: Record<string, any>;
        initialTemplateData?: Record<string, any>;
        preventClose?: boolean;
    }): DialogRef {
        const data: AIAgentTestHarnessDialogData = {
            agentId: options.agentId,
            agent: options.agent,
            title: options.title,
            width: options.width || '90vw',
            height: options.height || '90vh',
            initialDataContext: options.initialDataContext,
            initialTemplateData: options.initialTemplateData
        };
        
        const dialogSettings: DialogSettings = {
            title: '',
            content: AIAgentTestHarnessDialogComponent,
            width: this.convertToNumber(data.width) || 1200,
            height: this.convertToNumber(data.height) || 800,
            minWidth: 800,
            minHeight: 600,
            autoFocusedElement: 'none',
            cssClass: 'test-harness-dialog-wrapper'
        };
        
        const dialogRef = this.dialogService.open(dialogSettings);
        
        // Pass data to the component instance
        const componentInstance = dialogRef.content.instance as AIAgentTestHarnessDialogComponent;
        componentInstance.data = data;
        componentInstance.closeDialog.subscribe(() => {
            dialogRef.close();
        });
        
        return dialogRef;
    }
    
    /**
     * Opens the AI Prompt Test Harness in a dialog with comprehensive configuration options.
     * Supports both loading by prompt ID or passing an existing prompt entity.
     * Automatically loads related template and template content for prompt testing.
     * 
     * @param options - Configuration options for the dialog
     * @param options.promptId - ID of the AI prompt to load (alternative to prompt parameter)
     * @param options.prompt - Pre-loaded AI prompt entity (alternative to promptId parameter)
     * @param options.title - Custom title for the dialog (defaults to prompt name)
     * @param options.width - Dialog width (CSS units or viewport percentage, defaults to '90vw')
     * @param options.height - Dialog height (CSS units or viewport percentage, defaults to '90vh')
     * @param options.initialTemplateVariables - Initial template variables for prompt rendering
     * @param options.selectedModelId - Pre-selected AI model ID for prompt execution
     * @param options.preventClose - Whether to prevent dialog closure (currently unused)
     * @returns Reference to the opened dialog for further control
     * 
     * @example
     * ```typescript
     * // Load prompt by ID with template variables
     * const dialogRef = this.openPromptTestHarness({
     *   promptId: 'prompt-123',
     *   selectedModelId: 'gpt-4',
     *   initialTemplateVariables: { 
     *     userName: 'John Doe',
     *     context: 'Customer support inquiry',
     *     priority: 'high'
     *   }
     * });
     * 
     * // Use existing prompt entity
     * const dialogRef = this.openPromptTestHarness({
     *   prompt: myPromptEntity,
     *   title: 'Test Marketing Prompt'
     * });
     * ```
     */
    openPromptTestHarness(options: {
        promptId?: string;
        prompt?: AIPromptEntity;
        title?: string;
        width?: string | number;
        height?: string | number;
        initialTemplateVariables?: Record<string, any>;
        selectedModelId?: string;
        preventClose?: boolean;
    }): DialogRef {
        const data: AIPromptTestHarnessDialogData = {
            promptId: options.promptId,
            prompt: options.prompt,
            title: options.title,
            width: options.width || '90vw',
            height: options.height || '90vh',
            initialTemplateVariables: options.initialTemplateVariables,
            selectedModelId: options.selectedModelId
        };
        
        const dialogSettings: DialogSettings = {
            title: '',
            content: AIPromptTestHarnessDialogComponent,
            width: this.convertToNumber(data.width) || 1200,
            height: this.convertToNumber(data.height) || 800,
            minWidth: 800,
            minHeight: 600,
            autoFocusedElement: 'none',
            cssClass: 'test-harness-dialog-wrapper'
        };
        
        const dialogRef = this.dialogService.open(dialogSettings);
        
        // Pass data to the component instance
        const componentInstance = dialogRef.content.instance as AIPromptTestHarnessDialogComponent;
        componentInstance.data = data;
        componentInstance.closeDialog.subscribe(() => {
            dialogRef.close();
        });
        
        return dialogRef;
    }
    
    /**
     * Convenience method to open an AI Agent Test Harness dialog using only the agent ID.
     * Uses default dialog dimensions and no initial data.
     * 
     * @param agentId - ID of the AI agent to test
     * @returns Promise resolving to the dialog reference
     * 
     * @example
     * ```typescript
     * const dialogRef = await this.testHarnessService.openAgentById('agent-123');
     * ```
     */
    async openAgentById(agentId: string): Promise<DialogRef> {
        return this.openAgentTestHarness({ agentId });
    }
    
    /**
     * Convenience method to open an AI Prompt Test Harness dialog using only the prompt ID.
     * Uses default dialog dimensions and no initial template variables.
     * 
     * @param promptId - ID of the AI prompt to test
     * @returns Promise resolving to the dialog reference
     * 
     * @example
     * ```typescript
     * const dialogRef = await this.testHarnessService.openPromptById('prompt-456');
     * ```
     */
    async openPromptById(promptId: string): Promise<DialogRef> {
        return this.openPromptTestHarness({ promptId });
    }
    
    /**
     * Helper method to convert string dimensions (including viewport units) to pixel numbers.
     * Supports viewport width (vw), viewport height (vh), pixels (px), and plain numbers.
     * 
     * @param value - Dimension value as string, number, or undefined
     * @returns Converted pixel value or undefined if conversion fails
     * 
     * @private
     * @example
     * ```typescript
     * convertToNumber('90vw')  // Returns ~1728 on 1920px screen
     * convertToNumber('500px') // Returns 500
     * convertToNumber(800)     // Returns 800
     * convertToNumber('auto')  // Returns undefined
     * ```
     */
    private convertToNumber(value: string | number | undefined): number | undefined {
        if (!value) return undefined;
        if (typeof value === 'number') return value;
        
        // Handle percentage values
        if (value.endsWith('vw') || value.endsWith('vh')) {
            const percentage = parseFloat(value) / 100;
            if (value.endsWith('vw')) {
                return window.innerWidth * percentage;
            } else {
                return window.innerHeight * percentage;
            }
        }
        
        // Handle pixel values
        if (value.endsWith('px')) {
            return parseFloat(value);
        }
        
        // Try to parse as number
        const parsed = parseFloat(value);
        return isNaN(parsed) ? undefined : parsed;
    }
}