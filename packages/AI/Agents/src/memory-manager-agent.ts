import { BaseAgent } from './base-agent';
import { UserInfo, Metadata, RunView, LogError, LogStatus } from '@memberjunction/core';
import {
    ConversationDetailEntity,
    AIAgentRunEntity,
    AIAgentNoteEntity,
    AIAgentExampleEntity
} from '@memberjunction/core-entities';
import { AIPromptRunner } from '@memberjunction/ai-prompts';
import { AIPromptParams, ExecuteAgentParams, AgentConfiguration, BaseAgentNextStep, AIAgentEntityExtended } from '@memberjunction/ai-core-plus';
import { AIEngine } from '@memberjunction/aiengine';

/**
 * Extracted note from conversation/agent run analysis
 */
interface ExtractedNote {
    type: 'Preference' | 'Constraint' | 'Context' | 'Example' | 'Issue';
    noteTypeId: string;
    agentId?: string;
    userId?: string;
    companyId?: string;
    content: string;
    confidence: number;
    sourceConversationId?: string;
    sourceConversationDetailId?: string;
    sourceAgentRunId?: string;
    mergeWithExistingId?: string; // If should update existing note
}

/**
 * Extracted example from conversation/agent run analysis
 */
interface ExtractedExample {
    type: 'Preference' | 'Constraint' | 'Context' | 'Example' | 'Issue';
    agentId: string;
    userId?: string;
    companyId?: string;
    exampleInput: string;
    exampleOutput: string;
    successScore: number;
    confidence: number;
    sourceConversationId?: string;
    sourceConversationDetailId?: string;
    sourceAgentRunId?: string;
}

/**
 * Memory Manager Agent - automatically extracts notes and examples from conversations.
 * This agent runs on a schedule (every 15 minutes) and analyzes high-quality conversations
 * and agent runs to extract learnings and example interactions.
 */
export class MemoryManagerAgent extends BaseAgent {
    /**
     * Get the last run timestamp for this agent to determine what to process.
     * For first run, returns null to process all history (limited by MaxRows).
     */
    private async GetLastRunTime(agentId: string, contextUser: UserInfo): Promise<Date | null> {
        const rv = new RunView();
        const result = await rv.RunView<AIAgentRunEntity>({
            EntityName: 'MJ: AI Agent Runs',
            ExtraFilter: `AgentID='${agentId}' AND Status='Success'`,
            OrderBy: 'StartedAt DESC',
            MaxRows: 1,
            ResultType: 'entity_object'
        }, contextUser);

        if (result.Success && result.Results && result.Results.length > 0) {
            return result.Results[0].StartedAt;
        }

        // First run - return null to process all history (with MaxRows limit)
        return null;
    }

    /**
     * Load agents that have note or example injection enabled.
     * Only extract notes/examples for agents that actually use these features.
     */
    private async LoadAgentsUsingMemory(contextUser: UserInfo): Promise<AIAgentEntityExtended[]> {
        const filteredAgents = AIEngine.Instance.Agents.filter(a => a.Status === 'Active' && (a.InjectNotes || a.InjectExamples));

        return filteredAgents;
    }

    /**
     * Load conversation details with high ratings since last run.
     * Uses efficient subquery to avoid multiple database round-trips.
     * Filters to only completed conversation details with user->AI pairs.
     * Only loads details for agents that have memory injection enabled.
     */
    private async LoadHighQualityConversationDetails(
        since: Date | null,
        agentsUsingMemory: AIAgentEntityExtended[],
        contextUser: UserInfo
    ): Promise<ConversationDetailEntity[]> {
        if (agentsUsingMemory.length === 0) {
            LogStatus('Memory Manager: No agents have memory injection enabled - skipping');
            return [];
        }

        const rv = new RunView();

        // Build filter with subquery for high ratings
        const sinceFilter = since ? `AND cd.__mj_CreatedAt >= '${since.toISOString()}'` : '';

        // Filter to only agents that use memory
        const agentIdFilter = agentsUsingMemory.map(a => `'${a.ID}'`).join(',');

        const filter = `
            Status = 'Complete'
            AND Role = 'AI'
            ${sinceFilter}
            AND EXISTS (
                SELECT 1 FROM ConversationDetailRating cdr
                WHERE cdr.ConversationDetailID = cd.ID
                AND cdr.Rating >= 8
            )
            AND EXISTS (
                SELECT 1 FROM AIAgentRun ar
                WHERE ar.ConversationID = cd.ConversationID
                AND ar.AgentID IN (${agentIdFilter})
            )
        `.trim().replace(/\s+/g, ' ');

        const result = await rv.RunView<ConversationDetailEntity>({
            EntityName: 'Conversation Details',
            ExtraFilter: filter,
            OrderBy: '__mj_CreatedAt DESC',
            MaxRows: 100, // Limit to most recent 100 high-quality messages
            ResultType: 'entity_object'
        }, contextUser);

        return result.Success ? (result.Results || []) : [];
    }

    /**
     * Load agent runs with high-usage artifacts since last run.
     * Links through: ArtifactUse -> ArtifactVersion -> ConversationDetailArtifact -> ConversationDetail -> Conversation -> AIAgentRun
     */
    private async LoadHighValueAgentRuns(since: Date | null, contextUser: UserInfo): Promise<AIAgentRunEntity[]> {
        const rv = new RunView();

        // Use subquery to find agent runs with high-usage artifacts
        const sinceFilter = since ? `AND au.__mj_CreatedAt >= '${since.toISOString()}'` : '';

        const filter = `
            ID IN (
                SELECT DISTINCT ar.ID
                FROM AIAgentRun ar
                INNER JOIN Conversation c ON ar.ConversationID = c.ID
                INNER JOIN ConversationDetail cd ON cd.ConversationID = c.ID
                INNER JOIN ConversationDetailArtifact cda ON cda.ConversationDetailID = cd.ID
                INNER JOIN ArtifactVersion av ON av.ID = cda.ArtifactVersionID
                WHERE EXISTS (
                    SELECT 1
                    FROM ArtifactUse au
                    WHERE au.ArtifactVersionID = av.ID
                    ${sinceFilter}
                    GROUP BY au.ArtifactVersionID
                    HAVING (
                        SUM(CASE WHEN au.UsageType = 'Shared' THEN 1 ELSE 0 END) >= 2
                        OR COUNT(*) >= 5
                    )
                )
            )
        `.trim().replace(/\s+/g, ' ');

        const result = await rv.RunView<AIAgentRunEntity>({
            EntityName: 'MJ: AI Agent Runs',
            ExtraFilter: filter,
            OrderBy: '__mj_CreatedAt DESC',
            MaxRows: 50, // Limit to most recent 50 high-value runs
            ResultType: 'entity_object'
        }, contextUser);

        return result.Success ? (result.Results || []) : [];
    }

    /**
     * Extract notes from conversation details using AI analysis.
     * Works at ConversationDetail level with user<->AI message pairs.
     */
    private async ExtractNotes(
        conversationDetails: ConversationDetailEntity[],
        contextUser: UserInfo
    ): Promise<ExtractedNote[]> {
        if (conversationDetails.length === 0) {
            return [];
        }

        const allNotes = AIEngine.Instance.AgentNotes;
        const existingNotes = allNotes.filter(n => n.Status === 'Active');

        // Group conversation details by conversation ID for context
        const detailsByConversation = new Map<string, ConversationDetailEntity[]>();
        for (const detail of conversationDetails) {
            const existing = detailsByConversation.get(detail.ConversationID) || [];
            existing.push(detail);
            detailsByConversation.set(detail.ConversationID, existing);
        }

        // Prepare conversation detail threads (user->AI pairs)
        const conversationThreads = Array.from(detailsByConversation.entries()).map(([convId, details]) => ({
            conversationId: convId,
            messages: details.map(d => ({
                id: d.ID,
                role: d.Role,
                message: d.Message,
                createdAt: d.__mj_CreatedAt
            }))
        }));

        const promptData = {
            conversationThreads,
            existingNotes: existingNotes.map(n => ({
                id: n.ID,
                type: n.Type,
                content: n.Note,
                agentId: n.AgentID,
                userId: n.UserID,
                companyId: n.CompanyID
            }))
        };

        // Find extraction prompt
        const prompt = AIEngine.Instance.Prompts.find(p =>
            p.Name === 'Memory Manager - Extract Notes' && p.Category === 'MJ: System'
        );

        if (!prompt) {
            LogError('Memory Manager note extraction prompt not found');
            return [];
        }

        // Execute AI extraction
        const runner = new AIPromptRunner();
        const params = new AIPromptParams();
        params.prompt = prompt;
        params.data = promptData;
        params.contextUser = contextUser;

        const result = await runner.ExecutePrompt<{ notes: ExtractedNote[] }>(params);

        if (!result.success || !result.result) {
            LogError('Failed to extract notes:', result.errorMessage);
            return [];
        }

        // Filter by confidence threshold
        return (result.result.notes || []).filter(n => n.confidence >= 70);
    }

    /**
     * Extract examples from conversation details with high ratings.
     * Uses LLM-based deduplication to avoid adding redundant examples.
     */
    private async ExtractExamples(
        conversationDetails: ConversationDetailEntity[],
        contextUser: UserInfo
    ): Promise<ExtractedExample[]> {
        if (conversationDetails.length === 0) {
            return [];
        }

        // Prepare Q&A pairs from conversation details
        const qaPairs = conversationDetails.map(detail => ({
            id: detail.ID,
            conversationId: detail.ConversationID,
            role: detail.Role,
            message: detail.Message,
            createdAt: detail.__mj_CreatedAt
        }));

        // Find extraction prompt
        const extractPrompt = AIEngine.Instance.Prompts.find(p =>
            p.Name === 'Memory Manager - Extract Examples' && p.Category === 'MJ: System'
        );

        if (!extractPrompt) {
            LogError('Memory Manager example extraction prompt not found');
            return [];
        }

        // Execute AI extraction
        const runner = new AIPromptRunner();
        const extractParams = new AIPromptParams();
        extractParams.prompt = extractPrompt;
        extractParams.data = { qaPairs };
        extractParams.contextUser = contextUser;

        const extractResult = await runner.ExecutePrompt<{ examples: ExtractedExample[] }>(extractParams);

        if (!extractResult.success || !extractResult.result) {
            LogError('Failed to extract examples:', extractResult.errorMessage);
            return [];
        }

        const candidateExamples = (extractResult.result.examples || [])
            .filter(e => e.successScore >= 70 && e.confidence >= 70);

        if (candidateExamples.length === 0) {
            return [];
        }

        // Load existing examples for each agent to compare
        const approvedExamples: ExtractedExample[] = [];

        // Process each candidate example with LLM-based deduplication
        for (const candidate of candidateExamples) {
            // Find similar existing examples using semantic search
            const similarExamples = await AIEngine.Instance.FindSimilarAgentExamples(
                candidate.exampleInput,
                candidate.agentId,
                candidate.userId,
                candidate.companyId,
                5, // Top 5 similar
                0.7 // 70% similarity threshold
            );

            // Ask LLM if this candidate adds value given existing similar examples
            const dedupePrompt = AIEngine.Instance.Prompts.find(p =>
                p.Name === 'Memory Manager - Deduplicate Example' && p.Category === 'MJ: System'
            );

            if (dedupePrompt && similarExamples.length > 0) {
                const dedupeParams = new AIPromptParams();
                dedupeParams.prompt = dedupePrompt;
                dedupeParams.data = {
                    candidateExample: candidate,
                    similarExamples: similarExamples.map(s => ({
                        input: s.example.ExampleInput,
                        output: s.example.ExampleOutput,
                        successScore: s.example.SuccessScore,
                        similarity: s.similarity
                    }))
                };
                dedupeParams.contextUser = contextUser;

                const dedupeResult = await runner.ExecutePrompt<{ shouldAdd: boolean; reason: string }>(dedupeParams);

                if (dedupeResult.success && dedupeResult.result && dedupeResult.result.shouldAdd) {
                    approvedExamples.push(candidate);
                    LogStatus(`Memory Manager: Approved example - ${dedupeResult.result.reason}`);
                } else {
                    LogStatus(`Memory Manager: Skipped duplicate example - ${dedupeResult.result?.reason || 'too similar'}`);
                }
            } else {
                // No similar examples found, add it
                approvedExamples.push(candidate);
            }
        }

        return approvedExamples;
    }

    /**
     * Create note records from extracted data
     */
    private async CreateNoteRecords(extractedNotes: ExtractedNote[], contextUser: UserInfo): Promise<number> {
        let created = 0;
        const md = new Metadata();

        for (const extracted of extractedNotes) {
            try {
                // Check if we should merge with existing
                if (extracted.mergeWithExistingId) {
                    const existingNote = await md.GetEntityObject<AIAgentNoteEntity>('AI Agent Notes', contextUser);
                    if (await existingNote.Load(extracted.mergeWithExistingId)) {
                        // Update existing note
                        existingNote.Note = extracted.content;
                        existingNote.Type = extracted.type;
                        await existingNote.Save();
                        created++;
                    }
                } else {
                    // Create new note
                    const note = await md.GetEntityObject<AIAgentNoteEntity>('AI Agent Notes', contextUser);
                    note.AgentID = extracted.agentId || null;
                    note.UserID = extracted.userId || null;
                    note.CompanyID = extracted.companyId || null;
                    note.AgentNoteTypeID = extracted.noteTypeId;
                    note.Type = extracted.type;
                    note.Note = extracted.content;
                    note.IsAutoGenerated = true;
                    note.Status = 'Active'; // Auto-approve high-confidence notes
                    note.SourceConversationID = extracted.sourceConversationId || null;
                    note.SourceConversationDetailID = extracted.sourceConversationDetailId || null;
                    note.SourceAIAgentRunID = extracted.sourceAgentRunId || null;

                    if (await note.Save()) {
                        created++;
                    }
                }
            } catch (error) {
                LogError('Failed to create note:', error);
            }
        }

        return created;
    }

    /**
     * Create example records from extracted data
     */
    private async CreateExampleRecords(extractedExamples: ExtractedExample[], contextUser: UserInfo): Promise<number> {
        let created = 0;
        const md = new Metadata();

        for (const extracted of extractedExamples) {
            try {
                const example = await md.GetEntityObject<AIAgentExampleEntity>('MJ: AI Agent Examples', contextUser);
                example.AgentID = extracted.agentId;
                example.UserID = extracted.userId || null;
                example.CompanyID = extracted.companyId || null;
                example.Type = extracted.type;
                example.ExampleInput = extracted.exampleInput;
                example.ExampleOutput = extracted.exampleOutput;
                example.IsAutoGenerated = true;
                example.SuccessScore = extracted.successScore;
                example.Status = 'Active'; // Auto-approve high-confidence examples
                example.SourceConversationID = extracted.sourceConversationId || null;
                example.SourceConversationDetailID = extracted.sourceConversationDetailId || null;
                example.SourceAIAgentRunID = extracted.sourceAgentRunId || null;

                if (await example.Save()) {
                    created++;
                }
            } catch (error) {
                LogError('Failed to create example:', error);
            }
        }

        return created;
    }

    /**
     * Main execution method called by scheduler
     */
    protected async executeAgentInternal<P = any>(
        params: ExecuteAgentParams,
        config: AgentConfiguration
    ): Promise<{finalStep: BaseAgentNextStep<P>, stepCount: number}> {
        try {
            LogStatus('Memory Manager: Starting analysis cycle');

            const lastRunTime = await this.GetLastRunTime(params.agent.ID, params.contextUser!);
            const sinceMessage = lastRunTime ? `since ${lastRunTime.toISOString()}` : 'all history';
            LogStatus(`Memory Manager: Processing ${sinceMessage}`);

            // Load agents that have memory injection enabled
            const agentsUsingMemory = await this.LoadAgentsUsingMemory(params.contextUser!);
            LogStatus(`Memory Manager: Found ${agentsUsingMemory.length} agents with memory injection enabled`);

            if (agentsUsingMemory.length === 0) {
                const finalStep: BaseAgentNextStep<P> = {
                    terminate: true,
                    step: 'Success',
                    message: 'No agents have note/example injection enabled - nothing to extract'
                };
                return { finalStep, stepCount: 1 };
            }

            // Load high-quality conversation details (only for agents using memory)
            const conversationDetails = await this.LoadHighQualityConversationDetails(lastRunTime, agentsUsingMemory, params.contextUser!);
            LogStatus(`Memory Manager: Found ${conversationDetails.length} high-quality conversation details`);

            // Load high-value agent runs
            const agentRuns = await this.LoadHighValueAgentRuns(lastRunTime, params.contextUser!);
            LogStatus(`Memory Manager: Found ${agentRuns.length} high-value agent runs`);

            if (conversationDetails.length === 0 && agentRuns.length === 0) {
                LogStatus('Memory Manager: No data to process');
                const finalStep: BaseAgentNextStep<P> = {
                    terminate: true,
                    step: 'Success',
                    message: 'No high-quality conversation details or agent runs to process'
                };
                return { finalStep, stepCount: 1 };
            }

            // Extract notes
            const extractedNotes = await this.ExtractNotes(conversationDetails, params.contextUser!);
            LogStatus(`Memory Manager: Extracted ${extractedNotes.length} potential notes`);

            // Extract examples
            const extractedExamples = await this.ExtractExamples(conversationDetails, params.contextUser!);
            LogStatus(`Memory Manager: Extracted ${extractedExamples.length} potential examples`);

            // Create records
            const notesCreated = await this.CreateNoteRecords(extractedNotes, params.contextUser!);
            const examplesCreated = await this.CreateExampleRecords(extractedExamples, params.contextUser!);

            LogStatus(`Memory Manager: Created ${notesCreated} notes and ${examplesCreated} examples`);

            const finalStep: BaseAgentNextStep<P> = {
                terminate: true,
                step: 'Success',
                message: `Processed ${conversationDetails.length} conversation details and ${agentRuns.length} agent runs. Created ${notesCreated} notes and ${examplesCreated} examples.`,
                newPayload: {
                    notesCreated,
                    examplesCreated,
                    conversationDetailsProcessed: conversationDetails.length,
                    agentRunsProcessed: agentRuns.length
                } as any
            };

            return { finalStep, stepCount: 1 };

        } catch (error) {
            LogError('Memory Manager execution failed:', error);
            const finalStep: BaseAgentNextStep<P> = {
                terminate: true,
                step: 'Failed',
                message: error instanceof Error ? error.message : String(error)
            };
            return { finalStep, stepCount: 1 };
        }
    }
}
