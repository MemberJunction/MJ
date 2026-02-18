import { BaseAgent } from './base-agent';
import { RegisterClass, CleanAndParseJSON } from '@memberjunction/global';
import { UserInfo, Metadata, RunView, RunQuery, LogError, LogStatus } from '@memberjunction/core';
import {
    MJConversationDetailEntity,
    MJAIAgentRunEntity,
    MJAIAgentNoteEntity,
    MJAIAgentExampleEntity,
    MJConversationDetailRatingEntity,
    MJAIAgentRunStepEntity
} from '@memberjunction/core-entities';
import { AIPromptRunner } from '@memberjunction/ai-prompts';
import { AIPromptParams, AIPromptRunResult, ExecuteAgentParams, AgentConfiguration, BaseAgentNextStep, AIAgentEntityExtended, AIPromptEntityExtended } from '@memberjunction/ai-core-plus';
import { AIEngine } from '@memberjunction/aiengine';

/**
 * Configuration for extraction limits to ensure sparsity
 */
const EXTRACTION_CONFIG = {
    maxNotesPerRun: 1000,          // Max new notes per agent run
    maxNotesPerConversation: 1000, // Max notes from a single conversation
    maxNotesPerMessage: 1000,      // Max notes from a single message
    minConfidenceThreshold: 80,    // Minimum confidence to extract a note
    minContentLength: 10,          // Minimum note content length (lowered from 20 to allow short names)
    cooldownHours: 24              // Don't re-extract from same conversation within 24h
};

/**
 * Configuration for note consolidation.
 * Consolidation finds clusters of similar notes and synthesizes them into single comprehensive notes.
 */
const CONSOLIDATION_CONFIG = {
    /**
     * How often to run consolidation:
     * - 'disabled': Do not run consolidation
     * - 'every-run': Run on every memory manager execution
     * - 'hourly': Run once per hour (based on last run time)
     * - 'daily': Run once per day
     * - number: Run every N executions (e.g., 4 = every 4th run)
     */
    frequency: 'disabled' as 'disabled' | 'every-run' | 'hourly' | 'daily' | number,
    minClusterSize: 3,             // Minimum notes in a cluster to trigger consolidation
    similarityThreshold: 0.60      // Semantic similarity threshold — 60% captures topically related notes while excluding dissimilar ones
};


/**
 * Message with rating data for extraction
 */
interface MessageWithRating {
    id: string;
    role: string;
    message: string;
    createdAt: Date;
    rating: number | null;
    ratingComment: string | null;
}

/**
 * Conversation thread with rating data per message
 */
interface ConversationWithRatings {
    conversationId: string;
    userId: string | null;        // User who owns the conversation
    agentRunId: string | null;    // Linked agent run (for scope inheritance)
    messages: MessageWithRating[];
    hasPositiveRating: boolean;  // Any message rated 8-10
    hasNegativeRating: boolean;  // Any message rated 1-3
    isUnrated: boolean;          // No ratings at all
}

/**
 * Generic conversation thread for prompt data
 */
interface ConversationThread {
    conversationId: string;
    messages: {
        id: string;
        role: string;
        message: string;
        createdAt: Date;
        rating: number | null;
        ratingComment: string | null;
    }[];
}

/**
 * Result row from GetConversationsForMemoryManager query
 */
interface MemoryManagerQueryResult {
    ConversationID: string;
    UserID: string | null;
    AgentRunID: string | null;
    MessagesJSON: string | null;
    HasPositiveRating: number;
    HasNegativeRating: number;
    IsUnrated: number;
}

/**
 * Extracted note from conversation/agent run analysis
 */
interface ExtractedNote {
    type: 'Preference' | 'Constraint' | 'Context' | 'Example' | 'Issue';
    agentId?: string;
    userId?: string;
    companyId?: string;
    content: string;
    confidence: number;
    sourceConversationId?: string;
    sourceConversationDetailId?: string;
    sourceAgentRunId?: string;
    mergeWithExistingIds?: string[]; // IDs of existing notes to revoke and replace (contradiction merge)
    mergeWithExistingId?: string; // Legacy singular form from LLM — normalized to plural below
    /**
     * Scope level hint from LLM analysis.
     * - 'global': Applies to all users (e.g., "Always greet politely")
     * - 'company': Applies to all users in a company (e.g., "This company uses metric units")
     * - 'user': Specific to one user (e.g., "John prefers email")
     */
    scopeLevel?: 'global' | 'company' | 'user';
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
    /**
     * Scope level hint from LLM analysis.
     * - 'global': Applies to all users
     * - 'company': Applies to all users in a company
     * - 'user': Specific to one user
     */
    scopeLevel?: 'global' | 'company' | 'user';
}

/**
 * Memory Manager Agent - automatically extracts notes and examples from conversations.
 * This agent runs on a schedule (every 15 minutes) and analyzes high-quality conversations
 * and agent runs to extract learnings and example interactions.
 */
@RegisterClass(BaseAgent, 'MemoryManagerAgent')
export class MemoryManagerAgent extends BaseAgent {
    /** Verbose logging flag from params.verbose */
    private _verbose: boolean = false;
    /** Agent run ID for creating run steps */
    private _agentRunID: string | null = null;
    /** Step counter for sequential step numbering */
    private _stepCounter: number = 0;
    /** Context user for step operations */
    private _contextUser: UserInfo | null = null;

    /**
     * Create an agent run step record for observability.
     * Returns null if agentRunID is not set (defensive check).
     */
    private async CreateRunStep(
        stepType: 'Prompt' | 'Decision' | 'Validation',
        stepName: string,
        inputData?: Record<string, unknown>,
        targetId?: string
    ): Promise<MJAIAgentRunStepEntity | null> {
        if (!this._agentRunID || !this._contextUser) {
            return null;
        }

        try {
            const md = new Metadata();
            const step = await md.GetEntityObject<MJAIAgentRunStepEntity>('MJ: AI Agent Run Steps', this._contextUser);

            step.AgentRunID = this._agentRunID;
            step.StepNumber = ++this._stepCounter;
            step.StepType = stepType;
            step.StepName = stepName;
            step.Status = 'Running';
            step.StartedAt = new Date();

            if (targetId) {
                step.TargetID = targetId;
            }

            if (inputData) {
                step.InputData = JSON.stringify(inputData);
            }

            if (await step.Save()) {
                return step;
            } else {
                LogError(`Memory Manager: Failed to create run step: ${JSON.stringify(step.LatestResult)}`);
                return null;
            }
        } catch (error) {
            LogError('Memory Manager: Exception creating run step:', error);
            return null;
        }
    }

    /**
     * Finalize an agent run step with success/failure status and output data.
     */
    private async FinalizeRunStep(
        step: MJAIAgentRunStepEntity | null,
        success: boolean,
        outputData?: Record<string, unknown>,
        targetLogId?: string,
        errorMessage?: string
    ): Promise<void> {
        if (!step) {
            return;
        }

        try {
            step.Status = success ? 'Completed' : 'Failed';
            step.CompletedAt = new Date();
            step.Success = success;

            if (errorMessage) {
                step.ErrorMessage = errorMessage;
            }

            if (targetLogId) {
                step.TargetLogID = targetLogId;
            }

            if (outputData) {
                step.OutputData = JSON.stringify(outputData);
            }

            if (!await step.Save()) {
                LogError(`Memory Manager: Failed to finalize run step: ${JSON.stringify(step.LatestResult)}`);
            }
        } catch (error) {
            LogError('Memory Manager: Exception finalizing run step:', error);
        }
    }

    /**
     * Get the last run timestamp for this agent to determine what to process.
     * For first run, returns null to process all history (limited by MaxRows).
     */
    private async GetLastRunTime(agentId: string, contextUser: UserInfo): Promise<Date | null> {
        const rv = new RunView();
        const result = await rv.RunView<MJAIAgentRunEntity>({
            EntityName: 'MJ: AI Agent Runs',
            ExtraFilter: `AgentID='${agentId}' AND Status='Completed'`,
            OrderBy: 'StartedAt DESC',
            MaxRows: 1,
            ResultType: 'entity_object'
        }, contextUser);

        if (result.Success && result.Results && result.Results.length > 0) {
            // Ensure we return a proper Date object
            const startedAt = result.Results[0].StartedAt;
            return startedAt instanceof Date ? startedAt : new Date(startedAt);
        }

        // First run - return null to process all history (with MaxRows limit)
        return null;
    }

    /**
     * Load agents that have note or example injection enabled.
     * Only extract notes/examples for agents that actually use these features.
     */
    private async LoadAgentsUsingMemory(contextUser: UserInfo): Promise<AIAgentEntityExtended[]> {
        const allAgents = AIEngine.Instance.Agents;
        const filteredAgents = allAgents.filter(a => a.Status === 'Active' && (a.InjectNotes || a.InjectExamples));

        // Debug logging only in verbose mode
        if (this._verbose) {
            LogStatus(`Memory Manager: AIEngine has ${allAgents.length} total agents cached`);
            if (filteredAgents.length > 0) {
                const agentNames = filteredAgents.map(a => `${a.Name} (InjectNotes=${a.InjectNotes}, InjectExamples=${a.InjectExamples})`).join(', ');
                LogStatus(`Memory Manager: Agents with memory enabled: ${agentNames}`);
            }
            const sage = allAgents.find(a => a.Name === 'Sage');
            if (sage) {
                LogStatus(`Memory Manager: Sage agent - ID=${sage.ID}, InjectNotes=${sage.InjectNotes}, InjectExamples=${sage.InjectExamples}, Status=${sage.Status}`);
            }
        }

        // Warning: Always log if Sage is missing
        const sage = allAgents.find(a => a.Name === 'Sage');
        if (!sage) {
            LogStatus(`Memory Manager: WARNING - Sage agent not found in AIEngine cache!`);
        }

        return filteredAgents;
    }

    /**
     * Load conversations with new activity since last run, including rating data.
     * Uses a single optimized RunQuery that replaces 4 separate database queries.
     * Returns conversations with their details, ratings, and agent run IDs for scope inheritance.
     */
    private async LoadConversationsWithNewActivity(
        since: Date | null,
        agentsUsingMemory: AIAgentEntityExtended[],
        contextUser: UserInfo
    ): Promise<ConversationWithRatings[]> {
        if (agentsUsingMemory.length === 0) {
            LogStatus('Memory Manager: No agents have memory injection enabled - skipping');
            return [];
        }

        const agentIds = agentsUsingMemory.map(a => `'${a.ID}'`).join(',');

        // Use RunQuery to fetch all data in a single optimized query
        const rq = new RunQuery();
        const result = await rq.RunQuery({
            QueryName: 'GetConversationsForMemoryManager',
            CategoryPath: '/MJ/AI/Agents/',
            Parameters: {
                since: since?.toISOString() || null,
                agentIds: agentIds
            },
            MaxRows: 1000 // Limit to 1000 conversations per run
        }, contextUser);

        if (!result.Success || !result.Results || result.Results.length === 0) {
            LogStatus('Memory Manager: No conversations with new activity found');
            return [];
        }

        // Parse the query results into ConversationWithRatings objects
        const conversations: ConversationWithRatings[] = [];

        for (const row of result.Results as MemoryManagerQueryResult[]) {
            // Parse the MessagesJSON from the query result
            let messages: MessageWithRating[] = [];
            if (row.MessagesJSON) {
                try {
                    const parsedMessages = JSON.parse(row.MessagesJSON) as Array<{
                        id: string;
                        role: string;
                        message: string;
                        createdAt: string;
                        rating: number | null;
                        ratingComment: string | null;
                    }>;
                    messages = parsedMessages.map(m => ({
                        id: m.id,
                        role: m.role,
                        message: m.message,
                        createdAt: new Date(m.createdAt),
                        rating: m.rating,
                        ratingComment: m.ratingComment
                    }));
                } catch (e) {
                    LogError(`Memory Manager: Failed to parse MessagesJSON for conversation ${row.ConversationID}:`, e);
                    continue;
                }
            }

            conversations.push({
                conversationId: row.ConversationID,
                userId: row.UserID,
                agentRunId: row.AgentRunID,
                messages: messages,
                hasPositiveRating: row.HasPositiveRating === 1,
                hasNegativeRating: row.HasNegativeRating === 1,
                isUnrated: row.IsUnrated === 1
            });
        }

        const totalMessages = conversations.reduce((sum, c) => sum + c.messages.length, 0);
        if (this._verbose) {
            LogStatus(`Memory Manager: Loaded ${conversations.length} conversations with ${totalMessages} total messages (positive: ${conversations.filter(c => c.hasPositiveRating).length}, negative: ${conversations.filter(c => c.hasNegativeRating).length}, unrated: ${conversations.filter(c => c.isUnrated).length})`);
        }

        return conversations;
    }

    /**
     * Load agent runs with high-usage artifacts since last run.
     * Links through: ArtifactUse -> ArtifactVersion -> ConversationDetailArtifact -> ConversationDetail -> Conversation -> AIAgentRun
     */
    private async LoadHighValueAgentRuns(since: Date | null, contextUser: UserInfo): Promise<MJAIAgentRunEntity[]> {
        const rv = new RunView();

        // Use subquery to find agent runs with high-usage artifacts
        const sinceFilter = since ? `AND au.__mj_CreatedAt >= '${since.toISOString()}'` : '';

        const filter = `
            ID IN (
                SELECT DISTINCT ar.ID
                FROM __mj.AIAgentRun ar
                INNER JOIN __mj.Conversation c ON ar.ConversationID = c.ID
                INNER JOIN __mj.ConversationDetail cd ON cd.ConversationID = c.ID
                INNER JOIN __mj.ConversationDetailArtifact cda ON cda.ConversationDetailID = cd.ID
                INNER JOIN __mj.ArtifactVersion av ON av.ID = cda.ArtifactVersionID
                WHERE EXISTS (
                    SELECT 1
                    FROM __mj.ArtifactUse au
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

        const result = await rv.RunView<MJAIAgentRunEntity>({
            EntityName: 'MJ: AI Agent Runs',
            ExtraFilter: filter,
            OrderBy: '__mj_CreatedAt DESC',
            MaxRows: 50, // Limit to most recent 50 high-value runs
            ResultType: 'entity_object'
        }, contextUser);

        return result.Success ? (result.Results || []) : [];
    }

    /**
     * Extract notes from conversations with rating data using AI analysis.
     * This is the primary method that handles rated, unrated, positive, and negative feedback.
     * Uses LLM-based deduplication and applies sparsity controls.
     */
    private async ExtractNotesFromConversations(
        conversations: ConversationWithRatings[],
        contextUser: UserInfo
    ): Promise<ExtractedNote[]> {
        if (conversations.length === 0) {
            return [];
        }

        const allNotes = AIEngine.Instance.AgentNotes;
        const existingNotes = allNotes.filter(n => n.Status === 'Active');

        // Prepare conversation threads with rating data and user context
        const conversationThreads = conversations.map(conv => ({
            conversationId: conv.conversationId,
            userId: conv.userId,           // User who owns the conversation - for scoping
            agentRunId: conv.agentRunId,   // Linked agent run - for scope inheritance
            hasPositiveRating: conv.hasPositiveRating,
            hasNegativeRating: conv.hasNegativeRating,
            isUnrated: conv.isUnrated,
            messages: conv.messages.map(msg => ({
                id: msg.id,
                role: msg.role,
                message: msg.message,
                createdAt: msg.createdAt,
                rating: msg.rating,
                ratingComment: msg.ratingComment
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

        return this.executeNoteExtraction(promptData, existingNotes, contextUser);
    }

    /**
     * Common extraction logic for note extraction.
     * Applies sparsity controls and deduplication.
     */
    private async executeNoteExtraction(
        promptData: { conversationThreads: ConversationThread[]; existingNotes: unknown[] },
        existingNotes: MJAIAgentNoteEntity[],
        contextUser: UserInfo
    ): Promise<ExtractedNote[]> {
        const conversationThreads = promptData.conversationThreads;

        // Find extraction prompt
        const prompt = AIEngine.Instance.Prompts.find(p =>
            p.Name === 'Memory Manager - Extract Notes' && p.Category === 'MJ: System'
        );

        if (!prompt) {
            LogError('Memory Manager note extraction prompt not found');
            if (this._verbose) {
                LogStatus(`Memory Manager: Available prompts in MJ: System category: ${AIEngine.Instance.Prompts.filter(p => p.Category === 'MJ: System').map(p => p.Name).join(', ')}`);
            }
            return [];
        }

        if (this._verbose) {
            LogStatus(`Memory Manager: Found extraction prompt "${prompt.Name}" (ID: ${prompt.ID})`);
            LogStatus(`Memory Manager: Sending ${conversationThreads.length} conversation threads with ${conversationThreads.reduce((sum, t) => sum + t.messages.length, 0)} total messages for note extraction`);
            if (conversationThreads.length > 0) {
                const firstThread = conversationThreads[0];
                LogStatus(`Memory Manager: Sample thread (conv ${firstThread.conversationId}): ${firstThread.messages.map(m => `[${m.role}] ${m.message?.substring(0, 80)}...`).join(' | ')}`)
            }
        }

        // Step 3: Execute AI extraction
        const step3 = await this.CreateRunStep('Prompt', 'Extract Notes from Conversations', {
            conversationCount: conversationThreads.length,
            messageCount: conversationThreads.reduce((sum, t) => sum + t.messages.length, 0),
            existingNoteCount: existingNotes.length
        }, prompt.ID);

        const runner = new AIPromptRunner();
        const params = new AIPromptParams();
        params.prompt = prompt;
        params.data = promptData;
        params.contextUser = contextUser;
        params.attemptJSONRepair = true;

        const result = await runner.ExecutePrompt<{ notes: ExtractedNote[] }>(params);

        // Finalize Step 3 after extraction
        await this.FinalizeRunStep(step3, result.success, {
            success: result.success,
            rawNoteCount: result.result && typeof result.result !== 'string' ? (result.result.notes?.length || 0) : 0
        }, result.promptRun?.ID, result.errorMessage || undefined);

        if (this._verbose) {
            LogStatus(`Memory Manager: Extraction prompt result - success: ${result.success}, hasResult: ${!!result.result}`);
            if (result.errorMessage) {
                LogStatus(`Memory Manager: Extraction error: ${result.errorMessage}`);
            }
            if (result.result) {
                LogStatus(`Memory Manager: Raw extraction result: ${JSON.stringify(result.result)}`);
            }
        }

        if (!result.success || !result.result) {
            LogError('Failed to extract notes:', result.errorMessage);
            return [];
        }

        // Parse result if it's a string (AI sometimes returns JSON as string)
        // Some models (e.g., Gemini) wrap JSON in ```json fences
        let parsedResult: { notes: ExtractedNote[] };
        if (typeof result.result === 'string') {
            const parsed = CleanAndParseJSON<{ notes: ExtractedNote[] }>(result.result, true);
            if (!parsed) {
                LogError('Failed to parse extraction result as JSON');
                return [];
            }
            parsedResult = parsed;
            if (this._verbose) {
                LogStatus(`Memory Manager: Parsed string result into object with ${parsedResult.notes?.length || 0} notes`);
            }
        } else {
            parsedResult = result.result;
        }

        // Normalize singular mergeWithExistingId → plural mergeWithExistingIds
        // The LLM still outputs the singular field; we convert it here.
        // Notes are plain objects from JSON.parse, so the runtime cast is safe.
        if (parsedResult.notes) {
            for (const note of parsedResult.notes) {
                if (note.mergeWithExistingId && !note.mergeWithExistingIds) {
                    note.mergeWithExistingIds = [note.mergeWithExistingId];
                }
            }
        }

        // Log raw notes before filtering (for debugging)
        if (this._verbose && parsedResult.notes) {
            LogStatus(`Memory Manager: LLM returned ${parsedResult.notes.length} raw notes before filtering`);
            for (const note of parsedResult.notes) {
                LogStatus(`Memory Manager: Raw note: [${note.type}] "${note.content}" (confidence: ${note.confidence})${note.mergeWithExistingIds?.length ? ` mergeWith: ${note.mergeWithExistingIds.join(', ')}` : ''}`);
            }
        }

        // Filter by confidence threshold (use EXTRACTION_CONFIG)
        const candidateNotes = (parsedResult.notes || []).filter(n =>
            n.confidence >= EXTRACTION_CONFIG.minConfidenceThreshold &&
            n.content && n.content.length >= EXTRACTION_CONFIG.minContentLength
        );

        if (candidateNotes.length === 0) {
            if (this._verbose) {
                LogStatus('Memory Manager: No candidates passed confidence/length thresholds');
            }
            return [];
        }

        if (this._verbose) {
            LogStatus(`Memory Manager: ${candidateNotes.length} candidates passed confidence threshold (>=${EXTRACTION_CONFIG.minConfidenceThreshold})`);
            // Log each extracted note for debugging
            for (const note of candidateNotes) {
                LogStatus(`Memory Manager: Extracted note: [${note.type}] "${note.content}" (confidence: ${note.confidence})`);
            }
        }

        // Apply sparsity: limit notes per message AND per conversation
        const notesByMessage = new Map<string, ExtractedNote[]>();
        const noteCountByConversation = new Map<string, number>();

        for (const note of candidateNotes) {
            const msgId = note.sourceConversationDetailId || 'unknown';
            const convId = note.sourceConversationId || 'unknown';
            const existingForMsg = notesByMessage.get(msgId) || [];
            const convCount = noteCountByConversation.get(convId) || 0;

            // Check both per-message and per-conversation limits
            if (existingForMsg.length >= EXTRACTION_CONFIG.maxNotesPerMessage) {
                if (this._verbose) {
                    LogStatus(`Memory Manager: Skipping note (max ${EXTRACTION_CONFIG.maxNotesPerMessage} per message reached)`);
                }
            } else if (convCount >= EXTRACTION_CONFIG.maxNotesPerConversation) {
                if (this._verbose) {
                    LogStatus(`Memory Manager: Skipping note (max ${EXTRACTION_CONFIG.maxNotesPerConversation} per conversation reached)`);
                }
            } else {
                existingForMsg.push(note);
                notesByMessage.set(msgId, existingForMsg);
                noteCountByConversation.set(convId, convCount + 1);
            }
        }

        const sparseCandidates = Array.from(notesByMessage.values()).flat();
        if (this._verbose) {
            LogStatus(`Memory Manager: ${sparseCandidates.length} candidates after sparsity filter`);
        }

        // Collapse merge candidates with identical content into single candidates
        const collapsedCandidates = this.collapseMergeCandidates(sparseCandidates);

        if (this._verbose && collapsedCandidates.length < sparseCandidates.length) {
            LogStatus(`Memory Manager: Collapsed ${sparseCandidates.length} candidates to ${collapsedCandidates.length} after merging duplicate merge targets`);
        }

        // Step 4: Apply deduplication (summary step)
        const step4 = await this.CreateRunStep('Decision', 'Deduplicate Note Candidates', {
            candidateCount: collapsedCandidates.length,
            existingNoteCount: existingNotes.length
        });

        const approvedNotes: ExtractedNote[] = [];
        let dedupeRejectedCount = 0;
        let dedupeLlmCallCount = 0;

        // Find deduplication prompt
        const dedupePrompt = AIEngine.Instance.Prompts.find(p =>
            p.Name === 'Memory Manager - Deduplicate Note' && p.Category === 'MJ: System'
        );

        for (const candidate of collapsedCandidates) {
            // Check global max notes per run
            if (approvedNotes.length >= EXTRACTION_CONFIG.maxNotesPerRun) {
                if (this._verbose) {
                    LogStatus(`Memory Manager: Stopping - max notes per run (${EXTRACTION_CONFIG.maxNotesPerRun}) reached`);
                }
                break;
            }

            // Notes with mergeWithExistingIds are intentional replacements —
            // the extraction LLM already determined this is a contradiction.
            // Dedup would reject them as "too similar" to the note they're replacing.
            if (candidate.mergeWithExistingIds?.length) {
                approvedNotes.push(candidate);
                if (this._verbose) {
                    LogStatus(`Memory Manager: Auto-approved merge note targeting ${candidate.mergeWithExistingIds.join(', ')}: "${candidate.content.substring(0, 50)}..."`);
                }
                continue;
            }

            // Step 1: Check for exact content match FIRST (case-insensitive, trimmed)
            const normalizedContent = candidate.content.toLowerCase().trim();
            const exactMatch = existingNotes.find(n =>
                n.Note && n.Note.toLowerCase().trim() === normalizedContent
            );
            if (exactMatch) {
                dedupeRejectedCount++;
                if (this._verbose) {
                    LogStatus(`Memory Manager: Skipping exact duplicate: "${candidate.content.substring(0, 50)}..."`);
                }
                continue;
            }

            // Step 2: Find similar existing notes using semantic search with tighter threshold.
            // Cross-user dedup for org/global notes works naturally because those notes have
            // UserID=null, so FindSimilarAgentNotes won't filter them out for any user.
            const similarNotes = await AIEngine.Instance.FindSimilarAgentNotes(
                candidate.content,
                candidate.agentId,
                candidate.userId,
                candidate.companyId,
                10, // Top 10 similar (increased from 5)
                0.85 // 85% similarity threshold (increased from 70%)
            );

            // Step 3: If deduplication prompt exists and similar notes found, ask LLM
            if (dedupePrompt && similarNotes.length > 0) {
                const dedupeParams = new AIPromptParams();
                dedupeParams.prompt = dedupePrompt;
                dedupeParams.data = {
                    candidateNote: candidate,
                    similarNotes: similarNotes.map(s => ({
                        type: s.note.Type,
                        content: s.note.Note,
                        agentId: s.note.AgentID,
                        userId: s.note.UserID,
                        companyId: s.note.CompanyID,
                        similarity: s.similarity
                    }))
                };
                dedupeParams.contextUser = contextUser;

                dedupeParams.attemptJSONRepair = true;
                const dedupeResult = await runner.ExecutePrompt<{ shouldAdd: boolean; reason: string }>(dedupeParams);
                dedupeLlmCallCount++;

                if (dedupeResult.success && dedupeResult.result && dedupeResult.result.shouldAdd) {
                    approvedNotes.push(candidate);
                    if (this._verbose) {
                        LogStatus(`Memory Manager: Approved note - ${dedupeResult.result.reason}`);
                    }
                } else {
                    dedupeRejectedCount++;
                    if (this._verbose) {
                        LogStatus(`Memory Manager: Skipped duplicate note - ${dedupeResult.result?.reason || 'too similar to existing notes'}`);
                    }
                }
            } else {
                // No similar notes found or no deduplication prompt, add the note
                approvedNotes.push(candidate);
                if (this._verbose) {
                    LogStatus(`Memory Manager: Approved note (no similar notes found): "${candidate.content.substring(0, 50)}..."`);
                }
            }
        }

        // Finalize Step 4 after deduplication loop
        await this.FinalizeRunStep(step4, true, {
            approvedCount: approvedNotes.length,
            rejectedCount: dedupeRejectedCount,
            llmCallCount: dedupeLlmCallCount
        });

        if (this._verbose) {
            LogStatus(`Memory Manager: Final approved notes: ${approvedNotes.length}`);
        }

        // Enrich notes with userId and agentRunId from conversation context
        // Build a map of conversationId -> context for quick lookup
        const conversationContext = new Map<string, { userId: string | null; agentRunId: string | null }>();
        for (const thread of conversationThreads) {
            conversationContext.set(thread.conversationId, {
                userId: (thread as { userId?: string | null }).userId || null,
                agentRunId: (thread as { agentRunId?: string | null }).agentRunId || null
            });
        }

        // Enrich each note with conversation context
        for (const note of approvedNotes) {
            if (note.sourceConversationId) {
                const ctx = conversationContext.get(note.sourceConversationId);
                if (ctx) {
                    // Set userId from conversation if not already set
                    if (!note.userId && ctx.userId) {
                        note.userId = ctx.userId;
                    }
                    // Set sourceAgentRunId from conversation if not already set
                    if (!note.sourceAgentRunId && ctx.agentRunId) {
                        note.sourceAgentRunId = ctx.agentRunId;
                    }
                }
            }
        }

        return approvedNotes;
    }

    /**
     * Extract examples from conversation details with high ratings.
     * Uses LLM-based deduplication to avoid adding redundant examples.
     */
    private async ExtractExamples(
        conversationDetails: MJConversationDetailEntity[],
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

        // Step 5: Execute AI extraction
        const step5 = await this.CreateRunStep('Prompt', 'Extract Examples from Conversations', {
            qaPairCount: qaPairs.length
        }, extractPrompt.ID);

        const runner = new AIPromptRunner();
        const extractParams = new AIPromptParams();
        extractParams.prompt = extractPrompt;
        extractParams.data = { qaPairs };
        extractParams.contextUser = contextUser;
        extractParams.attemptJSONRepair = true;

        const extractResult = await runner.ExecutePrompt<{ examples: ExtractedExample[] }>(extractParams);

        if (!extractResult.success || !extractResult.result) {
            await this.FinalizeRunStep(step5, false, {
                success: false
            }, extractResult.promptRun?.ID, extractResult.errorMessage || undefined);
            LogError('Failed to extract examples:', extractResult.errorMessage);
            return [];
        }

        // Parse result if it's a string (AI sometimes returns JSON as string)
        // Some models (e.g., Gemini) wrap JSON in ```json fences
        let parsedResult: { examples: ExtractedExample[] };
        if (typeof extractResult.result === 'string') {
            const parsed = CleanAndParseJSON<{ examples: ExtractedExample[] }>(extractResult.result, true);
            if (!parsed) {
                LogError('Failed to parse example extraction result as JSON');
                return [];
            }
            parsedResult = parsed;
        } else {
            parsedResult = extractResult.result;
        }

        const candidateExamples = (parsedResult.examples || [])
            .filter(e => e.successScore >= 70 && e.confidence >= 70);

        // Finalize Step 5 after extraction parsing
        await this.FinalizeRunStep(step5, true, {
            rawExampleCount: parsedResult.examples?.length || 0,
            candidateCount: candidateExamples.length
        }, extractResult.promptRun?.ID);

        if (candidateExamples.length === 0) {
            return [];
        }

        // Step 6: Deduplicate example candidates (summary step)
        const step6 = await this.CreateRunStep('Decision', 'Deduplicate Example Candidates', {
            candidateCount: candidateExamples.length
        });

        const approvedExamples: ExtractedExample[] = [];
        let exampleDedupeRejectedCount = 0;
        let exampleDedupeLlmCallCount = 0;

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

                dedupeParams.attemptJSONRepair = true;
                const dedupeResult = await runner.ExecutePrompt<{ shouldAdd: boolean; reason: string }>(dedupeParams);
                exampleDedupeLlmCallCount++;

                if (dedupeResult.success && dedupeResult.result && dedupeResult.result.shouldAdd) {
                    approvedExamples.push(candidate);
                    if (this._verbose) {
                        LogStatus(`Memory Manager: Approved example - ${dedupeResult.result.reason}`);
                    }
                } else {
                    exampleDedupeRejectedCount++;
                    if (this._verbose) {
                        LogStatus(`Memory Manager: Skipped duplicate example - ${dedupeResult.result?.reason || 'too similar'}`);
                    }
                }
            } else {
                // No similar examples found, add it
                approvedExamples.push(candidate);
            }
        }

        // Finalize Step 6 after deduplication loop
        await this.FinalizeRunStep(step6, true, {
            approvedCount: approvedExamples.length,
            rejectedCount: exampleDedupeRejectedCount,
            llmCallCount: exampleDedupeLlmCallCount
        });

        return approvedExamples;
    }

    /**
     * Check if a string is a valid UUID format.
     */
    private isValidUUID(str: string): boolean {
        const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
        return uuidRegex.test(str);
    }

    /**
     * Create note records from extracted data.
     * Inherits scope from source agent run and applies scopeLevel to determine scope specificity.
     */
    private async CreateNoteRecords(extractedNotes: ExtractedNote[], contextUser: UserInfo): Promise<number> {
        // Step 7: Create Note Records
        const step7 = await this.CreateRunStep('Decision', 'Create Note Records', {
            noteCount: extractedNotes.length
        });

        let created = 0;
        let merged = 0;
        let failed = 0;
        const md = new Metadata();
        const rv = new RunView();

        // Cache source agent runs to avoid repeated lookups
        const runCache = new Map<string, MJAIAgentRunEntity | null>();

        // Get the "AI" note type ID for AI-generated notes
        const aiNoteTypeId = AIEngine.Instance.AgenteNoteTypeIDByName('AI');
        if (!aiNoteTypeId) {
            LogError('Memory Manager: Could not find "AI" note type - cannot create notes');
            await this.FinalizeRunStep(step7, false, {
                created: 0,
                merged: 0,
                failed: extractedNotes.length
            }, undefined, 'Could not find "AI" note type');
            return 0;
        }

        for (const extracted of extractedNotes) {
            try {

                // Load source agent run for scope inheritance (if available)
                let sourceRun: MJAIAgentRunEntity | null = null;
                if (extracted.sourceAgentRunId) {
                    if (!runCache.has(extracted.sourceAgentRunId)) {
                        const runResult = await rv.RunView<MJAIAgentRunEntity>({
                            EntityName: 'MJ: AI Agent Runs',
                            ExtraFilter: `ID='${extracted.sourceAgentRunId}'`,
                            MaxRows: 1,
                            ResultType: 'entity_object'
                        }, contextUser);
                        runCache.set(extracted.sourceAgentRunId, runResult.Success && runResult.Results?.length > 0 ? runResult.Results[0] : null);
                    }
                    sourceRun = runCache.get(extracted.sourceAgentRunId) || null;
                }

                // Check if we should merge with existing (revoke all targets, create one replacement)
                let createNewNote = !extracted.mergeWithExistingIds?.length;

                if (extracted.mergeWithExistingIds?.length) {
                    for (const mergeTargetId of extracted.mergeWithExistingIds) {
                        const existingNote = await md.GetEntityObject<MJAIAgentNoteEntity>('MJ: AI Agent Notes', contextUser);
                        if (await existingNote.Load(mergeTargetId)) {
                            existingNote.Status = 'Revoked';
                            existingNote.Comments = `Superseded: contradiction detected, replaced by new note from conversation ${extracted.sourceConversationId || 'unknown'}`;
                            if (await existingNote.Save()) {
                                merged++;
                            } else {
                                LogError(`Memory Manager: Failed to revoke note ${existingNote.ID} during merge`);
                                failed++;
                            }
                        } else {
                            LogStatus(`Memory Manager: Merge target ${mergeTargetId} not found, skipping revocation`);
                        }
                    }
                    createNewNote = true;
                }

                if (createNewNote) {
                    // Create new note
                    const note = await md.GetEntityObject<MJAIAgentNoteEntity>('MJ: AI Agent Notes', contextUser);
                    // Only use valid UUIDs, filter out placeholders like "user-uuid-here"
                    const isValidUUID = (id: string | undefined | null): boolean => {
                        if (!id) return false;
                        return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
                    };

                    // Determine AgentID - prefer extracted, then inherit from source run
                    let agentId: string | null = isValidUUID(extracted.agentId) ? extracted.agentId! : null;
                    if (!agentId && sourceRun?.AgentID) {
                        agentId = sourceRun.AgentID;
                    }
                    note.AgentID = agentId;
                    note.CompanyID = isValidUUID(extracted.companyId) ? extracted.companyId! : null;
                    note.AgentNoteTypeID = aiNoteTypeId;  // "AI" type for AI-generated notes
                    note.Type = extracted.type;  // Category: Preference, Constraint, Context, Issue, Example
                    note.Note = extracted.content;
                    note.IsAutoGenerated = true;
                    note.Status = 'Active'; // Auto-approve high-confidence notes
                    note.AccessCount = 1; // Required field
                    note.SourceConversationID = extracted.sourceConversationId || null;
                    // Only use if it's a valid UUID (LLM now sees message IDs in the prompt)
                    note.SourceConversationDetailID = isValidUUID(extracted.sourceConversationDetailId) ? extracted.sourceConversationDetailId! : null;
                    note.SourceAIAgentRunID = extracted.sourceAgentRunId || null;

                    // Apply scope: Lean towards user-specific memories by default
                    const scopeLevel = extracted.scopeLevel || 'user';

                    if (scopeLevel === 'global') {
                        note.PrimaryScopeEntityID = null;
                        note.PrimaryScopeRecordID = null;
                        note.SecondaryScopes = null;
                    } else if (scopeLevel === 'company' && sourceRun?.PrimaryScopeEntityID) {
                        note.PrimaryScopeEntityID = sourceRun.PrimaryScopeEntityID;
                        note.PrimaryScopeRecordID = sourceRun.PrimaryScopeRecordID;
                        note.SecondaryScopes = null;
                    } else if (sourceRun) {
                        note.PrimaryScopeEntityID = sourceRun.PrimaryScopeEntityID;
                        note.PrimaryScopeRecordID = sourceRun.PrimaryScopeRecordID;
                        note.SecondaryScopes = sourceRun.SecondaryScopes;
                    }

                    // UserID: Only set for user-scoped notes. Company/global notes belong to the
                    // company, not a specific user. This also enables cross-user dedup — FindSimilarAgentNotes
                    // filters by userId, so null UserID makes company notes visible to all users.
                    note.UserID = scopeLevel === 'user'
                        ? (isValidUUID(extracted.userId) ? extracted.userId! : null)
                        : null;

                    const saveResult = await note.Save();
                    if (saveResult) {
                        created++;
                    } else {
                        failed++;
                        LogError(`Memory Manager: Failed to save note - Validation errors: ${JSON.stringify(note.LatestResult)}`);
                    }
                }
            } catch (error) {
                failed++;
                LogError('Memory Manager: Exception creating note:', error);
            }
        }

        // Finalize Step 7
        await this.FinalizeRunStep(step7, failed === 0 || created > 0 || merged > 0, {
            created,
            merged,
            failed
        });

        return created + merged;
    }

    /**
     * Collapse merge candidates with identical content into a single candidate
     * carrying all merge target IDs. This prevents duplicate active notes when
     * a contradiction invalidates multiple existing notes (e.g., "I hate pizza"
     * replacing both a pepperoni note and a mushrooms note).
     */
    private collapseMergeCandidates(candidates: ExtractedNote[]): ExtractedNote[] {
        const mergeGroups = new Map<string, ExtractedNote>();
        const result: ExtractedNote[] = [];

        for (const candidate of candidates) {
            if (candidate.mergeWithExistingIds?.length) {
                const key = candidate.content.toLowerCase().trim();
                const existing = mergeGroups.get(key);
                if (existing) {
                    existing.mergeWithExistingIds!.push(...candidate.mergeWithExistingIds);
                } else {
                    mergeGroups.set(key, candidate);
                    result.push(candidate);
                }
            } else {
                result.push(candidate);
            }
        }

        return result;
    }

    /**
     * Determine whether consolidation should run based on CONSOLIDATION_CONFIG.frequency.
     * Uses AIAgentRun history instead of static in-memory state so that timing
     * survives process restarts and works correctly across clustered instances.
     *
     * Supports:
     * - 'every-run': Always run
     * - 'hourly': Run if 1+ hour since last completed MM run
     * - 'daily': Run if 24+ hours since last completed MM run
     * - number: Run every N completed MM runs
     */
    private async shouldRunConsolidation(agentId: string, contextUser: UserInfo): Promise<boolean> {
        const freq = CONSOLIDATION_CONFIG.frequency;

        if (freq === 'disabled') {
            return false;
        }

        if (freq === 'every-run') {
            return true;
        }

        if (freq === 'hourly' || freq === 'daily') {
            const thresholdHours = freq === 'hourly' ? 1 : 24;
            const lastRun = await this.GetLastRunTime(agentId, contextUser);
            if (!lastRun) {
                return true; // First run — consolidate
            }
            const hoursSinceLast = (Date.now() - lastRun.getTime()) / (1000 * 60 * 60);
            return hoursSinceLast >= thresholdHours;
        }

        // Numeric frequency: run every N completed executions
        if (typeof freq === 'number') {
            const rv = new RunView();
            const countResult = await rv.RunView({
                EntityName: 'MJ: AI Agent Runs',
                ExtraFilter: `AgentID='${agentId}' AND Status='Completed'`,
                ResultType: 'count_only'
            }, contextUser);
            const completedCount = countResult.Success ? (countResult.TotalRowCount || 0) : 0;
            return completedCount > 0 && completedCount % freq === 0;
        }

        // Default: run every time
        return true;
    }

    /**
     * Consolidate related notes into single, comprehensive notes.
     * This method finds clusters of similar notes and synthesizes them.
     *
     * @param agentId Optional - consolidate notes for a specific agent only
     * @param contextUser The context user for database operations
     * @returns Number of notes consolidated (archived)
     */
    public async consolidateRelatedNotes(
        agentId: string | null,
        contextUser: UserInfo
    ): Promise<{ consolidated: number; archived: number }> {
        const allNotes = AIEngine.Instance.AgentNotes;

        // Filter to active, auto-generated notes (optionally for specific agent)
        const activeNotes = allNotes.filter(n =>
            n.Status === 'Active' &&
            n.IsAutoGenerated &&
            (agentId === null || n.AgentID === agentId)
        );

        if (activeNotes.length < CONSOLIDATION_CONFIG.minClusterSize) {
            if (this._verbose) {
                LogStatus(`Memory Manager: Only ${activeNotes.length} active notes - need at least ${CONSOLIDATION_CONFIG.minClusterSize} to consolidate`);
            }
            return { consolidated: 0, archived: 0 };
        }

        if (this._verbose) {
            LogStatus(`Memory Manager: Analyzing ${activeNotes.length} active notes for consolidation`);
        }

        const clusters = await this.findConsolidationClusters(activeNotes);

        if (clusters.length === 0) {
            if (this._verbose) {
                LogStatus(`Memory Manager: No clusters found with ${CONSOLIDATION_CONFIG.minClusterSize}+ similar notes`);
            }
            return { consolidated: 0, archived: 0 };
        }

        if (this._verbose) {
            LogStatus(`Memory Manager: Found ${clusters.length} clusters to consolidate`);
        }

        // Find consolidation prompt
        const consolidatePrompt = AIEngine.Instance.Prompts.find(p =>
            p.Name === 'Memory Manager - Consolidate Notes' && p.Category === 'MJ: System'
        );

        if (!consolidatePrompt) {
            LogError('Memory Manager: Consolidation prompt not found');
            return { consolidated: 0, archived: 0 };
        }

        const aiNoteTypeId = AIEngine.Instance.AgenteNoteTypeIDByName('AI');
        if (!aiNoteTypeId) {
            LogError('Memory Manager: Could not find "AI" note type');
            return { consolidated: 0, archived: 0 };
        }

        let consolidated = 0;
        let archived = 0;
        const runner = new AIPromptRunner();
        const md = new Metadata();

        for (const cluster of clusters) {
            try {
                const result = await this.processConsolidationCluster(
                    cluster, consolidatePrompt, aiNoteTypeId, runner, md, contextUser
                );
                consolidated += result.consolidated;
                archived += result.archived;
            } catch (error) {
                LogError('Memory Manager: Exception during consolidation:', error);
            }
        }

        return { consolidated, archived };
    }

    /**
     * Find clusters of semantically similar notes suitable for consolidation.
     * Each cluster contains notes that exceed the similarity threshold and meet the minimum cluster size.
     */
    private async findConsolidationClusters(activeNotes: MJAIAgentNoteEntity[]): Promise<MJAIAgentNoteEntity[][]> {
        const clusters: MJAIAgentNoteEntity[][] = [];
        const processedIds = new Set<string>();

        for (const note of activeNotes) {
            if (processedIds.has(note.ID)) {
                continue;
            }

            const similarNotes = await AIEngine.Instance.FindSimilarAgentNotes(
                note.Note || '',
                note.AgentID,
                note.UserID,
                note.CompanyID,
                10,
                CONSOLIDATION_CONFIG.similarityThreshold
            );

            const cluster: MJAIAgentNoteEntity[] = [note];
            processedIds.add(note.ID);

            for (const similar of similarNotes) {
                if (!processedIds.has(similar.note.ID)) {
                    cluster.push(similar.note);
                    processedIds.add(similar.note.ID);
                }
            }

            if (cluster.length >= CONSOLIDATION_CONFIG.minClusterSize) {
                clusters.push(cluster);
            }
        }

        return clusters;
    }

    /**
     * Process a single consolidation cluster: run the LLM prompt, create the consolidated note,
     * and revoke source notes.
     */
    private async processConsolidationCluster(
        cluster: MJAIAgentNoteEntity[],
        consolidatePrompt: AIPromptEntityExtended,
        aiNoteTypeId: string,
        runner: AIPromptRunner,
        md: Metadata,
        contextUser: UserInfo
    ): Promise<{ consolidated: number; archived: number }> {
        const promptData = {
            notesToConsolidate: cluster.map(n => ({
                id: n.ID,
                type: n.Type,
                content: n.Note,
                createdAt: n.__mj_CreatedAt,
                accessCount: n.AccessCount,
                agentId: n.AgentID,
                userId: n.UserID,
                companyId: n.CompanyID
            }))
        };

        const params = new AIPromptParams();
        params.prompt = consolidatePrompt;
        params.data = promptData;
        params.contextUser = contextUser;
        params.attemptJSONRepair = true;

        const result = await runner.ExecutePrompt<{
            shouldConsolidate: boolean;
            consolidatedNote?: {
                type: string;
                content: string;
                scopeLevel: string;
                confidence: number;
            };
            sourceNoteIds?: string[];
            reason: string;
        }>(params);

        if (!result.success || !result.result) {
            LogError(`Memory Manager: Consolidation prompt failed for cluster: ${result.errorMessage}`);
            return { consolidated: 0, archived: 0 };
        }

        // Parse result if string (some models wrap JSON in ```json fences)
        let parsedResult = result.result;
        if (typeof result.result === 'string') {
            const parsed = CleanAndParseJSON<typeof result.result>(result.result, true);
            if (!parsed) {
                LogError('Memory Manager: Failed to parse consolidation result');
                return { consolidated: 0, archived: 0 };
            }
            parsedResult = parsed;
        }

        if (!parsedResult.shouldConsolidate) {
            if (this._verbose) {
                LogStatus(`Memory Manager: Skipping cluster consolidation - ${parsedResult.reason}`);
            }
            return { consolidated: 0, archived: 0 };
        }

        // Create consolidated note
        const consolidatedNoteData = parsedResult.consolidatedNote!;
        const newNote = await md.GetEntityObject<MJAIAgentNoteEntity>('MJ: AI Agent Notes', contextUser);
        const templateNote = cluster[0];

        newNote.AgentID = templateNote.AgentID;
        newNote.UserID = templateNote.UserID;
        newNote.CompanyID = templateNote.CompanyID;
        newNote.AgentNoteTypeID = aiNoteTypeId;
        newNote.Type = consolidatedNoteData.type as 'Preference' | 'Constraint' | 'Context' | 'Issue';
        newNote.Note = consolidatedNoteData.content;
        newNote.IsAutoGenerated = true;
        newNote.Status = 'Active';
        newNote.AccessCount = cluster.reduce((sum, n) => sum + (n.AccessCount || 0), 0);
        newNote.Comments = `Consolidated from ${cluster.length} notes: ${parsedResult.reason}`;

        this.applyScopeToConsolidatedNote(newNote, templateNote, consolidatedNoteData.scopeLevel);

        const saveResult = await newNote.Save();
        if (!saveResult) {
            LogError(`Memory Manager: Failed to save consolidated note: ${JSON.stringify(newNote.LatestResult)}`);
            return { consolidated: 0, archived: 0 };
        }

        // Revoke source notes in parallel
        // TODO: When a ConsolidatedIntoNoteID FK column is added to AI Agent Notes,
        // set it here so decomposition can properly restore source notes.
        const revokeResults = await Promise.all(
            cluster.map(async (sourceNote) => {
                const noteToRevoke = await md.GetEntityObject<MJAIAgentNoteEntity>('MJ: AI Agent Notes', contextUser);
                if (await noteToRevoke.Load(sourceNote.ID)) {
                    noteToRevoke.Status = 'Revoked';
                    noteToRevoke.Comments = 'Revoked during note consolidation';
                    if (await noteToRevoke.Save()) {
                        return true;
                    } else {
                        LogError(`Memory Manager: Failed to revoke source note ${sourceNote.ID}`);
                    }
                }
                return false;
            })
        );
        const archived = revokeResults.filter(Boolean).length;

        if (this._verbose) {
            LogStatus(`Memory Manager: Consolidated ${cluster.length} notes into: "${consolidatedNoteData.content.substring(0, 50)}..."`);
        }

        return { consolidated: 1, archived };
    }

    /**
     * Apply scope fields to a consolidated note based on the LLM's scope recommendation.
     * Mirrors the scoping logic in CreateNoteRecords.
     */
    private applyScopeToConsolidatedNote(
        newNote: MJAIAgentNoteEntity,
        templateNote: MJAIAgentNoteEntity,
        scopeLevel: string | undefined
    ): void {
        const level = scopeLevel || 'user';

        if (level === 'global') {
            newNote.PrimaryScopeEntityID = null;
            newNote.PrimaryScopeRecordID = null;
            newNote.SecondaryScopes = null;
        } else if (level === 'company' && templateNote.PrimaryScopeEntityID) {
            newNote.PrimaryScopeEntityID = templateNote.PrimaryScopeEntityID;
            newNote.PrimaryScopeRecordID = templateNote.PrimaryScopeRecordID;
            newNote.SecondaryScopes = null;
        } else {
            // user (default) — inherit full scope
            newNote.PrimaryScopeEntityID = templateNote.PrimaryScopeEntityID;
            newNote.PrimaryScopeRecordID = templateNote.PrimaryScopeRecordID;
            newNote.SecondaryScopes = templateNote.SecondaryScopes;
        }
    }

    /**
     * Create example records from extracted data.
     * Inherits scope from source agent run and applies scopeLevel to determine scope specificity.
     */
    private async CreateExampleRecords(extractedExamples: ExtractedExample[], contextUser: UserInfo): Promise<number> {
        // Step 8: Create Example Records
        const step8 = await this.CreateRunStep('Decision', 'Create Example Records', {
            exampleCount: extractedExamples.length
        });

        let created = 0;
        let skipped = 0;
        let failed = 0;
        const md = new Metadata();
        const rv = new RunView();

        // Cache source agent runs to avoid repeated lookups
        const runCache = new Map<string, MJAIAgentRunEntity | null>();

        for (const extracted of extractedExamples) {
            try {
                // Load source agent run for scope inheritance (if available)
                let sourceRun: MJAIAgentRunEntity | null = null;
                if (extracted.sourceAgentRunId) {
                    if (!runCache.has(extracted.sourceAgentRunId)) {
                        const runResult = await rv.RunView<MJAIAgentRunEntity>({
                            EntityName: 'MJ: AI Agent Runs',
                            ExtraFilter: `ID='${extracted.sourceAgentRunId}'`,
                            MaxRows: 1,
                            ResultType: 'entity_object'
                        }, contextUser);
                        runCache.set(extracted.sourceAgentRunId, runResult.Success && runResult.Results?.length > 0 ? runResult.Results[0] : null);
                    }
                    sourceRun = runCache.get(extracted.sourceAgentRunId) || null;
                }

                const example = await md.GetEntityObject<MJAIAgentExampleEntity>('MJ: AI Agent Examples', contextUser);

                // AgentID must come from source run - LLM doesn't know real agent IDs
                if (!sourceRun?.AgentID) {
                    skipped++;
                    if (this._verbose) {
                        LogStatus(`Memory Manager: Skipping example - no source run to inherit AgentID from`);
                    }
                    continue;
                }
                example.AgentID = sourceRun.AgentID;
                example.UserID = extracted.userId || null;
                example.CompanyID = extracted.companyId || null;
                example.Type = extracted.type;
                example.ExampleInput = extracted.exampleInput;
                example.ExampleOutput = extracted.exampleOutput;
                example.IsAutoGenerated = true;
                example.SuccessScore = extracted.successScore;
                example.Status = 'Active'; // Auto-approve high-confidence examples
                example.SourceConversationID = extracted.sourceConversationId || null;
                // Only use if it's a valid UUID
                example.SourceConversationDetailID = this.isValidUUID(extracted.sourceConversationDetailId) ? extracted.sourceConversationDetailId! : null;
                example.SourceAIAgentRunID = extracted.sourceAgentRunId || null;

                // Apply scope from source agent run based on scopeLevel hint
                if (sourceRun && sourceRun.PrimaryScopeEntityID) {
                    const scopeLevel = extracted.scopeLevel || 'user'; // Default to most specific

                    if (scopeLevel === 'global') {
                        // Global example - no scope fields set
                        example.PrimaryScopeEntityID = null;
                        example.PrimaryScopeRecordID = null;
                        example.SecondaryScopes = null;
                    } else if (scopeLevel === 'company') {
                        // Company-level example - primary scope only, no secondary
                        example.PrimaryScopeEntityID = sourceRun.PrimaryScopeEntityID;
                        example.PrimaryScopeRecordID = sourceRun.PrimaryScopeRecordID;
                        example.SecondaryScopes = null;
                    } else {
                        // Fully-scoped example (user level) - inherit full scope
                        example.PrimaryScopeEntityID = sourceRun.PrimaryScopeEntityID;
                        example.PrimaryScopeRecordID = sourceRun.PrimaryScopeRecordID;
                        example.SecondaryScopes = sourceRun.SecondaryScopes;
                    }
                }

                if (await example.Save()) {
                    created++;
                } else {
                    failed++;
                    LogError(`Memory Manager: Failed to save example - Validation errors: ${JSON.stringify(example.LatestResult)}`);
                }
            } catch (error) {
                failed++;
                LogError('Memory Manager: Exception creating example:', error);
            }
        }

        // Finalize Step 8
        await this.FinalizeRunStep(step8, failed === 0 || created > 0, {
            created,
            skipped,
            failed
        });

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
            // Use verbose flag from agent execution params or data payload (UI passes it via data)
            this._verbose = params.verbose ?? params.data?.verbose ?? false;

            // Initialize observability state for this run
            this._agentRunID = this.AgentRun?.ID || null;
            this._stepCounter = 0;
            this._contextUser = params.contextUser || null;

            LogStatus('Memory Manager: Starting analysis cycle');

            const lastRunTime = await this.GetLastRunTime(params.agent.ID, params.contextUser!);

            // Load agents that have memory injection enabled
            const agentsUsingMemory = await this.LoadAgentsUsingMemory(params.contextUser!);

            if (this._verbose) {
                const sinceMessage = lastRunTime ? `since ${lastRunTime.toISOString()}` : 'all history';
                LogStatus(`Memory Manager: Processing ${sinceMessage}`);
                LogStatus(`Memory Manager: Found ${agentsUsingMemory.length} agents with memory injection enabled`);
            }

            if (agentsUsingMemory.length === 0) {
                const finalStep: BaseAgentNextStep<P> = {
                    terminate: true,
                    step: 'Success',
                    message: 'No agents have note/example injection enabled - nothing to extract'
                };
                return { finalStep, stepCount: 1 };
            }

            // Step 1: Load conversations with new activity (includes rating data)
            const step1 = await this.CreateRunStep('Decision', 'Load Conversations With New Activity', {
                since: lastRunTime?.toISOString() || null,
                agentCount: agentsUsingMemory.length,
                agentIds: agentsUsingMemory.map(a => a.ID)
            });
            const conversations = await this.LoadConversationsWithNewActivity(lastRunTime, agentsUsingMemory, params.contextUser!);
            const totalMessages = conversations.reduce((sum, c) => sum + c.messages.length, 0);
            await this.FinalizeRunStep(step1, true, {
                conversationCount: conversations.length,
                totalMessages,
                positiveCount: conversations.filter(c => c.hasPositiveRating).length,
                negativeCount: conversations.filter(c => c.hasNegativeRating).length,
                unratedCount: conversations.filter(c => c.isUnrated).length
            });
            if (this._verbose) {
                LogStatus(`Memory Manager: Found ${conversations.length} conversations with new activity`);
            }

            // Step 2: Load high-value agent runs
            const step2 = await this.CreateRunStep('Decision', 'Load High-Value Agent Runs', {
                since: lastRunTime?.toISOString() || null
            });
            const agentRuns = await this.LoadHighValueAgentRuns(lastRunTime, params.contextUser!);
            await this.FinalizeRunStep(step2, true, {
                runCount: agentRuns.length
            });
            if (this._verbose) {
                LogStatus(`Memory Manager: Found ${agentRuns.length} high-value agent runs`);
            }

            if (conversations.length === 0 && agentRuns.length === 0) {
                if (this._verbose) {
                    LogStatus('Memory Manager: No data to process');
                }
                const finalStep: BaseAgentNextStep<P> = {
                    terminate: true,
                    step: 'Success',
                    message: 'No conversations with new activity or agent runs to process'
                };
                return { finalStep, stepCount: 1 };
            }

            // Initialization guard: ensure vector services exist for semantic dedup.
            // If no notes existed at server startup, _noteVectorService is null and
            // AddOrUpdateSingleNoteEmbedding will throw when saving new notes.
            // The two post-creation/post-consolidation Config(true) calls were removed
            // because entity save hooks now update vectors incrementally.
            await AIEngine.Instance.Config(true, params.contextUser);

            // Extract notes from conversations (with rating context)
            const extractedNotes = await this.ExtractNotesFromConversations(conversations, params.contextUser!);
            if (this._verbose) {
                LogStatus(`Memory Manager: Extracted ${extractedNotes.length} potential notes`);
            }

            // Extract examples from conversation details (legacy method for now)
            // Convert conversations back to flat details for example extraction
            const conversationDetails = conversations.flatMap(conv =>
                conv.messages.map(msg => ({
                    ID: msg.id,
                    ConversationID: conv.conversationId,
                    Role: msg.role,
                    Message: msg.message,
                    Status: 'Complete',
                    __mj_CreatedAt: msg.createdAt
                } as unknown as MJConversationDetailEntity))
            );
            const extractedExamples = await this.ExtractExamples(conversationDetails, params.contextUser!);
            if (this._verbose) {
                LogStatus(`Memory Manager: Extracted ${extractedExamples.length} potential examples`);
            }

            // Enrich examples with userId and agentRunId from conversation context
            // Build a map from conversationId to context (same as notes enrichment)
            const conversationContextForExamples = new Map<string, { userId: string | null; agentRunId: string | null }>();
            for (const conv of conversations) {
                conversationContextForExamples.set(conv.conversationId, {
                    userId: conv.userId || null,
                    agentRunId: conv.agentRunId || null
                });
            }

            for (const example of extractedExamples) {
                if (example.sourceConversationId) {
                    const ctx = conversationContextForExamples.get(example.sourceConversationId);
                    if (ctx) {
                        // Enrich userId if not set
                        if (!example.userId && ctx.userId) {
                            example.userId = ctx.userId;
                            if (this._verbose) {
                                LogStatus(`Memory Manager: Enriched example with userId from conversation: ${ctx.userId}`);
                            }
                        }
                        // Enrich agentRunId if not set
                        if (!example.sourceAgentRunId && ctx.agentRunId) {
                            example.sourceAgentRunId = ctx.agentRunId;
                            if (this._verbose) {
                                LogStatus(`Memory Manager: Enriched example with agentRunId from conversation: ${ctx.agentRunId}`);
                            }
                        }
                    }
                }
                // Clear invalid agentId (LLM sometimes returns placeholder values like "agent-12345")
                if (example.agentId && !this.isValidUUID(example.agentId)) {
                    if (this._verbose) {
                        LogStatus(`Memory Manager: Clearing invalid agentId "${example.agentId}" from example`);
                    }
                    example.agentId = '';
                }
            }

            // Create records
            const notesCreated = await this.CreateNoteRecords(extractedNotes, params.contextUser!);
            const examplesCreated = await this.CreateExampleRecords(extractedExamples, params.contextUser!);

            LogStatus(`Memory Manager: Created ${notesCreated} notes and ${examplesCreated} examples`);

            // Step 9: Consolidate related notes
            // This finds clusters of similar notes and synthesizes them into single comprehensive notes
            let consolidatedCount = 0;
            let archivedCount = 0;
            if (await this.shouldRunConsolidation(params.agent.ID, params.contextUser!)) {
                LogStatus(`Memory Manager: Running note consolidation...`);
                const consolidationResult = await this.consolidateRelatedNotes(null, params.contextUser!);
                consolidatedCount = consolidationResult.consolidated;
                archivedCount = consolidationResult.archived;
                if (consolidatedCount > 0 || archivedCount > 0) {
                    LogStatus(`Memory Manager: Consolidated ${consolidatedCount} note clusters, archived ${archivedCount} source notes`);
                } else {
                    LogStatus(`Memory Manager: No notes to consolidate`);
                }
            }

            const consolidationSummary = consolidatedCount > 0 ? ` Consolidated ${consolidatedCount} clusters (${archivedCount} notes archived).` : '';
            const finalStep: BaseAgentNextStep<P> = {
                terminate: true,
                step: 'Success',
                message: `Processed ${conversations.length} conversations (${totalMessages} messages) and ${agentRuns.length} agent runs. Created ${notesCreated} notes and ${examplesCreated} examples.${consolidationSummary}`,
                newPayload: {
                    notesCreated,
                    examplesCreated,
                    conversationsProcessed: conversations.length,
                    messagesProcessed: totalMessages,
                    agentRunsProcessed: agentRuns.length,
                    notesConsolidated: consolidatedCount,
                    notesArchived: archivedCount
                } as unknown as P
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
