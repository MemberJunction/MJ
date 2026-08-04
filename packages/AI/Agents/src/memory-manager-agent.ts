import { BaseAgent } from './base-agent';
import { RegisterClass, CleanAndParseJSON } from '@memberjunction/global';
import { UserInfo, RunView, RunQuery, LogError, LogStatus, LogStatusEx, IMetadataProvider } from '@memberjunction/core';
import {
    MJConversationDetailEntity,
    MJAIAgentNoteEntity,
    MJAIAgentExampleEntity,
    MJConversationDetailRatingEntity,
    MJAIAgentRunStepEntity,
    IsInjectableNoteStatus
} from '@memberjunction/core-entities';
import { AIPromptRunner } from '@memberjunction/ai-prompts';
import { AIPromptParams, AIPromptRunResult, ExecuteAgentParams, AgentConfiguration, BaseAgentNextStep, MJAIAgentEntityExtended, MJAIPromptEntityExtended } from '@memberjunction/ai-core-plus';
import { AIEngine } from '@memberjunction/aiengine';
import { UUIDsEqual } from '@memberjunction/global';

/**
 * Minimal shape of a conversation message that ExtractExamples needs. Lets callers pass
 * either a full MJConversationDetailEntity or a plain literal assembled from other sources
 * (e.g., loaded agent-run transcripts) without casting through `unknown`. Role is
 * intentionally widened to `string` so callers don't need to satisfy the entity's stricter
 * enum — ExtractExamples just forwards it to the prompt payload.
 */
interface ConversationDetailProjection {
    ID: string;
    ConversationID: string;
    Role: string;
    Message: string;
    __mj_CreatedAt: Date;
}

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

/** Cap on a failed run's ErrorMessage length when summarizing it for corrective extraction. */
const MAX_FAILURE_ERROR_CHARS = 2000;

/**
 * Configuration for note consolidation.
 * Consolidation finds clusters of similar notes and synthesizes them into single comprehensive notes.
 */
const HARDENING_CONFIG = {
    maxNotesPerRun: 200,           // Batch cap per MM run — remaining provisional notes picked up next cycle
    dedupeSimilarity: 0.85,        // Similarity threshold for the dedupe check against hardened notes
};

const CONSOLIDATION_CONFIG = {
    /**
     * How often to run consolidation:
     * - 'disabled': Do not run consolidation
     * - 'every-run': Run on every memory manager execution
     * - 'hourly': Run once per hour (based on last run time)
     * - 'daily': Run once per day
     * - number: Run every N executions (e.g., 4 = every 4th run)
     */
    frequency: 'daily' as 'disabled' | 'every-run' | 'hourly' | 'daily' | number,
    minClusterSize: 3,             // Minimum notes in a cluster to trigger consolidation
    maxClusterSize: 7,             // Maximum cluster size (Miller's 7±2) — split larger clusters
    similarityThreshold: 0.60,     // Semantic similarity threshold — 60% captures topically related notes
    maxConsolidationCount: 3,      // Cap re-summarization depth to prevent drift (research: 25.5% semantic loss after 5 iterations)
    noteCountTrigger: 100          // Event-driven trigger: consolidate when an agent accumulates this many new notes since last run
};

/**
 * Configuration for contradiction detection.
 * Finds semantically similar note pairs and evaluates whether they contain conflicting facts.
 */
const CONTRADICTION_CONFIG = {
    similarityThreshold: 0.70,     // Higher than consolidation — targets same-topic pairs
    maxPairsPerRun: 50,            // Limit LLM calls per cycle
    highImportanceThreshold: 7.0   // Notes above this get importance-weighted protection (both preserved with flag)
};

/**
 * The 7 signals fed into the composite importance scorer.
 * Used to strongly type both the config weights and the per-note signal arrays.
 */
type ImportanceSignalName = 'recencyDecay' | 'llmImportance' | 'relevance' | 'uniqueness' | 'correctionBoost' | 'goalAlignment' | 'userMark';

interface ImportanceSignal {
    signal: ImportanceSignalName;
    value: number;
    available: boolean;
}

/**
 * Configuration for composite importance scoring.
 * 7-signal formula replacing raw AccessCount for authority, retention, and consolidation decisions.
 * Based on Park et al.'s Generative Agents (2023) and neuroscience research on memory importance.
 */
const IMPORTANCE_CONFIG: {
    weights: Record<ImportanceSignalName, number>;
    correctionBonusPoints: number;
    autoPromoteThreshold: number;
} = {
    weights: {
        recencyDecay: 0.20,        // Exponential decay: 0.995^hours
        llmImportance: 0.25,       // Confidence from extraction prompt
        relevance: 0.15,           // Cosine similarity to recent conversation inputs
        uniqueness: 0.15,          // Min distance to nearest neighbor (rarity signal)
        correctionBoost: 0.10,     // Notes that corrected/superseded existing notes
        goalAlignment: 0.10,       // Alignment with agent goals (Phase 2 enrichment, 0.5 default)
        userMark: 0.05             // Manual creation flag (IsAutoGenerated=false)
    },
    correctionBonusPoints: 1.5,    // Flat additive bonus for correction-provenance notes
    autoPromoteThreshold: 8.0,     // Auto-promote Standard notes to Protected above this score
};

/**
 * Configuration for Ebbinghaus-inspired decay function.
 * Replaces fixed 90/180-day retention windows with continuous importance-weighted decay.
 * Formula: strength = normalizedImportance * e^(-lambdaEff * daysSinceAccess) * (1 + accessCount * accessBoostFactor)
 * where lambdaEff = baseLambda * (1 - normalizedImportance * importanceDampening)
 */
const DECAY_CONFIG = {
    baseLambda: 0.16,              // Base decay rate (Ebbinghaus-derived)
    importanceDampening: 0.8,      // How much high importance slows decay (0-1)
    accessBoostFactor: 0.2,        // Each access adds 20% to retention strength
    accessRetentionCap: 1.5,       // Hard cap on the access-retention multiplier to prevent frequently-accessed notes from becoming immortal
    protectedInactivityDays: 365,  // Protected tier extended retention before archival
    ephemeralDecayMultiplier: 2.0,  // Ephemeral tier decays 2x faster
    archivalFloor: 0.5,           // Score below this after proportional decay → archive (multiple cycles to reach)
};

/**
 * Configuration for stale reference pruning.
 * Caps how many orphaned notes the pruning phase will archive per cycle to keep
 * Memory Manager runtime bounded even on large corpora.
 */
const STALE_PRUNING_CONFIG = {
    maxNotesPerRun: 200,
};

/**
 * Minimum number of scored notes required to compute a 95th-percentile uniqueness
 * threshold. Below this the percentile is meaningless (a 5-note cohort has a p95
 * at index 4 which is just "the max"), so outlier auto-protection is disabled.
 */
const OUTLIER_PROMOTION_MIN_COHORT = 20;

/**
 * Valid Type values for MJAIAgentNote records. Must match the typed union in the
 * generated entity class (MJCoreEntities/src/generated/entity_subclasses.ts).
 * Used to validate LLM-returned values before assigning to entity properties.
 */
const VALID_NOTE_TYPES = ['Constraint', 'Context', 'Example', 'Issue', 'Preference'] as const;
type ValidNoteType = typeof VALID_NOTE_TYPES[number];

function isValidNoteType(value: unknown): value is ValidNoteType {
    return typeof value === 'string' && (VALID_NOTE_TYPES as readonly string[]).includes(value);
}

/** Reusable parameter object for deterministic (temperature=0) LLM prompt calls. */
const DETERMINISTIC_PROMPT_PARAMS = { temperature: 0 } as const;

/**
 * Possible reasons consolidation fired (or didn't). Exposed via shouldRunConsolidation's
 * return value so the observability layer can record the trigger on the parent run step.
 */
type ConsolidationTriggerType = 'forced' | 'every-run' | 'time' | 'event' | 'count' | 'disabled' | 'not-triggered';

interface ConsolidationTriggerDecision {
    shouldRun: boolean;
    triggerType: ConsolidationTriggerType;
}

/** Per-cluster verification result, aggregated into a phase-level observability step. */
interface ConsolidationVerificationResult {
    entitiesChecked: number;
    entitiesMissing: string[];
    passed: boolean;
}

/**
 * Entity-attribute-value triple as returned by the contradiction detection prompt.
 * Kept loose because the LLM's response shape is best-effort — countEntityTriples
 * handles malformed payloads defensively.
 */
interface ContradictionEntityTriple {
    entity: string;
    attribute: string;
    value: string;
}

/**
 * Raw shape of the LLM response returned by the contradiction detection prompt.
 * The `entityTriples` field may come back as an object keyed by noteA/noteB, a flat
 * array, or be absent entirely — the counter normalizes across all three.
 */
interface ContradictionPromptResult {
    isContradiction: boolean;
    keepNoteId?: string;
    revokeNoteId?: string;
    reason: string;
    entityTriples?: Record<string, ContradictionEntityTriple[]> | ContradictionEntityTriple[];
}

/** Normalized per-pair contradiction evaluation returned to the caller. */
interface ContradictionPairEvaluation {
    isContradiction: boolean;
    keepNoteId?: string;
    revokeNoteId?: string;
    reason: string;
    triplesExtracted: number;
}

/**
 * Accumulator passed through the decay phase to collect observability signals.
 * Mutated by decayOneNote/decayOneExample so the parent phase can surface the
 * distribution and tier-specific counts in its run step output.
 */
interface DecayStatsAccumulator {
    decayFactors: number[];
    protectedPreserved: number;
    ephemeralAccelerated: number;
}

/**
 * Projection of a note sent to the consolidation prompt.
 * Matches the shape that processConsolidationCluster builds.
 */
interface ConsolidationNoteProjection {
    id: string;
    type: string;
    content: string | null;
    createdAt: Date;
    accessCount: number | null;
    importanceScore: number | null;
    consolidationCount: number;
    agentId: string;
    userId: string | null;
    companyId: string | null;
}

interface ConsolidationPromptData extends Record<string, unknown> {
    anchoredMode: boolean;
    notesToConsolidate: ConsolidationNoteProjection[];
}

/** Projection of a note loaded into the decay phase. */
interface DecayNoteCandidate {
    ID: string;
    ImportanceScore: number | null;
    ProtectionTier: string;
    LastAccessedAt: Date | null;
    __mj_CreatedAt: Date;
    AccessCount: number;
    AgentID: string | null;
}

/** Projection of an example loaded into the decay phase. */
interface DecayExampleCandidate {
    ID: string;
    SuccessScore: number | null;
    LastAccessedAt: Date | null;
    __mj_CreatedAt: Date;
    AccessCount: number;
    AgentID: string;
}

/** Minimal projection of a note used by the orphan pruning phase. */
interface PruneCandidateNote {
    ID: string;
    AgentID: string | null;
    UserID: string | null;
    CompanyID: string | null;
    SourceConversationID: string | null;
}

/** In-memory existence caches built once per pruneStaleReferences run. */
interface ReferenceExistenceCaches {
    activeAgentIds: Set<string>;
    existingUserIds: Set<string>;
    existingCompanyIds: Set<string>;
    existingConversationIds: Set<string>;
}

/** Shape the consolidation LLM is expected to return. */
interface ConsolidationPromptResult {
    shouldConsolidate: boolean;
    consolidatedNote?: {
        type: string;
        content: string;
        scopeLevel: string;
        confidence: number;
    };
    sourceNoteIds?: string[];
    reason: string;
}

/** Counts returned by the 5 maintenance phases. */
interface MaintenancePhaseResults {
    consolidatedCount: number;
    consolidationArchived: number;
    contradictionsFound: number;
    contradictionsResolved: number;
    contradictionsFlagged: number;
    staleNotesArchived: number;
    decayNotesArchived: number;
    decayExamplesArchived: number;
    importanceScored: number;
    tierPromotions: number;
}

/**
 * Fields needed from notes resolved by `resolveOriginalSources`.
 * Used instead of full `MJAIAgentNoteEntity` for read-only resolution.
 */
interface ResolvedNoteRecord {
    ID: string;
    ConsolidationCount: number | null;
    DerivedFromNoteIDs: string | null;
    Note: string | null;
    Type: string;
    AccessCount: number | null;
    ImportanceScore: number | null;
    AgentID: string;
    UserID: string | null;
    CompanyID: string | null;
    __mj_CreatedAt: Date;
}

/**
 * Hard cap on `resolveOriginalSources()` recursion depth.
 * The `visited` set already prevents cycles, but a depth limit protects against
 * runaway recursion if `DerivedFromNoteIDs` chains are corrupted in a way that
 * passes the visited check (e.g., extremely deep legitimate chains from a bug).
 */
const MAX_SOURCE_RESOLUTION_DEPTH = 10;

/**
 * Read-only projection of a source agent run used for scope inheritance when creating
 * notes/examples. Only the scope-bearing fields are read (never mutated), so the run is
 * loaded as a 'simple' projection rather than a full entity object — which avoids the
 * secondary "MJ: AI Agent Run Steps" RunView that loading an MJAIAgentRunEntityExtended
 * triggers via InnerLoad/LoadRelatedData.
 */
interface SourceRunScope {
    AgentID: string | null;
    CompanyID: string | null;
    UserID: string | null;
    PrimaryScopeEntityID: string | null;
    PrimaryScopeRecordID: string | null;
    SecondaryScopes: string | null;
}

/** Fields fetched for a SourceRunScope projection. */
const SOURCE_RUN_SCOPE_FIELDS = ['AgentID', 'CompanyID', 'UserID', 'PrimaryScopeEntityID', 'PrimaryScopeRecordID', 'SecondaryScopes'] as const;


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
 * Projection of an existing note sent to the extraction/dedup prompts.
 * Only the fields the LLM needs — not the full MJAIAgentNoteEntity.
 */
interface ExistingNoteProjection {
    id: string;
    type: 'Constraint' | 'Context' | 'Example' | 'Issue' | 'Preference';
    content: string | null;
    agentId: string;
    userId: string | null;
    companyId: string | null;
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
    /**
     * Protection tier override applied at creation. Failure-mined corrective notes set this
     * to 'Ephemeral' so they decay fast unless reinforced by recurrence. Undefined falls back
     * to the default tier in CreateNoteRecords.
     */
    protectionTierHint?: 'Immutable' | 'Protected' | 'Standard' | 'Ephemeral';
}

/**
 * Minimal projection of a failed/cancelled agent run mined for corrective ("avoid this")
 * memory. ID-only-plus-error shape mirrors LoadHighValueAgentRuns' lightweight projection
 * to avoid per-run secondary RunViews.
 */
interface InstructiveFailedRun {
    ID: string;
    AgentID: string | null;
    ConversationID: string | null;
    Status: string;
    ErrorMessage: string | null;
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

    /** Check if a string is a valid UUID format. Filters out LLM-generated placeholders like "user-uuid-here". */
    private static isValidUUID(id: string | undefined | null): boolean {
        if (!id) return false;
        return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
    }

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
            const md = this.ProviderToUse;
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
        // Read-only: we only need StartedAt, so use a 'simple' projection with a narrow Fields
        // list. Loading this as 'entity_object' would build a full MJAIAgentRunEntityExtended,
        // whose InnerLoad fires a secondary "MJ: AI Agent Run Steps" RunView (LoadRelatedData) —
        // a round-trip the redundancy telemetry flagged as a duplicate. A simple projection
        // skips that sub-query entirely.
        const rv = new RunView();
        const result = await rv.RunView<{ StartedAt: Date }>({
            EntityName: 'MJ: AI Agent Runs',
            ExtraFilter: `AgentID='${agentId}' AND Status='Completed'`,
            OrderBy: 'StartedAt DESC',
            MaxRows: 1,
            Fields: ['StartedAt'],
            ResultType: 'simple'
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
     * Load a source agent run's scope fields (read-only) for scope inheritance, memoized in
     * the supplied per-cycle cache. Uses a 'simple' projection so it does not trigger the
     * agent-run entity's LoadRelatedData steps sub-query.
     */
    private async loadSourceRunScope(
        sourceAgentRunId: string,
        runCache: Map<string, SourceRunScope | null>,
        contextUser: UserInfo
    ): Promise<SourceRunScope | null> {
        if (!runCache.has(sourceAgentRunId)) {
            const rv = new RunView();
            const runResult = await rv.RunView<SourceRunScope>({
                EntityName: 'MJ: AI Agent Runs',
                ExtraFilter: `ID='${sourceAgentRunId}'`,
                MaxRows: 1,
                Fields: [...SOURCE_RUN_SCOPE_FIELDS],
                ResultType: 'simple'
            }, contextUser);
            runCache.set(sourceAgentRunId, runResult.Success && runResult.Results?.length > 0 ? runResult.Results[0] : null);
        }
        return runCache.get(sourceAgentRunId) || null;
    }

    /**
     * Load agents that have note or example injection enabled.
     * Only extract notes/examples for agents that actually use these features.
     */
    private async LoadAgentsUsingMemory(contextUser: UserInfo): Promise<MJAIAgentEntityExtended[]> {
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
        agentsUsingMemory: MJAIAgentEntityExtended[],
        contextUser: UserInfo
    ): Promise<ConversationWithRatings[]> {
        if (agentsUsingMemory.length === 0) {
            LogStatus('Memory Manager: No agents have memory injection enabled - skipping');
            return [];
        }

        // Pass a real JS array — the SQL template uses {{ agentIds | sqlIn }}
        const agentIds = agentsUsingMemory.map(a => a.ID);

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
            // Verbose-only: the common no-op outcome. The engine's "✅ Completed (Nms)" line already
            // signals the run finished with no work; surfacing "why" is a verbose diagnostic detail.
            LogStatusEx({ message: 'Memory Manager: No conversations with new activity found', verboseOnly: true });
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
     *
     * The caller only consumes the row count (`.length`) of the returned set, so this reads a
     * 'simple' ID-only projection rather than full entity objects. Loading these as
     * 'entity_object' would build up to 50 MJAIAgentRunEntityExtended instances, each firing a
     * secondary "MJ: AI Agent Run Steps" RunView via InnerLoad/LoadRelatedData — exactly the
     * redundant round-trips the telemetry flagged. The simple projection skips all of them.
     */
    private async LoadHighValueAgentRuns(since: Date | null, contextUser: UserInfo): Promise<Array<{ ID: string }>> {
        const rv = new RunView();

        // Use subquery to find agent runs with high-usage artifacts
        const sinceFilter = since ? `AND au.__mj_CreatedAt >= '${since.toISOString()}'` : '';

        const filter = `
            ID IN (
                SELECT DISTINCT ar.ID
                FROM __mj.vwAIAgentRuns ar
                INNER JOIN __mj.vwConversations c ON ar.ConversationID = c.ID
                INNER JOIN __mj.vwConversationDetails cd ON cd.ConversationID = c.ID
                INNER JOIN __mj.vwConversationDetailArtifacts cda ON cda.ConversationDetailID = cd.ID
                INNER JOIN __mj.vwArtifactVersions av ON av.ID = cda.ArtifactVersionID
                WHERE EXISTS (
                    SELECT 1
                    FROM __mj.vwArtifactUses au
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

        const result = await rv.RunView<{ ID: string }>({
            EntityName: 'MJ: AI Agent Runs',
            ExtraFilter: filter,
            OrderBy: '__mj_CreatedAt DESC',
            MaxRows: 50, // Limit to most recent 50 high-value runs
            Fields: ['ID'],
            ResultType: 'simple'
        }, contextUser);

        return result.Success ? (result.Results || []) : [];
    }

    /**
     * Load recent agent runs that ended in failure, to mine corrective ("this approach didn't
     * work") memory. Implements the plan's §6.1 selector: recent runs where **`Status`/`Success`
     * indicates failure**. The two clauses below cover the full failure surface that is persisted
     * on the run record:
     *   - `Status IN ('Failed','Cancelled') AND ErrorMessage IS NOT NULL` — explicit failures.
     *     This ALSO subsumes the plan's other two signals, because the engine records them here:
     *     the consecutive-failed-steps / unproductive-retry safety nets terminate the run with
     *     `Status='Failed'` and a descriptive `ErrorMessage` ("terminated after N consecutive…"),
     *     and a permanent context-recovery failure likewise ends `Status='Failed'`
     *     (see base-agent.ts safety-net + finalization paths).
     *   - `Success = 0 AND Status NOT IN ('Running','Paused')` — runs flagged unsuccessful that did
     *     not surface as a hard 'Failed'/'Cancelled' status (the plan's `Success` signal).
     * No subquery, no inline SQL literal beyond the bit comparison — dialect-agnostic across SQL
     * Server and PostgreSQL. Bounded (MaxRows 50) and cooldown-aware via the `since` window,
     * matching the high-value loader's lightweight projection. The confidence gate (≥80) downstream
     * discards transient/low-signal failures that carry no generalizable lesson.
     */
    private async LoadInstructiveFailedAgentRuns(since: Date | null, contextUser: UserInfo): Promise<InstructiveFailedRun[]> {
        const rv = new RunView();
        const sinceFilter = since ? ` AND __mj_CreatedAt >= '${since.toISOString()}'` : '';
        const filter = `((Status IN ('Failed', 'Cancelled') AND ErrorMessage IS NOT NULL) OR (Success = 0 AND Status NOT IN ('Running', 'Paused')))${sinceFilter}`;

        const result = await rv.RunView<InstructiveFailedRun>({
            EntityName: 'MJ: AI Agent Runs',
            ExtraFilter: filter,
            OrderBy: '__mj_CreatedAt DESC',
            MaxRows: 50,
            Fields: ['ID', 'AgentID', 'ConversationID', 'Status', 'ErrorMessage'],
            ResultType: 'simple'
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
     * Mine corrective ("avoid this") memory from failed/cancelled agent runs. Each failed run
     * is presented to the same extraction pipeline as a negative-outcome thread — the extraction
     * prompt already knows how to draw lessons from negative feedback — then the output is clamped
     * to the corrective note types (Issue/Context only, never Constraint/Preference/Example) and
     * tagged 'Ephemeral' so a one-off transient failure decays unless reinforced by recurrence.
     */
    private async ExtractNotesFromFailedRuns(
        failedRuns: InstructiveFailedRun[],
        contextUser: UserInfo
    ): Promise<ExtractedNote[]> {
        if (failedRuns.length === 0) {
            return [];
        }

        const existingNotes = AIEngine.Instance.AgentNotes.filter(n => n.Status === 'Active');

        const conversationThreads = failedRuns.map(run => ({
            conversationId: run.ConversationID || run.ID,
            agentRunId: run.ID,
            hasPositiveRating: false,
            hasNegativeRating: true,
            isUnrated: false,
            messages: [{
                id: run.ID,
                role: 'system',
                message: this.buildFailureSummary(run),
                createdAt: new Date(),
                rating: -1,
                ratingComment: 'Agent run failed — mine for a corrective lesson.'
            }]
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

        const extracted = await this.executeNoteExtraction(promptData, existingNotes, contextUser);
        return this.markCorrectiveNotes(extracted);
    }

    /**
     * Build the negative-outcome transcript line fed to corrective extraction for a failed run.
     * The error is capped so a large stack trace can't bloat the extraction prompt — ironic for a
     * token-optimization feature — while still carrying enough signal for a generalizable lesson.
     */
    private buildFailureSummary(run: InstructiveFailedRun): string {
        const rawError = run.ErrorMessage ?? '(none recorded)';
        const error = rawError.length > MAX_FAILURE_ERROR_CHARS
            ? `${rawError.slice(0, MAX_FAILURE_ERROR_CHARS)}… (truncated)`
            : rawError;
        return `An agent run ended with status "${run.Status}". Error: ${error}. `
            + `Identify a generalizable lesson to avoid repeating this failure; if none generalizes, extract nothing.`;
    }

    /**
     * Clamp failure-mined notes to the corrective types and tag them Ephemeral. Dropping
     * non-Issue/Context notes preserves the prompt-injection defense — a mined failure can
     * never become a behavioral Constraint without Memory-Manager/human promotion.
     */
    private markCorrectiveNotes(notes: ExtractedNote[]): ExtractedNote[] {
        return notes
            .filter(n => n.type === 'Issue' || n.type === 'Context')
            .map(n => ({ ...n, protectionTierHint: 'Ephemeral' as const }));
    }

    /**
     * Common extraction logic for note extraction. Thin orchestrator that coordinates:
     *   (1) running the extraction prompt,
     *   (2) normalizing merge-field shape from the LLM,
     *   (3) applying confidence/length filters,
     *   (4) enforcing per-message/per-conversation sparsity caps,
     *   (5) collapsing duplicate merge candidates,
     *   (6) deduplicating against existing notes,
     *   (7) enriching with conversation context (userId, agentRunId).
     *
     * Each step is its own private helper so the pipeline can be read top-to-bottom.
     */
    private async executeNoteExtraction(
        promptData: { conversationThreads: ConversationThread[]; existingNotes: ExistingNoteProjection[] },
        existingNotes: MJAIAgentNoteEntity[],
        contextUser: UserInfo
    ): Promise<ExtractedNote[]> {
        // Step 1: run the extraction prompt and parse out the raw notes
        const rawNotes = await this.runNoteExtractionPrompt(promptData, existingNotes.length, contextUser);
        if (!rawNotes) return [];

        // Step 2: normalize the LLM's legacy singular mergeWithExistingId → plural mergeWithExistingIds
        this.normalizeMergeCandidates(rawNotes);

        if (this._verbose) {
            LogStatus(`Memory Manager: LLM returned ${rawNotes.length} raw notes before filtering`);
            for (const note of rawNotes) {
                LogStatus(`Memory Manager: Raw note: [${note.type}] "${note.content}" (confidence: ${note.confidence})${note.mergeWithExistingIds?.length ? ` mergeWith: ${note.mergeWithExistingIds.join(', ')}` : ''}`);
            }
        }

        // Step 3: filter by confidence and content length
        const candidateNotes = this.filterByConfidenceAndLength(rawNotes);
        if (candidateNotes.length === 0) {
            if (this._verbose) LogStatus('Memory Manager: No candidates passed confidence/length thresholds');
            return [];
        }

        // Step 4: apply per-message and per-conversation sparsity caps
        const sparseCandidates = this.applySparsityLimits(candidateNotes);

        // Step 5: collapse merge candidates with identical content
        const collapsedCandidates = this.collapseMergeCandidates(sparseCandidates);
        if (this._verbose && collapsedCandidates.length < sparseCandidates.length) {
            LogStatus(`Memory Manager: Collapsed ${sparseCandidates.length} candidates to ${collapsedCandidates.length} after merging duplicate merge targets`);
        }

        // Step 6: deduplicate against existing notes (creates and finalizes Step 4 run step)
        const approvedNotes = await this.deduplicateCandidates(collapsedCandidates, existingNotes, contextUser);

        if (this._verbose) LogStatus(`Memory Manager: Final approved notes: ${approvedNotes.length}`);

        // Step 7: enrich with conversation context (userId, agentRunId)
        this.enrichWithConversationContext(approvedNotes, promptData.conversationThreads);

        return approvedNotes;
    }

    /**
     * Execute the extraction prompt, wrap it in an observability run step, and
     * parse the raw result into a typed array. Returns null on any failure so the
     * caller short-circuits cleanly.
     */
    private async runNoteExtractionPrompt(
        promptData: { conversationThreads: ConversationThread[]; existingNotes: ExistingNoteProjection[] },
        existingNoteCount: number,
        contextUser: UserInfo
    ): Promise<ExtractedNote[] | null> {
        const prompt = this.findNoteExtractionPrompt();
        if (!prompt) return null;

        const conversationThreads = promptData.conversationThreads;
        this.logExtractionPromptContext(prompt, conversationThreads);

        const step = await this.CreateRunStep('Prompt', 'Extract Notes from Conversations', {
            conversationCount: conversationThreads.length,
            messageCount: conversationThreads.reduce((sum, t) => sum + t.messages.length, 0),
            existingNoteCount
        }, prompt.ID);

        const runner = new AIPromptRunner();
        const params = new AIPromptParams();
        params.prompt = prompt;
        params.data = promptData;
        params.contextUser = contextUser;
        params.attemptJSONRepair = true;
        params.additionalParameters = DETERMINISTIC_PROMPT_PARAMS;

        const result = await runner.ExecutePrompt<{ notes: ExtractedNote[] }>(params);
        await this.FinalizeRunStep(step, result.success, {
            success: result.success,
            rawNoteCount: result.result && typeof result.result !== 'string' ? (result.result.notes?.length || 0) : 0
        }, result.promptRun?.ID, result.errorMessage || undefined);

        return this.parseNoteExtractionResult(result);
    }

    /** Look up the extraction prompt, logging available prompts on miss. */
    private findNoteExtractionPrompt(): MJAIPromptEntityExtended | undefined {
        const prompt = AIEngine.Instance.Prompts.find(p =>
            p.Name === 'Memory Manager - Extract Notes' && p.Category === 'MJ: System'
        );
        if (!prompt) {
            LogError('Memory Manager note extraction prompt not found');
            if (this._verbose) {
                LogStatus(`Memory Manager: Available prompts in MJ: System category: ${AIEngine.Instance.Prompts.filter(p => p.Category === 'MJ: System').map(p => p.Name).join(', ')}`);
            }
        }
        return prompt;
    }

    /** Verbose-only logging block for extraction prompt context. */
    private logExtractionPromptContext(prompt: MJAIPromptEntityExtended, conversationThreads: ConversationThread[]): void {
        if (!this._verbose) return;
        LogStatus(`Memory Manager: Found extraction prompt "${prompt.Name}" (ID: ${prompt.ID})`);
        LogStatus(`Memory Manager: Sending ${conversationThreads.length} conversation threads with ${conversationThreads.reduce((sum, t) => sum + t.messages.length, 0)} total messages for note extraction`);
        if (conversationThreads.length > 0) {
            const firstThread = conversationThreads[0];
            LogStatus(`Memory Manager: Sample thread (conv ${firstThread.conversationId}): ${firstThread.messages.map(m => `[${m.role}] ${m.message?.substring(0, 80)}...`).join(' | ')}`);
        }
    }

    /**
     * Parse an extraction prompt result into an ExtractedNote array, tolerating JSON-fenced
     * strings from models like Gemini. Returns null on failure.
     */
    private parseNoteExtractionResult(result: AIPromptRunResult<{ notes: ExtractedNote[] }>): ExtractedNote[] | null {
        if (this._verbose) {
            LogStatus(`Memory Manager: Extraction prompt result - success: ${result.success}, hasResult: ${!!result.result}`);
            if (result.errorMessage) LogStatus(`Memory Manager: Extraction error: ${result.errorMessage}`);
            if (result.result) LogStatus(`Memory Manager: Raw extraction result: ${JSON.stringify(result.result)}`);
        }

        if (!result.success || !result.result) {
            LogError('Failed to extract notes:', result.errorMessage);
            return null;
        }

        if (typeof result.result === 'string') {
            const reparsed = CleanAndParseJSON<{ notes: ExtractedNote[] }>(result.result, true);
            if (!reparsed) {
                LogError('Failed to parse extraction result as JSON');
                return null;
            }
            if (this._verbose) {
                LogStatus(`Memory Manager: Parsed string result into object with ${reparsed.notes?.length || 0} notes`);
            }
            return reparsed.notes || [];
        }
        return result.result.notes || [];
    }

    /**
     * Normalize the legacy singular `mergeWithExistingId` field into the plural
     * `mergeWithExistingIds` array. The extraction prompt still emits the singular
     * field in some paths; downstream code only reads the plural form.
     */
    private normalizeMergeCandidates(notes: ExtractedNote[]): void {
        for (const note of notes) {
            if (note.mergeWithExistingId && !note.mergeWithExistingIds) {
                note.mergeWithExistingIds = [note.mergeWithExistingId];
            }
        }
    }

    /**
     * Filter raw extracted notes against the confidence and content-length thresholds
     * from EXTRACTION_CONFIG. Notes below either threshold are silently dropped.
     */
    private filterByConfidenceAndLength(notes: ExtractedNote[]): ExtractedNote[] {
        const filtered = notes.filter(n =>
            n.confidence >= EXTRACTION_CONFIG.minConfidenceThreshold &&
            n.content && n.content.length >= EXTRACTION_CONFIG.minContentLength
        );
        if (this._verbose && filtered.length > 0) {
            LogStatus(`Memory Manager: ${filtered.length} candidates passed confidence threshold (>=${EXTRACTION_CONFIG.minConfidenceThreshold})`);
            for (const note of filtered) {
                LogStatus(`Memory Manager: Extracted note: [${note.type}] "${note.content}" (confidence: ${note.confidence})`);
            }
        }
        return filtered;
    }

    /**
     * Enforce per-message and per-conversation note caps from EXTRACTION_CONFIG.
     * Drops any candidates that would exceed either cap.
     */
    private applySparsityLimits(candidates: ExtractedNote[]): ExtractedNote[] {
        const notesByMessage = new Map<string, ExtractedNote[]>();
        const noteCountByConversation = new Map<string, number>();

        for (const note of candidates) {
            const msgId = note.sourceConversationDetailId || 'unknown';
            const convId = note.sourceConversationId || 'unknown';
            const existingForMsg = notesByMessage.get(msgId) || [];
            const convCount = noteCountByConversation.get(convId) || 0;

            if (existingForMsg.length >= EXTRACTION_CONFIG.maxNotesPerMessage) {
                if (this._verbose) LogStatus(`Memory Manager: Skipping note (max ${EXTRACTION_CONFIG.maxNotesPerMessage} per message reached)`);
            } else if (convCount >= EXTRACTION_CONFIG.maxNotesPerConversation) {
                if (this._verbose) LogStatus(`Memory Manager: Skipping note (max ${EXTRACTION_CONFIG.maxNotesPerConversation} per conversation reached)`);
            } else {
                existingForMsg.push(note);
                notesByMessage.set(msgId, existingForMsg);
                noteCountByConversation.set(convId, convCount + 1);
            }
        }

        const sparse = Array.from(notesByMessage.values()).flat();
        if (this._verbose) LogStatus(`Memory Manager: ${sparse.length} candidates after sparsity filter`);
        return sparse;
    }

    /**
     * Deduplicate candidate notes against existing notes in the database using:
     *   1. Exact text match (fast reject),
     *   2. Semantic similarity lookup (top-N with ≥85% threshold),
     *   3. Dedup prompt to resolve genuinely-similar candidates.
     *
     * Candidates flagged as merge/replacement by the extraction LLM are auto-approved
     * (dedup would reject them as "too similar" to the note they are intentionally
     * replacing). Creates and finalizes its own observability run step.
     */
    private async deduplicateCandidates(
        candidates: ExtractedNote[],
        existingNotes: MJAIAgentNoteEntity[],
        contextUser: UserInfo
    ): Promise<ExtractedNote[]> {
        const step = await this.CreateRunStep('Decision', 'Deduplicate Note Candidates', {
            candidateCount: candidates.length,
            existingNoteCount: existingNotes.length
        });

        const approved: ExtractedNote[] = [];
        const stats = { rejectedCount: 0, llmCallCount: 0 };
        const runner = new AIPromptRunner();
        const dedupePrompt = AIEngine.Instance.Prompts.find(p =>
            p.Name === 'Memory Manager - Deduplicate Note' && p.Category === 'MJ: System'
        );

        for (const candidate of candidates) {
            if (approved.length >= EXTRACTION_CONFIG.maxNotesPerRun) {
                if (this._verbose) LogStatus(`Memory Manager: Stopping - max notes per run (${EXTRACTION_CONFIG.maxNotesPerRun}) reached`);
                break;
            }
            const decision = await this.evaluateCandidateForApproval(candidate, existingNotes, dedupePrompt, runner, contextUser, stats);
            if (decision) {
                approved.push(candidate);
            }
        }

        await this.FinalizeRunStep(step, true, {
            approvedCount: approved.length,
            rejectedCount: stats.rejectedCount,
            llmCallCount: stats.llmCallCount
        });

        return approved;
    }

    /**
     * Evaluate a single candidate: merge markers auto-approve, exact-text duplicates are
     * rejected, otherwise run semantic similarity + LLM dedup. Returns true if the candidate
     * should be kept. Mutates `stats` for rejection + LLM call counts as a side effect.
     */
    private async evaluateCandidateForApproval(
        candidate: ExtractedNote,
        existingNotes: MJAIAgentNoteEntity[],
        dedupePrompt: MJAIPromptEntityExtended | undefined,
        runner: AIPromptRunner,
        contextUser: UserInfo,
        stats: { rejectedCount: number; llmCallCount: number }
    ): Promise<boolean> {
        // Merge/replacement candidates are auto-approved — the extraction LLM already
        // determined they supersede an existing note. Running dedup on them would reject
        // them as "too similar" to the very note they are replacing.
        if (candidate.mergeWithExistingIds?.length) {
            if (this._verbose) {
                LogStatus(`Memory Manager: Auto-approved merge note targeting ${candidate.mergeWithExistingIds.join(', ')}: "${candidate.content.substring(0, 50)}..."`);
            }
            return true;
        }

        // Fast path: exact text match (case-insensitive, trimmed)
        const normalizedContent = candidate.content.toLowerCase().trim();
        if (existingNotes.some(n => n.Note && n.Note.toLowerCase().trim() === normalizedContent)) {
            stats.rejectedCount++;
            if (this._verbose) LogStatus(`Memory Manager: Skipping exact duplicate: "${candidate.content.substring(0, 50)}..."`);
            return false;
        }

        // Semantic similarity lookup. Cross-user dedup for org/global notes works naturally
        // because those notes have UserID=null — FindSimilarAgentNotes won't filter them out.
        const similarNotes = await AIEngine.Instance.FindSimilarAgentNotes(
            candidate.content,
            candidate.agentId,
            candidate.userId,
            candidate.companyId,
            10,
            0.85
        );

        if (!dedupePrompt || similarNotes.length === 0) {
            if (this._verbose) LogStatus(`Memory Manager: Approved note (no similar notes found): "${candidate.content.substring(0, 50)}..."`);
            return true;
        }

        const decision = await this.runDedupePromptForCandidate(runner, dedupePrompt, candidate, similarNotes, contextUser);
        stats.llmCallCount++;
        if (decision.shouldAdd) {
            if (this._verbose) LogStatus(`Memory Manager: Approved note - ${decision.reason}`);
            return true;
        }
        stats.rejectedCount++;
        if (this._verbose) LogStatus(`Memory Manager: Skipped duplicate note - ${decision.reason}`);
        return false;
    }

    /**
     * Invoke the dedupe LLM prompt for a single candidate note against its similar
     * neighbors. Returns the decision plus reason string — callers handle logging.
     */
    private async runDedupePromptForCandidate(
        runner: AIPromptRunner,
        dedupePrompt: MJAIPromptEntityExtended,
        candidate: ExtractedNote,
        similarNotes: Array<{ note: MJAIAgentNoteEntity; similarity: number }>,
        contextUser: UserInfo
    ): Promise<{ shouldAdd: boolean; reason: string }> {
        const params = new AIPromptParams();
        params.prompt = dedupePrompt;
        params.data = {
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
        params.contextUser = contextUser;
        params.attemptJSONRepair = true;
        params.additionalParameters = DETERMINISTIC_PROMPT_PARAMS;

        const result = await runner.ExecutePrompt<{ shouldAdd: boolean; reason: string }>(params);
        if (result.success && result.result) {
            return { shouldAdd: result.result.shouldAdd, reason: result.result.reason || '' };
        }
        return { shouldAdd: false, reason: result.result?.reason || 'too similar to existing notes' };
    }

    /**
     * Populate userId and sourceAgentRunId on approved notes from the source
     * conversation's context. Only fills fields the LLM didn't already set.
     */
    private enrichWithConversationContext(
        notes: ExtractedNote[],
        conversationThreads: ConversationThread[]
    ): void {
        const conversationContext = new Map<string, { userId: string | null; agentRunId: string | null }>();
        for (const thread of conversationThreads) {
            conversationContext.set(thread.conversationId, {
                userId: (thread as { userId?: string | null }).userId || null,
                agentRunId: (thread as { agentRunId?: string | null }).agentRunId || null
            });
        }

        for (const note of notes) {
            if (!note.sourceConversationId) continue;
            const ctx = conversationContext.get(note.sourceConversationId);
            if (!ctx) continue;
            if (!note.userId && ctx.userId) note.userId = ctx.userId;
            if (!note.sourceAgentRunId && ctx.agentRunId) note.sourceAgentRunId = ctx.agentRunId;
        }
    }

    /**
     * Extract examples from conversation details with high ratings.
     * Uses LLM-based deduplication to avoid adding redundant examples.
     */
    private async ExtractExamples(
        conversationDetails: ConversationDetailProjection[],
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
        extractParams.additionalParameters = { temperature: 0 };

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
                dedupeParams.additionalParameters = { temperature: 0 };
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
        const md = this.ProviderToUse;

        // Cache source agent runs (scope fields only) to avoid repeated lookups
        const runCache = new Map<string, SourceRunScope | null>();

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
                let sourceRun: SourceRunScope | null = null;
                if (extracted.sourceAgentRunId) {
                    sourceRun = await this.loadSourceRunScope(extracted.sourceAgentRunId, runCache, contextUser);
                }

                // Check if we should merge with existing (revoke all targets, create one replacement)
                let createNewNote = !extracted.mergeWithExistingIds?.length;

                if (extracted.mergeWithExistingIds?.length) {
                    for (const mergeTargetId of extracted.mergeWithExistingIds) {
                        const existingNote = await md.GetEntityObject<MJAIAgentNoteEntity>('MJ: AI Agent Notes', contextUser);
                        if (await existingNote.Load(mergeTargetId)) {
                            // Honor protection tiers — Immutable and Protected notes must NEVER be
                            // auto-revoked even when the extraction LLM flags them as merge targets.
                            // The contradiction-detection phase enforces the same rule via tier-based
                            // filtering, but this earlier merge path bypassed it. Skip the revocation
                            // and just annotate the existing note so the conflict is observable.
                            const tier = existingNote.ProtectionTier || 'Standard';
                            if (tier === 'Immutable' || tier === 'Protected') {
                                const flagComment = `[Merge-target conflict: extraction LLM flagged this ${tier} note for merge from conversation ${extracted.sourceConversationId || 'unknown'} but tier prevents auto-revocation]`;
                                existingNote.Comments = `${existingNote.Comments || ''} ${flagComment}`.trim();
                                if (!await existingNote.Save()) {
                                    LogError(`Memory Manager: Failed to annotate ${tier} merge target ${existingNote.ID}`);
                                }
                                if (this._verbose) {
                                    LogStatus(`Memory Manager: Skipped revocation of ${tier} note ${existingNote.ID} flagged as merge target`);
                                }
                                continue;
                            }
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
                    // Determine AgentID - prefer extracted, then inherit from source run
                    let agentId: string | null = MemoryManagerAgent.isValidUUID(extracted.agentId) ? extracted.agentId! : null;
                    if (!agentId && sourceRun?.AgentID) {
                        agentId = sourceRun.AgentID;
                    }
                    note.AgentID = agentId;
                    note.CompanyID = sourceRun?.CompanyID || null;
                    note.AgentNoteTypeID = aiNoteTypeId;  // "AI" type for AI-generated notes
                    note.Type = extracted.type;  // Category: Preference, Constraint, Context, Issue, Example
                    note.Note = extracted.content;
                    note.IsAutoGenerated = true;
                    note.Status = 'Active'; // Auto-approve high-confidence notes
                    note.AccessCount = 1; // Required field

                    // Consolidation tracking fields
                    note.ConsolidationCount = 0; // Raw extraction, never consolidated
                    // Failure-mined corrective notes carry an explicit tier hint (Ephemeral) so
                    // they decay fast unless reinforced; otherwise apply the default tier.
                    note.ProtectionTier = extracted.protectionTierHint || (note.IsAutoGenerated ? 'Standard' : 'Protected');

                    note.SourceConversationID = extracted.sourceConversationId || null;
                    // Only use if it's a valid UUID (LLM now sees message IDs in the prompt)
                    note.SourceConversationDetailID = MemoryManagerAgent.isValidUUID(extracted.sourceConversationDetailId) ? extracted.sourceConversationDetailId! : null;
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
                    note.UserID = scopeLevel === 'user' ? (sourceRun?.UserID || null) : null;

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
     * Compute composite importance scores for all active notes.
     * Uses a 7-signal weighted formula based on Park et al.'s Generative Agents (2023).
     * Signals not available for a given note use neutral defaults (0.5) with proportional weight redistribution.
     *
     * Auto-promotes Standard-tier notes to Protected via two paths:
     *  1. ImportanceScore >= IMPORTANCE_CONFIG.autoPromoteThreshold (default 8.0)
     *  2. Uniqueness at or above the 95th percentile of the cohort (outlier protection,
     *     FR-094). The cohort must be at least OUTLIER_PROMOTION_MIN_COHORT notes for
     *     the percentile to be meaningful.
     *
     * Also reports the score distribution (min/max/mean/median) so the observability
     * step can surface it in the agent run step output.
     */
    private async computeImportanceScores(contextUser: UserInfo): Promise<{
        notesScored: number;
        tierPromotions: number;
        scoreDistribution: { min: number; max: number; mean: number; median: number } | null;
    }> {
        const allNotes = AIEngine.Instance.AgentNotes.filter(n => n.Status === 'Active');
        let notesScored = 0;
        let tierPromotions = 0;
        const md = this.ProviderToUse;
        const scoresForDistribution: number[] = [];

        // Pre-pass: compute uniqueness per note once, derive 95th-percentile threshold.
        // Passing uniqueness into gatherImportanceSignals also eliminates a redundant
        // FindSimilarAgentNotes call per note.
        const uniquenessByNoteId = await this.precomputeUniqueness(allNotes);
        const p95Threshold = this.computeUniquenessP95(uniquenessByNoteId);

        for (const note of allNotes) {
            const uniquenessInfo = uniquenessByNoteId.get(note.ID);
            const signals = this.gatherImportanceSignals(note, uniquenessInfo);
            const importanceScore = this.computeWeightedImportanceScore(signals);

            const noteToUpdate = await md.GetEntityObject<MJAIAgentNoteEntity>('MJ: AI Agent Notes', contextUser);
            if (await noteToUpdate.Load(note.ID)) {
                noteToUpdate.ImportanceScore = importanceScore;

                // Promotion path 1: high ImportanceScore
                const currentTier = noteToUpdate.ProtectionTier || 'Standard';
                let promotedByScore = false;
                if (currentTier === 'Standard' && importanceScore >= IMPORTANCE_CONFIG.autoPromoteThreshold) {
                    noteToUpdate.ProtectionTier = 'Protected';
                    noteToUpdate.Comments = `${noteToUpdate.Comments || ''} [Auto-promoted to Protected: ImportanceScore ${importanceScore} >= ${IMPORTANCE_CONFIG.autoPromoteThreshold}]`.trim();
                    tierPromotions++;
                    promotedByScore = true;
                }

                // Promotion path 2: uniqueness outlier (p95+). Only apply when the cohort
                // is large enough for the percentile to be meaningful, the note has a
                // computed uniqueness, and we didn't already promote it via the score path.
                if (
                    !promotedByScore &&
                    currentTier === 'Standard' &&
                    p95Threshold !== null &&
                    uniquenessInfo?.available &&
                    uniquenessInfo.value >= p95Threshold
                ) {
                    noteToUpdate.ProtectionTier = 'Protected';
                    noteToUpdate.Comments = `${noteToUpdate.Comments || ''} [Auto-protected: uniqueness ${uniquenessInfo.value.toFixed(3)} at/above 95th percentile ${p95Threshold.toFixed(3)}]`.trim();
                    tierPromotions++;
                }

                if (await noteToUpdate.Save()) {
                    notesScored++;
                    scoresForDistribution.push(importanceScore);
                } else {
                    LogError(`Memory Manager: Failed to update ImportanceScore for note ${note.ID}`);
                }
            }
        }

        return {
            notesScored,
            tierPromotions,
            scoreDistribution: this.summarizeScores(scoresForDistribution)
        };
    }

    /**
     * Pre-compute uniqueness (1 - maxSimilarity to nearest neighbor) for each note in
     * one pass. Returns a map keyed by note ID. Notes without content get an
     * unavailable signal so downstream scoring falls back to the neutral default.
     */
    private async precomputeUniqueness(
        notes: MJAIAgentNoteEntity[]
    ): Promise<Map<string, { value: number; available: boolean }>> {
        const map = new Map<string, { value: number; available: boolean }>();
        for (const note of notes) {
            if (!note.Note) {
                map.set(note.ID, { value: 0.5, available: false });
                continue;
            }
            const similar = await AIEngine.Instance.FindSimilarAgentNotes(note.Note, note.AgentID, undefined, undefined, 1, 0.0);
            const uniqueness = similar.length > 0 ? 1.0 - similar[0].similarity : 1.0;
            map.set(note.ID, { value: uniqueness, available: true });
        }
        return map;
    }

    /**
     * Derive the 95th-percentile uniqueness threshold across the cohort. Returns null
     * when the cohort is smaller than OUTLIER_PROMOTION_MIN_COHORT (percentile isn't
     * meaningful) or when no uniqueness was actually computable.
     */
    private computeUniquenessP95(
        uniquenessMap: Map<string, { value: number; available: boolean }>
    ): number | null {
        const available = Array.from(uniquenessMap.values())
            .filter(u => u.available)
            .map(u => u.value);
        if (available.length < OUTLIER_PROMOTION_MIN_COHORT) {
            return null;
        }
        const sorted = available.slice().sort((a, b) => a - b);
        const index = Math.floor(sorted.length * 0.95);
        const clampedIndex = Math.min(sorted.length - 1, index);
        return sorted[clampedIndex];
    }

    /**
     * Summarize importance scores into min/max/mean/median. Returns null for an empty
     * input so the caller can serialize it as an explicit "no data" signal in the
     * observability step.
     */
    private summarizeScores(scores: number[]): { min: number; max: number; mean: number; median: number } | null {
        if (scores.length === 0) return null;
        const sorted = scores.slice().sort((a, b) => a - b);
        const min = sorted[0];
        const max = sorted[sorted.length - 1];
        const mean = sorted.reduce((sum, v) => sum + v, 0) / sorted.length;
        const mid = sorted.length / 2;
        const median = sorted.length % 2 === 0
            ? (sorted[mid - 1] + sorted[mid]) / 2
            : sorted[Math.floor(mid)];
        return {
            min: Math.round(min * 100) / 100,
            max: Math.round(max * 100) / 100,
            mean: Math.round(mean * 100) / 100,
            median: Math.round(median * 100) / 100
        };
    }

    /**
     * Gather the 7 importance signals for a single note. Uniqueness is precomputed by
     * the caller so the full cohort can be examined in one pass for percentile
     * analysis. Other signals are derived from the note itself.
     */
    private gatherImportanceSignals(
        note: MJAIAgentNoteEntity,
        precomputedUniqueness: { value: number; available: boolean } | undefined
    ): ImportanceSignal[] {
        const signals: ImportanceSignal[] = [];
        const hoursSinceCreation = (Date.now() - new Date(note.__mj_CreatedAt).getTime()) / (1000 * 60 * 60);
        const hasConfidence = note.Comments?.includes('confidence') || false;
        const isCorrection = note.Comments?.includes('Superseded') || note.Comments?.includes('contradiction');

        signals.push({ signal: 'recencyDecay', value: Math.pow(0.995, hoursSinceCreation), available: true });
        signals.push({ signal: 'llmImportance', value: hasConfidence ? 0.7 : 0.5, available: hasConfidence });
        signals.push({ signal: 'relevance', value: 0.5, available: false }); // Phase 2 enrichment
        signals.push({
            signal: 'uniqueness',
            value: precomputedUniqueness?.value ?? 0.5,
            available: precomputedUniqueness?.available ?? false
        });
        signals.push({ signal: 'correctionBoost', value: isCorrection ? 1.0 : 0.0, available: true });
        signals.push({ signal: 'goalAlignment', value: 0.5, available: false }); // Phase 2 enrichment
        signals.push({ signal: 'userMark', value: note.IsAutoGenerated ? 0.0 : 1.0, available: true });

        return signals;
    }

    /** Compute a weighted importance score (0-10) from signals, redistributing weight from unavailable signals. */
    private computeWeightedImportanceScore(signals: ImportanceSignal[]): number {
        const weights = IMPORTANCE_CONFIG.weights;
        const availableSignals = signals.filter(s => s.available);
        const totalAvailableWeight = availableSignals.reduce((sum, s) => sum + (weights[s.signal] || 0), 0);
        const unavailableWeight = signals.filter(s => !s.available).reduce((sum, s) => sum + (weights[s.signal] || 0), 0);

        let rawScore = 0;
        for (const s of availableSignals) {
            if (totalAvailableWeight > 0) {
                const adjustedWeight = (weights[s.signal] || 0) + ((weights[s.signal] || 0) / totalAvailableWeight) * unavailableWeight;
                rawScore += s.value * adjustedWeight;
            }
        }

        let score = rawScore * 10.0;
        const isCorrection = signals.some(s => s.signal === 'correctionBoost' && s.value > 0);
        if (isCorrection) {
            score = Math.min(10.0, score + IMPORTANCE_CONFIG.correctionBonusPoints);
        }

        return Math.round(score * 100) / 100;
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
     *
     * @param forceMaintenance When true, bypasses all gating and runs maintenance
     *   regardless of frequency/history. Set by callers via `params.data.forceMaintenance`
     *   (see `executeAgentInternal`). Intended for tests, manual admin triggers, and
     *   the E2E verification script — NOT for production config. Previously this was
     *   an env var (`FORCE_MAINTENANCE=1`), which was removed because an env-var
     *   sidechannel could accidentally leak into production and cause massive DB/LLM
     *   churn on every run.
     *
     * Returns both a boolean and the reason it fired so the observability layer can
     * record the trigger type on the parent consolidation run step.
     */
    private async shouldRunConsolidation(
        agentId: string,
        contextUser: UserInfo,
        forceMaintenance: boolean,
        lastRun: Date | null
    ): Promise<ConsolidationTriggerDecision> {
        if (forceMaintenance) return { shouldRun: true, triggerType: 'forced' };

        const freq = CONSOLIDATION_CONFIG.frequency;
        if (freq === 'disabled') return { shouldRun: false, triggerType: 'disabled' };
        if (freq === 'every-run') return { shouldRun: true, triggerType: 'every-run' };

        if (freq === 'hourly' || freq === 'daily') {
            return this.shouldRunConsolidationByTimeWindow(contextUser, freq === 'hourly' ? 1 : 24, lastRun);
        }

        if (typeof freq === 'number') {
            return this.shouldRunConsolidationByRunCount(agentId, contextUser, freq);
        }

        return { shouldRun: true, triggerType: 'every-run' };
    }

    /**
     * Time-window frequency gate: returns shouldRun=true with triggerType='time' when
     * enough time has passed since the last memory-manager run, or triggerType='event'
     * when the event-driven new-note threshold has been crossed. Falls back to
     * triggerType='not-triggered' when neither condition fires.
     */
    private async shouldRunConsolidationByTimeWindow(
        contextUser: UserInfo,
        thresholdHours: number,
        lastRun: Date | null
    ): Promise<ConsolidationTriggerDecision> {
        // `lastRun` is the same value computed once at the top of the maintenance cycle
        // (executeAgentInternal). Threading it through here removes a second identical
        // `MJ: AI Agent Runs` RunView (AgentID + Status='Completed', OrderBy StartedAt DESC)
        // that the redundancy telemetry flagged as a duplicate round-trip.
        if (!lastRun) return { shouldRun: true, triggerType: 'time' };

        const hoursSinceLast = (Date.now() - lastRun.getTime()) / (1000 * 60 * 60);
        if (hoursSinceLast >= thresholdHours) return { shouldRun: true, triggerType: 'time' };

        // Event-driven trigger: consolidate when at least `noteCountTrigger` new notes
        // have been added system-wide since the last Memory Manager run.
        //
        // NOTE: this count intentionally does NOT filter by AgentID. The `agentId` parameter
        // here is the Memory Manager's own ID (passed from `params.agent.ID` at the call
        // site), not the agent that owns the notes. Filtering the count by MM's own agent
        // ID would never match anything because MM doesn't own notes — it processes notes
        // belonging to other (memory-enabled) agents.
        //
        // AIEngineBase caches `MJ: AI Agent Notes` unfiltered as full entity objects
        // (`AIEngine.Instance.AgentNotes`) and keeps that cache current via BaseEntity
        // save/delete events, so we count in-memory instead of a `count_only` RunView. This
        // avoids the "Entity Already in Engine" redundancy telemetry warning and a DB
        // round-trip on every maintenance cycle. Mirrors the cached-note filtering used
        // elsewhere in this class (e.g. buildMaintenanceSummary).
        const lastRunMs = lastRun.getTime();
        const newNoteCount = AIEngine.Instance.AgentNotes.filter(n =>
            n.IsAutoGenerated &&
            n.Status === 'Active' &&
            n.__mj_CreatedAt != null &&
            new Date(n.__mj_CreatedAt).getTime() > lastRunMs
        ).length;

        if (newNoteCount >= CONSOLIDATION_CONFIG.noteCountTrigger) {
            if (this._verbose) {
                LogStatus(`Memory Manager: Event-driven consolidation trigger fired (${newNoteCount} new notes >= ${CONSOLIDATION_CONFIG.noteCountTrigger} threshold since last MM run)`);
            }
            return { shouldRun: true, triggerType: 'event' };
        }
        return { shouldRun: false, triggerType: 'not-triggered' };
    }

    /** Run-count frequency gate: consolidate every N completed runs. */
    private async shouldRunConsolidationByRunCount(
        agentId: string,
        contextUser: UserInfo,
        everyN: number
    ): Promise<ConsolidationTriggerDecision> {
        const rv = new RunView();
        const countResult = await rv.RunView({
            EntityName: 'MJ: AI Agent Runs',
            ExtraFilter: `AgentID='${agentId}' AND Status='Completed'`,
            ResultType: 'count_only'
        }, contextUser);
        const completedCount = countResult.Success ? (countResult.TotalRowCount || 0) : 0;
        const shouldRun = completedCount > 0 && completedCount % everyN === 0;
        return { shouldRun, triggerType: shouldRun ? 'count' : 'not-triggered' };
    }

    /**
     * Consolidate related notes into single, comprehensive notes.
     * This method finds clusters of similar notes and synthesizes them.
     *
     * Returns per-cluster verification results alongside the consolidation counts so
     * the phase-level "Verify Consolidation Output" run step can aggregate them.
     *
     * @param agentId Optional - consolidate notes for a specific agent only
     * @param contextUser The context user for database operations
     */
    public async consolidateRelatedNotes(
        agentId: string | null,
        contextUser: UserInfo
    ): Promise<{ consolidated: number; archived: number; newNoteIds: string[]; verifications: ConsolidationVerificationResult[] }> {
        const allNotes = AIEngine.Instance.AgentNotes;

        // Filter to active, auto-generated notes (optionally for specific agent)
        const activeNotes = allNotes.filter(n =>
            n.Status === 'Active' &&
            n.IsAutoGenerated &&
            (agentId === null || UUIDsEqual(n.AgentID, agentId))
        );

        if (activeNotes.length < CONSOLIDATION_CONFIG.minClusterSize) {
            if (this._verbose) {
                LogStatus(`Memory Manager: Only ${activeNotes.length} active notes - need at least ${CONSOLIDATION_CONFIG.minClusterSize} to consolidate`);
            }
            return { consolidated: 0, archived: 0, newNoteIds: [], verifications: [] };
        }

        if (this._verbose) {
            LogStatus(`Memory Manager: Analyzing ${activeNotes.length} active notes for consolidation`);
        }

        const clusters = await this.findConsolidationClusters(activeNotes);

        if (clusters.length === 0) {
            if (this._verbose) {
                LogStatus(`Memory Manager: No clusters found with ${CONSOLIDATION_CONFIG.minClusterSize}+ similar notes`);
            }
            return { consolidated: 0, archived: 0, newNoteIds: [], verifications: [] };
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
            return { consolidated: 0, archived: 0, newNoteIds: [], verifications: [] };
        }

        const aiNoteTypeId = AIEngine.Instance.AgenteNoteTypeIDByName('AI');
        if (!aiNoteTypeId) {
            LogError('Memory Manager: Could not find "AI" note type');
            return { consolidated: 0, archived: 0, newNoteIds: [], verifications: [] };
        }

        let consolidated = 0;
        let archived = 0;
        const newNoteIds: string[] = [];
        const verifications: ConsolidationVerificationResult[] = [];
        const runner = new AIPromptRunner();
        const md = this.ProviderToUse;

        for (const cluster of clusters) {
            try {
                const result = await this.processConsolidationCluster(
                    cluster, consolidatePrompt, aiNoteTypeId, runner, md, contextUser
                );
                consolidated += result.consolidated;
                archived += result.archived;
                if (result.newNoteId) newNoteIds.push(result.newNoteId);
                if (result.verification) verifications.push(result.verification);
            } catch (error) {
                LogError('Memory Manager: Exception during consolidation:', error);
            }
        }

        return { consolidated, archived, newNoteIds, verifications };
    }

    /**
     * Find clusters of semantically similar notes suitable for consolidation.
     * Each cluster contains notes that exceed the similarity threshold and meet the minimum cluster size.
     */
    private async findConsolidationClusters(activeNotes: MJAIAgentNoteEntity[]): Promise<MJAIAgentNoteEntity[][]> {
        const clusters: MJAIAgentNoteEntity[][] = [];
        const processedIds = new Set<string>();

        // Protection tier filtering: exclude Immutable and Protected notes from consolidation clustering
        const eligibleNotes = activeNotes.filter(n => {
            const tier = n.ProtectionTier || 'Standard';
            return tier !== 'Immutable' && tier !== 'Protected';
        });

        for (const note of eligibleNotes) {
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
                    // Also check that similar notes pass protection tier filter
                    const similarTier = similar.note.ProtectionTier || 'Standard';
                    if (similarTier !== 'Immutable' && similarTier !== 'Protected') {
                        cluster.push(similar.note);
                        processedIds.add(similar.note.ID);
                    }
                }
            }

            // Determine minClusterSize based on tier: Ephemeral uses relaxed threshold of 2
            const noteTier = note.ProtectionTier || 'Standard';
            const minSize = noteTier === 'Ephemeral' ? 2 : CONSOLIDATION_CONFIG.minClusterSize;

            if (cluster.length >= minSize) {
                // Enforce maxClusterSize by splitting oversized clusters
                if (cluster.length > CONSOLIDATION_CONFIG.maxClusterSize) {
                    const splitClusters = this.splitOversizedCluster(cluster);
                    clusters.push(...splitClusters);
                } else {
                    clusters.push(cluster);
                }
            }
        }

        return clusters;
    }

    /**
     * Split a cluster that exceeds maxClusterSize into sub-clusters.
     * Takes the first maxClusterSize notes (sorted by position in original cluster, which preserves
     * similarity ordering from FindSimilarAgentNotes), and forms a second cluster from the remainder
     * if it meets minClusterSize.
     */
    private splitOversizedCluster(cluster: MJAIAgentNoteEntity[]): MJAIAgentNoteEntity[][] {
        const result: MJAIAgentNoteEntity[][] = [];
        const maxSize = CONSOLIDATION_CONFIG.maxClusterSize;
        const minSize = CONSOLIDATION_CONFIG.minClusterSize;

        // Split into chunks of maxClusterSize
        for (let i = 0; i < cluster.length; i += maxSize) {
            const chunk = cluster.slice(i, i + maxSize);
            if (chunk.length >= minSize) {
                result.push(chunk);
            }
        }

        return result;
    }

    /**
     * Walk DerivedFromNoteIDs chains breadth-first to find all generation-0 (original) source notes.
     * Batches each depth level into a single `ID IN (...)` query instead of one query per ID.
     */
    private async resolveOriginalSources(noteIds: string[], contextUser: UserInfo): Promise<ResolvedNoteRecord[]> {
        const originals: ResolvedNoteRecord[] = [];
        const visited = new Set<string>();

        let currentIds = noteIds.filter(id => !visited.has(id));
        currentIds.forEach(id => visited.add(id));
        let depth = 0;

        while (currentIds.length > 0 && depth <= MAX_SOURCE_RESOLUTION_DEPTH) {
            if (depth > MAX_SOURCE_RESOLUTION_DEPTH) {
                LogError(`Memory Manager: resolveOriginalSources() exceeded max depth ${MAX_SOURCE_RESOLUTION_DEPTH} — treating remaining ${currentIds.length} IDs as terminal to prevent runaway recursion`);
                break;
            }

            const results = await this.loadResolvedNotes(currentIds, contextUser);
            if (results.length === 0) break;

            currentIds = this.collectNextLevelSourceIds(results, originals, visited);
            depth++;
        }

        return originals;
    }

    /**
     * Load a batch of notes by ID with the fields needed for source resolution.
     *
     * AIEngineBase caches `MJ: AI Agent Notes` unfiltered as full entity objects
     * (`AIEngine.Instance.AgentNotes`), so source-chain ancestors — which are pre-existing
     * notes, never ones created earlier in this same cycle — are already in memory. We serve
     * those from the cache and only issue a RunView for IDs the cache doesn't have, instead of
     * a DB round-trip per BFS depth level. This resolves the redundancy telemetry's
     * "Entity Already in Engine" warning for AIEngineBase while preserving exact behavior
     * (the projection shape and field set are unchanged).
     */
    private async loadResolvedNotes(noteIds: string[], contextUser: UserInfo): Promise<ResolvedNoteRecord[]> {
        const cachedById = new Map<string, MJAIAgentNoteEntity>();
        for (const note of AIEngine.Instance.AgentNotes) {
            if (note.ID) cachedById.set(note.ID.toLowerCase(), note);
        }

        const resolved: ResolvedNoteRecord[] = [];
        const missingIds: string[] = [];
        for (const id of noteIds) {
            const cached = cachedById.get(id.toLowerCase());
            if (cached) {
                resolved.push(this.projectResolvedNote(cached));
            } else {
                missingIds.push(id);
            }
        }

        if (missingIds.length > 0) {
            resolved.push(...await this.loadResolvedNotesFromDatabase(missingIds, contextUser));
        }
        return resolved;
    }

    /** Project a cached note entity into the read-only shape used by source resolution. */
    private projectResolvedNote(note: MJAIAgentNoteEntity): ResolvedNoteRecord {
        return {
            ID: note.ID,
            ConsolidationCount: note.ConsolidationCount,
            DerivedFromNoteIDs: note.DerivedFromNoteIDs,
            Note: note.Note,
            Type: note.Type,
            AccessCount: note.AccessCount,
            ImportanceScore: note.ImportanceScore,
            AgentID: note.AgentID,
            UserID: note.UserID,
            CompanyID: note.CompanyID,
            __mj_CreatedAt: note.__mj_CreatedAt
        };
    }

    /** RunView fallback for note IDs not present in the AIEngine cache. */
    private async loadResolvedNotesFromDatabase(noteIds: string[], contextUser: UserInfo): Promise<ResolvedNoteRecord[]> {
        const resolvedFields: (keyof ResolvedNoteRecord)[] = [
            'ID', 'ConsolidationCount', 'DerivedFromNoteIDs', 'Note', 'Type',
            'AccessCount', 'ImportanceScore', 'AgentID', 'UserID', 'CompanyID', '__mj_CreatedAt'
        ];
        const inClause = noteIds.map(id => `'${id}'`).join(',');
        const rv = new RunView();
        const result = await rv.RunView<ResolvedNoteRecord>({
            EntityName: 'MJ: AI Agent Notes',
            ExtraFilter: `ID IN (${inClause})`,
            Fields: resolvedFields as string[],
        }, contextUser);
        return result.Success && result.Results ? result.Results : [];
    }

    /**
     * Partition a batch of resolved notes into terminal originals (pushed into `originals`)
     * and parent IDs that need further resolution. Mutates `originals` and `visited`.
     */
    private collectNextLevelSourceIds(
        notes: ResolvedNoteRecord[],
        originals: ResolvedNoteRecord[],
        visited: Set<string>
    ): string[] {
        const nextLevelIds: string[] = [];
        for (const note of notes) {
            const consolidationCount = note.ConsolidationCount || 0;
            if (consolidationCount === 0 || !note.DerivedFromNoteIDs) {
                originals.push(note);
                continue;
            }
            try {
                const parentIds = JSON.parse(note.DerivedFromNoteIDs) as string[];
                for (const parentId of parentIds) {
                    if (!visited.has(parentId)) {
                        visited.add(parentId);
                        nextLevelIds.push(parentId);
                    }
                }
            } catch {
                LogError(`Memory Manager: Malformed DerivedFromNoteIDs on note ${note.ID} — treating as terminal source`);
                originals.push(note);
            }
        }
        return nextLevelIds;
    }

    /**
     * Verify that a consolidated note preserves key entities from its source notes.
     * Extracts numbers, dates, and proper nouns from source notes and checks they appear in the output.
     * Non-blocking: returns verification results but does not prevent consolidation.
     */
    private verifyConsolidationOutput(
        sourceNotes: Array<{ Note: string | null }>,
        consolidatedText: string
    ): { entitiesChecked: number; entitiesMissing: string[]; passed: boolean } {
        const entities = new Set<string>();
        const consolidatedLower = consolidatedText.toLowerCase();

        for (const note of sourceNotes) {
            this.extractVerifiableEntities(note.Note || '', entities);
        }

        const missing: string[] = [];
        for (const entity of entities) {
            if (!consolidatedLower.includes(entity.toLowerCase())) {
                missing.push(entity);
            }
        }

        return {
            entitiesChecked: entities.size,
            entitiesMissing: missing,
            passed: missing.length === 0
        };
    }

    /**
     * Harvest numbers, dates, proper nouns, and camelCase identifiers from a note's text
     * into the supplied set. Used only by verifyConsolidationOutput to assemble a
     * best-effort entity inventory for post-consolidation checks.
     */
    private extractVerifiableEntities(text: string, entities: Set<string>): void {
        const numbers = text.match(/\b\d+\.?\d*%?\b/g);
        if (numbers) numbers.forEach(n => entities.add(n));

        const dates = text.match(/\b\d{4}-\d{2}-\d{2}\b|\b(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\w*\s+\d{1,2}\b|\b\d{1,2}\/\d{1,2}\/\d{2,4}\b/gi);
        if (dates) dates.forEach(d => entities.add(d));

        const properNouns = text.match(/(?<=[.!?]\s+|^)(?:[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)/g);
        if (properNouns) {
            const skipWords = new Set(['the', 'a', 'an', 'this', 'that', 'it', 'we', 'they', 'user', 'note']);
            properNouns
                .filter(pn => !skipWords.has(pn.toLowerCase()) && pn.length > 2)
                .forEach(pn => entities.add(pn));
        }

        const techTerms = text.match(/\b[a-z]+(?:[A-Z][a-z]+)+\b|\b(?:[A-Z][a-z]+){2,}\b/g);
        if (techTerms) techTerms.forEach(t => entities.add(t));
    }

    /**
     * Detect and resolve contradictions between semantically similar notes.
     * Uses a three-stage pipeline: embedding pre-filter, entity-attribute extraction, LLM judgment.
     * High-importance pairs (both >= highImportanceThreshold) are flagged but preserved.
     * Protected-tier notes are never auto-revoked.
     *
     * Aggregates the per-pair entity-attribute-value triple count so the observability
     * step can report how much structural reasoning the LLM produced.
     */
    private async detectAndResolveContradictions(
        contextUser: UserInfo,
        consolidatedNoteIds: Set<string>
    ): Promise<{ contradictionsFound: number; resolved: number; flagged: number; pairsAnalyzed: number; entityTriplesExtracted: number }> {
        const result = { contradictionsFound: 0, resolved: 0, flagged: 0, pairsAnalyzed: 0, entityTriplesExtracted: 0 };

        const prompt = AIEngine.Instance.Prompts.find(p =>
            p.Name === 'Memory Manager - Detect Contradictions' && p.Category === 'MJ: System'
        );
        if (!prompt) {
            LogError('Memory Manager: Contradiction detection prompt not found, skipping phase');
            return result;
        }

        const candidatePairs = await this.buildContradictionCandidatePairs(consolidatedNoteIds);
        if (candidatePairs.length === 0) return result;

        const runner = new AIPromptRunner();
        const md = this.ProviderToUse;

        for (const [noteA, noteB] of candidatePairs) {
            result.pairsAnalyzed++;

            const llmResult = await this.evaluateContradictionPair(noteA, noteB, prompt, runner, contextUser);
            if (!llmResult) continue;

            result.entityTriplesExtracted += llmResult.triplesExtracted;
            if (!llmResult.isContradiction) continue;

            result.contradictionsFound++;
            const resolved = await this.resolveContradiction(noteA, noteB, llmResult, md, contextUser);
            if (resolved === 'flagged') result.flagged++;
            else if (resolved === 'resolved') result.resolved++;
        }

        return result;
    }

    /** Build unique candidate pairs of semantically similar notes for contradiction analysis. */
    private async buildContradictionCandidatePairs(
        consolidatedNoteIds: Set<string>
    ): Promise<[MJAIAgentNoteEntity, MJAIAgentNoteEntity][]> {
        const allNotes = AIEngine.Instance.AgentNotes.filter(n =>
            n.Status === 'Active' && n.IsAutoGenerated && (n.ProtectionTier || 'Standard') !== 'Immutable'
        );

        const processedPairs = new Set<string>();
        const pairs: [MJAIAgentNoteEntity, MJAIAgentNoteEntity][] = [];

        for (const note of allNotes) {
            if (!note.Note || pairs.length >= CONTRADICTION_CONFIG.maxPairsPerRun) break;

            const similarNotes = await AIEngine.Instance.FindSimilarAgentNotes(
                note.Note, note.AgentID, undefined, undefined, 5, CONTRADICTION_CONFIG.similarityThreshold
            );

            for (const similar of similarNotes) {
                const pairKey = [note.ID, similar.note.ID].sort().join('|');
                if (processedPairs.has(pairKey)) continue;
                processedPairs.add(pairKey);
                if (consolidatedNoteIds.has(note.ID) && consolidatedNoteIds.has(similar.note.ID)) continue;

                pairs.push([note, similar.note]);
                if (pairs.length >= CONTRADICTION_CONFIG.maxPairsPerRun) break;
            }
        }

        return pairs;
    }

    /** Evaluate a single note pair for contradiction using the LLM prompt. */
    private async evaluateContradictionPair(
        noteA: MJAIAgentNoteEntity,
        noteB: MJAIAgentNoteEntity,
        prompt: MJAIPromptEntityExtended,
        runner: AIPromptRunner,
        contextUser: UserInfo
    ): Promise<ContradictionPairEvaluation | null> {
        const params = new AIPromptParams();
        params.prompt = prompt;
        params.data = {
            noteA: { id: noteA.ID, type: noteA.Type, content: noteA.Note, createdAt: noteA.__mj_CreatedAt, accessCount: noteA.AccessCount, importanceScore: noteA.ImportanceScore || null, agentId: noteA.AgentID, userId: noteA.UserID, companyId: noteA.CompanyID },
            noteB: { id: noteB.ID, type: noteB.Type, content: noteB.Note, createdAt: noteB.__mj_CreatedAt, accessCount: noteB.AccessCount, importanceScore: noteB.ImportanceScore || null, agentId: noteB.AgentID, userId: noteB.UserID, companyId: noteB.CompanyID }
        };
        params.contextUser = contextUser;
        params.attemptJSONRepair = true;
        params.additionalParameters = DETERMINISTIC_PROMPT_PARAMS;

        const llmResult = await runner.ExecutePrompt<ContradictionPromptResult>(params);
        if (!llmResult.success || !llmResult.result) return null;

        let parsed = llmResult.result;
        if (typeof parsed === 'string') {
            const cleaned = CleanAndParseJSON<ContradictionPromptResult>(parsed, true);
            if (!cleaned) return null;
            parsed = cleaned;
        }

        return {
            isContradiction: parsed.isContradiction,
            keepNoteId: parsed.keepNoteId,
            revokeNoteId: parsed.revokeNoteId,
            reason: parsed.reason,
            triplesExtracted: this.countEntityTriples(parsed.entityTriples)
        };
    }

    /**
     * Count entity-attribute-value triples returned by the contradiction detection prompt.
     * Accepts any shape the LLM may produce: object of arrays keyed by noteId, flat array,
     * or null/undefined. Unrecognized shapes return 0 so a malformed response can't poison
     * the aggregate counter.
     */
    private countEntityTriples(entityTriples: ContradictionPromptResult['entityTriples']): number {
        if (!entityTriples) return 0;
        if (Array.isArray(entityTriples)) return entityTriples.length;
        if (typeof entityTriples === 'object') {
            let total = 0;
            for (const value of Object.values(entityTriples)) {
                if (Array.isArray(value)) total += value.length;
            }
            return total;
        }
        return 0;
    }

    /** Resolve a detected contradiction: flag both notes if high-importance/Protected, otherwise revoke the loser. */
    private async resolveContradiction(
        noteA: MJAIAgentNoteEntity,
        noteB: MJAIAgentNoteEntity,
        llmResult: { keepNoteId?: string; revokeNoteId?: string; reason: string },
        md: IMetadataProvider,
        contextUser: UserInfo
    ): Promise<'flagged' | 'resolved' | 'skipped'> {
        if (this.shouldFlagContradiction(noteA, noteB)) {
            await this.flagContradictionPair(noteA, noteB, llmResult, md, contextUser);
            return 'flagged';
        }

        const { revokeNoteId: revokeId, keepNoteId: keepId } = llmResult;
        if (!revokeId || !keepId) return 'skipped';

        const noteToRevoke = await md.GetEntityObject<MJAIAgentNoteEntity>('MJ: AI Agent Notes', contextUser);
        if (!(await noteToRevoke.Load(revokeId))) return 'skipped';

        noteToRevoke.Status = 'Revoked';
        noteToRevoke.ConsolidatedIntoNoteID = keepId;
        noteToRevoke.Comments = `[Contradiction resolved: superseded by note ${keepId}. ${llmResult.reason}]`;
        if (!(await noteToRevoke.Save())) return 'skipped';

        if (this._verbose) {
            LogStatus(`Memory Manager: Contradiction resolved — revoked note ${revokeId} in favor of ${keepId}`);
        }
        return 'resolved';
    }

    /** Decide whether a contradiction pair must be flagged rather than auto-resolved. */
    private shouldFlagContradiction(noteA: MJAIAgentNoteEntity, noteB: MJAIAgentNoteEntity): boolean {
        const bothHighImportance = (noteA.ImportanceScore || 0) >= CONTRADICTION_CONFIG.highImportanceThreshold &&
                                    (noteB.ImportanceScore || 0) >= CONTRADICTION_CONFIG.highImportanceThreshold;
        const hasProtected = (noteA.ProtectionTier || 'Standard') === 'Protected' || (noteB.ProtectionTier || 'Standard') === 'Protected';
        return bothHighImportance || hasProtected;
    }

    /** Flag both notes in a contradiction pair with a cross-referencing audit comment. */
    private async flagContradictionPair(
        noteA: MJAIAgentNoteEntity,
        noteB: MJAIAgentNoteEntity,
        llmResult: { keepNoteId?: string; revokeNoteId?: string; reason: string },
        md: IMetadataProvider,
        contextUser: UserInfo
    ): Promise<void> {
        const flagComment = `[Contradiction flagged: conflicts with note ${llmResult.revokeNoteId && UUIDsEqual(noteA.ID, llmResult.revokeNoteId) ? llmResult.keepNoteId : llmResult.revokeNoteId}. ${llmResult.reason}]`;
        for (const flagNote of [noteA, noteB]) {
            const noteToFlag = await md.GetEntityObject<MJAIAgentNoteEntity>('MJ: AI Agent Notes', contextUser);
            if (await noteToFlag.Load(flagNote.ID)) {
                noteToFlag.Comments = `${noteToFlag.Comments || ''} ${flagComment}`.trim();
                await noteToFlag.Save();
            }
        }
        if (this._verbose) {
            const bothHighImportance = (noteA.ImportanceScore || 0) >= CONTRADICTION_CONFIG.highImportanceThreshold &&
                                        (noteB.ImportanceScore || 0) >= CONTRADICTION_CONFIG.highImportanceThreshold;
            const reason = bothHighImportance ? 'both high-importance' : 'Protected tier present';
            LogStatus(`Memory Manager: Contradiction flagged (${reason}): "${noteA.Note?.substring(0, 40)}..." vs "${noteB.Note?.substring(0, 40)}..."`);
        }
    }

    /**
     * Process a single consolidation cluster: run the LLM prompt, create the consolidated note,
     * and revoke source notes.
     *
     * Emits a per-cluster "Process Consolidation Cluster" observability step that runs
     * between the parent consolidation step's create/finalize calls, producing an
     * implicit parent-child relationship via step-number ordering.
     */
    private async processConsolidationCluster(
        cluster: MJAIAgentNoteEntity[],
        consolidatePrompt: MJAIPromptEntityExtended,
        aiNoteTypeId: string,
        runner: AIPromptRunner,
        md: IMetadataProvider,
        contextUser: UserInfo
    ): Promise<{ consolidated: number; archived: number; newNoteId: string | null; verification: ConsolidationVerificationResult | null }> {
        const maxGeneration = Math.max(...cluster.map(n => n.ConsolidationCount || 0));
        const clusterStep = await this.CreateRunStep('Prompt', 'Process Consolidation Cluster', {
            clusterSize: cluster.length,
            noteIds: cluster.map(n => n.ID),
            maxGeneration
        });

        const outcome: { consolidated: number; archived: number; newNoteId: string | null; verification: ConsolidationVerificationResult | null } = {
            consolidated: 0,
            archived: 0,
            newNoteId: null,
            verification: null
        };
        let stepOutput: Record<string, unknown> = { clusterSize: cluster.length };

        try {
            const { notesForPrompt, promptData } = await this.buildConsolidationPromptData(cluster, contextUser);

            const parsedResult = await this.runConsolidationPrompt(consolidatePrompt, promptData, runner, contextUser);
            if (!parsedResult) {
                stepOutput = { ...stepOutput, shouldConsolidate: false, skipReason: 'prompt-failed' };
                return outcome;
            }
            if (!parsedResult.shouldConsolidate) {
                if (this._verbose) {
                    LogStatus(`Memory Manager: Skipping cluster consolidation - ${parsedResult.reason}`);
                }
                stepOutput = { ...stepOutput, shouldConsolidate: false, skipReason: parsedResult.reason };
                return outcome;
            }

            const consolidatedNoteData = parsedResult.consolidatedNote!;
            const newNote = await this.createConsolidatedNote(cluster, consolidatedNoteData, parsedResult.reason, aiNoteTypeId, md, contextUser);
            if (!newNote) {
                stepOutput = { ...stepOutput, shouldConsolidate: true, skipReason: 'save-failed' };
                return outcome;
            }

            outcome.verification = await this.annotateConsolidationVerification(newNote, notesForPrompt, consolidatedNoteData.content);
            outcome.archived = await this.revokeSourceNotes(cluster, newNote.ID, parsedResult.reason, md, contextUser);
            outcome.consolidated = 1;
            outcome.newNoteId = newNote.ID;

            if (this._verbose) {
                LogStatus(`Memory Manager: Consolidated ${cluster.length} notes into: "${consolidatedNoteData.content.substring(0, 50)}..."`);
            }

            stepOutput = {
                ...stepOutput,
                shouldConsolidate: true,
                consolidatedNoteId: newNote.ID,
                sourceNotesArchived: outcome.archived,
                verificationPassed: outcome.verification?.passed ?? null,
                entitiesChecked: outcome.verification?.entitiesChecked ?? 0,
                entitiesMissing: outcome.verification?.entitiesMissing ?? []
            };
            return outcome;
        } finally {
            // Treat skip (shouldConsolidate: false) as a successful completion rather than a
            // failure — the phase intentionally chose not to consolidate this cluster.
            await this.FinalizeRunStep(clusterStep, outcome.consolidated === 1 || stepOutput.shouldConsolidate === false, stepOutput);
        }
    }

    /**
     * Prepare the prompt payload for consolidation. Handles drift prevention: if any source
     * note is at the consolidation count cap, resolve back to original generation-0 sources
     * to avoid re-summarizing summaries. Returns both the notes used (for verification) and
     * the prompt data.
     */
    private async buildConsolidationPromptData(
        cluster: MJAIAgentNoteEntity[],
        contextUser: UserInfo
    ): Promise<{ notesForPrompt: Array<MJAIAgentNoteEntity | ResolvedNoteRecord>; promptData: ConsolidationPromptData }> {
        const maxConsolidationCount = Math.max(...cluster.map(n => n.ConsolidationCount || 0));
        let notesForPrompt: Array<MJAIAgentNoteEntity | ResolvedNoteRecord> = cluster;
        let anchoredMode = false;

        if (maxConsolidationCount >= CONSOLIDATION_CONFIG.maxConsolidationCount) {
            const originals = await this.resolveOriginalSources(cluster.map(n => n.ID), contextUser);
            if (originals.length > 0) {
                notesForPrompt = originals;
                if (this._verbose) {
                    LogStatus(`Memory Manager: ConsolidationCount cap reached (${maxConsolidationCount}). Resolved ${cluster.length} notes to ${originals.length} original sources.`);
                }
            }
        } else if (maxConsolidationCount > 0) {
            anchoredMode = true;
        }

        const promptData: ConsolidationPromptData = {
            anchoredMode,
            notesToConsolidate: notesForPrompt.map(n => ({
                id: n.ID,
                type: n.Type,
                content: n.Note,
                createdAt: n.__mj_CreatedAt,
                accessCount: n.AccessCount,
                importanceScore: n.ImportanceScore || null,
                consolidationCount: n.ConsolidationCount || 0,
                agentId: n.AgentID,
                userId: n.UserID,
                companyId: n.CompanyID
            }))
        };

        return { notesForPrompt, promptData };
    }

    /**
     * Execute the consolidation prompt and parse the result. Returns null on any failure
     * so the caller can short-circuit.
     */
    private async runConsolidationPrompt(
        consolidatePrompt: MJAIPromptEntityExtended,
        promptData: ConsolidationPromptData,
        runner: AIPromptRunner,
        contextUser: UserInfo
    ): Promise<ConsolidationPromptResult | null> {
        const params = new AIPromptParams();
        params.prompt = consolidatePrompt;
        params.data = promptData;
        params.contextUser = contextUser;
        params.attemptJSONRepair = true;
        params.additionalParameters = DETERMINISTIC_PROMPT_PARAMS;

        const result = await runner.ExecutePrompt<ConsolidationPromptResult>(params);

        if (!result.success || !result.result) {
            LogError(`Memory Manager: Consolidation prompt failed for cluster: ${result.errorMessage}`);
            return null;
        }

        if (typeof result.result === 'string') {
            const parsed = CleanAndParseJSON<ConsolidationPromptResult>(result.result, true);
            if (!parsed) {
                LogError('Memory Manager: Failed to parse consolidation result');
                return null;
            }
            return parsed;
        }
        return result.result;
    }

    /**
     * Build, validate, and save the consolidated note. Returns the saved entity on success,
     * null on save failure. The LLM-returned Type is validated against the allowed union and
     * falls back to the template note's Type on hallucination — previously a blind `as` cast
     * silently wrote invalid values.
     */
    private async createConsolidatedNote(
        cluster: MJAIAgentNoteEntity[],
        consolidatedNoteData: NonNullable<ConsolidationPromptResult['consolidatedNote']>,
        reason: string,
        aiNoteTypeId: string,
        md: IMetadataProvider,
        contextUser: UserInfo
    ): Promise<MJAIAgentNoteEntity | null> {
        const newNote = await md.GetEntityObject<MJAIAgentNoteEntity>('MJ: AI Agent Notes', contextUser);
        const templateNote = cluster[0];

        let validatedType: ValidNoteType;
        if (isValidNoteType(consolidatedNoteData.type)) {
            validatedType = consolidatedNoteData.type;
        } else {
            LogError(`Memory Manager: Consolidation LLM returned invalid note Type "${consolidatedNoteData.type}" — falling back to template note's Type "${templateNote.Type}"`);
            validatedType = templateNote.Type;
        }

        newNote.AgentID = templateNote.AgentID;
        newNote.UserID = templateNote.UserID;
        newNote.CompanyID = templateNote.CompanyID;
        newNote.AgentNoteTypeID = aiNoteTypeId;
        newNote.Type = validatedType;
        newNote.Note = consolidatedNoteData.content;
        newNote.IsAutoGenerated = true;
        newNote.Status = 'Active';
        newNote.AccessCount = cluster.reduce((sum, n) => sum + (n.AccessCount || 0), 0);
        newNote.Comments = `Consolidated from ${cluster.length} notes: ${reason}`;

        const maxSourceConsolidationCount = Math.max(...cluster.map(n => n.ConsolidationCount || 0));
        newNote.ConsolidationCount = maxSourceConsolidationCount + 1;
        newNote.DerivedFromNoteIDs = JSON.stringify(cluster.map(n => n.ID));
        newNote.ProtectionTier = 'Standard';

        this.applyScopeToConsolidatedNote(newNote, templateNote, consolidatedNoteData.scopeLevel);

        if (!(await newNote.Save())) {
            LogError(`Memory Manager: Failed to save consolidated note: ${JSON.stringify(newNote.LatestResult)}`);
            return null;
        }
        return newNote;
    }

    /**
     * Run post-consolidation entity verification and, if entities are missing, append a
     * warning to the saved note's Comments (best-effort, non-blocking). Returns the
     * verification result so the caller can aggregate it into the phase-level
     * observability step.
     */
    private async annotateConsolidationVerification(
        newNote: MJAIAgentNoteEntity,
        notesForPrompt: Array<MJAIAgentNoteEntity | ResolvedNoteRecord>,
        consolidatedContent: string
    ): Promise<ConsolidationVerificationResult> {
        const verification = this.verifyConsolidationOutput(notesForPrompt, consolidatedContent);
        if (verification.passed || verification.entitiesMissing.length === 0) {
            return verification;
        }

        const missingList = verification.entitiesMissing.slice(0, 10).join(', ');
        const warning = `[Verification: potentially missing entities: ${missingList}]`;
        if (this._verbose) {
            LogStatus(`Memory Manager: Post-consolidation verification warning — ${verification.entitiesMissing.length} entities not found in consolidated output (${verification.entitiesChecked} checked)`);
        }

        newNote.Comments = `${newNote.Comments || ''} ${warning}`.trim();
        await newNote.Save();
        return verification;
    }

    /**
     * Revoke source notes in parallel, linking each to the consolidated replacement.
     * Returns the number of notes successfully revoked.
     */
    private async revokeSourceNotes(
        cluster: MJAIAgentNoteEntity[],
        newNoteId: string,
        reason: string,
        md: IMetadataProvider,
        contextUser: UserInfo
    ): Promise<number> {
        const results = await Promise.all(
            cluster.map(async (sourceNote) => {
                const noteToRevoke = await md.GetEntityObject<MJAIAgentNoteEntity>('MJ: AI Agent Notes', contextUser);
                if (!(await noteToRevoke.Load(sourceNote.ID))) {
                    return false;
                }
                noteToRevoke.Status = 'Revoked';
                noteToRevoke.ConsolidatedIntoNoteID = newNoteId;
                noteToRevoke.Comments = `Consolidated into note ${newNoteId}: ${reason}`;
                if (await noteToRevoke.Save()) {
                    return true;
                }
                LogError(`Memory Manager: Failed to revoke source note ${sourceNote.ID}`);
                return false;
            })
        );
        return results.filter(Boolean).length;
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
     * Prune notes that reference entities which no longer exist or are inactive.
     * Checks AgentID, UserID, CompanyID, and SourceConversationID against current database state.
     * Immutable-tier notes are never pruned. Caps at 200 notes per cycle.
     */
    private async pruneStaleReferences(contextUser: UserInfo): Promise<{ notesArchived: number; orphanedAgents: number; orphanedUsers: number; orphanedCompanies: number; orphanedConversations: number }> {
        const maxPerCycle = STALE_PRUNING_CONFIG.maxNotesPerRun;
        const result = { notesArchived: 0, orphanedAgents: 0, orphanedUsers: 0, orphanedCompanies: 0, orphanedConversations: 0 };

        const notes = this.loadPruneCandidateNotes(maxPerCycle * 2);
        if (notes.length === 0) {
            return result;
        }

        const caches = await this.buildReferenceExistenceCache(notes, contextUser);
        const md = this.ProviderToUse;

        for (const note of notes) {
            if (result.notesArchived >= maxPerCycle) break;

            const orphanReasons = this.detectOrphanReasons(note, caches, result);
            if (orphanReasons.length > 0 && await this.archiveOrphanedNote(note.ID, orphanReasons, md, contextUser)) {
                result.notesArchived++;
            }
        }

        return result;
    }

    /**
     * Collect auto-generated, non-immutable `Active` notes that are candidates for orphan
     * pruning, oldest first.
     *
     * Served from the `AIEngine` cache rather than a `RunView`: `AIEngine.Instance.AgentNotes`
     * holds the full note pool, loaded unfiltered as entity objects and kept current via
     * `BaseEntity` save/delete events, so an equivalent in-memory filter/sort/cap avoids both a
     * DB round-trip and the "Entity Already in Engine" redundancy-telemetry warning each cycle.
     * Note `.filter()` returns a fresh array, so the subsequent `.sort()` never reorders the
     * engine's cached array. The result is projected to plain {@link PruneCandidateNote} rows —
     * we never hand a cached `BaseEntity` instance to a mutating caller; `pruneStaleReferences`
     * re-`Load()`s a fresh, owned entity before archiving.
     *
     * @param maxRows Hard cap on candidates returned this cycle (oldest-`__mj_CreatedAt` first).
     * @returns Lightweight projection rows for orphan-reference evaluation.
     */
    private loadPruneCandidateNotes(maxRows: number): PruneCandidateNote[] {
        return AIEngine.Instance.AgentNotes
            .filter(n => n.IsAutoGenerated && n.Status === 'Active' && (n.ProtectionTier || 'Standard') !== 'Immutable')
            .sort((a, b) => new Date(a.__mj_CreatedAt).getTime() - new Date(b.__mj_CreatedAt).getTime())
            .slice(0, maxRows)
            .map(n => ({
                ID: n.ID,
                AgentID: n.AgentID,
                UserID: n.UserID,
                CompanyID: n.CompanyID,
                SourceConversationID: n.SourceConversationID
            }));
    }

    /**
     * Build in-memory lookup caches of which referenced users/companies/conversations still
     * exist and which agents are still Active. Runs all three existence lookups in a single
     * RunViews batch to minimize round trips.
     */
    private async buildReferenceExistenceCache(notes: PruneCandidateNote[], contextUser: UserInfo): Promise<ReferenceExistenceCaches> {
        const caches: ReferenceExistenceCaches = {
            activeAgentIds: new Set(
                AIEngine.Instance.Agents.filter(a => a.Status === 'Active').map(a => a.ID?.toLowerCase())
            ),
            existingUserIds: new Set<string>(),
            existingCompanyIds: new Set<string>(),
            existingConversationIds: new Set<string>()
        };

        const { lookupQueries, queryMapping } = this.buildExistenceLookupQueries(notes);
        if (lookupQueries.length === 0) return caches;

        const rv = new RunView();
        const lookupResults = await rv.RunViews<{ ID: string }>(lookupQueries, contextUser);
        for (let i = 0; i < lookupResults.length; i++) {
            if (!lookupResults[i].Success) continue;
            const targetSet = queryMapping[i] === 'users' ? caches.existingUserIds
                : queryMapping[i] === 'companies' ? caches.existingCompanyIds
                : caches.existingConversationIds;
            lookupResults[i].Results.forEach(r => targetSet.add(r.ID?.toLowerCase()));
        }
        return caches;
    }

    /**
     * Collect unique referenced IDs from the note batch and assemble a RunViews query list
     * for existence checks. Returns the query list alongside a parallel mapping array that
     * tells the caller which target cache each query result belongs in.
     */
    private buildExistenceLookupQueries(notes: PruneCandidateNote[]): {
        lookupQueries: { EntityName: string; ExtraFilter: string; Fields: string[] }[];
        queryMapping: Array<'users' | 'companies' | 'conversations'>;
    } {
        const referencedUserIds = new Set<string>();
        const referencedCompanyIds = new Set<string>();
        const referencedConversationIds = new Set<string>();
        for (const note of notes) {
            if (note.UserID) referencedUserIds.add(note.UserID);
            if (note.CompanyID) referencedCompanyIds.add(note.CompanyID);
            if (note.SourceConversationID) referencedConversationIds.add(note.SourceConversationID);
        }

        const lookupQueries: { EntityName: string; ExtraFilter: string; Fields: string[] }[] = [];
        const queryMapping: Array<'users' | 'companies' | 'conversations'> = [];
        const push = (entityName: string, ids: Set<string>, kind: 'users' | 'companies' | 'conversations') => {
            if (ids.size === 0) return;
            lookupQueries.push({ EntityName: entityName, ExtraFilter: `ID IN (${Array.from(ids).map(id => `'${id}'`).join(',')})`, Fields: ['ID'] });
            queryMapping.push(kind);
        };
        push('MJ: Users', referencedUserIds, 'users');
        push('MJ: Companies', referencedCompanyIds, 'companies');
        push('MJ: Conversations', referencedConversationIds, 'conversations');
        return { lookupQueries, queryMapping };
    }

    /**
     * Evaluate a single note's foreign-key references against the existence caches, returning
     * human-readable reasons for any orphaned fields. Increments the supplied counter as a
     * side effect so aggregate totals are tracked without a second pass.
     */
    private detectOrphanReasons(
        note: PruneCandidateNote,
        caches: ReferenceExistenceCaches,
        counter: { orphanedAgents: number; orphanedUsers: number; orphanedCompanies: number; orphanedConversations: number }
    ): string[] {
        const reasons: string[] = [];
        if (note.AgentID && !caches.activeAgentIds.has(note.AgentID.toLowerCase())) {
            reasons.push('referenced agent is inactive or deleted');
            counter.orphanedAgents++;
        }
        if (note.UserID && !caches.existingUserIds.has(note.UserID.toLowerCase())) {
            reasons.push('referenced user no longer exists');
            counter.orphanedUsers++;
        }
        if (note.CompanyID && !caches.existingCompanyIds.has(note.CompanyID.toLowerCase())) {
            reasons.push('referenced company no longer exists');
            counter.orphanedCompanies++;
        }
        if (note.SourceConversationID && !caches.existingConversationIds.has(note.SourceConversationID.toLowerCase())) {
            reasons.push('source conversation no longer exists');
            counter.orphanedConversations++;
        }
        return reasons;
    }

    /**
     * Archive a single orphaned note with an audit-trail Comments entry. Returns true on success.
     */
    private async archiveOrphanedNote(
        noteId: string,
        reasons: string[],
        md: IMetadataProvider,
        contextUser: UserInfo
    ): Promise<boolean> {
        const noteToArchive = await md.GetEntityObject<MJAIAgentNoteEntity>('MJ: AI Agent Notes', contextUser);
        if (!(await noteToArchive.Load(noteId))) {
            return false;
        }
        noteToArchive.Status = 'Archived';
        noteToArchive.Comments = `[Archived by Memory Manager: stale reference pruning - ${reasons.join('; ')} on ${new Date().toISOString()}]`;
        if (!(await noteToArchive.Save())) {
            LogError(`Memory Manager: Failed to archive orphaned note ${noteId}`);
            return false;
        }
        return true;
    }

    /**
     * Compute Ebbinghaus-inspired proportional decay factor for a note.
     * Returns a multiplier (0-1) to apply to the note's ImportanceScore.
     * Per research: "decay should be proportional (multiply all strengths by a factor <1),
     * not threshold-based deletion — this preserves relative importance ordering."
     */
    private computeDecayFactor(note: { ImportanceScore: number | null; ProtectionTier: string; LastAccessedAt: Date | null; __mj_CreatedAt: Date; AccessCount: number }): number {
        const importanceScore = note.ImportanceScore || 5.0;
        const normalizedImportance = importanceScore / 10.0;
        let lambdaEff = DECAY_CONFIG.baseLambda * (1 - normalizedImportance * DECAY_CONFIG.importanceDampening);

        if (note.ProtectionTier === 'Ephemeral') {
            lambdaEff *= DECAY_CONFIG.ephemeralDecayMultiplier;
        }

        const lastAccess = note.LastAccessedAt || note.__mj_CreatedAt;
        const daysSinceAccess = (Date.now() - new Date(lastAccess).getTime()) / (1000 * 60 * 60 * 24);

        // Decay factor: how much of the current score to retain.
        // Higher access count slows decay (well-used notes persist longer), but the
        // multiplier is CAPPED — without a cap, a note with AccessCount=1000 would get
        // accessRetention=201 and the `Math.min(1.0, ...)` clamp below would force the
        // decay factor to 1.0 forever, making frequently-accessed notes effectively
        // immortal. Capping at ~1.5 means access count can meaningfully slow decay but
        // cannot indefinitely prevent it.
        const rawAccessRetention = 1 + (note.AccessCount || 0) * DECAY_CONFIG.accessBoostFactor;
        const accessRetention = Math.min(DECAY_CONFIG.accessRetentionCap, rawAccessRetention);
        return Math.min(1.0, Math.exp(-lambdaEff * daysSinceAccess) * accessRetention);
    }

    /**
     * Decay-based archival replacing fixed 90/180-day retention windows.
     * Uses Ebbinghaus-inspired decay function weighted by ImportanceScore.
     * Respects protection tiers: Immutable=never, Protected=365d extended, Ephemeral=2x decay.
     * Handles both notes and examples. Respects per-agent AutoArchiveEnabled.
     */
    private async decayBasedArchival(contextUser: UserInfo): Promise<{
        notesArchived: number;
        examplesArchived: number;
        notesExpired: number;
        examplesExpired: number;
        decayScoreDistribution: { min: number; max: number; mean: number } | null;
        protectedPreserved: number;
        ephemeralAccelerated: number;
    }> {
        const archiveEnabledAgentIds = new Set(
            AIEngine.Instance.Agents
                .filter(a => a.AutoArchiveEnabled !== false)
                .map(a => a.ID?.toLowerCase())
        );

        const [expiredResult, decayResult] = await Promise.all([
            this.archiveExpiredItems(contextUser),
            this.applyProportionalDecay(contextUser, archiveEnabledAgentIds)
        ]);

        return {
            notesExpired: expiredResult.notesExpired,
            examplesExpired: expiredResult.examplesExpired,
            notesArchived: decayResult.notesArchived,
            examplesArchived: decayResult.examplesArchived,
            decayScoreDistribution: this.summarizeDecayFactors(decayResult.stats.decayFactors),
            protectedPreserved: decayResult.stats.protectedPreserved,
            ephemeralAccelerated: decayResult.stats.ephemeralAccelerated
        };
    }

    /**
     * Summarize raw decay factors (values in [0,1]) into a min/max/mean triple for
     * the observability step. Returns null when no factors were computed (empty
     * cohort or all notes skipped via tier/config).
     */
    private summarizeDecayFactors(factors: number[]): { min: number; max: number; mean: number } | null {
        if (factors.length === 0) return null;
        let min = factors[0];
        let max = factors[0];
        let sum = 0;
        for (const f of factors) {
            if (f < min) min = f;
            if (f > max) max = f;
            sum += f;
        }
        return {
            min: Math.round(min * 1000) / 1000,
            max: Math.round(max * 1000) / 1000,
            mean: Math.round((sum / factors.length) * 1000) / 1000
        };
    }

    /** Archive notes and examples past their explicit ExpiresAt timestamp, regardless of decay score. */
    private async archiveExpiredItems(contextUser: UserInfo): Promise<{ notesExpired: number; examplesExpired: number }> {
        const result = { notesExpired: 0, examplesExpired: 0 };
        const md = this.ProviderToUse;
        const nowISO = new Date().toISOString();

        const [expiredNotes, expiredExamples] = this.loadExpiredItems(nowISO);

        for (const note of expiredNotes) {
            if ((note.ProtectionTier || 'Standard') === 'Immutable') continue;
            if (await this.archiveExpiredNote(note, md, contextUser)) result.notesExpired++;
        }

        for (const example of expiredExamples) {
            if (await this.archiveExpiredExample(example, md, contextUser)) result.examplesExpired++;
        }

        return result;
    }

    /**
     * Find notes and examples whose explicit `ExpiresAt` timestamp has passed, so the
     * archival pass can expire them regardless of decay score.
     *
     * Served from the `AIEngine` caches (`AgentNotes` / `AgentExamples`) instead of a batched
     * `RunViews`: both pools are loaded unfiltered as entity objects and kept current via
     * `BaseEntity` events, so an in-memory filter/cap reproduces the former queries while
     * removing two DB round-trips and the pair of "Entity Already in Engine" redundancy
     * warnings they emitted. Rows are projected to plain shapes; `archiveExpiredNote` /
     * `archiveExpiredExample` re-`Load()` a fresh, owned entity before mutating.
     *
     * Notes include `Provisional` (via {@link IsInjectableNoteStatus} — the same Active+Provisional
     * predicate used by the read-path injection queries) so the TTL safety net on in-flight
     * agent writes is enforced: a provisional note the hardening pass never reaches must still
     * expire.
     *
     * @param nowISO Current time as an ISO string; items with `ExpiresAt` strictly before this are expired.
     * @returns A `[expiredNotes, expiredExamples]` tuple of projection rows (each capped at 200).
     */
    private loadExpiredItems(
        nowISO: string
    ): [Array<{ ID: string; ExpiresAt: Date; ProtectionTier: string }>, Array<{ ID: string; ExpiresAt: Date }>] {
        type ExpiredNoteRow = { ID: string; ExpiresAt: Date; ProtectionTier: string };
        type ExpiredExampleRow = { ID: string; ExpiresAt: Date };
        const nowMs = new Date(nowISO).getTime();

        const expiredNotes: ExpiredNoteRow[] = AIEngine.Instance.AgentNotes
            .filter(n => IsInjectableNoteStatus(n.Status) && n.ExpiresAt != null && new Date(n.ExpiresAt).getTime() < nowMs)
            .slice(0, 200)
            .map(n => ({ ID: n.ID, ExpiresAt: n.ExpiresAt as Date, ProtectionTier: n.ProtectionTier || 'Standard' }));

        const expiredExamples: ExpiredExampleRow[] = AIEngine.Instance.AgentExamples
            .filter(e => e.Status === 'Active' && e.ExpiresAt != null && new Date(e.ExpiresAt).getTime() < nowMs)
            .slice(0, 200)
            .map(e => ({ ID: e.ID, ExpiresAt: e.ExpiresAt as Date }));

        return [expiredNotes, expiredExamples];
    }

    private async archiveExpiredNote(
        note: { ID: string; ExpiresAt: Date },
        md: IMetadataProvider,
        contextUser: UserInfo
    ): Promise<boolean> {
        const noteToArchive = await md.GetEntityObject<MJAIAgentNoteEntity>('MJ: AI Agent Notes', contextUser);
        if (!(await noteToArchive.Load(note.ID))) return false;
        noteToArchive.Status = 'Archived';
        noteToArchive.Comments = `${noteToArchive.Comments || ''} [Archived by Memory Manager: expired on ${note.ExpiresAt}]`.trim();
        return await noteToArchive.Save();
    }

    private async archiveExpiredExample(
        example: { ID: string; ExpiresAt: Date },
        md: IMetadataProvider,
        contextUser: UserInfo
    ): Promise<boolean> {
        const exampleToArchive = await md.GetEntityObject<MJAIAgentExampleEntity>('MJ: AI Agent Examples', contextUser);
        if (!(await exampleToArchive.Load(example.ID))) return false;
        exampleToArchive.Status = 'Archived';
        exampleToArchive.Comments = `${exampleToArchive.Comments || ''} [Archived by Memory Manager: expired on ${example.ExpiresAt}]`.trim();
        return await exampleToArchive.Save();
    }

    /**
     * Apply proportional decay to ImportanceScores, archiving only when score reaches the floor.
     * Per research: "decay should be proportional (multiply all strengths by a factor <1),
     * not threshold-based deletion — this preserves relative importance ordering while reducing overall load."
     * Notes without ImportanceScore (not yet scored) are skipped entirely.
     *
     * Threads a stats accumulator through decayOneNote/decayOneExample to collect
     * decay-factor distribution and tier-specific counts for observability.
     */
    private async applyProportionalDecay(contextUser: UserInfo, archiveEnabledAgentIds: Set<string | undefined>): Promise<{
        notesDecayed: number;
        notesArchived: number;
        examplesDecayed: number;
        examplesArchived: number;
        stats: DecayStatsAccumulator;
    }> {
        const result = { notesDecayed: 0, notesArchived: 0, examplesDecayed: 0, examplesArchived: 0 };
        const stats: DecayStatsAccumulator = { decayFactors: [], protectedPreserved: 0, ephemeralAccelerated: 0 };
        const md = this.ProviderToUse;

        const [activeNotes, activeExamples] = this.loadDecayCandidates();

        for (const note of activeNotes) {
            await this.decayOneNote(note, archiveEnabledAgentIds, md, contextUser, result, stats);
        }

        for (const example of activeExamples) {
            await this.decayOneExample(example, archiveEnabledAgentIds, md, contextUser, result, stats);
        }

        return { ...result, stats };
    }

    /**
     * Fetch decay-candidate notes and examples from the AIEngine caches.
     *
     * Served from `AIEngine.Instance.AgentNotes` / `AgentExamples` (loaded unfiltered as
     * entity objects and kept current via BaseEntity events), filtered/capped in-memory to
     * mirror the former RunViews — avoids two "Entity Already in Engine" redundancy warnings
     * and a DB round-trip per maintenance cycle. We project to plain candidate rows; the
     * actual decay/archival re-Loads fresh entities.
     *
     * @returns A `[activeNotes, activeExamples]` tuple of decay-candidate projection rows
     *          (auto-generated `Active` notes capped at 1000; auto-generated `Active` examples
     *          scoring below 50, capped at 500).
     */
    private loadDecayCandidates(): [DecayNoteCandidate[], DecayExampleCandidate[]] {
        const activeNotes: DecayNoteCandidate[] = AIEngine.Instance.AgentNotes
            .filter(n => n.IsAutoGenerated && n.Status === 'Active')
            .slice(0, 1000)
            .map(n => ({
                ID: n.ID,
                ImportanceScore: n.ImportanceScore,
                ProtectionTier: n.ProtectionTier || 'Standard',
                LastAccessedAt: n.LastAccessedAt,
                __mj_CreatedAt: n.__mj_CreatedAt,
                AccessCount: n.AccessCount,
                AgentID: n.AgentID
            }));

        const activeExamples: DecayExampleCandidate[] = AIEngine.Instance.AgentExamples
            .filter(e => e.IsAutoGenerated && e.Status === 'Active' && (e.SuccessScore ?? 0) < 50)
            .slice(0, 500)
            .map(e => ({
                ID: e.ID,
                SuccessScore: e.SuccessScore,
                LastAccessedAt: e.LastAccessedAt,
                __mj_CreatedAt: e.__mj_CreatedAt,
                AccessCount: e.AccessCount,
                AgentID: e.AgentID
            }));

        return [activeNotes, activeExamples];
    }

    /**
     * Apply proportional decay to a single note. Archives if the decayed score drops below
     * the archival floor, otherwise writes the reduced score (skipping when the factor is
     * effectively 1.0 to avoid unnecessary saves).
     */
    private async decayOneNote(
        note: DecayNoteCandidate,
        archiveEnabledAgentIds: Set<string | undefined>,
        md: IMetadataProvider,
        contextUser: UserInfo,
        result: { notesDecayed: number; notesArchived: number },
        stats: DecayStatsAccumulator
    ): Promise<void> {
        if (note.AgentID && !archiveEnabledAgentIds.has(note.AgentID.toLowerCase())) return;
        if (note.ImportanceScore === null) return;

        const tier = note.ProtectionTier || 'Standard';
        if (tier === 'Immutable') return;
        if (tier === 'Protected') {
            const lastAccess = note.LastAccessedAt || note.__mj_CreatedAt;
            const daysSinceAccess = (Date.now() - new Date(lastAccess).getTime()) / (1000 * 60 * 60 * 24);
            if (daysSinceAccess < DECAY_CONFIG.protectedInactivityDays) {
                // Protected note within the extended-retention window — evaluated but preserved.
                stats.protectedPreserved++;
                return;
            }
        }
        if (tier === 'Ephemeral') {
            stats.ephemeralAccelerated++;
        }

        const decayFactor = this.computeDecayFactor(note);
        stats.decayFactors.push(decayFactor);
        const newScore = Math.round(note.ImportanceScore * decayFactor * 100) / 100;

        const noteToUpdate = await md.GetEntityObject<MJAIAgentNoteEntity>('MJ: AI Agent Notes', contextUser);
        if (!(await noteToUpdate.Load(note.ID))) return;

        if (newScore < DECAY_CONFIG.archivalFloor) {
            noteToUpdate.Status = 'Archived';
            noteToUpdate.ImportanceScore = newScore;
            noteToUpdate.Comments = `${noteToUpdate.Comments || ''} [Archived by Memory Manager: ImportanceScore decayed to ${newScore.toFixed(2)}, below floor ${DECAY_CONFIG.archivalFloor}]`.trim();
            if (await noteToUpdate.Save()) result.notesArchived++;
        } else if (decayFactor < 0.99) {
            noteToUpdate.ImportanceScore = newScore;
            if (await noteToUpdate.Save()) result.notesDecayed++;
        }
    }

    /**
     * Apply proportional decay to a single example, using SuccessScore as a proxy importance.
     * Archives if the effective score drops below the archival floor.
     */
    private async decayOneExample(
        example: DecayExampleCandidate,
        archiveEnabledAgentIds: Set<string | undefined>,
        md: IMetadataProvider,
        contextUser: UserInfo,
        result: { examplesArchived: number },
        stats: DecayStatsAccumulator
    ): Promise<void> {
        if (example.AgentID && !archiveEnabledAgentIds.has(example.AgentID.toLowerCase())) return;

        const normalizedImportance = (example.SuccessScore || 25) / 100.0;
        const lambdaEff = DECAY_CONFIG.baseLambda * (1 - normalizedImportance * DECAY_CONFIG.importanceDampening);
        const lastAccess = example.LastAccessedAt || example.__mj_CreatedAt;
        const daysSinceAccess = (Date.now() - new Date(lastAccess).getTime()) / (1000 * 60 * 60 * 24);
        const decayFactor = Math.min(1.0, Math.exp(-lambdaEff * daysSinceAccess) * (1 + (example.AccessCount || 0) * DECAY_CONFIG.accessBoostFactor));
        stats.decayFactors.push(decayFactor);
        const effectiveScore = normalizedImportance * 10.0 * decayFactor;

        if (effectiveScore >= DECAY_CONFIG.archivalFloor) return;

        const exampleToArchive = await md.GetEntityObject<MJAIAgentExampleEntity>('MJ: AI Agent Examples', contextUser);
        if (!(await exampleToArchive.Load(example.ID))) return;
        exampleToArchive.Status = 'Archived';
        exampleToArchive.Comments = `${exampleToArchive.Comments || ''} [Archived by Memory Manager: effective score ${effectiveScore.toFixed(2)} below floor]`.trim();
        if (await exampleToArchive.Save()) result.examplesArchived++;
    }

    /**
     * Hardening pass over in-flight agent-written notes (Status='Provisional',
     * AuthorType='Agent'). Runs UNCONDITIONALLY at the start of every MM cycle —
     * before the consolidation-gated maintenance phases — so that:
     *   1. provisional notes never languish waiting for a consolidation trigger, and
     *   2. notes hardened here participate in importance scoring, consolidation,
     *      contradiction detection, and decay in the SAME cycle via the existing
     *      machinery (no duplicated reconciliation logic in this pass).
     *
     * Per note: dedupe against hardened (Active) notes using the same LLM dedupe
     * prompt as extraction — duplicates are Archived with ConsolidatedIntoNoteID
     * lineage; survivors are hardened (Status='Active', ExpiresAt=NULL so the
     * standard decay machinery owns their lifetime).
     */
    protected async runHardeningPhase(
        contextUser: UserInfo
    ): Promise<{ hardened: number; deduped: number; failed: number }> {
        const counters = { hardened: 0, deduped: 0, failed: 0 };
        const step = await this.CreateRunStep('Decision', 'Harden Provisional Notes', {
            maxNotesPerRun: HARDENING_CONFIG.maxNotesPerRun
        });
        try {
            // Served from AIEngine.Instance.AgentNotes (loaded unfiltered as entity
            // objects and kept current via BaseEntity + remote-invalidate events),
            // filtered/ordered/capped in-memory to mirror the former RunView. This
            // avoids the "Entity Already in Engine" redundancy warning and a DB
            // round-trip every MM cycle, matching loadDecayCandidates/loadExpiredItems.
            // Provisional agent notes are in-flight writes already reflected in the
            // cache, and hardenSingleNote mutates+saves these entities directly —
            // consistent with the dedupe path, which already saves cached note
            // instances returned by FindSimilarAgentNotes.
            const provisionalNotes = AIEngine.Instance.AgentNotes
                .filter(n => n.Status === 'Provisional' && n.AuthorType === 'Agent')
                .sort((a, b) => new Date(a.__mj_CreatedAt).getTime() - new Date(b.__mj_CreatedAt).getTime())
                .slice(0, HARDENING_CONFIG.maxNotesPerRun);

            if (provisionalNotes.length === 0) {
                await this.FinalizeRunStep(step, true, { ...counters, provisionalCount: 0 });
                return counters;
            }

            const runner = new AIPromptRunner();
            const dedupePrompt = AIEngine.Instance.Prompts.find(p =>
                p.Name === 'Memory Manager - Deduplicate Note' && p.Category === 'MJ: System'
            );

            for (const note of provisionalNotes) {
                const outcome = await this.hardenSingleNote(note, dedupePrompt, runner, contextUser);
                counters[outcome]++;
            }

            if (this._verbose) {
                LogStatus(`Memory Manager: Hardening pass — ${counters.hardened} hardened, ${counters.deduped} deduped, ${counters.failed} failed of ${provisionalNotes.length} provisional notes`);
            }
            await this.FinalizeRunStep(step, counters.failed === 0, { ...counters, provisionalCount: provisionalNotes.length });
        } catch (error) {
            LogError('Memory Manager: Hardening pass failed, continuing with run:', error);
            await this.FinalizeRunStep(step, false, counters, undefined, error instanceof Error ? error.message : String(error));
        }
        return counters;
    }

    /**
     * Harden one provisional note: archive it as a duplicate when the LLM dedupe
     * decision says an equivalent hardened note exists, otherwise promote it to
     * Active with decay-managed lifetime.
     */
    protected async hardenSingleNote(
        note: MJAIAgentNoteEntity,
        dedupePrompt: MJAIPromptEntityExtended | undefined,
        runner: AIPromptRunner,
        contextUser: UserInfo
    ): Promise<'hardened' | 'deduped' | 'failed'> {
        try {
            // Compare against HARDENED notes only — other provisional notes are themselves
            // unvetted, and same-run duplicates were already handled at write time.
            const similar = (await AIEngine.Instance.FindSimilarAgentNotes(
                note.Note || '',
                note.AgentID || undefined,
                note.UserID || undefined,
                note.CompanyID || undefined,
                10,
                HARDENING_CONFIG.dedupeSimilarity
            )).filter(m => m.note.ID !== note.ID && m.note.Status === 'Active');

            if (similar.length > 0 && dedupePrompt) {
                const candidate: ExtractedNote = {
                    type: note.Type,
                    content: note.Note || '',
                    confidence: 100,
                    agentId: note.AgentID || undefined,
                    userId: note.UserID || undefined,
                    companyId: note.CompanyID || undefined,
                };
                const decision = await this.runDedupePromptForCandidate(runner, dedupePrompt, candidate, similar, contextUser);
                if (!decision.shouldAdd) {
                    const target = similar[0].note;
                    note.Status = 'Archived';
                    note.ConsolidatedIntoNoteID = target.ID;
                    note.Comments = `${note.Comments || ''} [Hardening: duplicate of ${target.ID} — ${decision.reason}]`.trim();
                    if (!await note.Save()) {
                        LogError(`Memory Manager: Failed to archive duplicate provisional note ${note.ID}: ${note.LatestResult?.CompleteMessage || 'unknown error'}`);
                        return 'failed';
                    }
                    target.AccessCount = (target.AccessCount || 0) + 1;
                    target.LastAccessedAt = new Date();
                    if (!await target.Save()) {
                        LogError(`Memory Manager: Failed to bump dedupe target ${target.ID}: ${target.LatestResult?.CompleteMessage || 'unknown error'}`);
                    }
                    return 'deduped';
                }
            }

            note.Status = 'Active';
            note.ExpiresAt = null;
            if (!await note.Save()) {
                LogError(`Memory Manager: Failed to harden provisional note ${note.ID}: ${note.LatestResult?.CompleteMessage || 'unknown error'}`);
                return 'failed';
            }
            return 'hardened';
        } catch (error) {
            LogError(`Memory Manager: Exception hardening note ${note.ID}:`, error);
            return 'failed';
        }
    }

    /**
     * Run all 5 maintenance phases in order: importance scoring, consolidation,
     * contradiction detection, stale-reference pruning, and decay-based archival.
     * Each phase is wrapped in try/catch so a failure in one does not abort the rest.
     *
     * `triggerType` flows through to the parent consolidation run step so observability
     * records *why* the maintenance cycle fired this run.
     */
    private async runMaintenancePhases(
        contextUser: UserInfo,
        forceMaintenance: boolean,
        triggerType: ConsolidationTriggerType
    ): Promise<MaintenancePhaseResults> {
        const r: MaintenancePhaseResults = {
            consolidatedCount: 0, consolidationArchived: 0,
            contradictionsFound: 0, contradictionsResolved: 0, contradictionsFlagged: 0,
            staleNotesArchived: 0, decayNotesArchived: 0, decayExamplesArchived: 0,
            importanceScored: 0, tierPromotions: 0
        };

        LogStatus(`Memory Manager: Running maintenance phases${forceMaintenance ? ' (forced via params.data.forceMaintenance)' : ''}...`);

        await this.runImportancePhase(r, contextUser);
        const consolidatedNoteIds = await this.runConsolidationPhase(r, contextUser, triggerType);
        await this.runContradictionPhase(r, contextUser, consolidatedNoteIds);
        await this.runPruneAndDecayPhases(r, contextUser);

        return r;
    }

    private async runImportancePhase(r: MaintenancePhaseResults, contextUser: UserInfo): Promise<void> {
        const importanceStep = await this.CreateRunStep('Decision', 'Compute Importance Scores', {
            activeNoteCount: AIEngine.Instance.AgentNotes.filter(n => n.Status === 'Active').length
        });
        try {
            const scoringResult = await this.computeImportanceScores(contextUser);
            r.importanceScored = scoringResult.notesScored;
            r.tierPromotions = scoringResult.tierPromotions;
            if (this._verbose) LogStatus(`Memory Manager: Scored ${r.importanceScored} notes, ${r.tierPromotions} tier promotions`);
            await this.FinalizeRunStep(importanceStep, true, {
                notesScored: r.importanceScored,
                tierPromotions: r.tierPromotions,
                scoreDistribution: scoringResult.scoreDistribution
            });
        } catch (error) {
            LogError('Memory Manager: Importance scoring failed, continuing with other phases:', error);
            await this.FinalizeRunStep(importanceStep, false, undefined, undefined, error instanceof Error ? error.message : String(error));
        }
    }

    private async runConsolidationPhase(
        r: MaintenancePhaseResults,
        contextUser: UserInfo,
        triggerType: ConsolidationTriggerType
    ): Promise<Set<string>> {
        const consolidatedNoteIds = new Set<string>();
        const consolidationStep = await this.CreateRunStep('Decision', 'Consolidate Related Notes', {
            frequency: CONSOLIDATION_CONFIG.frequency,
            triggerType,
            activeNoteCount: AIEngine.Instance.AgentNotes.filter(n => n.Status === 'Active' && n.IsAutoGenerated).length
        });
        let consolidationResult: { consolidated: number; archived: number; newNoteIds: string[]; verifications: ConsolidationVerificationResult[] } | null = null;
        try {
            consolidationResult = await this.consolidateRelatedNotes(null, contextUser);
            r.consolidatedCount = consolidationResult.consolidated;
            r.consolidationArchived = consolidationResult.archived;
            for (const id of consolidationResult.newNoteIds) consolidatedNoteIds.add(id);
            if (r.consolidatedCount > 0 && this._verbose) {
                LogStatus(`Memory Manager: Consolidated ${r.consolidatedCount} clusters, archived ${r.consolidationArchived} source notes`);
            }
            await this.FinalizeRunStep(consolidationStep, true, {
                consolidatedClusterCount: r.consolidatedCount,
                sourceNotesArchived: r.consolidationArchived,
                newConsolidatedNoteIds: Array.from(consolidatedNoteIds)
            });
        } catch (error) {
            LogError('Memory Manager: Consolidation failed, continuing with other phases:', error);
            await this.FinalizeRunStep(consolidationStep, false, undefined, undefined, error instanceof Error ? error.message : String(error));
        }

        // Emit the phase-level verification run step (spec Task 8c). Runs whether or not
        // any clusters were consolidated so "no items" runs still produce a visible step.
        await this.emitVerificationRunStep(consolidationResult?.verifications ?? []);

        return consolidatedNoteIds;
    }

    /** Aggregate per-cluster verification results into a single phase-level run step. */
    private async emitVerificationRunStep(verifications: ConsolidationVerificationResult[]): Promise<void> {
        const verificationStep = await this.CreateRunStep('Validation', 'Verify Consolidation Output', {
            clustersVerified: verifications.length
        });
        const verificationsFlagged = verifications.filter(v => !v.passed).length;
        const verificationsPassed = verifications.filter(v => v.passed).length;
        const entitiesChecked = verifications.reduce((sum, v) => sum + v.entitiesChecked, 0);
        const entitiesMissing = verifications.flatMap(v => v.entitiesMissing);
        await this.FinalizeRunStep(verificationStep, true, {
            clustersVerified: verifications.length,
            entitiesChecked,
            entitiesMissing,
            verificationsPassed,
            verificationsFlagged
        });
    }

    private async runContradictionPhase(r: MaintenancePhaseResults, contextUser: UserInfo, consolidatedNoteIds: Set<string>): Promise<void> {
        const contradictionStep = await this.CreateRunStep('Decision', 'Detect Note Contradictions', {
            consolidatedNoteIdsCount: consolidatedNoteIds.size
        });
        try {
            const contradictionResult = await this.detectAndResolveContradictions(contextUser, consolidatedNoteIds);
            r.contradictionsFound = contradictionResult.contradictionsFound;
            r.contradictionsResolved = contradictionResult.resolved;
            r.contradictionsFlagged = contradictionResult.flagged;
            if (r.contradictionsFound > 0 && this._verbose) {
                LogStatus(`Memory Manager: Found ${r.contradictionsFound} contradictions — resolved ${r.contradictionsResolved}, flagged ${r.contradictionsFlagged}`);
            }
            await this.FinalizeRunStep(contradictionStep, true, {
                pairsAnalyzed: contradictionResult.pairsAnalyzed,
                contradictionsFound: r.contradictionsFound,
                contradictionsResolved: r.contradictionsResolved,
                contradictionsFlagged: r.contradictionsFlagged,
                entityTriplesExtracted: contradictionResult.entityTriplesExtracted
            });
        } catch (error) {
            LogError('Memory Manager: Contradiction detection failed, continuing with other phases:', error);
            await this.FinalizeRunStep(contradictionStep, false, undefined, undefined, error instanceof Error ? error.message : String(error));
        }
    }

    /**
     * Prune and decay are independent — run in parallel via Promise.allSettled so one failure
     * doesn't block the other.
     */
    private async runPruneAndDecayPhases(r: MaintenancePhaseResults, contextUser: UserInfo): Promise<void> {
        const pruneStep = await this.CreateRunStep('Decision', 'Prune Stale References', {});
        const decayStep = await this.CreateRunStep('Decision', 'Decay-Based Archival', {});
        await Promise.allSettled([
            this.runPrunePhase(r, contextUser, pruneStep),
            this.runDecayPhase(r, contextUser, decayStep),
        ]);
    }

    private async runPrunePhase(r: MaintenancePhaseResults, contextUser: UserInfo, pruneStep: MJAIAgentRunStepEntity | null): Promise<void> {
        try {
            const pruneResult = await this.pruneStaleReferences(contextUser);
            r.staleNotesArchived = pruneResult.notesArchived;
            if (r.staleNotesArchived > 0 && this._verbose) {
                LogStatus(`Memory Manager: Pruned ${r.staleNotesArchived} orphaned notes`);
            }
            await this.FinalizeRunStep(pruneStep, true, {
                notesArchived: r.staleNotesArchived,
                orphanedAgents: pruneResult.orphanedAgents,
                orphanedUsers: pruneResult.orphanedUsers,
                orphanedCompanies: pruneResult.orphanedCompanies,
                orphanedConversations: pruneResult.orphanedConversations
            });
        } catch (error) {
            LogError('Memory Manager: Stale reference pruning failed:', error);
            await this.FinalizeRunStep(pruneStep, false, undefined, undefined, error instanceof Error ? error.message : String(error));
        }
    }

    private async runDecayPhase(r: MaintenancePhaseResults, contextUser: UserInfo, decayStep: MJAIAgentRunStepEntity | null): Promise<void> {
        try {
            const decayResult = await this.decayBasedArchival(contextUser);
            r.decayNotesArchived = decayResult.notesArchived;
            r.decayExamplesArchived = decayResult.examplesArchived;
            const totalDecayArchived = decayResult.notesArchived + decayResult.examplesArchived + decayResult.notesExpired + decayResult.examplesExpired;
            if (totalDecayArchived > 0 && this._verbose) {
                LogStatus(`Memory Manager: Decay archival — ${decayResult.notesArchived} notes, ${decayResult.examplesArchived} examples, ${decayResult.notesExpired} expired notes, ${decayResult.examplesExpired} expired examples`);
            }
            await this.FinalizeRunStep(decayStep, true, {
                notesArchived: decayResult.notesArchived,
                examplesArchived: decayResult.examplesArchived,
                notesExpired: decayResult.notesExpired,
                examplesExpired: decayResult.examplesExpired,
                decayScoreDistribution: decayResult.decayScoreDistribution,
                protectedPreserved: decayResult.protectedPreserved,
                ephemeralAccelerated: decayResult.ephemeralAccelerated
            });
        } catch (error) {
            LogError('Memory Manager: Decay-based archival failed:', error);
            await this.FinalizeRunStep(decayStep, false, undefined, undefined, error instanceof Error ? error.message : String(error));
        }
    }

    /** Build a human-readable summary string from maintenance phase results. */
    private buildMaintenanceSummary(m: MaintenancePhaseResults): string {
        const parts: string[] = [];
        if (m.consolidatedCount > 0) parts.push(`consolidated ${m.consolidatedCount} clusters`);
        if (m.contradictionsResolved > 0) parts.push(`resolved ${m.contradictionsResolved} contradictions`);
        if (m.contradictionsFlagged > 0) parts.push(`flagged ${m.contradictionsFlagged} high-importance contradictions`);
        if (m.staleNotesArchived > 0) parts.push(`pruned ${m.staleNotesArchived} stale notes`);
        if (m.decayNotesArchived + m.decayExamplesArchived > 0) parts.push(`decay-archived ${m.decayNotesArchived} notes + ${m.decayExamplesArchived} examples`);
        return parts.length > 0 ? ` Maintenance: ${parts.join(', ')}.` : '';
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
        const md = this.ProviderToUse;

        // Cache source agent runs (scope fields only) to avoid repeated lookups
        const runCache = new Map<string, SourceRunScope | null>();

        for (const extracted of extractedExamples) {
            try {
                // Load source agent run for scope inheritance (if available)
                let sourceRun: SourceRunScope | null = null;
                if (extracted.sourceAgentRunId) {
                    sourceRun = await this.loadSourceRunScope(extracted.sourceAgentRunId, runCache, contextUser);
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
                example.SourceConversationDetailID = MemoryManagerAgent.isValidUUID(extracted.sourceConversationDetailId) ? extracted.sourceConversationDetailId! : null;
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
            this._verbose = params.verbose || params.data?.verbose || false;

            // Initialize observability state for this run
            this._agentRunID = this.AgentRun?.ID || null;
            this._stepCounter = 0;
            this._contextUser = params.contextUser || null;

            // Verbose-only: the scheduling engine's always-on "▶️ Starting / ✅ Completed" lines already
            // mark that this run began/ended. On routine no-op runs this internal trace is just noise.
            LogStatusEx({ message: 'Memory Manager: Starting analysis cycle', verboseOnly: true });

            // Phase 1: the last-run-time and the memory-enabled agent set are independent — load in
            // parallel (avoids two back-to-back sequential RunViews flagged by the parallelization telemetry).
            const [lastRunTime, agentsUsingMemory] = await Promise.all([
                this.GetLastRunTime(params.agent.ID, params.contextUser!),
                this.LoadAgentsUsingMemory(params.contextUser!)
            ]);

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

            // Phase 2: conversations-with-new-activity and high-value agent runs both depend only on
            // (lastRunTime, agentsUsingMemory) — never on each other — so load them in parallel, each
            // recorded in its own run step.
            const step1 = await this.CreateRunStep('Decision', 'Load Conversations With New Activity', {
                since: lastRunTime?.toISOString() || null,
                agentCount: agentsUsingMemory.length,
                agentIds: agentsUsingMemory.map(a => a.ID)
            });
            const step2 = await this.CreateRunStep('Decision', 'Load High-Value Agent Runs', {
                since: lastRunTime?.toISOString() || null
            });
            const step3 = await this.CreateRunStep('Decision', 'Load Instructive Failed Agent Runs', {
                since: lastRunTime?.toISOString() || null
            });
            const [conversations, agentRuns, failedRuns] = await Promise.all([
                this.LoadConversationsWithNewActivity(lastRunTime, agentsUsingMemory, params.contextUser!),
                this.LoadHighValueAgentRuns(lastRunTime, params.contextUser!),
                this.LoadInstructiveFailedAgentRuns(lastRunTime, params.contextUser!)
            ]);
            const totalMessages = conversations.reduce((sum, c) => sum + c.messages.length, 0);
            await this.FinalizeRunStep(step1, true, {
                conversationCount: conversations.length,
                totalMessages,
                positiveCount: conversations.filter(c => c.hasPositiveRating).length,
                negativeCount: conversations.filter(c => c.hasNegativeRating).length,
                unratedCount: conversations.filter(c => c.isUnrated).length
            });
            await this.FinalizeRunStep(step2, true, {
                runCount: agentRuns.length
            });
            await this.FinalizeRunStep(step3, true, {
                runCount: failedRuns.length
            });
            if (this._verbose) {
                LogStatus(`Memory Manager: Found ${conversations.length} conversations with new activity`);
                LogStatus(`Memory Manager: Found ${agentRuns.length} high-value agent runs`);
                LogStatus(`Memory Manager: Found ${failedRuns.length} instructive failed agent runs`);
            }

            const hasNewData = conversations.length > 0 || agentRuns.length > 0 || failedRuns.length > 0;

            // Initialization guard: ensure vector services exist for semantic dedup.
            // If no notes existed at server startup, _noteVectorService is null and
            // AddOrUpdateSingleNoteEmbedding will throw when saving new notes.
            // The two post-creation/post-consolidation Config(true) calls were removed
            // because entity save hooks now update vectors incrementally.
            await AIEngine.Instance.Config(true, params.contextUser);

            // Extract notes and examples only when there's new data to process
            let notesCreated = 0;
            let examplesCreated = 0;

            if (hasNewData) {
                const extractedNotes = await this.ExtractNotesFromConversations(conversations, params.contextUser!);
                if (this._verbose) {
                    LogStatus(`Memory Manager: Extracted ${extractedNotes.length} potential notes`);
                }

                // Mine corrective notes from failed runs (Issue/Context only, Ephemeral tier).
                const correctiveNotes = await this.ExtractNotesFromFailedRuns(failedRuns, params.contextUser!);
                if (this._verbose) {
                    LogStatus(`Memory Manager: Extracted ${correctiveNotes.length} corrective notes from failed runs`);
                }

                // Convert conversations back to flat details for example extraction.
                // ExtractExamples accepts a ConversationDetailProjection, so we only
                // need the fields it reads — no entity cast.
                const conversationDetails: ConversationDetailProjection[] = conversations.flatMap(conv =>
                    conv.messages.map(msg => ({
                        ID: msg.id,
                        ConversationID: conv.conversationId,
                        Role: msg.role,
                        Message: msg.message,
                        __mj_CreatedAt: msg.createdAt
                    }))
                );
                const extractedExamples = await this.ExtractExamples(conversationDetails, params.contextUser!);
                if (this._verbose) {
                    LogStatus(`Memory Manager: Extracted ${extractedExamples.length} potential examples`);
                }

                // Enrich examples with userId and agentRunId from conversation context
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
                            if (!example.userId && ctx.userId) {
                                example.userId = ctx.userId;
                                if (this._verbose) {
                                    LogStatus(`Memory Manager: Enriched example with userId from conversation: ${ctx.userId}`);
                                }
                            }
                            if (!example.sourceAgentRunId && ctx.agentRunId) {
                                example.sourceAgentRunId = ctx.agentRunId;
                                if (this._verbose) {
                                    LogStatus(`Memory Manager: Enriched example with agentRunId from conversation: ${ctx.agentRunId}`);
                                }
                            }
                        }
                    }
                    if (example.agentId && !MemoryManagerAgent.isValidUUID(example.agentId)) {
                        if (this._verbose) {
                            LogStatus(`Memory Manager: Clearing invalid agentId "${example.agentId}" from example`);
                        }
                        example.agentId = '';
                    }
                }

                notesCreated = await this.CreateNoteRecords([...extractedNotes, ...correctiveNotes], params.contextUser!);
                examplesCreated = await this.CreateExampleRecords(extractedExamples, params.contextUser!);

                if (this._verbose) LogStatus(`Memory Manager: Created ${notesCreated} notes and ${examplesCreated} examples`);
            }

            // Harden agent-written provisional notes FIRST and unconditionally — survivors
            // become Active and participate in this same cycle's maintenance phases
            // (importance, consolidation, contradiction, decay) when those fire.
            const hardening = await this.runHardeningPhase(params.contextUser!);
            const hardeningSummary = hardening.hardened + hardening.deduped + hardening.failed > 0
                ? ` Hardened ${hardening.hardened} provisional notes (${hardening.deduped} deduped, ${hardening.failed} failed).`
                : '';

            const forceMaintenance = params.data?.forceMaintenance === true;
            const triggerDecision = await this.shouldRunConsolidation(params.agent.ID, params.contextUser!, forceMaintenance, lastRunTime);
            const maintenance = triggerDecision.shouldRun
                ? await this.runMaintenancePhases(params.contextUser!, forceMaintenance, triggerDecision.triggerType)
                : { consolidatedCount: 0, consolidationArchived: 0, contradictionsFound: 0, contradictionsResolved: 0, contradictionsFlagged: 0, staleNotesArchived: 0, decayNotesArchived: 0, decayExamplesArchived: 0, importanceScored: 0, tierPromotions: 0 } satisfies MaintenancePhaseResults;

            const maintenanceSummary = this.buildMaintenanceSummary(maintenance);

            const finalStep: BaseAgentNextStep<P> = {
                terminate: true,
                step: 'Success',
                message: `Processed ${conversations.length} conversations (${totalMessages} messages) and ${agentRuns.length} agent runs. Created ${notesCreated} notes and ${examplesCreated} examples.${hardeningSummary}${maintenanceSummary}`,
                newPayload: {
                    notesCreated,
                    examplesCreated,
                    conversationsProcessed: conversations.length,
                    messagesProcessed: totalMessages,
                    agentRunsProcessed: agentRuns.length,
                    ...maintenance
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
