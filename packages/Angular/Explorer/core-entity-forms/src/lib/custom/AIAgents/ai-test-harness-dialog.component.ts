import { Component, Input, Output, EventEmitter, OnInit, ViewChild } from '@angular/core';
import { AIAgentEntity } from '@memberjunction/core-entities';
import { Metadata } from '@memberjunction/core';
import { AITestHarnessComponent } from './ai-test-harness.component';

/**
 * Configuration data interface for the AI Agent Test Harness Dialog.
 * Provides all necessary options for initializing the dialog with appropriate
 * agent data, dimensions, and initial variable configurations.
 */
export interface AITestHarnessDialogData {
    /** ID of the AI agent to load (alternative to providing agent entity) */
    agentId?: string;
    /** Pre-loaded AI agent entity (alternative to providing agentId) */
    agent?: AIAgentEntity;
    /** Custom dialog title (defaults to agent name) */
    title?: string;
    /** Dialog width in CSS units or viewport percentage */
    width?: string | number;
    /** Dialog height in CSS units or viewport percentage */
    height?: string | number;
    /** Initial data context variables for agent execution */
    initialDataContext?: Record<string, any>;
    /** Initial template data variables for prompt rendering */
    initialTemplateData?: Record<string, any>;
}

/**
 * Dialog wrapper component for the AI Agent Test Harness.
 * Provides a modal dialog interface with proper sizing, header, and close functionality.
 * Automatically loads agent data and initializes the test harness with provided configuration.
 * 
 * ## Features:
 * - **Automatic Agent Loading**: Loads agent by ID or uses provided entity
 * - **Configurable Dimensions**: Supports custom dialog sizing
 * - **Initial Data Setup**: Pre-populates data context and template variables
 * - **Clean Dialog Interface**: Professional header with close button
 * - **Responsive Layout**: Adapts to content and screen size
 * 
 * ## Usage:
 * This component is typically opened through the `TestHarnessDialogService` rather than directly:
 * ```typescript
 * const dialogRef = this.testHarnessService.openAgentTestHarness({
 *   agentId: 'agent-123',
 *   initialDataContext: { userId: 'user-456' }
 * });
 * ```
 */
@Component({
    selector: 'mj-ai-test-harness-dialog',
    template: `
        <div class="test-harness-dialog">
            <div class="dialog-header">
                <h2>{{ title }}</h2>
                <button class="close-button" (click)="close()">
                    <i class="fa-solid fa-times"></i>
                </button>
            </div>
            <div class="dialog-content">
                <mj-ai-test-harness 
                    #testHarness
                    [aiAgent]="agent"
                    [isVisible]="true">
                </mj-ai-test-harness>
            </div>
        </div>
    `,
    styles: [`
        .test-harness-dialog {
            display: flex;
            flex-direction: column;
            height: 100%;
            width: 100%;
        }

        .dialog-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 16px 24px;
            border-bottom: 1px solid #e0e0e0;
            background-color: #f5f5f5;
        }

        .dialog-header h2 {
            margin: 0;
            font-size: 20px;
            font-weight: 500;
        }

        .close-button {
            position: relative;
            top: -4px;
            background: none;
            border: none;
            cursor: pointer;
            padding: 4px;
            display: flex;
            align-items: center;
            justify-content: center;
            border-radius: 4px;
            transition: background-color 0.2s;
        }
        
        .close-button:hover {
            background-color: rgba(0, 0, 0, 0.04);
        }

        .dialog-content {
            flex: 1;
            overflow: hidden;
            padding: 0;
        }

        :host ::ng-deep .test-harness-container {
            height: 100%;
        }
    `]
})
export class AITestHarnessDialogComponent implements OnInit {
    /** Reference to the embedded test harness component */
    @ViewChild('testHarness', { static: false }) testHarness!: AITestHarnessComponent;
    
    /** The loaded AI agent entity for testing */
    agent: AIAgentEntity | null = null;
    
    /** Display title for the dialog header */
    title: string = 'AI Agent Test Harness';
    
    /** Configuration data passed from the dialog service */
    @Input() data: AITestHarnessDialogData = {};
    
    /** Event emitted when the dialog should be closed */
    @Output() closeDialog = new EventEmitter<void>();
    
    /**
     * Initializes the dialog component by loading agent data and configuring
     * the embedded test harness with initial variables and settings.
     */
    async ngOnInit() {
        if (this.data.title) {
            this.title = this.data.title;
        }
        
        // Load agent if ID provided
        if (this.data.agentId && !this.data.agent) {
            const md = new Metadata();
            this.agent = await md.GetEntityObject<AIAgentEntity>('AI Agents');
            await this.agent.Load(this.data.agentId);
            
            if (this.agent) {
                this.title = `Test Harness: ${this.agent.Name}`;
            }
        } else if (this.data.agent) {
            this.agent = this.data.agent;
            this.title = `Test Harness: ${this.agent.Name}`;
        }
        
        // Wait for view to initialize then set initial data if provided
        setTimeout(() => {
            if (this.testHarness && this.data.initialDataContext) {
                // Convert initial data context to variables
                const variables = Object.entries(this.data.initialDataContext).map(([name, value]) => ({
                    name,
                    value: typeof value === 'object' ? JSON.stringify(value) : String(value),
                    type: this.detectVariableType(value)
                }));
                this.testHarness.agentVariables = variables;
            }
            
            if (this.testHarness && this.data.initialTemplateData) {
                // Add template data to the unified agent variables
                const templateVariables = Object.entries(this.data.initialTemplateData).map(([name, value]) => ({
                    name,
                    value: typeof value === 'object' ? JSON.stringify(value) : String(value),
                    type: this.detectVariableType(value)
                }));
                // Merge with existing agent variables
                this.testHarness.agentVariables = [...this.testHarness.agentVariables, ...templateVariables];
            }
        }, 100);
    }
    
    /**
     * Determines the appropriate variable type for initial data configuration.
     * @param value - The value to analyze for type detection
     * @returns The detected variable type
     * @private
     */
    private detectVariableType(value: any): 'string' | 'number' | 'boolean' | 'object' {
        if (typeof value === 'boolean') return 'boolean';
        if (typeof value === 'number') return 'number';
        if (typeof value === 'object') return 'object';
        return 'string';
    }
    
    /**
     * Closes the dialog by emitting the close event.
     * This method is called by the close button in the header.
     */
    close(): void {
        this.closeDialog.emit();
    }
}