/**
 * @fileoverview Example demonstrating the Loop Agent Type with hierarchical prompts and system placeholders.
 * 
 * This example shows how to:
 * 1. Configure an agent with the Loop Agent Type
 * 2. Use system placeholders in prompts
 * 3. Execute the agent with hierarchical prompt composition
 * 4. Handle different next step outcomes
 * 
 * @module @memberjunction/ai-agents/examples
 */

import { BaseAgent } from '@memberjunction/ai-agents';
import { AIAgentEntity, AIAgentTypeEntity, AIPromptEntity } from '@memberjunction/core-entities';
import { UserInfo } from '@memberjunction/core';
import { ChatMessage, ChatMessageRole } from '@memberjunction/ai';
import { SystemPlaceholderManager } from '@memberjunction/ai-prompts';

// Example: Add a custom system placeholder
SystemPlaceholderManager.addPlaceholder({
    name: '_COMPANY_NAME',
    description: 'The company name for this deployment',
    getValue: async (params) => {
        // In a real app, this might come from configuration or user context
        return 'Acme Corporation';
    }
});

async function runLoopAgentExample() {
    // Mock entities - in real usage these would come from the database
    const loopAgentType: AIAgentTypeEntity = {
        ID: 'loop-type-id',
        Name: 'Loop',
        Description: 'Iterative execution until task completion',
        SystemPromptID: 'loop-system-prompt-id',
        IsActive: true,
        AgentPromptPlaceholder: 'agentResponse',
        DriverClass: 'LoopAgentType',
        // ... other properties
    } as AIAgentTypeEntity;

    const systemPrompt: AIPromptEntity = {
        ID: 'loop-system-prompt-id',
        Name: 'Loop Agent System Prompt',
        Description: 'System prompt for loop agent type',
        TemplateID: 'loop-template-id',
        OutputType: 'object',
        OutputExample: JSON.stringify({
            taskComplete: false,
            reasoning: "Analysis of current state",
            nextStep: { type: "continue", target: null, parameters: {} },
            result: {},
            progress: { percentage: 50, message: "Processing..." }
        }),
        Status: 'Active',
        // ... other properties
    } as AIPromptEntity;

    const agentPrompt: AIPromptEntity = {
        ID: 'customer-service-prompt-id',
        Name: 'Customer Service Agent Prompt',
        Description: 'Handles customer inquiries',
        TemplateID: 'cs-template-id',
        Status: 'Active',
        // Template would include placeholders like:
        // "You are a customer service agent for {{ _COMPANY_NAME }}."
        // "Current date: {{ _CURRENT_DATE }}"
        // "User: {{ _USER_NAME }}"
        // ... other properties
    } as AIPromptEntity;

    const customerServiceAgent: AIAgentEntity = {
        ID: 'cs-agent-id',
        Name: 'Customer Service Agent',
        Description: 'Handles customer support inquiries',
        TypeID: 'loop-type-id',
        Status: 'Active',
        // ... other properties
    } as AIAgentEntity;

    // Create conversation context
    const conversationMessages: ChatMessage[] = [
        {
            role: ChatMessageRole.user,
            content: "I need help with my recent order #12345"
        }
    ];

    // Create user context
    const contextUser: UserInfo = {
        ID: 'user-123',
        Name: 'John Doe',
        Email: 'john.doe@example.com',
        // ... other properties
    } as UserInfo;

    // Execute the agent
    const agent = new BaseAgent();
    
    try {
        console.log('Starting Loop Agent execution...');
        console.log(`Company: ${await SystemPlaceholderManager.getPlaceholder('_COMPANY_NAME')?.getValue({} as any)}`);
        
        const result = await agent.Execute({
            agent: customerServiceAgent,
            conversationMessages,
            contextUser
        });

        console.log('\nExecution completed!');
        console.log(`Next Step: ${result.nextStep}`);
        
        switch (result.nextStep) {
            case 'success':
                console.log('✅ Task completed successfully!');
                console.log('Result:', result.returnValue);
                break;
                
            case 'retry':
                console.log('🔄 Agent requests continuation');
                console.log('Raw response:', result.rawResult);
                // In a real loop, you would execute again with updated context
                break;
                
            case 'sub-agent':
                console.log('👥 Agent wants to delegate to sub-agent');
                // Handle sub-agent execution
                break;
                
            case 'action':
                console.log('⚡ Agent wants to execute an action');
                // Handle action execution
                break;
                
            case 'failed':
                console.log('❌ Execution failed:', result.errorMessage);
                break;
        }
        
    } catch (error) {
        console.error('Error executing agent:', error);
    }
}

// Example output from the hierarchical prompt execution:
/*
The system would:
1. Load the Loop Agent Type system prompt template
2. Execute the customer service agent prompt as a child
3. Inject system placeholders:
   - _COMPANY_NAME → "Acme Corporation"
   - _CURRENT_DATE → "2024-06-13"
   - _USER_NAME → "John Doe"
   - _OUTPUT_EXAMPLE → (the JSON structure)
4. The child prompt result gets injected into {{ agentResponse }}
5. The LoopAgentType parses the JSON response
6. Returns the appropriate next step

The prompts would be composed like:
- System Prompt (parent): "You are a Loop Agent... {{ agentResponse }} ... Respond with JSON..."
- Agent Prompt (child): "You are a customer service agent for Acme Corporation..."
*/

// Run the example
if (require.main === module) {
    runLoopAgentExample()
        .then(() => console.log('\nExample completed'))
        .catch(error => console.error('Example failed:', error));
}