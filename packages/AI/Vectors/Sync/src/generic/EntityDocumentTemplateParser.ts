import { CompositeKey, LogError, LogStatus, Metadata, UserInfo } from "@memberjunction/core";
import { MJGlobal, RegisterClass, UUIDsEqual } from "@memberjunction/global";
import { EntityVectorSyncer } from "../models/entityVectorSync";
import { EntityDocumentTemplateParserBase } from "./EntityDocumenTemplateParserBase";

/**
 * This is the first-level sub-class of EntityDocumentTemplateParserBase. This class is used to parse a string template with variables and functions. 
 * If you wish to override functionality you can subclass it and then use the @RegisterClass decorator to register the sub-class of EntityDocumentTemplateParser with a priority of 1 or above to 
 * then be used instead of the default implementation.
 */
export class EntityDocumentTemplateParser extends EntityDocumentTemplateParserBase {

    /** Convenience method to get an instance of the class and uses the ClassFactory so we can create sub-classes if they are registered with higher priorities than the base class */
    public static CreateInstance(): EntityDocumentTemplateParser {
        return MJGlobal.Instance.ClassFactory.CreateInstance<EntityDocumentTemplateParser>(EntityDocumentTemplateParser);
    }

    /**
     * This function 
     * @param entityID 
     * @param entityRecord 
     * @param relationshipName 
     * @param maxRows 
     * @param entityDocumentName 
     * @returns 
     */
    protected async Relationship(entityID: string, entityRecord: any, ContextUser: UserInfo, relationshipName: string, maxRows: number, entityDocumentName: string): Promise<string> {
        // super inefficient handling to start, we'll optimize this later to call the related stuff in batch
        const md = new Metadata();
        const vectorSyncer: EntityVectorSyncer = new EntityVectorSyncer();
        vectorSyncer.CurrentUser = ContextUser;

        const entityInfo = md.Entities.find(e => UUIDsEqual(e.ID, entityID));    
        if (!entityInfo){
            throw new Error(`Entity with ID ${entityID} not found.`);
        }

        const re = entityInfo.RelatedEntities.find(re => re.RelatedEntity === relationshipName);
        if (!re){
            throw new Error(`Relationship ${relationshipName} not found for entity ${entityInfo.Name}`);
        }

        const obj = await md.GetEntityObject(entityInfo.Name, ContextUser);
        let compositeKey: CompositeKey = new CompositeKey();
        compositeKey.LoadFromEntityInfoAndRecord(entityInfo, entityRecord);
        let loadResult: boolean = await obj.InnerLoad(compositeKey);
        if (!loadResult){
            LogError(`Failed to load entity ${entityInfo.Name} with ID ${compositeKey.ToString()}`);
            return "";
        }

        const reData = await obj.GetRelatedEntityDataExt(re, null, maxRows)

        if (reData && reData.Data) {
            // now, get the entity document info if provided
            if (entityDocumentName && entityDocumentName.trim().length > 0) {
                // we have a document name, attempt to locate it
                const doc = await vectorSyncer.GetEntityDocumentByName(entityDocumentName, ContextUser);
                if (doc) {
                    // we have the document, now we need to parse it and build a result that is the concatenation of all the parsed documents
                    // start off by creating an instance of the parser using CreateInstance() so we're using the highest priority registered subclass
                    const parser = EntityDocumentTemplateParser.CreateInstance();

                    // now we need to batch the requests to the parser to have the right concurrency
                    const batchSize = 10; // Set the batch size to the desired number of concurrent requests
                    const results = [];
                    
                    for (let i = 0; i < reData.Data.length; i += batchSize) {
                        const batchPromises = reData.Data.slice(i, i + batchSize).map(data => {
                            return parser.Parse((doc as any).Template, re.RelatedEntityID, data, ContextUser);
                        });
                        const batchResults = await Promise.all(batchPromises);
                        results.push(...batchResults);
                    }
                    
                    return results.map(r => r + "\n\n").join('');
                }
                else {
                    LogStatus(`Entity Document with name ${entityDocumentName} not found.`);
                    return "";
                }
            }
            else {
                // no entity document name provided, just return the data in a simple format
                return JSON.stringify({ Relationship: relationshipName, Data: reData.Data});
            }
        }
        else {
            return "{ No Data for: " + relationshipName + " }"
        }
    }
}