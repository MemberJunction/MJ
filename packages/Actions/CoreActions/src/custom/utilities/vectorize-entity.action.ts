import { ActionResultSimple, RunActionParams, ActionParam } from "@memberjunction/actions-base";
import { BaseAction } from "@memberjunction/actions";

import { RegisterClass } from "@memberjunction/global";
import { EntityVectorSyncer } from "@memberjunction/ai-vector-sync";
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

        LogStatus(`VectorizeEntityAction: Entities to vectorize: ${entityNames.join(', ') || '(all)'} (EntityDocumentType="${entityDocumentType}")`);

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
                const msg = `No active "${entityDocumentType}" Entity Documents found` +
                    `${entityNames.length ? ` for: ${entityNames.join(', ')}` : ''} — nothing to vectorize.`;
                LogStatus(`VectorizeEntityAction: ${msg}`);
                return { Success: true, Message: msg, ResultCode: "NO_DOCUMENTS" };
            }

            const results: ActionResultSimple[] = await Promise.all(entityDocuments.map(async (entityDocument: MJEntityDocumentEntity) => {
                try {
                    await vectorizer.VectorizeEntity({
                        entityID: entityDocument.EntityID,
                        entityDocumentID: entityDocument.ID,
                        listBatchCount: 20,
                        options: {},
                    }, params.ContextUser);

                    return { Success: true, ResultCode: "SUCCESS" };
                }
                catch (error) {
                    const message = error instanceof Error ? error.message : String(error);
                    LogError(`VectorizeEntityAction: failed to vectorize Entity Document "${entityDocument.Name}" (${entityDocument.ID})`, undefined, message);
                    return { Success: false, Message: message, ResultCode: "FAILED" };
                }
            }));

            const allSucceeded = results.every(r => r.Success);
            return {
                Success: allSucceeded,
                Message: results.map(r => r.Message).filter(Boolean).join('\n'),
                ResultCode: allSucceeded ? "SUCCESS" : "FAILED"
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
}