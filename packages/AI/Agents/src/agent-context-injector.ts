import { Metadata, RunView, UserInfo } from "@memberjunction/core";
import { AIAgentNoteEntity, AIAgentExampleEntity } from "@memberjunction/core-entities";
import { AIEngine } from "@memberjunction/aiengine";

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
     * Get notes using semantic search via AIEngine
     */
    private async getNotesViaSemanticSearch(params: GetNotesParams): Promise<AIAgentNoteEntity[]> {
        const matches = await AIEngine.Instance.FindSimilarAgentNotes(
            params.currentInput!,
            params.agentId,
            params.userId,
            params.companyId,
            params.maxNotes
        );

        // Return entities directly from vector service (no database round-trip)
        return matches.map(m => m.note);
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
        // For 'Recent' strategy, sort by creation date only
        // For other strategies (including 'All'), sort by priority first, then date
        const orderBy = params.strategy === 'Recent'
            ? '__mj_CreatedAt DESC'
            : 'AgentNoteType.Priority ASC, __mj_CreatedAt DESC';

        const rv = new RunView();
        const result = await rv.RunView<AIAgentNoteEntity>({
            EntityName: 'AI Agent Notes',
            ExtraFilter: filter,
            OrderBy: orderBy,
            MaxRows: params.maxNotes,
            ResultType: 'entity_object'
        }, params.contextUser);

        return result.Success ? (result.Results || []) : [];
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
     * Build filter with 8-level scoping priority for notes
     */
    private buildNotesScopingFilter(params: GetNotesParams): string {
        const filters: string[] = ['Status = \'Active\''];

        // Build scoping filter using OR conditions with priority
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

        return filters.join(' AND ');
    }

    /**
     * Filter examples using multi-dimensional scoping priority.
     * Implements 4-level scoping hierarchy for examples (examples are always agent-specific).
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

            // Check scoping priority (any of these conditions can match)
            const matchesPriority1 = params.userId && params.companyId &&
                example.UserID === params.userId && example.CompanyID === params.companyId;

            const matchesPriority2 = params.userId &&
                example.UserID === params.userId && example.CompanyID == null;

            const matchesPriority3 = params.companyId &&
                example.UserID == null && example.CompanyID === params.companyId;

            const matchesPriority4 = example.UserID == null && example.CompanyID == null;

            return matchesPriority1 || matchesPriority2 || matchesPriority3 || matchesPriority4;
        });
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
     * Format notes for injection into agent prompt
     */
    FormatNotesForInjection(notes: AIAgentNoteEntity[]): string {
        if (notes.length === 0) return '';

        const lines: string[] = [
            `📝 AGENT NOTES (${notes.length})`,
            ''
        ];

        for (const note of notes) {
            lines.push(`[${note.Type}] ${note.Note}`);

            const scope = this.determineNoteScope(note);
            if (scope) {
                lines.push(`  Scope: ${scope}`);
            }

            lines.push('');
        }

        lines.push('---');
        return lines.join('\n');
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
