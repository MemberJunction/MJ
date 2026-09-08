import { ActionResultSimple, AIDirective, RunActionParams } from "@memberjunction/actions-base";
import { RegisterClass, NormalizeUUID } from "@memberjunction/global";
import { BaseAction } from "@memberjunction/actions";
import { QueryEngineServer } from "@memberjunction/core-entities-server";
import { MJQueryEntity } from "@memberjunction/core-entities";
import { LogError } from "@memberjunction/core";
import { runSemanticEntitySearch } from "../ai/semantic-entity-search.helper";

/**
 * Action that searches the saved query catalog using semantic search.
 * Takes a natural language description of what data is needed and returns ranked
 * matching queries with similarity scores.
 *
 * Ranking is delegated to the unified `Provider.SearchEntity` pipeline (semantic
 * mode, backed by the daily-synced "Queries Search" EntityDocument) instead of
 * the bespoke `QueryEngineServer.FindSimilarQueries` vector index. Matched query
 * metadata is hydrated from QueryEngine's cache to preserve the existing ranked
 * output + AI directive guidance.
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

            // Rank via the unified SearchEntity pipeline (over-fetch to allow status/reusable filtering)
            const search = await runSemanticEntitySearch(
                params,
                'MJ: Queries',
                searchText,
                Math.max(topK * 3, 30),
                minSimilarity
            );
            if (!search.ok) {
                return { Success: false, ResultCode: search.resultCode ?? 'SEARCH_FAILED', Message: search.message ?? 'Semantic search failed' };
            }

            // Ensure QueryEngineServer is loaded (uses cached queries, no DB call if already loaded)
            await QueryEngineServer.Instance.Config(false, params.ContextUser);
            const queriesById = new Map<string, MJQueryEntity>();
            for (const q of QueryEngineServer.Instance.Queries) {
                queriesById.set(NormalizeUUID(q.ID), q);
            }

            // Hydrate + filter, preserving the search rank order
            const results: Record<string, unknown>[] = [];
            for (const r of search.results) {
                const q = queriesById.get(NormalizeUUID(r.recordId));
                if (!q) continue;
                if (approvedOnly && q.Status !== 'Approved') continue;
                if (reusableOnly && !q.Reusable) continue;

                const result: Record<string, unknown> = {
                    QueryID: q.ID,
                    Name: q.Name,
                    Description: q.Description,
                    Category: q.Category,
                    Similarity: Math.round(r.score * 100) / 100,
                    Status: q.Status,
                    Reusable: q.Reusable,
                    UserQuestion: q.UserQuestion
                };
                if (includeSQL) {
                    result.SQL = q.SQL;
                }
                results.push(result);
                if (results.length >= topK) break;
            }

            if (results.length === 0) {
                return {
                    Success: true,
                    ResultCode: 'NO_MATCHES',
                    Message: `No matching queries found in the catalog for: "${searchText}". Proceed with schema exploration and fresh SQL.`
                };
            }

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

            // Build the full message (preserved for backward compatibility) and
            // structured AI directives for the agent framework.
            const { message, directives } = this.buildDirectiveMessage(results);

            return {
                Success: true,
                ResultCode: 'SUCCESS',
                Message: message,
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
     * Builds the original full-text message (preserved for backward compatibility)
     * and structured AI directives for the agent framework.
     */
    private buildDirectiveMessage(results: Record<string, unknown>[]): { message: string; directives: AIDirective[] } {
        const bestOverall = results[0];
        const bestComposable = results.find(r =>
            (r.Similarity as number) >= 0.6 && !this.hasTemplateParams(r)
        );
        const recommend = bestComposable || bestOverall;
        const similarity = recommend.Similarity as number;

        if (similarity < 0.6) {
            return {
                message: `Found ${results.length} queries but no high-confidence composable matches (best: ${Math.round(similarity * 100)}%). Proceed with schema exploration and fresh SQL.`,
                directives: []
            };
        }

        const name = recommend.Name as string;
        const category = recommend.Category as string;
        const categoryPath = category ? `${category}/${name}` : name;
        const queryID = recommend.QueryID as string;
        const sql = recommend.SQL as string | undefined;
        const columns = sql ? this.extractSelectColumns(sql) : '';

        // Build the full message matching the original format
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
            message: lines.join('\n'),
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
