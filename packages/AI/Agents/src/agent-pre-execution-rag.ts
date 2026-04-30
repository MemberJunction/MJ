/**
 * @fileoverview Agent pre-execution RAG — Phase 1C of plans/search-scopes-rag-plus.md.
 *
 * Runs in parallel with the rest of `BaseAgent.Execute()` Phase 2 to retrieve and inject
 * scoped search context before the agent's first LLM call. Follows the same pattern as
 * `AgentContextInjector` (notes/examples) so the two subsystems coexist cleanly:
 *
 *   1. Load the agent's active `AIAgentSearchScope` rows where Phase IN ('PreExecution','Both')
 *      and the row is within its Status + StartAt/EndAt window.
 *   2. For each active scope, render the `QueryTemplateID` via MJ TemplateEngineServer
 *      (or fall back to `lastUserMessage`).
 *   3. Call `SearchEngine.Search()` with `ScopeIDs: [scopeId]`, honoring per-agent overrides
 *      (MaxResults, MinScore, FusionWeightsOverride) and the agent's multi-tenant context
 *      (PrimaryScopeRecordID, SecondaryScopes).
 *   4. Cross-scope RRF when multiple scopes produced results.
 *   5. Format results as a `<retrieved_context>` system message and return.
 *
 * @module @memberjunction/ai-agents
 */

import { LogError, LogStatus, RunView, UserInfo } from '@memberjunction/core';
import {
    MJAIAgentEntity,
    MJAIAgentSearchScopeEntity,
    SearchEngineBase,
    MJSearchScopeEntity,
    MJTemplateEntityExtended,
    MJTemplateContentEntity,
} from '@memberjunction/core-entities';
import {
    SearchEngine,
    SearchResultItem,
    SearchContext,
    FusionWeightsByProvider,
    SearchFusion,
} from '@memberjunction/search-engine';
import { TemplateEngineServer } from '@memberjunction/templates';
import { ChatMessage } from '@memberjunction/ai';
import { SecondaryScopeValue } from '@memberjunction/ai-core-plus';

/**
 * Parameters for executing pre-execution RAG for an agent.
 */
export interface AgentPreExecutionRAGParams {
    /** The agent currently being executed. */
    agent: MJAIAgentEntity;
    /** The most recent user message — used as the default query when no template is configured. */
    lastUserMessage: string;
    /** Optional recent messages (role + content) for template rendering. */
    recentMessages?: ChatMessage[];
    /** Optional conversation summary. */
    conversationSummary?: string;
    /** Agent's current payload state. Available to templates under `payload`. */
    payload?: unknown;
    /** Multi-tenant primary scope record ID (flows into `SearchContext.PrimaryScopeRecordID`). */
    primaryScopeRecordId?: string;
    /** Multi-tenant primary scope entity ID. */
    primaryScopeEntityId?: string;
    /** Multi-tenant secondary scope dimensions. */
    secondaryScopes?: Record<string, SecondaryScopeValue>;
    /** Calling user — threaded through to SearchEngine + Metadata. */
    contextUser: UserInfo;
    /**
     * Phase 2C: when true, consume SearchEngine.streamSearch() instead of
     * the synchronous Search() per scope. The final aggregate is identical
     * — what changes is that intermediate provider traces are written to
     * `streamingTrace` (when supplied) so the agent's pre-execution
     * scratchpad can show "while you wait" progress. Default false.
     */
    streamingEnabled?: boolean;
    /**
     * Optional sink for streamingEnabled traces. Caller pushes nothing
     * itself — the RAG hook appends one markdown line per provider event
     * per scope. Caller decides what to do with the lines (typically
     * concat into the agent's pre-prompt scratchpad).
     */
    streamingTrace?: string[];
}

/** Structured result of a single scope's search, used for formatting + artifact persistence. */
export interface ScopeSearchResult {
    scopeID: string;
    scopeName: string;
    scopeDescription: string | null;
    scopeIcon: string | null;
    query: string;
    results: SearchResultItem[];
    minScore: number;
}

/** Final aggregate result of `AgentPreExecutionRAG.Execute()`. */
export interface AgentPreExecutionRAGResult {
    /** Formatted `<retrieved_context>` system-message content ready for `unshift()`. */
    formattedSystemMessage: string;
    /** Per-scope result detail (for observability + artifact persistence). */
    perScopeResults: ScopeSearchResult[];
    /** Cross-scope fused result list (deduped, truncated). */
    combinedResults: SearchResultItem[];
    /** Combined search context passed into the engine. */
    searchContext?: SearchContext;
    /** Scope IDs actually queried (inactive/expired ones dropped). */
    queriedScopeIDs: string[];
    /** Raw agent-scope rows used (for debugging). */
    agentScopeRows: MJAIAgentSearchScopeEntity[];
}

/**
 * Orchestrator for agent pre-execution RAG. Stateless — create a fresh instance per call.
 */
export class AgentPreExecutionRAG {
    /**
     * Main entry point. Returns a filled-in `AgentPreExecutionRAGResult` when the agent
     * has any active PreExecution/Both scopes; otherwise returns `null` so callers can
     * skip injection entirely.
     */
    public async Execute(params: AgentPreExecutionRAGParams): Promise<AgentPreExecutionRAGResult | null> {
        if (!params.agent?.ID) return null;
        await SearchEngineBase.Instance.Config(false, params.contextUser);

        // 1. Load active PreExecution/Both scope rows for this agent (sorted by priority)
        const agentScopeRows = this.loadActiveAgentScopeRows(params.agent.ID);
        if (agentScopeRows.length === 0) return null;

        const searchContext: SearchContext = {
            PrimaryScopeEntityID: params.primaryScopeEntityId,
            PrimaryScopeRecordID: params.primaryScopeRecordId,
            SecondaryScopes: params.secondaryScopes
        };
        const hasContext = !!(searchContext.PrimaryScopeRecordID || (searchContext.SecondaryScopes && Object.keys(searchContext.SecondaryScopes).length > 0));

        // 2–3. For each agent-scope row, render the query and run scoped search.
        const perScopeResults: ScopeSearchResult[] = [];
        for (const row of agentScopeRows) {
            const r = await this.searchOneAgentScope(row, params, searchContext, hasContext);
            if (r) perScopeResults.push(r);
        }
        if (perScopeResults.length === 0) return null;

        // 4. Cross-scope RRF when multiple scopes contributed
        const combined = this.combineAcrossScopes(perScopeResults);

        // 5. Format for system-message injection
        const formatted = this.formatAsSystemMessage(perScopeResults);

        return {
            formattedSystemMessage: formatted,
            perScopeResults,
            combinedResults: combined,
            searchContext: hasContext ? searchContext : undefined,
            queriedScopeIDs: perScopeResults.map(s => s.scopeID),
            agentScopeRows
        };
    }

    /**
     * Load active PreExecution/Both AIAgentSearchScope rows for the agent,
     * sorted by Priority ascending (lower number = higher priority).
     */
    private loadActiveAgentScopeRows(agentID: string): MJAIAgentSearchScopeEntity[] {
        const rows = SearchEngineBase.Instance.GetAgentScopes(agentID, 'PreExecution');
        return [...rows].sort((a, b) => a.Priority - b.Priority);
    }

    /**
     * Resolve + render the query for one agent-scope row, run the search
     * (sync or streaming), and shape the per-scope result. Returns null when
     * the row is unusable (inactive scope, empty query, search failure, or
     * empty result set) — the caller decides whether to keep iterating.
     */
    private async searchOneAgentScope(
        row: MJAIAgentSearchScopeEntity,
        params: AgentPreExecutionRAGParams,
        searchContext: SearchContext,
        hasContext: boolean,
    ): Promise<ScopeSearchResult | null> {
        const scope = SearchEngineBase.Instance.GetActiveScopeByID(row.SearchScopeID);
        if (!scope) {
            LogStatus(`AgentPreExecutionRAG: Scope "${row.SearchScopeID}" not active — skipping.`);
            return null;
        }
        const query = await this.resolveQuery(row, scope, params);
        if (!query || !query.trim()) return null;

        const fusionWeights = this.parseFusionWeights(row.FusionWeightsOverride);
        const minScore = row.MinScore ?? 0;
        const maxResults = row.MaxResults ?? 10;

        try {
            const sr = params.streamingEnabled
                ? await this.streamSearchOneScope({ scope, query, maxResults, minScore, fusionWeights, searchContext, hasContext, params })
                : await SearchEngine.Instance.Search({
                    Query: query,
                    MaxResults: maxResults,
                    MinScore: minScore,
                    ScopeIDs: [scope.ID],
                    SearchContext: hasContext ? searchContext : undefined,
                    FusionWeightsOverride: fusionWeights,
                    Mode: 'full',
                    // P3.2 — thread AIAgentID so SearchExecutionLog rows
                    // attribute pre-execution RAG searches to the calling
                    // agent. Without this, the analytics dashboard's "top
                    // searches by agent" view is blind to the RAG path.
                    AIAgentID: params.agent.ID,
                }, params.contextUser);

            if (sr.Success && sr.Results.length > 0) {
                return {
                    scopeID: scope.ID,
                    scopeName: scope.Name,
                    scopeDescription: scope.Description,
                    scopeIcon: scope.Icon,
                    query,
                    results: sr.Results,
                    minScore,
                };
            }
            if (!sr.Success) {
                LogError(`AgentPreExecutionRAG: Search in scope "${scope.Name}" failed: ${sr.ErrorMessage}`);
            }
            return null;
        } catch (error) {
            const msg = error instanceof Error ? error.message : String(error);
            LogError(`AgentPreExecutionRAG: Exception searching scope "${scope.Name}": ${msg}`);
            return null;
        }
    }

    /**
     * Phase 2C streaming-mode helper — consume `SearchEngine.streamSearch()`
     * and shape the events back into a `SearchResult` so the rest of the
     * pipeline doesn't need to know about streaming. Per-provider trace
     * lines are appended to `params.streamingTrace` (markdown over JSON,
     * per RAG_plan §2.2) so the agent's pre-prompt scratchpad can show
     * "while you wait" progress.
     */
    private async streamSearchOneScope(input: {
        scope: MJSearchScopeEntity;
        query: string;
        maxResults: number;
        minScore: number;
        fusionWeights: FusionWeightsByProvider | undefined;
        searchContext: SearchContext;
        hasContext: boolean;
        params: AgentPreExecutionRAGParams;
    }): Promise<Awaited<ReturnType<typeof SearchEngine.Instance.Search>>> {
        let finalResults: SearchResultItem[] = [];
        let sourceCounts = { Vector: 0, FullText: 0, Entity: 0, Storage: 0 };
        let elapsedMs = 0;
        let errorMsg: string | undefined;
        const traces: string[] = [];
        for await (const ev of SearchEngine.Instance.streamSearch({
            Query: input.query,
            MaxResults: input.maxResults,
            MinScore: input.minScore,
            ScopeIDs: [input.scope.ID],
            SearchContext: input.hasContext ? input.searchContext : undefined,
            FusionWeightsOverride: input.fusionWeights,
            Mode: 'full',
            AIAgentID: input.params.agent.ID,
        }, input.params.contextUser)) {
            if (ev.phase === 'provider') {
                traces.push(`### Provider \`${ev.providerName}\` returned ${ev.results.length} rows in ${ev.durationMs}ms`);
            } else if (ev.phase === 'final') {
                finalResults = ev.results;
                sourceCounts = ev.sourceCounts;
                elapsedMs = ev.elapsedMs;
            } else if (ev.phase === 'error') {
                errorMsg = ev.error;
            }
        }
        if (input.params.streamingTrace) input.params.streamingTrace.push(...traces);
        return {
            Success: !errorMsg,
            Results: finalResults,
            TotalCount: finalResults.length,
            ElapsedMs: elapsedMs,
            SourceCounts: sourceCounts,
            Providers: [],
            ErrorMessage: errorMsg,
        };
    }

    /**
     * Cross-scope reciprocal rank fusion — when 2+ scopes contributed, run
     * RRF + dedup so the merged list reflects each scope's contribution.
     * Single-scope cases skip fusion and return the only result list directly.
     */
    private combineAcrossScopes(perScopeResults: ScopeSearchResult[]): SearchResultItem[] {
        if (perScopeResults.length === 1) return perScopeResults[0].results;
        const fusion = new SearchFusion();
        const map = new Map<string, SearchResultItem[]>();
        for (const s of perScopeResults) map.set(s.scopeID, s.results);
        const maxAcrossScopes = Math.max(...perScopeResults.map(s => s.results.length));
        return fusion.Deduplicate(fusion.CrossScopeFusion(map, Math.max(10, maxAcrossScopes)));
    }

    /**
     * Shape the result into a Data-Snapshot-compatible payload so `ProcessAgentArtifacts`
     * can persist it as a `Search Result Set` artifact. See Section 6.3 of the plan.
     * Returns `undefined` when there is nothing to persist.
     */
    public BuildArtifactPayload(
        result: AgentPreExecutionRAGResult
    ): Record<string, unknown> | undefined {
        if (!result || result.combinedResults.length === 0) return undefined;
        const rows = result.combinedResults.map(r => ({
            id: r.ID,
            recordID: r.RecordID,
            entity: r.EntityName,
            title: r.Title,
            snippet: r.Snippet,
            score: r.Score,
            source: r.SourceType,
            tags: r.Tags,
            matchedAt: r.MatchedAt?.toISOString?.() ?? null,
            scopeID: r.ProviderId
        }));

        return {
            title: `Pre-execution RAG (${result.queriedScopeIDs.length} scope(s))`,
            tables: [
                {
                    name: 'results',
                    description: 'Ranked search results after per-scope and cross-scope RRF fusion.',
                    source: 'search',
                    columns: [
                        { field: 'id', displayName: 'ID', sqlBaseType: 'nvarchar' },
                        { field: 'recordID', displayName: 'Record ID', sqlBaseType: 'uniqueidentifier' },
                        { field: 'entity', displayName: 'Entity', sqlBaseType: 'nvarchar' },
                        { field: 'title', displayName: 'Title', sqlBaseType: 'nvarchar' },
                        { field: 'snippet', displayName: 'Snippet', sqlBaseType: 'nvarchar' },
                        { field: 'score', displayName: 'Score', sqlBaseType: 'decimal', isSummary: true },
                        { field: 'source', displayName: 'Source', sqlBaseType: 'nvarchar' },
                        { field: 'tags', displayName: 'Tags', sqlBaseType: 'nvarchar' },
                        { field: 'matchedAt', displayName: 'Matched At', sqlBaseType: 'datetimeoffset' },
                        { field: 'scopeID', displayName: 'Scope', sqlBaseType: 'uniqueidentifier' }
                    ],
                    rows,
                    sorting: [{ field: 'score', direction: 'desc' }],
                    metadata: { rowCount: rows.length }
                }
            ],
            computations: [
                { name: 'Total Results', type: 'count', value: rows.length, formattedValue: String(rows.length) },
                { name: 'Top Score', type: 'max', field: 'score', value: rows[0]?.score ?? 0 }
            ],
            interpretation: `Retrieved ${rows.length} result(s) across ${result.queriedScopeIDs.length} scope(s) during pre-execution RAG.`,
            scopeIDs: result.queriedScopeIDs,
            queries: result.perScopeResults.map(s => ({ scopeID: s.scopeID, scopeName: s.scopeName, query: s.query })),
            searchContext: result.searchContext,
            searchedAt: new Date().toISOString()
        };
    }

    // ────────────────────────────────────────────────────────────────
    // Query resolution
    // ────────────────────────────────────────────────────────────────

    /**
     * Resolve the search query for one scope. If the agent-scope row has a QueryTemplateID,
     * render it via `TemplateEngineServer`. Otherwise fall back to `lastUserMessage`.
     */
    private async resolveQuery(
        row: MJAIAgentSearchScopeEntity,
        scope: MJSearchScopeEntity,
        params: AgentPreExecutionRAGParams
    ): Promise<string> {
        if (!row.QueryTemplateID) return params.lastUserMessage;

        try {
            const tmpl = await this.loadTemplate(row.QueryTemplateID, params.contextUser);
            if (!tmpl) return params.lastUserMessage;

            const content = tmpl.template.GetHighestPriorityContent?.() ?? tmpl.content;
            if (!content) return params.lastUserMessage;

            const data = {
                lastUserMessage: params.lastUserMessage,
                recentMessages: params.recentMessages ?? [],
                conversationSummary: params.conversationSummary ?? '',
                payload: params.payload ?? {},
                agentName: params.agent.Name,
                agentDescription: params.agent.Description ?? '',
                scopeName: scope.Name,
                scopeDescription: scope.Description ?? ''
            };

            const rendered = await TemplateEngineServer.Instance.RenderTemplate(tmpl.template, content, data);
            if (rendered?.Success && rendered.Output) {
                return rendered.Output.trim();
            }
            LogError(`AgentPreExecutionRAG: Template "${row.QueryTemplateID}" render failed: ${rendered?.Message ?? 'unknown'}`);
            return params.lastUserMessage;
        } catch (error) {
            const msg = error instanceof Error ? error.message : String(error);
            LogError(`AgentPreExecutionRAG: Template "${row.QueryTemplateID}" exception: ${msg}`);
            return params.lastUserMessage;
        }
    }

    /**
     * Load a Template entity + its highest-priority content row.
     * Uses the cached `TemplateEngineServer.FindTemplate` when available; falls back to a
     * direct RunView when not.
     */
    private async loadTemplate(
        templateID: string,
        contextUser: UserInfo
    ): Promise<{ template: MJTemplateEntityExtended; content: MJTemplateContentEntity | null } | null> {
        try {
            await TemplateEngineServer.Instance.Config(false, contextUser);
            const t = TemplateEngineServer.Instance.FindTemplate?.(templateID);
            if (t) {
                const content = t.GetHighestPriorityContent?.() ?? null;
                return { template: t, content };
            }
        } catch {
            // fall through to RunView
        }

        const rv = new RunView();
        const tResult = await rv.RunView<MJTemplateEntityExtended>({
            EntityName: 'Templates',
            ExtraFilter: `ID='${templateID}'`,
            ResultType: 'entity_object'
        }, contextUser);
        if (!tResult.Success || tResult.Results.length === 0) return null;
        const template = tResult.Results[0];

        const cResult = await rv.RunView<MJTemplateContentEntity>({
            EntityName: 'Template Contents',
            ExtraFilter: `TemplateID='${templateID}'`,
            OrderBy: 'Priority DESC, __mj_CreatedAt ASC',
            MaxRows: 1,
            ResultType: 'entity_object'
        }, contextUser);
        const content = cResult.Success && cResult.Results.length > 0 ? cResult.Results[0] : null;

        return { template, content };
    }

    private parseFusionWeights(raw: string | null): FusionWeightsByProvider | undefined {
        if (!raw) return undefined;
        try {
            const parsed = JSON.parse(raw);
            if (parsed && typeof parsed === 'object') return parsed as FusionWeightsByProvider;
        } catch {
            LogError(`AgentPreExecutionRAG: Invalid FusionWeightsOverride JSON — ignoring: ${raw.substring(0, 120)}`);
        }
        return undefined;
    }

    // ────────────────────────────────────────────────────────────────
    // Output formatting
    // ────────────────────────────────────────────────────────────────

    /**
     * Format the per-scope results into a `<retrieved_context>` system-message block.
     * Matches the shape documented in Section 4.2 of the plan.
     */
    private formatAsSystemMessage(perScope: ScopeSearchResult[]): string {
        const lines: string[] = [];
        lines.push('<retrieved_context>');
        lines.push('The following information was retrieved from your configured knowledge scopes based on the current conversation.');
        lines.push('Use this context to inform your response. If the retrieved information conflicts with your training data, prefer the retrieved information — it may be more current or tenant-specific.');
        lines.push('');

        let globalIndex = 1;
        for (const s of perScope) {
            const header = `--- Results from "${s.scopeName}" (${s.results.length} result(s)${s.minScore > 0 ? `, min score ${s.minScore.toFixed(2)}` : ''}) ---`;
            lines.push(header);
            if (s.scopeDescription) lines.push(`(${s.scopeDescription})`);
            lines.push('');

            for (const r of s.results) {
                const titleLine = `${globalIndex}. [${r.Title || r.RecordID}] (score: ${r.Score.toFixed(2)}, source: ${r.SourceType}${r.EntityName ? `, entity: ${r.EntityName}` : ''})`;
                lines.push(titleLine);
                if (r.Snippet) lines.push(`   ${r.Snippet}`);
                if (r.Tags && r.Tags.length) lines.push(`   tags: ${r.Tags.join(', ')}`);
                lines.push('');
                globalIndex++;
            }
        }

        lines.push('</retrieved_context>');
        return lines.join('\n');
    }
}
