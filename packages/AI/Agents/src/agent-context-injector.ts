import { LogError, LogStatus, RunView, UserInfo } from "@memberjunction/core";
import { AIAgentNoteEntity, AIAgentExampleEntity, AIAgentNoteTypeEntity } from "@memberjunction/core-entities";
import { AIEngine } from "@memberjunction/aiengine";
import { UserScope } from "@memberjunction/ai-core-plus";
import { RerankerConfiguration, RerankerService } from "@memberjunction/ai-reranker";

/**
 * Options for observability integration when retrieving notes.
 */
export interface NotesObservabilityOptions {
    /**
     * Current agent run ID for tracing
     */
    agentRunID: string;
    /**
     * Parent step ID for hierarchical step logging
     */
    parentStepID?: string;
    /**
     * Step sequence number for the rerank step
     */
    stepNumber?: number;
}

/**
 * Parameters for retrieving notes in a specific context
 */
export interface GetNotesParams {
    agentId: string;
    userId?: string;
    companyId?: string;
    currentInput?: string;
    strategy: 'Relevant' | 'Recent' | 'All';
    maxNotes: number;
    contextUser: UserInfo;
    /**
     * Optional user scope for multi-tenant SaaS deployments.
     * When provided, enables hierarchical scope filtering:
     * - Global notes (no scope)
     * - Primary-scope notes (e.g., org-level)
     * - Fully-scoped notes (e.g., contact-level)
     */
    userScope?: UserScope;
    /**
     * Optional reranker configuration for two-stage retrieval.
     * When enabled, fetches more candidates via vector search,
     * then reranks them using a semantic reranker for better relevance.
     */
    rerankerConfig?: RerankerConfiguration | null;
    /**
     * Optional observability context for tracing reranking operations.
     * When provided, reranking will create an AIAgentRunStep record.
     */
    observability?: NotesObservabilityOptions;
}

/**
 * Parameters for retrieving examples in a specific context
 */
export interface GetExamplesParams {
    agentId: string;
    userId?: string;
    companyId?: string;
    currentInput?: string;
    strategy: 'Semantic' | 'Recent' | 'Rated';
    maxExamples: number;
    contextUser: UserInfo;
    /**
     * Optional user scope for multi-tenant SaaS deployments.
     * When provided, enables hierarchical scope filtering.
     */
    userScope?: UserScope;
}

/**
 * Central service for retrieving and formatting notes/examples for injection into agent context.
 * Implements multi-dimensional scoping (Agent, User, Company) with 8 priority levels.
 */
export class AgentContextInjector {
    /**
     * Retrieve notes for a specific agent execution context.
     * Implements multi-dimensional scoping and injection strategy.
     */
    async GetNotesForContext(params: GetNotesParams): Promise<AIAgentNoteEntity[]> {
        // Use semantic search if strategy is 'Relevant'
        if (params.strategy === 'Relevant' && params.currentInput) {
            return await this.getNotesViaSemanticSearch(params);
        }

        // Otherwise use database query with scoping
        return await this.queryNotesWithScoping(params);
    }

    /**
     * Retrieve examples for a specific agent execution context.
     * Implements multi-dimensional scoping and injection strategy.
     */
    async GetExamplesForContext(params: GetExamplesParams): Promise<AIAgentExampleEntity[]> {
        // Use semantic search if strategy is 'Semantic'
        if (params.strategy === 'Semantic' && params.currentInput) {
            return await this.getExamplesViaSemanticSearch(params);
        }

        // Otherwise use database query with scoping
        return await this.queryExamplesWithScoping(params);
    }

    /**
     * Get notes using semantic search via AIEngine.
     * Supports optional two-stage retrieval with reranking for improved relevance.
     *
     * When reranking is enabled:
     * 1. Fetch N * retrievalMultiplier candidates via vector search
     * 2. Rerank candidates using configured reranker
     * 3. Return top N reranked results
     *
     * Fallback behavior (controlled by config.fallbackOnError):
     * - If true: On reranking failure, gracefully falls back to vector search results
     * - If false: Propagates reranking errors to caller
     */
    private async getNotesViaSemanticSearch(params: GetNotesParams): Promise<AIAgentNoteEntity[]> {
        const config = params.rerankerConfig;

        // Calculate candidates to fetch (more if reranking enabled)
        const fetchCount = config?.enabled
            ? params.maxNotes * config.retrievalMultiplier
            : params.maxNotes;

        // Stage 1: Vector search
        const matches = await AIEngine.Instance.FindSimilarAgentNotes(
            params.currentInput!,
            params.agentId,
            params.userId,
            params.companyId,
            fetchCount
        );

        // If no reranker config or disabled, return vector results directly
        if (!config?.enabled) {
            return matches.slice(0, params.maxNotes).map(m => m.note);
        }

        // Stage 2: Rerank candidates with fallback handling
        LogStatus(`AgentContextInjector: Reranking ${matches.length} candidates to top ${params.maxNotes}`);
        const rerankerService = RerankerService.Instance;

        try {
            const rerankResult = await rerankerService.rerankNotes(
                matches,
                params.currentInput!,
                config,
                params.contextUser,
                params.observability ? {
                    agentRunID: params.observability.agentRunID,
                    parentStepID: params.observability.parentStepID,
                    stepNumber: params.observability.stepNumber
                } : undefined
            );

            // Return top N reranked notes
            const result = rerankResult.notes.slice(0, params.maxNotes).map(m => m.note);
            LogStatus(`AgentContextInjector: Returning ${result.length} notes after reranking`);
            return result;

        } catch (error) {
            // Fallback decision is made HERE in the agent class, not in the service
            const message = error instanceof Error ? error.message : String(error);

            if (config.fallbackOnError) {
                // Graceful fallback to vector search results
                LogStatus(`AgentContextInjector: Reranking failed (${message}), falling back to vector search results`);
                return matches.slice(0, params.maxNotes).map(m => m.note);
            }

            // No fallback - propagate the error
            LogError(`AgentContextInjector: Reranking failed and fallbackOnError is false: ${message}`);
            throw error;
        }
    }

    /**
     * Get examples using semantic search via AIEngine
     */
    private async getExamplesViaSemanticSearch(params: GetExamplesParams): Promise<AIAgentExampleEntity[]> {
        const matches = await AIEngine.Instance.FindSimilarAgentExamples(
            params.currentInput!,
            params.agentId,
            params.userId,
            params.companyId,
            params.maxExamples
        );

        // Return entities directly from vector service (no database round-trip)
        return matches.map(m => m.example);
    }

    /**
     * Query notes using multi-dimensional scoping priority.
     * Implements 8-level scoping hierarchy from most specific to least specific.
     */
    private async queryNotesWithScoping(params: GetNotesParams): Promise<AIAgentNoteEntity[]> {
        const filter = this.buildNotesScopingFilter(params);
        const orderBy = '__mj_CreatedAt DESC';

        const rv = new RunView();
        const result = await rv.RunView<AIAgentNoteEntity>({
            EntityName: 'AI Agent Notes',
            ExtraFilter: filter,
            OrderBy: orderBy,
            IgnoreMaxRows: params.strategy !== 'Recent',
            MaxRows: params.strategy === 'Recent' ? params.maxNotes : undefined,
            ResultType: 'entity_object'
        }, params.contextUser);

        const notes = result.Success ? (result.Results || []) : [];
        if (notes.length === 0) {
            return [];
        }

        const sorted = this.sortNotes(notes, params.strategy, AIEngine.Instance.AgentNoteTypes);
        return sorted.slice(0, params.maxNotes);
    }

    /**
     * Query examples using multi-dimensional scoping priority
     */
    private async queryExamplesWithScoping(params: GetExamplesParams): Promise<AIAgentExampleEntity[]> {
        // Use cached data from AIEngine instead of database query
        const allExamples = AIEngine.Instance.AgentExamples;

        // Filter examples matching our scoping criteria
        const filtered = this.filterExamplesByScoping(allExamples, params);

        // Sort based on strategy
        const sorted = this.sortExamples(filtered, params.strategy);

        // Return top N results
        return sorted.slice(0, params.maxExamples);
    }

    /**
     * Build filter with 8-level scoping priority for notes.
     * Combines MJ-internal scoping (AgentID, UserID, CompanyID) with
     * multi-tenant SaaS scoping (PrimaryScopeEntityID, PrimaryScopeRecordID, SecondaryScopes).
     */
    private buildNotesScopingFilter(params: GetNotesParams): string {
        const filters: string[] = ['Status = \'Active\''];

        // Build MJ-internal scoping filter using OR conditions with priority
        const scopeConditions: string[] = [];

        // Priority 1: AgentID + UserID + CompanyID
        if (params.agentId && params.userId && params.companyId) {
            scopeConditions.push(`(AgentID='${params.agentId}' AND UserID='${params.userId}' AND CompanyID='${params.companyId}')`);
        }

        // Priority 2: AgentID + UserID
        if (params.agentId && params.userId) {
            scopeConditions.push(`(AgentID='${params.agentId}' AND UserID='${params.userId}' AND CompanyID IS NULL)`);
        }

        // Priority 3: AgentID + CompanyID
        if (params.agentId && params.companyId) {
            scopeConditions.push(`(AgentID='${params.agentId}' AND UserID IS NULL AND CompanyID='${params.companyId}')`);
        }

        // Priority 4: UserID + CompanyID
        if (params.userId && params.companyId) {
            scopeConditions.push(`(AgentID IS NULL AND UserID='${params.userId}' AND CompanyID='${params.companyId}')`);
        }

        // Priority 5: AgentID only
        if (params.agentId) {
            scopeConditions.push(`(AgentID='${params.agentId}' AND UserID IS NULL AND CompanyID IS NULL)`);
        }

        // Priority 6: UserID only
        if (params.userId) {
            scopeConditions.push(`(AgentID IS NULL AND UserID='${params.userId}' AND CompanyID IS NULL)`);
        }

        // Priority 7: CompanyID only
        if (params.companyId) {
            scopeConditions.push(`(AgentID IS NULL AND UserID IS NULL AND CompanyID='${params.companyId}')`);
        }

        // Priority 8: Global (all NULL)
        scopeConditions.push(`(AgentID IS NULL AND UserID IS NULL AND CompanyID IS NULL)`);

        if (scopeConditions.length > 0) {
            filters.push(`(${scopeConditions.join(' OR ')})`);
        }

        // Add multi-tenant SaaS scoping if userScope is provided
        if (params.userScope) {
            const saasScopes = this.buildSaasScopeFilter(params.userScope);
            filters.push(`(${saasScopes})`);
        }

        return filters.join(' AND ');
    }

    /**
     * Build filter for multi-tenant SaaS scoping with hierarchical inheritance.
     * Returns notes at all applicable scope levels (global → primary → full).
     */
    private buildSaasScopeFilter(userScope: UserScope): string {
        const conditions: string[] = [];

        // Always include global notes (no scope set)
        conditions.push('PrimaryScopeRecordID IS NULL');

        if (userScope.primaryRecordId) {
            // Include primary-scope-only notes (matches org, no secondary scopes)
            conditions.push(`(
                PrimaryScopeRecordID = '${userScope.primaryRecordId}'
                AND (SecondaryScopes IS NULL OR SecondaryScopes = '{}')
            )`);

            // Include fully-scoped notes if secondary scopes are provided
            if (userScope.secondary && Object.keys(userScope.secondary).length > 0) {
                const secondaryConditions = Object.entries(userScope.secondary)
                    .map(([key, val]) => `JSON_VALUE(SecondaryScopes, '$.${key}') = '${val}'`)
                    .join(' AND ');

                conditions.push(`(
                    PrimaryScopeRecordID = '${userScope.primaryRecordId}'
                    AND ${secondaryConditions}
                )`);
            }
        }

        return conditions.join(' OR ');
    }

    /**
     * Filter examples using multi-dimensional scoping priority.
     * Implements 4-level scoping hierarchy for examples (examples are always agent-specific).
     * Also handles multi-tenant SaaS scoping when userScope is provided.
     */
    private filterExamplesByScoping(examples: AIAgentExampleEntity[], params: GetExamplesParams): AIAgentExampleEntity[] {
        return examples.filter(example => {
            // Must be active
            if (example.Status !== 'Active') {
                return false;
            }

            // Must match the agent
            if (example.AgentID !== params.agentId) {
                return false;
            }

            // Check MJ-internal scoping priority (any of these conditions can match)
            const matchesPriority1 = params.userId && params.companyId &&
                example.UserID === params.userId && example.CompanyID === params.companyId;

            const matchesPriority2 = params.userId &&
                example.UserID === params.userId && example.CompanyID == null;

            const matchesPriority3 = params.companyId &&
                example.UserID == null && example.CompanyID === params.companyId;

            const matchesPriority4 = example.UserID == null && example.CompanyID == null;

            const matchesMJScoping = matchesPriority1 || matchesPriority2 || matchesPriority3 || matchesPriority4;
            if (!matchesMJScoping) {
                return false;
            }

            // Check multi-tenant SaaS scoping if userScope is provided
            if (params.userScope) {
                return this.matchesSaasScope(example, params.userScope);
            }

            return true;
        });
    }

    /**
     * Check if an example matches the SaaS scope criteria (hierarchical).
     * Returns true for: global, primary-only, or fully-scoped matches.
     */
    private matchesSaasScope(example: AIAgentExampleEntity, userScope: UserScope): boolean {
        // Global examples (no scope) always match
        if (!example.PrimaryScopeRecordID) {
            return true;
        }

        // No primary scope provided - only global examples match
        if (!userScope.primaryRecordId) {
            return false;
        }

        // Primary scope must match
        if (example.PrimaryScopeRecordID !== userScope.primaryRecordId) {
            return false;
        }

        // If example has no secondary scopes, it's an org-level example - matches
        const exampleSecondary = example.SecondaryScopes;
        if (!exampleSecondary || exampleSecondary === '{}') {
            return true;
        }

        // Example has secondary scopes - check if they match
        if (!userScope.secondary || Object.keys(userScope.secondary).length === 0) {
            // User has no secondary scope but example does - no match
            return false;
        }

        // Parse and match secondary scopes
        try {
            const parsedSecondary = JSON.parse(exampleSecondary);
            return Object.entries(parsedSecondary).every(([key, val]) =>
                userScope.secondary?.[key] === val
            );
        } catch {
            return false;
        }
    }

    /**
     * Sort examples based on the specified strategy
     */
    private sortExamples(examples: AIAgentExampleEntity[], strategy: 'Semantic' | 'Recent' | 'Rated'): AIAgentExampleEntity[] {
        // Create a copy to avoid mutating the original array
        const sorted = [...examples];

        if (strategy === 'Rated') {
            // Sort by SuccessScore DESC, then by creation date DESC
            sorted.sort((a, b) => {
                const scoreA = a.SuccessScore ?? 0;
                const scoreB = b.SuccessScore ?? 0;

                if (scoreB !== scoreA) {
                    return scoreB - scoreA;
                }

                // Tie-breaker: most recent first
                const dateA = a.__mj_CreatedAt?.getTime() ?? 0;
                const dateB = b.__mj_CreatedAt?.getTime() ?? 0;
                return dateB - dateA;
            });
        } else {
            // 'Recent' strategy (or default): sort by creation date DESC
            sorted.sort((a, b) => {
                const dateA = a.__mj_CreatedAt?.getTime() ?? 0;
                const dateB = b.__mj_CreatedAt?.getTime() ?? 0;
                return dateB - dateA;
            });
        }

        return sorted;
    }

    /**
     * Sort notes based on the specified strategy.
     * For non-Recent strategies, uses AgentNoteType.Priority from cached note types.
     */
    private sortNotes(
        notes: AIAgentNoteEntity[],
        strategy: 'Relevant' | 'Recent' | 'All',
        noteTypes: AIAgentNoteTypeEntity[]
    ): AIAgentNoteEntity[] {
        const sorted = [...notes];
        const priorityByTypeId = new Map<string, number>();

        for (const noteType of noteTypes) {
            priorityByTypeId.set(noteType.ID, noteType.Priority);
        }

        const getPriority = (note: AIAgentNoteEntity): number => {
            const noteTypeId = note.AgentNoteTypeID;
            if (!noteTypeId) {
                return Number.MAX_SAFE_INTEGER;
            }

            const priority = priorityByTypeId.get(noteTypeId);
            return typeof priority === 'number' ? priority : Number.MAX_SAFE_INTEGER;
        };

        if (strategy === 'Recent') {
            sorted.sort((a, b) => {
                const dateA = a.__mj_CreatedAt?.getTime() ?? 0;
                const dateB = b.__mj_CreatedAt?.getTime() ?? 0;
                return dateB - dateA;
            });
            return sorted;
        }

        sorted.sort((a, b) => {
            const priorityA = getPriority(a);
            const priorityB = getPriority(b);

            if (priorityA !== priorityB) {
                return priorityA - priorityB;
            }

            const dateA = a.__mj_CreatedAt?.getTime() ?? 0;
            const dateB = b.__mj_CreatedAt?.getTime() ?? 0;
            return dateB - dateA;
        });

        return sorted;
    }

    /**
     * Format notes for injection into agent prompt.
     * Includes memory policy explaining scope precedence for conflict resolution.
     *
     * @param notes - Array of notes to format
     * @param includeMemoryPolicy - Whether to include the memory policy preamble (default: true)
     */
    FormatNotesForInjection(notes: AIAgentNoteEntity[], includeMemoryPolicy: boolean = true): string {
        if (notes.length === 0) return '';

        const lines: string[] = [];

        // Add memory policy preamble for LLM understanding of scope precedence
        if (includeMemoryPolicy) {
            lines.push('<memory_policy>');
            lines.push('Precedence (highest to lowest):');
            lines.push('1) Current user message overrides all stored memory');
            lines.push('2) Contact-specific notes override organization-level');
            lines.push('3) Organization notes override global defaults');
            lines.push('4) When same scope, prefer most recent by date');
            lines.push('');
            lines.push('Conflict resolution:');
            lines.push('- If two notes contradict, prefer the more specific scope');
            lines.push('- Ask clarifying question only if conflict materially affects response');
            lines.push('</memory_policy>');
            lines.push('');
        }

        lines.push(`📝 AGENT NOTES (${notes.length})`);
        lines.push('');

        for (const note of notes) {
            lines.push(`[${note.Type}] ${note.Note}`);

            const scope = this.determineNoteScope(note);
            const saasScope = this.determineSaaSScope(note);

            if (saasScope) {
                lines.push(`  Scope: ${saasScope}`);
            } else if (scope) {
                lines.push(`  Scope: ${scope}`);
            }

            lines.push('');
        }

        lines.push('---');
        return lines.join('\n');
    }

    /**
     * Determine multi-tenant SaaS scope description for a note
     */
    private determineSaaSScope(note: AIAgentNoteEntity): string | null {
        // Check for SaaS scoping (takes precedence over MJ scoping)
        if (!note.PrimaryScopeRecordID) {
            return null; // No SaaS scope, fall back to MJ scope
        }

        const hasSecondary = note.SecondaryScopes && note.SecondaryScopes !== '{}';

        if (hasSecondary) {
            return 'Contact-specific (most specific)';
        }

        return 'Organization-level';
    }

    /**
     * Format examples for injection into agent prompt
     */
    FormatExamplesForInjection(examples: AIAgentExampleEntity[]): string {
        if (examples.length === 0) return '';

        const lines: string[] = [
            `💡 RELEVANT EXAMPLES (${examples.length})`,
            ''
        ];

        for (let i = 0; i < examples.length; i++) {
            const example = examples[i];
            lines.push(`Example ${i + 1}:`);
            lines.push(`Q: ${example.ExampleInput}`);
            lines.push(`A: ${example.ExampleOutput}`);

            if (example.SuccessScore) {
                lines.push(`  (Success Score: ${example.SuccessScore}/100)`);
            }

            lines.push('');
        }

        lines.push('---');
        return lines.join('\n');
    }

    /**
     * Determine human-readable scope description for a note
     */
    private determineNoteScope(note: AIAgentNoteEntity): string {
        if (note.AgentID && note.UserID && note.CompanyID) {
            return 'Agent + User + Company specific';
        }
        if (note.AgentID && note.UserID) {
            return 'Agent + User specific';
        }
        if (note.AgentID && note.CompanyID) {
            return 'Agent + Company specific';
        }
        if (note.UserID && note.CompanyID) {
            return 'User + Company specific';
        }
        if (note.AgentID) {
            return 'Agent-specific';
        }
        if (note.UserID) {
            return 'User-specific';
        }
        if (note.CompanyID) {
            return 'Company-wide';
        }
        return 'Global';
    }
}
