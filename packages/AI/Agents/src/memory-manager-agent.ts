import { BaseAgent } from './base-agent';
import { RegisterClass } from '@memberjunction/global';
import { UserInfo, Metadata, RunView, RunQuery, LogError, LogStatus } from '@memberjunction/core';
import {
    ConversationDetailEntity,
    AIAgentRunEntity,
    AIAgentNoteEntity,
    AIAgentExampleEntity,
    ConversationDetailRatingEntity
} from '@memberjunction/core-entities';
import { AIPromptRunner } from '@memberjunction/ai-prompts';
import { AIPromptParams, ExecuteAgentParams, AgentConfiguration, BaseAgentNextStep, AIAgentEntityExtended } from '@memberjunction/ai-core-plus';
import { AIEngine } from '@memberjunction/aiengine';

/**
 * Configuration for extraction limits to ensure sparsity
 */
const EXTRACTION_CONFIG = {
    maxNotesPerRun: 10,           // Max new notes per agent run
    maxNotesPerConversation: 2,   // Max notes from a single conversation (most should be zero)
    minConfidenceThreshold: 80,   // Minimum confidence to extract a note
    minContentLength: 20,         // Minimum note content length
    cooldownHours: 24,            // Don't re-extract from same conversation within 24h
    verboseLogging: false         // Enable detailed per-item logging (noisy, use for debugging)
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
    mergeWithExistingId?: string; // If should update existing note
    /**
     * Scope level hint from LLM analysis.
     * - 'global': Applies to all users (e.g., "Always greet politely")
     * - 'organization': Applies to all contacts in an org (e.g., "This org uses metric units")
     * - 'contact': Specific to one contact (e.g., "John prefers email")
     */
    scopeLevel?: 'global' | 'organization' | 'contact';
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
     * - 'organization': Applies to all contacts in an org
     * - 'contact': Specific to one contact
     */
    scopeLevel?: 'global' | 'organization' | 'contact';
}

/**
 * Memory Manager Agent - automatically extracts notes and examples from conversations.
 * This agent runs on a schedule (every 15 minutes) and analyzes high-quality conversations
 * and agent runs to extract learnings and example interactions.
 */
@RegisterClass(BaseAgent, 'MemoryManagerAgent')
export class MemoryManagerAgent extends BaseAgent {
    /**
     * Get the last run timestamp for this agent to determine what to process.
     * For first run, returns null to process all history (limited by MaxRows).
     */
    private async GetLastRunTime(agentId: string, contextUser: UserInfo): Promise<Date | null> {
        const rv = new RunView();
        const result = await rv.RunView<AIAgentRunEntity>({
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
        if (EXTRACTION_CONFIG.verboseLogging) {
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
            MaxRows: 50 // Limit to 50 conversations per run
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
        if (EXTRACTION_CONFIG.verboseLogging) {
            LogStatus(`Memory Manager: Loaded ${conversations.length} conversations with ${totalMessages} total messages (positive: ${conversations.filter(c => c.hasPositiveRating).length}, negative: ${conversations.filter(c => c.hasNegativeRating).length}, unrated: ${conversations.filter(c => c.isUnrated).length})`);
        }

        return conversations;
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
        existingNotes: AIAgentNoteEntity[],
        contextUser: UserInfo
    ): Promise<ExtractedNote[]> {
        const conversationThreads = promptData.conversationThreads;

        // Find extraction prompt
        const prompt = AIEngine.Instance.Prompts.find(p =>
            p.Name === 'Memory Manager - Extract Notes' && p.Category === 'MJ: System'
        );

        if (!prompt) {
            LogError('Memory Manager note extraction prompt not found');
            if (EXTRACTION_CONFIG.verboseLogging) {
                LogStatus(`Memory Manager: Available prompts in MJ: System category: ${AIEngine.Instance.Prompts.filter(p => p.Category === 'MJ: System').map(p => p.Name).join(', ')}`);
            }
            return [];
        }

        if (EXTRACTION_CONFIG.verboseLogging) {
            LogStatus(`Memory Manager: Found extraction prompt "${prompt.Name}" (ID: ${prompt.ID})`);
            LogStatus(`Memory Manager: Sending ${conversationThreads.length} conversation threads with ${conversationThreads.reduce((sum, t) => sum + t.messages.length, 0)} total messages for note extraction`);
            if (conversationThreads.length > 0) {
                const firstThread = conversationThreads[0];
                LogStatus(`Memory Manager: Sample thread (conv ${firstThread.conversationId}): ${firstThread.messages.map(m => `[${m.role}] ${m.message?.substring(0, 80)}...`).join(' | ')}`)
            }
        }

        // Execute AI extraction
        const runner = new AIPromptRunner();
        const params = new AIPromptParams();
        params.prompt = prompt;
        params.data = promptData;
        params.contextUser = contextUser;

        const result = await runner.ExecutePrompt<{ notes: ExtractedNote[] }>(params);

        if (EXTRACTION_CONFIG.verboseLogging) {
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
        let parsedResult: { notes: ExtractedNote[] };
        if (typeof result.result === 'string') {
            try {
                parsedResult = JSON.parse(result.result);
                if (EXTRACTION_CONFIG.verboseLogging) {
                    LogStatus(`Memory Manager: Parsed string result into object with ${parsedResult.notes?.length || 0} notes`);
                }
            } catch (e) {
                LogError('Failed to parse extraction result as JSON:', e);
                return [];
            }
        } else {
            parsedResult = result.result;
        }

        // Filter by confidence threshold (use EXTRACTION_CONFIG)
        const candidateNotes = (parsedResult.notes || []).filter(n =>
            n.confidence >= EXTRACTION_CONFIG.minConfidenceThreshold &&
            n.content && n.content.length >= EXTRACTION_CONFIG.minContentLength
        );

        if (candidateNotes.length === 0) {
            if (EXTRACTION_CONFIG.verboseLogging) {
                LogStatus('Memory Manager: No candidates passed confidence/length thresholds');
            }
            return [];
        }

        if (EXTRACTION_CONFIG.verboseLogging) {
            LogStatus(`Memory Manager: ${candidateNotes.length} candidates passed confidence threshold (>=${EXTRACTION_CONFIG.minConfidenceThreshold})`);
        }

        // Apply sparsity: limit notes per conversation
        const notesByConversation = new Map<string, ExtractedNote[]>();
        for (const note of candidateNotes) {
            const convId = note.sourceConversationId || 'unknown';
            const existing = notesByConversation.get(convId) || [];
            if (existing.length < EXTRACTION_CONFIG.maxNotesPerConversation) {
                existing.push(note);
                notesByConversation.set(convId, existing);
            } else if (EXTRACTION_CONFIG.verboseLogging) {
                LogStatus(`Memory Manager: Skipping note (max ${EXTRACTION_CONFIG.maxNotesPerConversation} per conversation reached for ${convId})`);
            }
        }

        const sparseCandidates = Array.from(notesByConversation.values()).flat();
        if (EXTRACTION_CONFIG.verboseLogging) {
            LogStatus(`Memory Manager: ${sparseCandidates.length} candidates after sparsity filter`);
        }

        // Apply deduplication
        const approvedNotes: ExtractedNote[] = [];

        // Find deduplication prompt
        const dedupePrompt = AIEngine.Instance.Prompts.find(p =>
            p.Name === 'Memory Manager - Deduplicate Note' && p.Category === 'MJ: System'
        );

        for (const candidate of sparseCandidates) {
            // Check global max notes per run
            if (approvedNotes.length >= EXTRACTION_CONFIG.maxNotesPerRun) {
                if (EXTRACTION_CONFIG.verboseLogging) {
                    LogStatus(`Memory Manager: Stopping - max notes per run (${EXTRACTION_CONFIG.maxNotesPerRun}) reached`);
                }
                break;
            }

            // Step 1: Check for exact content match FIRST (case-insensitive, trimmed)
            const normalizedContent = candidate.content.toLowerCase().trim();
            const exactMatch = existingNotes.find(n =>
                n.Note && n.Note.toLowerCase().trim() === normalizedContent
            );
            if (exactMatch) {
                if (EXTRACTION_CONFIG.verboseLogging) {
                    LogStatus(`Memory Manager: Skipping exact duplicate: "${candidate.content.substring(0, 50)}..."`);
                }
                continue;
            }

            // Step 2: Find similar existing notes using semantic search with tighter threshold
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

                const dedupeResult = await runner.ExecutePrompt<{ shouldAdd: boolean; reason: string }>(dedupeParams);

                if (dedupeResult.success && dedupeResult.result && dedupeResult.result.shouldAdd) {
                    approvedNotes.push(candidate);
                    if (EXTRACTION_CONFIG.verboseLogging) {
                        LogStatus(`Memory Manager: Approved note - ${dedupeResult.result.reason}`);
                    }
                } else if (EXTRACTION_CONFIG.verboseLogging) {
                    LogStatus(`Memory Manager: Skipped duplicate note - ${dedupeResult.result?.reason || 'too similar to existing notes'}`);
                }
            } else {
                // No similar notes found or no deduplication prompt, add the note
                approvedNotes.push(candidate);
                if (EXTRACTION_CONFIG.verboseLogging) {
                    LogStatus(`Memory Manager: Approved note (no similar notes found): "${candidate.content.substring(0, 50)}..."`);
                }
            }
        }

        if (EXTRACTION_CONFIG.verboseLogging) {
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

        // Parse result if it's a string (AI sometimes returns JSON as string)
        let parsedResult: { examples: ExtractedExample[] };
        if (typeof extractResult.result === 'string') {
            try {
                parsedResult = JSON.parse(extractResult.result);
            } catch (e) {
                LogError('Failed to parse example extraction result as JSON:', e);
                return [];
            }
        } else {
            parsedResult = extractResult.result;
        }

        const candidateExamples = (parsedResult.examples || [])
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
                    if (EXTRACTION_CONFIG.verboseLogging) {
                        LogStatus(`Memory Manager: Approved example - ${dedupeResult.result.reason}`);
                    }
                } else if (EXTRACTION_CONFIG.verboseLogging) {
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
        let created = 0;
        const md = new Metadata();
        const rv = new RunView();

        // Cache source agent runs to avoid repeated lookups
        const runCache = new Map<string, AIAgentRunEntity | null>();

        // Get the "AI" note type ID for AI-generated notes
        const aiNoteTypeId = AIEngine.Instance.AgenteNoteTypeIDByName('AI');
        if (!aiNoteTypeId) {
            LogError('Memory Manager: Could not find "AI" note type - cannot create notes');
            return 0;
        }

        for (const extracted of extractedNotes) {
            try {

                // Load source agent run for scope inheritance (if available)
                let sourceRun: AIAgentRunEntity | null = null;
                if (extracted.sourceAgentRunId) {
                    if (!runCache.has(extracted.sourceAgentRunId)) {
                        const runResult = await rv.RunView<AIAgentRunEntity>({
                            EntityName: 'MJ: AI Agent Runs',
                            ExtraFilter: `ID='${extracted.sourceAgentRunId}'`,
                            MaxRows: 1,
                            ResultType: 'entity_object'
                        }, contextUser);
                        runCache.set(extracted.sourceAgentRunId, runResult.Success && runResult.Results?.length > 0 ? runResult.Results[0] : null);
                    }
                    sourceRun = runCache.get(extracted.sourceAgentRunId) || null;
                }

                // Check if we should merge with existing
                if (extracted.mergeWithExistingId) {
                    const existingNote = await md.GetEntityObject<AIAgentNoteEntity>('AI Agent Notes', contextUser);
                    if (await existingNote.Load(extracted.mergeWithExistingId)) {
                        // Update existing note
                        existingNote.Note = extracted.content;
                        existingNote.Type = extracted.type;
                        existingNote.AgentNoteTypeID = aiNoteTypeId;
                        await existingNote.Save();
                        created++;
                    }
                } else {
                    // Create new note
                    const note = await md.GetEntityObject<AIAgentNoteEntity>('AI Agent Notes', contextUser);
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
                    note.UserID = isValidUUID(extracted.userId) ? extracted.userId! : null;
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

                    // Apply scope: Lean towards USER-specific memories by default
                    const scopeLevel = extracted.scopeLevel || 'contact';

                    if (scopeLevel === 'global') {
                        note.PrimaryScopeEntityID = null;
                        note.PrimaryScopeRecordID = null;
                        note.SecondaryScopes = null;
                    } else if (scopeLevel === 'organization' && sourceRun?.PrimaryScopeEntityID) {
                        note.PrimaryScopeEntityID = sourceRun.PrimaryScopeEntityID;
                        note.PrimaryScopeRecordID = sourceRun.PrimaryScopeRecordID;
                        note.SecondaryScopes = null;
                    } else if (sourceRun) {
                        note.PrimaryScopeEntityID = sourceRun.PrimaryScopeEntityID;
                        note.PrimaryScopeRecordID = sourceRun.PrimaryScopeRecordID;
                        note.SecondaryScopes = sourceRun.SecondaryScopes;
                    }

                    const saveResult = await note.Save();
                    if (saveResult) {
                        created++;
                    } else {
                        LogError(`Memory Manager: Failed to save note - Validation errors: ${JSON.stringify(note.LatestResult)}`);
                    }
                }
            } catch (error) {
                LogError('Memory Manager: Exception creating note:', error);
            }
        }

        return created;
    }

    /**
     * Create example records from extracted data.
     * Inherits scope from source agent run and applies scopeLevel to determine scope specificity.
     */
    private async CreateExampleRecords(extractedExamples: ExtractedExample[], contextUser: UserInfo): Promise<number> {
        let created = 0;
        const md = new Metadata();
        const rv = new RunView();

        // Cache source agent runs to avoid repeated lookups
        const runCache = new Map<string, AIAgentRunEntity | null>();

        for (const extracted of extractedExamples) {
            try {
                // Load source agent run for scope inheritance (if available)
                let sourceRun: AIAgentRunEntity | null = null;
                if (extracted.sourceAgentRunId) {
                    if (!runCache.has(extracted.sourceAgentRunId)) {
                        const runResult = await rv.RunView<AIAgentRunEntity>({
                            EntityName: 'MJ: AI Agent Runs',
                            ExtraFilter: `ID='${extracted.sourceAgentRunId}'`,
                            MaxRows: 1,
                            ResultType: 'entity_object'
                        }, contextUser);
                        runCache.set(extracted.sourceAgentRunId, runResult.Success && runResult.Results?.length > 0 ? runResult.Results[0] : null);
                    }
                    sourceRun = runCache.get(extracted.sourceAgentRunId) || null;
                }

                const example = await md.GetEntityObject<AIAgentExampleEntity>('MJ: AI Agent Examples', contextUser);

                // AgentID must come from source run - LLM doesn't know real agent IDs
                if (!sourceRun?.AgentID) {
                    if (EXTRACTION_CONFIG.verboseLogging) {
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
                    const scopeLevel = extracted.scopeLevel || 'contact'; // Default to most specific

                    if (scopeLevel === 'global') {
                        // Global example - no scope fields set
                        example.PrimaryScopeEntityID = null;
                        example.PrimaryScopeRecordID = null;
                        example.SecondaryScopes = null;
                    } else if (scopeLevel === 'organization') {
                        // Org-level example - primary scope only, no secondary
                        example.PrimaryScopeEntityID = sourceRun.PrimaryScopeEntityID;
                        example.PrimaryScopeRecordID = sourceRun.PrimaryScopeRecordID;
                        example.SecondaryScopes = null;
                    } else {
                        // Fully-scoped example (contact level) - inherit full scope
                        example.PrimaryScopeEntityID = sourceRun.PrimaryScopeEntityID;
                        example.PrimaryScopeRecordID = sourceRun.PrimaryScopeRecordID;
                        example.SecondaryScopes = sourceRun.SecondaryScopes;
                    }
                }

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

            // Load agents that have memory injection enabled
            const agentsUsingMemory = await this.LoadAgentsUsingMemory(params.contextUser!);

            if (EXTRACTION_CONFIG.verboseLogging) {
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

            // Load conversations with new activity (includes rating data)
            const conversations = await this.LoadConversationsWithNewActivity(lastRunTime, agentsUsingMemory, params.contextUser!);
            if (EXTRACTION_CONFIG.verboseLogging) {
                LogStatus(`Memory Manager: Found ${conversations.length} conversations with new activity`);
            }

            // Load high-value agent runs
            const agentRuns = await this.LoadHighValueAgentRuns(lastRunTime, params.contextUser!);
            if (EXTRACTION_CONFIG.verboseLogging) {
                LogStatus(`Memory Manager: Found ${agentRuns.length} high-value agent runs`);
            }

            if (conversations.length === 0 && agentRuns.length === 0) {
                if (EXTRACTION_CONFIG.verboseLogging) {
                    LogStatus('Memory Manager: No data to process');
                }
                const finalStep: BaseAgentNextStep<P> = {
                    terminate: true,
                    step: 'Success',
                    message: 'No conversations with new activity or agent runs to process'
                };
                return { finalStep, stepCount: 1 };
            }

            // Extract notes from conversations (with rating context)
            const extractedNotes = await this.ExtractNotesFromConversations(conversations, params.contextUser!);
            if (EXTRACTION_CONFIG.verboseLogging) {
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
                } as unknown as ConversationDetailEntity))
            );
            const extractedExamples = await this.ExtractExamples(conversationDetails, params.contextUser!);
            if (EXTRACTION_CONFIG.verboseLogging) {
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
                            if (EXTRACTION_CONFIG.verboseLogging) {
                                LogStatus(`Memory Manager: Enriched example with userId from conversation: ${ctx.userId}`);
                            }
                        }
                        // Enrich agentRunId if not set
                        if (!example.sourceAgentRunId && ctx.agentRunId) {
                            example.sourceAgentRunId = ctx.agentRunId;
                            if (EXTRACTION_CONFIG.verboseLogging) {
                                LogStatus(`Memory Manager: Enriched example with agentRunId from conversation: ${ctx.agentRunId}`);
                            }
                        }
                    }
                }
                // Clear invalid agentId (LLM sometimes returns placeholder values like "agent-12345")
                if (example.agentId && !this.isValidUUID(example.agentId)) {
                    if (EXTRACTION_CONFIG.verboseLogging) {
                        LogStatus(`Memory Manager: Clearing invalid agentId "${example.agentId}" from example`);
                    }
                    example.agentId = '';
                }
            }

            // Create records
            const notesCreated = await this.CreateNoteRecords(extractedNotes, params.contextUser!);
            const examplesCreated = await this.CreateExampleRecords(extractedExamples, params.contextUser!);

            LogStatus(`Memory Manager: Created ${notesCreated} notes and ${examplesCreated} examples`);

            const totalMessages = conversations.reduce((sum, c) => sum + c.messages.length, 0);
            const finalStep: BaseAgentNextStep<P> = {
                terminate: true,
                step: 'Success',
                message: `Processed ${conversations.length} conversations (${totalMessages} messages) and ${agentRuns.length} agent runs. Created ${notesCreated} notes and ${examplesCreated} examples.`,
                newPayload: {
                    notesCreated,
                    examplesCreated,
                    conversationsProcessed: conversations.length,
                    messagesProcessed: totalMessages,
                    agentRunsProcessed: agentRuns.length
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
