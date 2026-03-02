import { LogError, LogStatus, RunView, UserInfo } from "@memberjunction/core";
import { UUIDsEqual } from "@memberjunction/global";
import { MJAIAgentNoteEntity, MJAIAgentExampleEntity, MJAIAgentNoteTypeEntity } from "@memberjunction/core-entities";
import { AIEngine, NoteEmbeddingMetadata, ExampleEmbeddingMetadata } from "@memberjunction/aiengine";
import { SecondaryScopeConfig, SecondaryDimension, SecondaryScopeValue } from "@memberjunction/ai-core-plus";
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
    /** Primary scope entity ID for multi-tenant filtering (FK to Entity table). */
    primaryScopeEntityId?: string;
    /** Primary scope record ID for multi-tenant filtering. */
    primaryScopeRecordId?: string;
    /** Arbitrary secondary scope dimensions for multi-tenant filtering. */
    secondaryScopes?: Record<string, SecondaryScopeValue>;
    /**
     * Optional secondary scope configuration from the agent.
     * Defines per-dimension inheritance modes and validation rules.
     */
    secondaryScopeConfig?: SecondaryScopeConfig | null;
    /**
     * Optional reranker configuration for two-stage retrieval.
     */
    rerankerConfig?: RerankerConfiguration | null;
    /**
     * Optional observability context for tracing reranking operations.
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
    /** Primary scope entity ID for multi-tenant filtering (FK to Entity table). */
    primaryScopeEntityId?: string;
    /** Primary scope record ID for multi-tenant filtering. */
    primaryScopeRecordId?: string;
    /** Arbitrary secondary scope dimensions for multi-tenant filtering. */
    secondaryScopes?: Record<string, SecondaryScopeValue>;
    /**
     * Optional secondary scope configuration from the agent.
     * Defines per-dimension inheritance modes and validation rules.
     */
    secondaryScopeConfig?: SecondaryScopeConfig | null;
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
    async GetNotesForContext(params: GetNotesParams): Promise<MJAIAgentNoteEntity[]> {
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
    async GetExamplesForContext(params: GetExamplesParams): Promise<MJAIAgentExampleEntity[]> {
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
    private async getNotesViaSemanticSearch(params: GetNotesParams): Promise<MJAIAgentNoteEntity[]> {
        const config = params.rerankerConfig;

        // Calculate candidates to fetch (more if reranking enabled)
        const fetchCount = config?.enabled
            ? params.maxNotes * config.retrievalMultiplier
            : params.maxNotes;

        // Build scope pre-filter so FindNearest only returns scope-valid candidates
        const scopePreFilter = this.buildScopePreFilter<NoteEmbeddingMetadata>(params, m => m.noteEntity);
        LogStatus(`AgentContextInjector: primaryScopeEntityId=${params.primaryScopeEntityId}, primaryScopeRecordId=${params.primaryScopeRecordId}, secondaryScopes=${JSON.stringify(params.secondaryScopes)}, secondaryScopeConfig=${JSON.stringify(params.secondaryScopeConfig)}, hasPreFilter=${!!scopePreFilter}`);

        // Stage 1: Vector search (scope filtering happens inside FindNearest)
        const matches = await AIEngine.Instance.FindSimilarAgentNotes(
            params.currentInput!,
            params.agentId,
            params.userId,
            params.companyId,
            fetchCount,
            0.5,
            scopePreFilter
        );

        LogStatus(`AgentContextInjector: FindSimilarAgentNotes returned ${matches.length} matches: ${matches.map(m => m.note.SecondaryScopes || 'GLOBAL').join(', ')}`);

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
                // Graceful fallback to vector search results (already scope-filtered)
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
    private async getExamplesViaSemanticSearch(params: GetExamplesParams): Promise<MJAIAgentExampleEntity[]> {
        // Build scope pre-filter so FindNearest only returns scope-valid candidates
        const scopePreFilter = this.buildScopePreFilter<ExampleEmbeddingMetadata>(params, m => m.exampleEntity);

        const matches = await AIEngine.Instance.FindSimilarAgentExamples(
            params.currentInput!,
            params.agentId,
            params.userId,
            params.companyId,
            params.maxExamples,
            0.5,
            scopePreFilter
        );

        // Return entities directly from vector service (no database round-trip)
        return matches.map(m => m.example);
    }

    /**
     * Build a pre-filter callback for vector search that enforces secondary scope rules.
     * Returns undefined when no scope params are provided (no filtering needed).
     *
     * @param params - Note or example params containing scope and secondaryScopeConfig
     * @param entityExtractor - Function to extract the scoped entity from the embedding metadata
     */
    private buildScopePreFilter<TMetadata>(
        params: GetNotesParams | GetExamplesParams,
        entityExtractor: (metadata: TMetadata) => { PrimaryScopeEntityID: string | null; PrimaryScopeRecordID: string | null; SecondaryScopes: string | null }
    ): ((metadata: TMetadata) => boolean) | undefined {
        if (!params.primaryScopeRecordId && !params.secondaryScopes) return undefined;
        return (metadata: TMetadata): boolean =>
            this.matchesSecondaryScope(entityExtractor(metadata), params.primaryScopeEntityId, params.primaryScopeRecordId, params.secondaryScopes, params.secondaryScopeConfig);
    }

    /**
     * Query notes using multi-dimensional scoping priority.
     * Implements 8-level scoping hierarchy from most specific to least specific.
     */
    private async queryNotesWithScoping(params: GetNotesParams): Promise<MJAIAgentNoteEntity[]> {
        const filter = this.buildNotesScopingFilter(params);
        const orderBy = '__mj_CreatedAt DESC';

        const rv = new RunView();
        const result = await rv.RunView<MJAIAgentNoteEntity>({
            EntityName: 'MJ: AI Agent Notes',
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
    private async queryExamplesWithScoping(params: GetExamplesParams): Promise<MJAIAgentExampleEntity[]> {
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
     * multi-tenant scoping (PrimaryScopeEntityID, PrimaryScopeRecordID, SecondaryScopes).
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

        // Add multi-tenant secondary scoping if primary or secondary scopes are provided
        if (params.primaryScopeRecordId || params.secondaryScopes) {
            const scopeFilter = this.buildSecondaryScopeFilter(params.primaryScopeEntityId, params.primaryScopeRecordId, params.secondaryScopes, params.secondaryScopeConfig);
            filters.push(`(${scopeFilter})`);
        }

        return filters.join(' AND ');
    }

    /**
     * Build filter for multi-tenant secondary scoping with per-dimension inheritance.
     * Returns notes at all applicable scope levels (global -> primary -> full).
     *
     * Inheritance modes per dimension:
     * - 'cascading': Notes without this dimension match queries with it (broader retrieval)
     * - 'strict': Notes must exactly match the dimension value
     */
    private buildSecondaryScopeFilter(
        primaryScopeEntityId: string | undefined,
        primaryScopeRecordId: string | undefined,
        secondaryScopes: Record<string, SecondaryScopeValue> | undefined,
        scopeConfig?: SecondaryScopeConfig | null
    ): string {
        const conditions: string[] = [];

        // Always include global notes (no scope set at all)
        conditions.push('(PrimaryScopeRecordID IS NULL AND (SecondaryScopes IS NULL OR SecondaryScopes = \'{}\'))');

        const hasSecondary = secondaryScopes && Object.keys(secondaryScopes).length > 0;
        const allowSecondaryOnly = scopeConfig?.allowSecondaryOnly ?? false;

        // Build primary scope match clause: both entity ID and record ID must match
        const primaryMatchClause = primaryScopeEntityId
            ? `PrimaryScopeEntityID = '${primaryScopeEntityId}' AND PrimaryScopeRecordID = '${primaryScopeRecordId}'`
            : `PrimaryScopeRecordID = '${primaryScopeRecordId}'`;

        if (primaryScopeRecordId) {
            // Include primary-scope-only notes (matches org, no secondary scopes)
            conditions.push(`(
                ${primaryMatchClause}
                AND (SecondaryScopes IS NULL OR SecondaryScopes = '{}')
            )`);

            // Include fully-scoped notes if secondary scopes are provided
            if (hasSecondary) {
                const secondaryCondition = this.buildPerDimensionFilter(
                    secondaryScopes!,
                    scopeConfig
                );

                conditions.push(`(
                    ${primaryMatchClause}
                    AND ${secondaryCondition}
                )`);
            }
        } else if (allowSecondaryOnly && hasSecondary) {
            // Secondary-only scoping: no primary required
            const secondaryCondition = this.buildPerDimensionFilter(
                secondaryScopes!,
                scopeConfig
            );

            conditions.push(`(
                PrimaryScopeRecordID IS NULL
                AND SecondaryScopes IS NOT NULL
                AND SecondaryScopes != '{}'
                AND ${secondaryCondition}
            )`);
        }

        return conditions.join(' OR ');
    }

    /**
     * Build SQL filter conditions for secondary dimensions with per-dimension inheritance.
     *
     * For each dimension in the runtime scope:
     * - 'cascading' mode: Match if dimension value matches OR dimension is absent in note
     * - 'strict' mode: Match only if dimension value matches exactly
     */
    private buildPerDimensionFilter(
        secondary: Record<string, SecondaryScopeValue>,
        scopeConfig?: SecondaryScopeConfig | null
    ): string {
        const dimensionConditions: string[] = [];
        const defaultMode = scopeConfig?.defaultInheritanceMode ?? 'cascading';

        // Build a map of dimension configs for quick lookup
        const dimConfigMap = new Map<string, SecondaryDimension>();
        if (scopeConfig?.dimensions) {
            for (const dim of scopeConfig.dimensions) {
                dimConfigMap.set(dim.name, dim);
            }
        }

        for (const [key, rawValue] of Object.entries(secondary)) {
            const dimConfig = dimConfigMap.get(key);
            const inheritanceMode = dimConfig?.inheritanceMode ?? defaultMode;
            // Stringify all values (numbers, booleans) for SQL comparison via JSON_VALUE
            const values = Array.isArray(rawValue) ? rawValue.map(String) : [String(rawValue)];

            // Escape single quotes in values to prevent SQL injection
            const escapedValues = values.map(v => v.replace(/'/g, "''"));

            if (inheritanceMode === 'strict') {
                const matchClause = escapedValues.length === 1
                    ? `JSON_VALUE(SecondaryScopes, '$.${key}') = '${escapedValues[0]}'`
                    : `JSON_VALUE(SecondaryScopes, '$.${key}') IN (${escapedValues.map(v => `'${v}'`).join(', ')})`;
                dimensionConditions.push(matchClause);
            } else {
                const matchClause = escapedValues.length === 1
                    ? `JSON_VALUE(SecondaryScopes, '$.${key}') = '${escapedValues[0]}'`
                    : `JSON_VALUE(SecondaryScopes, '$.${key}') IN (${escapedValues.map(v => `'${v}'`).join(', ')})`;
                dimensionConditions.push(
                    `(JSON_VALUE(SecondaryScopes, '$.${key}') IS NULL OR ${matchClause})`
                );
            }
        }

        return dimensionConditions.length > 0
            ? `(${dimensionConditions.join(' AND ')})`
            : '1=1';
    }

    /**
     * Filter examples using multi-dimensional scoping priority.
     * Implements 4-level scoping hierarchy for examples (examples are always agent-specific).
     * Also handles multi-tenant secondary scoping when scope params are provided.
     */
    private filterExamplesByScoping(examples: MJAIAgentExampleEntity[], params: GetExamplesParams): MJAIAgentExampleEntity[] {
        return examples.filter(example => {
            // Must be active
            if (example.Status !== 'Active') {
                return false;
            }

            // Must match the agent
            if (!UUIDsEqual(example.AgentID, params.agentId)) {
                return false;
            }

            // Check MJ-internal scoping priority (any of these conditions can match)
            const matchesPriority1 = params.userId && params.companyId &&
                UUIDsEqual(example.UserID, params.userId) && UUIDsEqual(example.CompanyID, params.companyId);

            const matchesPriority2 = params.userId &&
                UUIDsEqual(example.UserID, params.userId) && example.CompanyID == null;

            const matchesPriority3 = params.companyId &&
                example.UserID == null && UUIDsEqual(example.CompanyID, params.companyId);

            const matchesPriority4 = example.UserID == null && example.CompanyID == null;

            const matchesMJScoping = matchesPriority1 || matchesPriority2 || matchesPriority3 || matchesPriority4;
            if (!matchesMJScoping) {
                return false;
            }

            // Check multi-tenant secondary scoping if scope params are provided
            if (params.primaryScopeRecordId || params.secondaryScopes) {
                return this.matchesSecondaryScope(example, params.primaryScopeEntityId, params.primaryScopeRecordId, params.secondaryScopes, params.secondaryScopeConfig);
            }

            return true;
        });
    }

    /**
     * Check if a scoped entity (note or example) matches the secondary scope criteria
     * with per-dimension inheritance.
     * Returns true for: global, primary-only, secondary-only, or fully-scoped matches.
     */
    private matchesSecondaryScope(
        entity: { PrimaryScopeEntityID: string | null; PrimaryScopeRecordID: string | null; SecondaryScopes: string | null },
        primaryScopeEntityId: string | undefined,
        primaryScopeRecordId: string | undefined,
        secondaryScopes: Record<string, SecondaryScopeValue> | undefined,
        scopeConfig?: SecondaryScopeConfig | null
    ): boolean {
        const hasSecondary = secondaryScopes && Object.keys(secondaryScopes).length > 0;
        const allowSecondaryOnly = scopeConfig?.allowSecondaryOnly ?? false;

        // Global entities (no scope at all) always match
        const exampleSecondary = entity.SecondaryScopes;
        const hasExampleSecondary = exampleSecondary && exampleSecondary !== '{}';

        if (!entity.PrimaryScopeRecordID && !hasExampleSecondary) {
            return true;
        }

        // Handle secondary-only mode
        if (allowSecondaryOnly && !primaryScopeRecordId && hasSecondary) {
            if (!entity.PrimaryScopeRecordID && !hasExampleSecondary) {
                return true;
            }
            if (!entity.PrimaryScopeRecordID && hasExampleSecondary) {
                return this.matchSecondaryScopes(exampleSecondary!, secondaryScopes!, scopeConfig);
            }
            return false;
        }

        // No primary scope provided - only global entities match
        if (!primaryScopeRecordId) {
            return !entity.PrimaryScopeRecordID && !hasExampleSecondary;
        }

        // Primary scope must match (both entity ID and record ID)
        if (entity.PrimaryScopeRecordID !== primaryScopeRecordId) {
            return false;
        }
        if (primaryScopeEntityId && entity.PrimaryScopeEntityID && entity.PrimaryScopeEntityID !== primaryScopeEntityId) {
            return false;
        }

        // If entity has no secondary scopes, it's an org-level entity - matches
        if (!hasExampleSecondary) {
            return true;
        }

        // Entity has secondary scopes - check with per-dimension inheritance
        if (!hasSecondary) {
            return false;
        }

        return this.matchSecondaryScopes(exampleSecondary!, secondaryScopes!, scopeConfig);
    }

    /**
     * Match secondary scopes with per-dimension inheritance mode.
     *
     * For each dimension in the example's secondary scopes:
     * - 'cascading': Match if user has the same value OR user doesn't have the dimension
     * - 'strict': Match only if user has the exact same value
     */
    private matchSecondaryScopes(
        exampleSecondaryJson: string,
        userSecondary: Record<string, SecondaryScopeValue>,
        scopeConfig?: SecondaryScopeConfig | null
    ): boolean {
        const defaultMode = scopeConfig?.defaultInheritanceMode ?? 'cascading';

        // Build dimension config map for quick lookup
        const dimConfigMap = new Map<string, SecondaryDimension>();
        if (scopeConfig?.dimensions) {
            for (const dim of scopeConfig.dimensions) {
                dimConfigMap.set(dim.name, dim);
            }
        }

        try {
            const exampleScopes = JSON.parse(exampleSecondaryJson) as Record<string, string>;

            // Check each dimension in the example
            for (const [key, exampleValue] of Object.entries(exampleScopes)) {
                const dimConfig = dimConfigMap.get(key);
                const inheritanceMode = dimConfig?.inheritanceMode ?? defaultMode;

                if (inheritanceMode === 'strict') {
                    if (!this.userDimensionMatches(userSecondary[key], exampleValue)) {
                        return false;
                    }
                } else {
                    // Cascading: match if user doesn't have this dimension, or values match
                    const rawValue = userSecondary[key];
                    if (rawValue !== undefined && !this.userDimensionMatches(rawValue, exampleValue)) {
                        return false;
                    }
                }
            }

            // Also check user dimensions for strict mode requirements
            // (ensures user's strict dimensions are present in example if required)
            for (const [key] of Object.entries(userSecondary)) {
                const dimConfig = dimConfigMap.get(key);
                const inheritanceMode = dimConfig?.inheritanceMode ?? defaultMode;

                if (inheritanceMode === 'strict') {
                    const exampleValue = exampleScopes[key];
                    if (exampleValue === undefined) {
                        return false;
                    }
                }
            }

            return true;
        } catch {
            return false;
        }
    }

    /**
     * Check if a user's dimension value matches an example's value.
     * Compares as strings to handle mixed types (numbers, booleans stored as JSON strings).
     */
    private userDimensionMatches(userValue: SecondaryScopeValue | undefined, exampleValue: string): boolean {
        if (userValue === undefined) return false;
        if (Array.isArray(userValue)) return userValue.map(String).includes(exampleValue);
        return String(userValue) === exampleValue;
    }

    /**
     * Sort examples based on the specified strategy
     */
    private sortExamples(examples: MJAIAgentExampleEntity[], strategy: 'Semantic' | 'Recent' | 'Rated'): MJAIAgentExampleEntity[] {
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
        notes: MJAIAgentNoteEntity[],
        strategy: 'Relevant' | 'Recent' | 'All',
        noteTypes: MJAIAgentNoteTypeEntity[]
    ): MJAIAgentNoteEntity[] {
        const sorted = [...notes];
        const priorityByTypeId = new Map<string, number>();

        for (const noteType of noteTypes) {
            priorityByTypeId.set(noteType.ID, noteType.Priority);
        }

        const getPriority = (note: MJAIAgentNoteEntity): number => {
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
    FormatNotesForInjection(notes: MJAIAgentNoteEntity[], includeMemoryPolicy: boolean = true): string {
        if (notes.length === 0) return '';

        const lines: string[] = [];

        // Add memory policy preamble for LLM understanding of scope precedence
        if (includeMemoryPolicy) {
            lines.push('<memory_policy>');
            lines.push('Precedence (highest to lowest):');
            lines.push('1) Current user message overrides all stored memory');
            lines.push('2) User-specific notes override company-level');
            lines.push('3) Company notes override global defaults');
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
            const secondaryScope = this.determineSecondaryScope(note);

            if (secondaryScope) {
                lines.push(`  Scope: ${secondaryScope}`);
            } else if (scope) {
                lines.push(`  Scope: ${scope}`);
            }

            lines.push('');
        }

        lines.push('---');
        return lines.join('\n');
    }

    /**
     * Determine multi-tenant secondary scope description for a note
     */
    private determineSecondaryScope(note: MJAIAgentNoteEntity): string | null {
        // Check for secondary scoping (takes precedence over MJ scoping)
        if (!note.PrimaryScopeRecordID) {
            return null; // No secondary scope, fall back to MJ scope
        }

        const hasSecondary = note.SecondaryScopes && note.SecondaryScopes !== '{}';

        if (hasSecondary) {
            return 'User-specific (most specific)';
        }

        return 'Company-level';
    }

    /**
     * Format examples for injection into agent prompt
     */
    FormatExamplesForInjection(examples: MJAIAgentExampleEntity[]): string {
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
    private determineNoteScope(note: MJAIAgentNoteEntity): string {
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
