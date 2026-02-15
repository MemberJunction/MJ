import { ActionResultSimple, RunActionParams, ActionParam } from "@memberjunction/actions-base";
import { BaseAction } from "@memberjunction/actions";

import { RegisterClass } from "@memberjunction/global";
import { EntityVectorSyncer } from "@memberjunction/ai-vector-sync";
import { MJEntityDocumentEntity } from "@memberjunction/core-entities";
import { LogStatus } from "@memberjunction/core";

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
     *   - Success: true if all entities were vectorized successfully
     *   - Message: Combined messages from all vectorization operations
     *   - ResultCode: "SUCCESS" if all succeeded, "FAILED" if any failed
     * 
     * @throws Never throws directly - all errors are caught and returned in the result
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

        LogStatus(`VectorizeEntityAction: Entities to vectorize: ${entityNames.join(', ')}`);
        let vectorizer = new EntityVectorSyncer();
        await vectorizer.Config(false, params.ContextUser);

        const entityDocuments: MJEntityDocumentEntity[] = await vectorizer.GetActiveEntityDocuments(entityNames);
        let results: ActionResultSimple[] = await Promise.all(entityDocuments.map(async (entityDocument: MJEntityDocumentEntity) => {
            try{
                await vectorizer.VectorizeEntity({
                    entityID: entityDocument.EntityID,
                    entityDocumentID: entityDocument.ID,
                    listBatchCount: 20,
                    options: {},
                }, params.ContextUser);
    
                return {
                    Success: true,
                    ResultCode: "SUCCESS"            
                };
            }
            catch(error){
                return {
                    Success: false,
                    Message: error as any,
                    ResultCode: "FAILED"            
                };
            }
        }));

        return {
            Success: results.every(r => r.Success),
            Message: results.map(r => r.Message).join('\n'),
            ResultCode: results.every(r => r.Success) ? "SUCCESS" : "FAILED"            
        };
    }
}