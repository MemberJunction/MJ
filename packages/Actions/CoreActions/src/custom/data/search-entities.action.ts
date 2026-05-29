import { ActionResultSimple, RunActionParams } from "@memberjunction/actions-base";
import { RegisterClass } from "@memberjunction/global";
import { BaseAction } from "@memberjunction/actions";
import { Metadata, LogError } from "@memberjunction/core";
import type { SearchEntitiesOptions, EntitySearchResult } from "@memberjunction/core";

/**
 * Action that runs a ranked search across one entity's records using lexical,
 * semantic, or hybrid (weighted-RRF) ranking. Backed by `EntityDocument`-style
 * semantic search where configured, with permission filtering applied.
 *
 * **Use this action when** an AI agent or workflow needs to find "the most
 * relevant records in entity X for the user's request" without paginating
 * through the full table. The classic agent prompt-seeding case — swap a
 * 1500-row entity dump for "here are 10 likely candidates" — is just
 * `SearchEntities('MJ: Entities', userText, { topK: 10 })`.
 *
 * Returns a JSON payload of `{ count, results: EntitySearchResult[] }` in
 * the action `Message`, where each result includes the recordId, score,
 * matchType, and per-list component scores.
 *
 * @example
 * ```typescript
 * await runAction({
 *   ActionName: 'Search Entities',
 *   Params: [
 *     { Name: 'EntityName', Value: 'MJ: Entities' },
 *     { Name: 'SearchText', Value: 'invoices' },
 *     { Name: 'TopK', Value: 10 },
 *     { Name: 'Mode', Value: 'hybrid' }
 *   ]
 * });
 * ```
 */
@RegisterClass(BaseAction, "Search Entities")
export class SearchEntitiesAction extends BaseAction {

    protected async InternalRunAction(params: RunActionParams): Promise<ActionResultSimple> {
        try {
            const entityName = this.getStringParam(params, "EntityName");
            const searchText = this.getStringParam(params, "SearchText");
            if (!entityName) {
                return { Success: false, ResultCode: "MISSING_PARAMETER", Message: "Parameter 'EntityName' is required" };
            }
            if (!searchText) {
                return { Success: false, ResultCode: "MISSING_PARAMETER", Message: "Parameter 'SearchText' is required" };
            }

            const mode = this.getStringParam(params, "Mode")?.toLowerCase();
            const validModes = ['lexical', 'semantic', 'hybrid'];
            if (mode && !validModes.includes(mode)) {
                return {
                    Success: false,
                    ResultCode: "INVALID_PARAMETER",
                    Message: `Mode must be one of: ${validModes.join(', ')}`,
                };
            }

            const options: SearchEntitiesOptions = {
                mode: (mode as SearchEntitiesOptions['mode']) ?? 'hybrid',
                topK: this.getNumericParam(params, "TopK", 10),
                minScore: this.getNumericParam(params, "MinScore", 0),
                rrfK: this.getNumericParam(params, "RRFK", 60),
                weights: {
                    lexical: this.getNumericParam(params, "LexicalWeight", 1.0),
                    semantic: this.getNumericParam(params, "SemanticWeight", 1.0),
                },
                entityDocumentId: this.getStringParam(params, "EntityDocumentID"),
                contextUser: params.ContextUser,
            };

            const md = params.Provider ?? new Metadata();
            const results: EntitySearchResult[] = await md.SearchEntities(entityName, searchText, options);

            this.addOutputParam(params, "Count", results.length);
            this.addOutputParam(params, "Results", results);

            return {
                Success: true,
                ResultCode: "SUCCESS",
                Message: JSON.stringify({ count: results.length, results }),
            };
        } catch (error) {
            LogError(`SearchEntitiesAction failed: ${error instanceof Error ? error.message : String(error)}`);
            return {
                Success: false,
                ResultCode: "UNEXPECTED_ERROR",
                Message: error instanceof Error ? error.message : String(error),
            };
        }
    }

    private getStringParam(params: RunActionParams, name: string): string | undefined {
        const p = params.Params.find(x => x.Name.trim().toLowerCase() === name.toLowerCase());
        if (!p || p.Value == null) return undefined;
        const v = String(p.Value).trim();
        return v.length > 0 ? v : undefined;
    }

    private getNumericParam(params: RunActionParams, name: string, defaultValue: number): number {
        const p = params.Params.find(x => x.Name.trim().toLowerCase() === name.toLowerCase());
        if (!p || p.Value == null) return defaultValue;
        const n = Number(p.Value);
        return Number.isFinite(n) ? n : defaultValue;
    }

    private addOutputParam(params: RunActionParams, name: string, value: unknown): void {
        params.Params.push({ Name: name, Type: "Output", Value: value });
    }
}

/** Tree-shaking prevention export — called from the package's barrel to keep
 *  the class registration alive under aggressive bundlers. */
export function LoadSearchEntitiesAction(): void {
    // intentionally empty
}
