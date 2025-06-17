// Example component showing how to use the Test Harness Dialog Service

import { Component } from '@angular/core';
import { TestHarnessDialogService } from '@memberjunction/ng-explorer-core';
import { AIAgentEntity, AIPromptEntity } from '@memberjunction/core-entities';
import { Metadata } from '@memberjunction/core';

@Component({
    selector: 'app-ai-dashboard',
    template: `
        <div class="ai-dashboard">
            <!-- Example 1: Simple button to open test harness by ID -->
            <button kendoButton (click)="testAgentById('agent-123-id')">
                Test Agent by ID
            </button>
            
            <!-- Example 2: Agent cards with test buttons -->
            <div class="agent-grid">
                <div class="agent-card" *ngFor="let agent of agents">
                    <h3>{{ agent.Name }}</h3>
                    <p>{{ agent.Description }}</p>
                    <button kendoButton look="flat" (click)="testAgent(agent)">
                        <span class="k-icon k-i-play"></span>
                        Test
                    </button>
                </div>
            </div>
            
            <!-- Example 3: Prompt list with test harness -->
            <kendo-grid [data]="prompts" [height]="400">
                <kendo-grid-column field="Name" title="Prompt Name"></kendo-grid-column>
                <kendo-grid-column field="Description" title="Description"></kendo-grid-column>
                <kendo-grid-column title="Actions" [width]="120">
                    <ng-template kendoGridCellTemplate let-dataItem>
                        <button kendoButton 
                                size="small" 
                                (click)="testPrompt(dataItem)">
                            Test
                        </button>
                    </ng-template>
                </kendo-grid-column>
            </kendo-grid>
        </div>
    `
})
export class AIDashboardComponent {
    agents: AIAgentEntity[] = [];
    prompts: AIPromptEntity[] = [];
    
    constructor(private testHarnessService: TestHarnessDialogService) {}
    
    // Example 1: Open test harness by agent ID
    testAgentById(agentId: string) {
        this.testHarnessService.openAgentById(agentId);
    }
    
    // Example 2: Open test harness with a loaded agent entity
    testAgent(agent: AIAgentEntity) {
        const dialogRef = this.testHarnessService.openAgentTestHarness({
            agent: agent,
            title: `Testing: ${agent.Name}`,
            width: '95vw',
            height: '90vh'
        });
        
        // Optional: Handle dialog close
        dialogRef.result.subscribe((result) => {
            console.log('Test harness closed', result);
        });
    }
    
    // Example 3: Open prompt test harness with initial data
    testPrompt(prompt: AIPromptEntity) {
        this.testHarnessService.openPromptTestHarness({
            prompt: prompt,
            initialTemplateVariables: {
                userName: 'Test User',
                context: 'Testing the prompt'
            },
            selectedModelId: 'gpt-4-model-id' // Pre-select a model
        });
    }
    
    // Example 4: Advanced usage with custom data context
    async testAgentWithContext() {
        // Load agent first
        const md = new Metadata();
        const agent = await md.GetEntityObject<AIAgentEntity>('AI Agents');
        await agent.Load('specific-agent-id');
        
        // Open with custom context
        this.testHarnessService.openAgentTestHarness({
            agent: agent,
            initialDataContext: {
                userId: '123',
                organizationId: '456',
                customData: {
                    department: 'Sales',
                    region: 'North America'
                }
            },
            initialTemplateData: {
                greeting: 'Hello from the test harness!',
                signature: 'Best regards'
            }
        });
    }
}

// Example from within a custom form component
export class CustomAIAgentFormComponent {
    record: AIAgentEntity;
    
    constructor(private testHarnessService: TestHarnessDialogService) {}
    
    testCurrentAgent() {
        if (this.record && this.record.ID) {
            this.testHarnessService.openAgentTestHarness({
                agent: this.record,
                title: `Test Harness: ${this.record.Name}`,
                width: 1400,  // Can use numbers for pixels
                height: 900
            });
        }
    }
}

// Example service that programmatically opens test harnesses
export class AITestingService {
    constructor(private testHarnessService: TestHarnessDialogService) {}
    
    async runAgentTest(agentId: string, testData: any) {
        const dialogRef = await this.testHarnessService.openAgentById(agentId);
        
        // The dialog ref gives you access to the component instance
        const componentInstance = dialogRef.content.instance;
        
        // You can interact with the dialog programmatically if needed
        dialogRef.result.subscribe((result) => {
            // Handle the result when dialog closes
            if (result) {
                console.log('Test completed', result);
            }
        });
    }
}