import { ActionResultSimple, RunActionParams, ActionParam } from "@memberjunction/actions-base";
import { BaseAction } from "@memberjunction/actions";

import { RegisterClass } from "@memberjunction/global";
import { EntityVectorSyncer, VectorizeEntityResponse } from "@memberjunction/ai-vector-sync";
import { MJEntityDocumentEntity } from "@memberjunction/core-entities";
import { LogStatus, LogError } from "@memberjunction/core";

/**
 * Action that vectorizes entities by creating and storing vector embeddings for entity documents.
 * This action processes one or more entities and their associated documents to generate
 * searchable vector representations for AI-powered semantic search and retrieval.
 * 
 * @example
 * ```typescript
 * // Vectorize a single entity
 * await runAction({
 *   ActionName: 'Vectorize Entity',
 *   Params: [{
 *     Name: 'EntityNames',
 *     Value: 'Customers'
 *   }]
 * });
 * 
 * // Vectorize multiple entities
 * await runAction({
 *   ActionName: 'Vectorize Entity',
 *   Params: [{
 *     Name: 'EntityNames',
 *     Value: ['Customers', 'Orders', 'Products']
 *   }]
 * });
 * ```
 */
@RegisterClass(BaseAction, "__VectorizeEntity")
export class VectorizeEntityAction extends BaseAction {
    /**
     * Executes the vectorization process for specified entities.
     * 
     * @param params - The action parameters containing:
     *   - EntityNames: A string, comma-separated string, or array of entity names to vectorize
     *   - ContextUser: The user context for permissions and logging
     * 
     * @returns A promise resolving to an ActionResultSimple with:
     *   - Success: true if all matched documents were vectorized (or there were none to do)
     *   - Message: Combined messages from all vectorization operations
     *   - ResultCode:
     *       - "SUCCESS" if every matched Entity Document vectorized
     *       - "NO_DOCUMENTS" (Success: true) when no Active documents of the requested
     *         type exist — a benign no-op so unattended jobs (the daily Entity Vector
     *         Sync) don't report a failed run on a fresh/empty DB
     *       - "FAILED" if any document failed, or Config()/lookup threw
     *
     * @throws Never throws - all errors (per-document and top-level) are caught and
     *   returned as a FAILED result.
     */
    protected async InternalRunAction(params: RunActionParams): Promise<ActionResultSimple> {

        const entityNamesParam: ActionParam | undefined = params.Params.find(p => p.Name.trim().toLowerCase() === 'entitynames');
        let entityNames: string[] = [];
        if(entityNamesParam && entityNamesParam.Value){
            if(Array.isArray(entityNamesParam.Value)){
                entityNames = entityNamesParam.Value;
            }
            else if(entityNamesParam.Value.includes(',')){
                entityNames = entityNamesParam.Value.split(',');
            }
            else{
                entityNames = [entityNamesParam.Value];
            }
        }

        // Optional — defaults to 'Record Duplicate' to preserve the action's
        // original behavior. Pass 'Search' to drive the search-tier vector
        // pool used by Provider.SearchEntity (typically from a scheduled job).
        const entityDocumentTypeParam: ActionParam | undefined = params.Params.find(p => p.Name.trim().toLowerCase() === 'entitydocumenttype');
        const entityDocumentType: string = (entityDocumentTypeParam?.Value ? String(entityDocumentTypeParam.Value).trim() : '') || 'Record Duplicate';

        try {
            const vectorizer = new EntityVectorSyncer();
            await vectorizer.Config(false, params.ContextUser);

            const entityDocuments: MJEntityDocumentEntity[] = await vectorizer.GetActiveEntityDocuments(entityNames, entityDocumentType);

            // Nothing to vectorize is a benign no-op for unattended jobs (e.g. the
            // daily Entity Vector Sync on a fresh DB with no Search-type Entity
            // Documents configured yet), NOT a failure. Report success with a
            // distinct result code so operators can tell "nothing to do" apart
            // from "did work" — and so the scheduled-job run isn't flagged failed.
            if (entityDocuments.length === 0) {
                const scope = entityNames.length ? ` for: ${entityNames.join(', ')}` : '';
                const msg = `No active "${entityDocumentType}" Entity Documents found${scope} — nothing to vectorize.`;
                LogStatus(`   ${msg}`);
                return { Success: true, Message: msg, ResultCode: "NO_DOCUMENTS" };
            }

            // Header line (regular mode). Per-page / per-pipeline detail is emitted by the
            // EntityVectorSyncer under verbose logging (MJ_VERBOSE), entity-prefixed so the
            // concurrent pipelines stay attributable.
            LogStatus(`   Vectorizing ${entityDocuments.length} "${entityDocumentType}" Entity Document${entityDocuments.length === 1 ? '' : 's'}…`);

            const docResults = await Promise.all(entityDocuments.map(async (entityDocument: MJEntityDocumentEntity) => {
                try {
                    const response: VectorizeEntityResponse = await vectorizer.VectorizeEntity({
                        entityID: entityDocument.EntityID,
                        entityDocumentID: entityDocument.ID,
                        listBatchCount: 20,
                        options: {},
                    }, params.ContextUser);
                    return { name: entityDocument.Name, response, error: undefined as string | undefined };
                }
                catch (error) {
                    const message = error instanceof Error ? error.message : String(error);
                    LogError(`VectorizeEntityAction: failed to vectorize Entity Document "${entityDocument.Name}" (${entityDocument.ID})`, undefined, message);
                    return { name: entityDocument.Name, response: undefined, error: message };
                }
            }));

            const summary = this.summarizeAndLog(docResults);
            return {
                Success: summary.allSucceeded,
                Message: summary.message,
                ResultCode: summary.allSucceeded ? "SUCCESS" : "FAILED"
            };
        }
        catch (error) {
            // Config()/GetActiveEntityDocuments() failures (DB, misconfiguration)
            // surface here as a legible FAILED result instead of an uncaught throw.
            const message = error instanceof Error ? error.message : String(error);
            LogError(`VectorizeEntityAction: unexpected error`, undefined, message);
            return { Success: false, Message: message, ResultCode: "FAILED" };
        }
    }

    /**
     * Renders the concise, aligned per-document summary (regular mode) and computes the
     * aggregate result. One `✓`/`✗` line per Entity Document with `processed/total` counts
     * and duration, then a totals line. Returns the overall success flag and a combined
     * error message for the ActionResult.
     */
    private summarizeAndLog(
        docResults: Array<{ name: string; response?: VectorizeEntityResponse; error?: string }>
    ): { allSucceeded: boolean; message: string } {
        const nameWidth = Math.max(...docResults.map(d => d.name.length));
        let totalProcessed = 0;
        let totalErrors = 0;
        let allSucceeded = true;
        const errorMessages: string[] = [];

        for (const d of docResults) {
            const name = d.name.padEnd(nameWidth);
            if (d.error) {
                allSucceeded = false;
                totalErrors++;
                errorMessages.push(`${d.name}: ${d.error}`);
                LogStatus(`   ✗ ${name}  ${d.error}`);
                continue;
            }
            const r = d.response!;
            totalProcessed += r.processedRecords ?? 0;
            totalErrors += r.errorCount ?? 0;
            if (!r.success) {
                allSucceeded = false;
                if (r.errorMessage) errorMessages.push(`${d.name}: ${r.errorMessage}`);
            }
            const secs = ((r.elapsedMs ?? 0) / 1000).toFixed(1);
            const counts = `${r.processedRecords ?? 0}/${r.totalRecords ?? 0}`.padEnd(11);
            const errSuffix = (r.errorCount ?? 0) > 0 ? `  ${r.errorCount} error(s)` : '';
            LogStatus(`   ${r.success ? '✓' : '✗'} ${name}  ${counts} ${secs.padStart(5)}s${errSuffix}`);
        }

        LogStatus(
            `   ${allSucceeded ? '✓' : '⚠'} ${totalProcessed.toLocaleString()} record(s) vectorized across ` +
            `${docResults.length} document(s)${totalErrors ? `, ${totalErrors} error(s)` : ''}`
        );

        return { allSucceeded, message: errorMessages.join('\n') };
    }
}