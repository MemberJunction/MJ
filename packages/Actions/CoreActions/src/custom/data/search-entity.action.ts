import { ActionResultSimple, RunActionParams } from "@memberjunction/actions-base";
import { RegisterClass } from "@memberjunction/global";
import { BaseAction } from "@memberjunction/actions";
import { LogError } from "@memberjunction/core";
import type { SearchEntityParams, SearchEntitiesOptions, EntitySearchResult, IRunViewProvider } from "@memberjunction/core";

/**
 * Action wrapper around {@link Metadata.Provider.SearchEntity}: ranked hybrid
 * (lexical + semantic) search over one entity's records, with permission
 * filtering. The classic agent prompt-seeding case — swap a 1500-row entity
 * dump for "here are 10 likely candidates" — is just
 * `SearchEntity({ entityName: 'MJ: Entities', searchText: userText, options: { topK: 10 } })`.
 *
 * ## When to use this Action vs. the others MJ already exposes
 *
 * - **Search Entity** (this action): "Find me the N most relevant *records* of
 *   one entity for this free-text request." Hybrid lexical + semantic ranking,
 *   backed by an `EntityDocument` of type `Search`. Use for agent prompt
 *   seeding, in-app "find a customer/invoice/document" UX.
 * - **Get Entity Details / Get Entity List**: deterministic metadata or row
 *   reads, no ranking. Use when you already know which entity / which records.
 * - **Search Query Catalog** / unified `Search` actions (`@memberjunction/ai-search`):
 *   cross-source search across vectors, full-text, entities, storage — broader
 *   in scope, slower, requires SearchScope configuration. Use when the agent
 *   doesn't know which entity to look in.
 *
 * Returns a JSON payload of `{ count, results: EntitySearchResult[] }` in the
 * action `Message`, plus `Count` and `Results` output params.
 *
 * @example
 * ```typescript
 * await runAction({
 *   ActionName: 'Search Entity',
 *   Params: [
 *     { Name: 'EntityName', Value: 'MJ: Entities' },
 *     { Name: 'SearchText', Value: 'invoices' },
 *     { Name: 'TopK', Value: 10 },
 *     { Name: 'Mode', Value: 'hybrid' }
 *   ]
 * });
 * ```
 */
@RegisterClass(BaseAction, "Search Entity")
export class SearchEntityAction extends BaseAction {

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

            // Always thread the invoking provider through — the action must run
            // against the same metadata layer the caller is bound to (multi-server
            // clients, request-scoped server-side providers). Falling back to the
            // global `new Metadata()` would silently land on the wrong server in
            // multi-provider scenarios. See CLAUDE.md "Don't Reach for the Global
            // Metadata Provider in Per-Provider Code Paths".
            const md = params.Provider as unknown as IRunViewProvider | undefined;
            if (!md) {
                return {
                    Success: false,
                    ResultCode: "MISSING_PROVIDER",
                    Message: "RunActionParams.Provider is required — SearchEntity must run against the caller's metadata provider.",
                };
            }
            const searchParams: SearchEntityParams = { entityName, searchText, options };
            const results: EntitySearchResult[] = await md.SearchEntity(searchParams);

            this.addOutputParam(params, "Count", results.length);
            this.addOutputParam(params, "Results", results);

            return {
                Success: true,
                ResultCode: "SUCCESS",
                Message: JSON.stringify({ count: results.length, results }),
            };
        } catch (error) {
            LogError(`SearchEntityAction failed: ${error instanceof Error ? error.message : String(error)}`);
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
export function LoadSearchEntityAction(): void {
    // intentionally empty
}
