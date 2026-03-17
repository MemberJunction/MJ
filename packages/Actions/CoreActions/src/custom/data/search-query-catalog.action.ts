import { ActionResultSimple, RunActionParams } from "@memberjunction/actions-base";
import { RegisterClass } from "@memberjunction/global";
import { BaseAction } from "@memberjunction/actions";
import { AIEngine } from "@memberjunction/aiengine";
import { QueryEngineServer, QueryEmbeddingMetadata } from "@memberjunction/core-entities-server";
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

            // Ensure QueryEngineServer is loaded (uses cached queries, no DB call if already loaded)
            await QueryEngineServer.Instance.Config(false, params.ContextUser);

            // Build metadata filter from action params
            const metadataFilter = (meta: QueryEmbeddingMetadata): boolean => {
                if (approvedOnly && meta.status !== 'Approved') return false;
                if (reusableOnly && !meta.reusable) return false;
                return true;
            };

            // Search using the persistent vector index
            const matches = await QueryEngineServer.Instance.FindSimilarQueries(
                searchText,
                (text: string) => AIEngine.Instance.EmbedTextLocal(text),
                topK,
                minSimilarity,
                metadataFilter
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

            // Build a plain-text directive — the agent framework wraps action results in
            // JSON.stringify, so plain text avoids double-encoding that buries instructions.
            // Prefer non-parameterized queries for composition (parameterized ones require
            // runtime params and can't be directly composed for aggregate use cases).
            const message = this.buildDirectiveMessage(results);

            return {
                Success: true,
                ResultCode: 'SUCCESS',
                Message: message
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
     * Builds the plain-text directive message from search results.
     * If a composable match >= 0.6 exists, returns Option A/B instructions.
     * Otherwise, tells the LLM to proceed with fresh SQL.
     */
    private buildDirectiveMessage(results: Record<string, unknown>[]): string {
        const bestOverall = results[0];
        const bestComposable = results.find(r =>
            (r.Similarity as number) >= 0.6 && !this.hasTemplateParams(r)
        );
        const recommend = bestComposable || bestOverall;
        const similarity = recommend.Similarity as number;

        if (similarity < 0.6) {
            return `Found ${results.length} queries but no high-confidence composable matches (best: ${Math.round(similarity * 100)}%). Proceed with schema exploration and fresh SQL.`;
        }

        const name = recommend.Name as string;
        const category = recommend.Category as string;
        const categoryPath = category ? `${category}/${name}` : name;
        const queryID = recommend.QueryID as string;
        const sql = recommend.SQL as string | undefined;
        const columns = sql ? this.extractSelectColumns(sql) : '';

        const lines: string[] = [`Found ${results.length} matching queries.`];

        if (bestComposable && bestComposable !== bestOverall) {
            lines.push(`Note: "${bestOverall.Name}" scored highest (${Math.round((bestOverall.Similarity as number) * 100)}%) but is parameterized — not directly composable.`);
            lines.push(`Best composable match: "${name}" (${Math.round(similarity * 100)}% similarity).`);
        } else {
            lines.push(`Best match: "${name}" (${Math.round(similarity * 100)}% similarity).`);
        }

        lines.push(
            '',
            'YOUR NEXT ACTION — pick one:',
            '',
            'Option A — Fully covers the request? Call "Run Stored Query":',
            `  Action: "Run Stored Query"`,
            `  Params: { QueryID: "${queryID}", DataFormat: "json" }`,
            '',
            'Option B — Partially covers? Call "Run Ad-hoc Query" with composition SQL:',
            `  Action: "Run Ad-hoc Query"`,
            `  Params: { Query: "SELECT base.*, <extra columns> FROM {{query:\\"${categoryPath}\\"}} base <extra JOINs> ORDER BY <column>", MaxRows: 100, DataFormat: "json" }`
        );
        if (columns) {
            lines.push(`  The stored query provides these columns: ${columns}`);
        }
        lines.push(
            '  Add only the columns/JOINs the user needs that aren\'t already in the stored query.',
            '',
            'Do NOT call Get Entity Details or write fresh SQL — use one of the options above.',
            '',
            'Top matches:'
        );
        for (const r of results.slice(0, 5)) {
            const sim = Math.round((r.Similarity as number) * 100);
            const paramFlag = this.hasTemplateParams(r) ? ' [parameterized]' : '';
            lines.push(`  - ${r.Name} (${r.Category}) — ${sim}%${paramFlag} — ${r.Description || r.Name}`);
        }

        return lines.join('\n');
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
