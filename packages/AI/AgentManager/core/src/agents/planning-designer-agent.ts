import { BaseAgent } from '@memberjunction/ai-agents';
import { ExecuteAgentParams, BaseAgentNextStep } from '@memberjunction/ai-core-plus';
import { AIAgentRunEntityExtended, AIAgentRunStepEntityExtended, AIAgentEntityExtended } from '@memberjunction/ai-core-plus';
import { RegisterClass } from '@memberjunction/global';
import { AIEngine } from '@memberjunction/aiengine';

/**
 * Planning Designer Agent - Designs agent architectures by researching existing capabilities
 *
 * This agent creates TechnicalDesign or modificationPlan by researching available
 * actions, agents, and database entities. It overrides validateSuccessNextStep to
 * enforce that required research actions are called before finalizing designs.
 *
 * Key responsibilities:
 * - Force discovery of existing agents before selecting actions
 * - Force discovery of available actions before designing
 * - Force database schema research for CRUD operations
 * - Prevent hallucination of non-existent entities/actions
 * - Ensure designs are research-backed, not assumption-based
 */
@RegisterClass(BaseAgent, 'AgentPlanningDesigner')
export class PlanningDesignerAgent extends BaseAgent {

    protected override async validateSuccessNextStep<P>(
        params: ExecuteAgentParams,
        nextStep: BaseAgentNextStep<P>,
        currentPayload: P,
        agentRun: AIAgentRunEntityExtended,
        currentStep: AIAgentRunStepEntityExtended
    ): Promise<BaseAgentNextStep<P>> {
        // 1. Call base validation first (checks MinExecutionsPerRun, FinalPayloadValidation)
        const baseValidation = await super.validateSuccessNextStep(params, nextStep, currentPayload, agentRun, currentStep);
        if (baseValidation.step === 'Retry') {
            return baseValidation;
        }

        // 2. Check if required research actions were called
        const researchViolations = await this.checkResearchRequirements(params.agent, agentRun, currentPayload);

        if (researchViolations.length > 0) {
            console.log('🚫 Planning Designer: Research requirements not met:', researchViolations);
            return {
                ...nextStep,
                step: 'Retry',
                retryInstructions: this.formatResearchViolations(researchViolations)
            };
        }

        console.log('✅ Planning Designer: All research requirements met');
        return nextStep;
    }

    /**
     * Checks if Planning Designer called required research actions/agents
     */
    protected async checkResearchRequirements(
        agent: AIAgentEntityExtended,
        agentRun: AIAgentRunEntityExtended,
        currentPayload: any
    ): Promise<string[]> {
        const violations: string[] = [];

        // Hardcoded IDs for required research capabilities (from metadata)
        const FIND_CANDIDATE_AGENTS_ACTION_ID = 'EF610103-E48D-4D9C-8DA2-1CF5B05F8AB6';
        const FIND_CANDIDATE_ACTIONS_ACTION_ID = 'FD932133-CB1D-4C96-8EFC-14F0C8CE045B';
        const DATABASE_RESEARCH_AGENT_ID = '746CD1E8-CB8D-49A4-BE69-D0F208A0B462';

        // Get execution counts using hardcoded IDs
        const findAgentsCount = await this.getActionExecutionCount(agentRun.ID, FIND_CANDIDATE_AGENTS_ACTION_ID);
        const findActionsCount = await this.getActionExecutionCount(agentRun.ID, FIND_CANDIDATE_ACTIONS_ACTION_ID);
        const dbResearchCount = await this.getSubAgentExecutionCount(agentRun.ID, DATABASE_RESEARCH_AGENT_ID);

        // Find Candidate Agents is MANDATORY (at least once)
        if (findAgentsCount === 0) {
            violations.push(`❌ MISSING: "Find Candidate Agents" action has NOT been called

**Purpose**: Discovers existing agents that can handle your subtasks as related subagents
**What it returns**: Agent IDs, names, descriptions, existing actions, and existing subAgents
**Why critical**: Existing specialized agents eliminate the need for multiple actions - one capable agent can replace several actions. You must search BEFORE selecting actions to avoid duplication.
**What to do**: Call "Find Candidate Agents" multiple times with different TaskDescriptions for each major subtask. Set ExcludeSubAgents=false to see ALL available agents. Review their actions and subAgents arrays to understand full capabilities.`);
        }

        // Find Candidate Actions is MANDATORY (at least once)
        if (findActionsCount === 0) {
            violations.push(`❌ MISSING: "Find Candidate Actions" action has NOT been called

**Purpose**: Discovers existing actions that can handle specific tasks (only use for tasks NOT covered by existing agents)
**What it returns**: Action IDs, names, parameters (inputs/outputs), and descriptions
**Why critical**: You cannot guess or make up action IDs - they must come from actual search results. Actions have specific parameter structures you need to understand.
**What to do**: Call "Find Candidate Actions" for each task that existing agents cannot handle. Use the exact action IDs and names from results in your design.`);
        }

        // Database Research Agent is REQUIRED if design mentions CRUD/database operations
        const designText = this.getDesignText(currentPayload);
        if (this.mentionsDatabaseOperations(designText)) {
            if (dbResearchCount === 0) {
                violations.push(`❌ MISSING: "Database Research Agent" sub-agent has NOT been called (but your design mentions database/CRUD operations)

**Purpose**: Provides actual entity names, field names, primary keys, data types, and relationships from the database schema
**What it returns**: Complete entity schema information written to payload.TechnicalDesign.databaseSchema
**Why critical**: NEVER guess entity or field names - they must come from Database Research Agent. CRUD actions require exact entity names and field names to work correctly.
**What to do**: Call Database Research Agent with specific questions like "Is there an entity called [NAME] or related to [CONCEPT]? Give me all fields." Review the results and use ONLY those exact entity/field names in your CRUD action designs.`);
            }
        }

        return violations;
    }

    /**
     * Extracts design text from payload (FunctionalRequirements, TechnicalDesign, or modificationPlan)
     */
    protected getDesignText(payload: any): string {
        if (!payload) {
            return '';
        }

        // Check all possible fields that might mention database operations:
        // - FunctionalRequirements (from Requirements Analyst - may mention data storage needs)
        // - TechnicalDesign (creation mode - the design document)
        // - modificationPlan (modification mode - the change plan)
        const functionalRequirements = payload.FunctionalRequirements || '';
        const technicalDesign = payload.TechnicalDesign || '';
        const modificationPlan = payload.modificationPlan || '';

        return (functionalRequirements + ' ' + technicalDesign + ' ' + modificationPlan).toLowerCase();
    }

    /**
     * Checks if text mentions database operations that require entity knowledge
     */
    protected mentionsDatabaseOperations(text: string): boolean {
        const keywords = [
            'create record',
            'update record',
            'delete record',
            'crud',
            'database',
            'entity',
            'save to',
            'store in',
            'persist',
            'write to database',
            'update priority',
            'create new record',
            'insert into',
            'entityname'
        ];

        return keywords.some(keyword => text.includes(keyword));
    }

    /**
     * Formats research violations into clear, actionable retry instructions
     */
    protected formatResearchViolations(violations: string[]): string {
        const header = '## Research Requirements Not Met\n\nYou must conduct thorough research before finalizing your design:\n\n';
        const violationList = violations.map((v, idx) => `${idx + 1}. ${v}`).join('\n\n');
        const footer = `\n\n---

**Next Steps - Complete Research Process**:

1. **Call each missing research action/agent listed above** (in order shown)

2. **Review research results carefully**:
   - "Find Candidate Agents": Check each agent's actions and subAgents arrays - if an agent can handle multiple subtasks, use it instead of individual actions
   - "Find Candidate Actions": Note the exact action IDs and parameter structures - you'll need these exact IDs in your design
   - "Database Research Agent": Copy the exact entity names and field names - use ONLY these in your CRUD action instructions

3. **Update your design based on actual research findings**:
   - Replace any guessed/assumed names with actual IDs and names from research
   - Remove redundant actions if subagents already provide those capabilities
   - Maximize reuse of existing agents to simplify your design
   - For CRUD actions: Include exact entity names and field names in the agent prompt

4. **Try again** - Your next response must include research-backed design (no assumptions!)`;

        return header + violationList + footer;
    }
}
