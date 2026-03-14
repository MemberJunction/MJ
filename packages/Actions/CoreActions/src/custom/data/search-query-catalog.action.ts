import { ActionResultSimple, RunActionParams } from "@memberjunction/actions-base";
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
                    Message: JSON.stringify({
                        message: 'No matching queries found in the catalog',
                        searchText,
                        resultCount: 0,
                        results: []
                    })
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

            return {
                Success: true,
                ResultCode: 'SUCCESS',
                Message: JSON.stringify({
                    message: `Found ${results.length} matching quer${results.length === 1 ? 'y' : 'ies'}`,
                    searchText,
                    resultCount: results.length,
                    results
                }, null, 2)
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
}
