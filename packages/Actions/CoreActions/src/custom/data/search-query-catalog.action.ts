import { ActionResultSimple, AIDirective, RunActionParams } from "@memberjunction/actions-base";
import { RegisterClass } from "@memberjunction/global";
import { BaseAction } from "@memberjunction/actions";
import { AIEngine } from "@memberjunction/aiengine";
import { QueryEmbeddingService } from "@memberjunction/aiengine";
import { LogError } from "@memberjunction/core";

/**
 * Action that searches the saved query catalog using vector-based semantic search.
 * Takes a natural language description of what data is needed and returns ranked
 * matching queries with similarity scores.
 *
 * This replaces the previous approach of loading the full query catalog into agent
 * context (Option A) with a scalable vector search (Option B).
 *
 * @example
 * ```typescript
 * await runAction({
 *   ActionName: 'Search Query Catalog',
 *   Params: [{
 *     Name: 'SearchText',
 *     Value: 'monthly revenue breakdown by region'
 *   }, {
 *     Name: 'TopK',
 *     Value: 10
 *   }]
 * });
 * ```
 */
@RegisterClass(BaseAction, "Search Query Catalog")
export class SearchQueryCatalogAction extends BaseAction {
    protected async InternalRunAction(params: RunActionParams): Promise<ActionResultSimple> {
        try {
            // Extract parameters
            const searchText = this.getParamValue(params, 'searchtext');
            const topK = parseInt(this.getParamValue(params, 'topk') || '10');
            const minSimilarity = parseFloat(this.getParamValue(params, 'minsimilarity') || '0.3');
            const reusableOnly = this.getBooleanParam(params, 'reusableonly', false);
            const approvedOnly = this.getBooleanParam(params, 'approvedonly', true);
            const includeSQL = this.getBooleanParam(params, 'includesql', false);

            // Validate required input
            if (!searchText || searchText.trim().length === 0) {
                return {
                    Success: false,
                    ResultCode: 'MISSING_PARAMETER',
                    Message: 'SearchText parameter is required and cannot be empty'
                };
            }

            if (!params.ContextUser) {
                return {
                    Success: false,
                    ResultCode: 'MISSING_USER_CONTEXT',
                    Message: 'User context required'
                };
            }

            // Ensure AIEngine is loaded for embedding generation
            await AIEngine.Instance.Config(false, params.ContextUser);

            // Build SQL filter for query loading
            const filters: string[] = [];
            if (approvedOnly) filters.push("Status = 'Approved'");
            if (reusableOnly) filters.push("Reusable = 1");
            const filter = filters.length > 0 ? filters.join(' AND ') : undefined;

            // Load pre-computed embeddings from DB
            const vectorService = await QueryEmbeddingService.LoadQueryEmbeddings(
                params.ContextUser,
                filter
            );

            // Search for similar queries
            const matches = await QueryEmbeddingService.FindSimilarQueries(
                vectorService,
                searchText,
                (text) => AIEngine.Instance.EmbedTextLocal(text),
                topK,
                minSimilarity
            );

            if (matches.length === 0) {
                return {
                    Success: true,
                    ResultCode: 'NO_MATCHES',
                    Message: `No matching queries found in the catalog for: "${searchText}". Proceed with schema exploration and fresh SQL.`
                };
            }

            // Format results, optionally excluding SQL
            const results = matches.map(m => {
                const result: Record<string, unknown> = {
                    QueryID: m.queryId,
                    Name: m.queryName,
                    Description: m.description,
                    Category: m.category,
                    Similarity: Math.round(m.similarityScore * 100) / 100,
                    Status: m.status,
                    Reusable: m.reusable,
                    UserQuestion: m.userQuestion
                };
                if (includeSQL) {
                    result.SQL = m.sql;
                }
                return result;
            });

            // Set output parameters
            params.Params.push({
                Name: 'Results',
                Type: 'Output',
                Value: results
            });
            params.Params.push({
                Name: 'ResultCount',
                Type: 'Output',
                Value: results.length
            });

            // Build directive content — instructions the AI should follow to pick the
            // right query execution path (run stored vs compose ad-hoc SQL).
            const { summary, directives } = this.buildDirectiveMessage(results);

            return {
                Success: true,
                ResultCode: 'SUCCESS',
                Message: summary,
                AIDirectives: directives.length > 0 ? directives : undefined
            };

        } catch (error) {
            LogError(`SearchQueryCatalogAction error: ${error instanceof Error ? error.message : String(error)}`);
            return {
                Success: false,
                ResultCode: 'EMBEDDING_FAILED',
                Message: `Failed to search query catalog: ${error instanceof Error ? error.message : String(error)}`
            };
        }
    }

    private getBooleanParam(params: RunActionParams, name: string, defaultValue: boolean): boolean {
        const value = this.getParamValue(params, name);
        if (value === undefined || value === null) return defaultValue;
        if (typeof value === 'boolean') return value;
        if (typeof value === 'string') {
            return value.toLowerCase() === 'true';
        }
        return defaultValue;
    }

    private getParamValue(params: RunActionParams, name: string): string | undefined {
        const param = params.Params.find(p => p.Name.toLowerCase() === name.toLowerCase());
        return param?.Value !== undefined && param?.Value !== null ? String(param.Value) : undefined;
    }

    /**
     * Builds an informational summary and, when a high-confidence composable match
     * exists, structured AI directives telling the agent which action to call next.
     */
    private buildDirectiveMessage(results: Record<string, unknown>[]): { summary: string; directives: AIDirective[] } {
        const bestOverall = results[0];
        const bestComposable = results.find(r =>
            (r.Similarity as number) >= 0.6 && !this.hasTemplateParams(r)
        );
        const recommend = bestComposable || bestOverall;
        const similarity = recommend.Similarity as number;

        if (similarity < 0.6) {
            return {
                summary: `Found ${results.length} queries but no high-confidence composable matches (best: ${Math.round(similarity * 100)}%). Proceed with schema exploration and fresh SQL.`,
                directives: []
            };
        }

        const name = recommend.Name as string;
        const category = recommend.Category as string;
        const categoryPath = category ? `${category}/${name}` : name;
        const queryID = recommend.QueryID as string;
        const sql = recommend.SQL as string | undefined;
        const columns = sql ? this.extractSelectColumns(sql) : '';

        // Informational summary for the action result JSON
        const summaryParts: string[] = [`Found ${results.length} matching queries.`];
        if (bestComposable && bestComposable !== bestOverall) {
            summaryParts.push(`Note: "${bestOverall.Name}" scored highest (${Math.round((bestOverall.Similarity as number) * 100)}%) but is parameterized — not directly composable.`);
            summaryParts.push(`Best composable match: "${name}" (${Math.round(similarity * 100)}% similarity).`);
        } else {
            summaryParts.push(`Best match: "${name}" (${Math.round(similarity * 100)}% similarity).`);
        }
        summaryParts.push('', 'Top matches:');
        for (const r of results.slice(0, 5)) {
            const sim = Math.round((r.Similarity as number) * 100);
            const paramFlag = this.hasTemplateParams(r) ? ' [parameterized]' : '';
            summaryParts.push(`  - ${r.Name} (${r.Category}) — ${sim}%${paramFlag} — ${r.Description || r.Name}`);
        }

        // Structured AI directives — surfaced by the agent framework
        const directives: AIDirective[] = [
            {
                Message: `YOUR NEXT ACTION — pick one:\n\nOption A — Fully covers the request? Call "Run Stored Query":\n  Action: "Run Stored Query"\n  Params: { QueryID: "${queryID}", DataFormat: "json" }\n\nOption B — Partially covers? Call "Run Ad-hoc Query" with composition SQL:\n  Action: "Run Ad-hoc Query"\n  Params: { Query: "SELECT base.*, <extra columns> FROM {{query:\\"${categoryPath}\\"}} base <extra JOINs> ORDER BY <column>", MaxRows: 100, DataFormat: "json" }`,
                Type: 'instruction',
                Priority: 'high'
            },
            {
                Message: 'Do NOT call Get Entity Details or write fresh SQL — use one of the options above.',
                Type: 'constraint',
                Priority: 'critical'
            }
        ];

        if (columns) {
            directives.push({
                Message: `The stored query provides these columns: ${columns}. Add only the columns/JOINs the user needs that aren't already in the stored query.`,
                Type: 'context',
                Priority: 'medium'
            });
        }

        return {
            summary: summaryParts.join('\n'),
            directives
        };
    }

    /** Extracts column aliases from the SELECT portion of SQL (before FROM). */
    private extractSelectColumns(sql: string): string {
        const fromIndex = sql.search(/\bFROM\b/i);
        const selectPart = fromIndex > 0 ? sql.substring(0, fromIndex) : sql;
        return [...selectPart.matchAll(/\bAS\s+(\w+)/gi)].map(m => m[1]).join(', ');
    }

    /** Checks if a query's SQL contains Nunjucks template params ({{ }}) but not composition macros. */
    private hasTemplateParams(result: Record<string, unknown>): boolean {
        const sql = result.SQL as string | undefined;
        return sql ? /\{\{(?!query:)/.test(sql) : false;
    }
}
