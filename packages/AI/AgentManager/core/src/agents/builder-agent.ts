import { BaseAgent } from '@memberjunction/ai-agents';
import { ExecuteAgentParams, AgentConfiguration, BaseAgentNextStep, AgentSpec } from '@memberjunction/ai-core-plus';
import { RegisterClass } from '@memberjunction/global';
import { Metadata } from '@memberjunction/core';
import { AgentSpecSync } from '../agent-spec-sync';

/**
 * Builder Agent - Persists validated AgentSpec to database via AgentSpecSync
 *
 * This is a code-based agent that overrides executeAgentInternal to bypass
 * the normal chat loop and directly execute persistence logic. It receives
 * a validated AgentSpec from the Architect Agent and saves it to the database
 * using AgentSpecSync.
 *
 * Key responsibilities:
 * - Receive validated AgentSpec from payload
 * - Create AgentSpecSync instance
 * - Persist to database
 * - Return success with created agent ID, or failure with error details
 *
 * This agent does NOT iterate - it runs once and returns Success or Failed.
 */
@RegisterClass(BaseAgent, 'AgentBuilderAgent')
export class AgentBuilderAgent extends BaseAgent {

    /**
     * Override executeAgentInternal to run code instead of chat loop
     * This follows the Skip Code Generator pattern
     */
    protected override async executeAgentInternal<P = any>(
        params: ExecuteAgentParams<P>,
        _config: AgentConfiguration
    ): Promise<{ finalStep: BaseAgentNextStep<P>; stepCount: number }> {

        console.log('🔨 Builder Agent: Starting agent persistence...');

        try {
            // Extract AgentSpec from nested payload structure
            // The payload has structure: { metadata, requirements, design, agentSpec }
            const agentSpec = (params.payload as any).agentSpec as AgentSpec;

            if (!agentSpec) {
                throw new Error('No AgentSpec found in payload.agentSpec - ensure Architect Agent placed it there');
            }

            if (!agentSpec.Name) {
                throw new Error('AgentSpec is missing required Name field');
            }

            console.log(`🔨 Builder Agent: Creating agent "${agentSpec.Name}"...`);

            // Create AgentSpecSync instance
            const specSync = new AgentSpecSync(agentSpec, params.contextUser);

            // Mark as dirty to ensure it saves
            specSync.markDirty();

            // Save to database
            const agentId = await specSync.SaveToDatabase();

            // Refresh metadata cache to include newly created agents/prompts/steps
            console.log('🔄 Builder Agent: Refreshing metadata cache...');
            const md = new Metadata();
            await md.Refresh();
            console.log('✅ Builder Agent: Metadata cache refreshed');

            console.log(`✅ Builder Agent: Successfully created agent with ID: ${agentId}`);

            // Return success with the created agent ID
            const updatedSpec = { ...agentSpec, ID: agentId };

            return {
                finalStep: {
                    terminate: true,
                    step: 'Success',
                    reasoning: `Successfully created agent "${agentSpec.Name}" with ID: ${agentId}`,
                    newPayload: updatedSpec as P
                },
                stepCount: 1
            };

        } catch (error: any) {
            console.error('❌ Builder Agent: Failed to create agent:', error);

            // Return failure with error details
            return {
                finalStep: {
                    terminate: true,
                    step: 'Failed',
                    reasoning: `Failed to create agent: ${error?.message || String(error)}`
                },
                stepCount: 1
            };
        }
    }
}
