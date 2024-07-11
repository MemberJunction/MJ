import { CompositeKey, LogError, LogStatus, Metadata, UserInfo } from "@memberjunction/core";
import { MJGlobal, RegisterClass } from "@memberjunction/global";
import { EntityVectorSyncer } from "../models/entityVectorSync";

/**
 * This is an abstract base class, use the EntityDocumentTemplateParser class or a sub-class thereof.
 */
export abstract class EntityDocumentTemplateParserBase {
    public static ClearCache() {
        EntityDocumentTemplateParserBase.__cache = {};
    }
    public static CreateCacheKey(EntityID: string, EntityRecordPrimaryKey: string, Content: string): string {
        return `${EntityID}___${EntityRecordPrimaryKey}___${Content}`;
    } 

    protected static __cache: { [key: string]: string } = {};
    protected static get _cache(): { [key: string]: string } { 
        return EntityDocumentTemplateParserBase.__cache;
    }

    /**
     * This method will parse an entity document template and replace values within ${} placeholders with actual values from the entity record. In the case of function calls
     * within the placeholders, the functions object must be provided to parse the function calls.
     * @param Template - the document template to parse
     * @param EntityID - the ID of the entity
     * @param EntityRecord - the values for the entity record
     * @param ContextUser - the current user
     * @returns the evaluated value of the template incorporating fields and function call(s), if any.
     */
    public async Parse(Template: string, EntityID: string, EntityRecord: any, ContextUser: UserInfo): Promise<string> {

        if(!ContextUser){
            throw new Error('ContextUser is required to parse the template');
        }

        const md = new Metadata();
        const entityInfo = md.Entities.find(e => e.ID === EntityID);
        if (!entityInfo){
            throw new Error(`Entity with ID ${EntityID} not found.`);
        }

        let compositeKey: CompositeKey = new CompositeKey();
        compositeKey.LoadFromEntityInfoAndRecord(entityInfo, EntityRecord);

        const regex = /\$\{([^{}]+)\}/g;
        const matches = Template.matchAll(regex);
        
        // Convert matches to an array to handle them asynchronously
        const replacements = Array.from(matches).map(async match => {
            const content = match[1]; // The captured group from regex
            const cacheKey = EntityDocumentTemplateParserBase.CreateCacheKey(EntityID, compositeKey.ToString(), content);
            
            // check the cache and if we don't have an entry in the cache, add it
            if (!EntityDocumentTemplateParserBase._cache[cacheKey]) {
                // Cache miss, evaluate and store the result
                EntityDocumentTemplateParserBase._cache[cacheKey] = await this.evalSingleArgument(content, EntityID, EntityRecord, ContextUser);
            }

            return {
                old: match[0], // The entire placeholder including ${}
                new: EntityDocumentTemplateParserBase._cache[cacheKey] // The replacement value
            };
        });

        // Resolve all promises
        const resolvedReplacements = await Promise.all(replacements);

        // Replace each placeholder in the template with its resolved value
        let resolvedTemplate = Template;
        resolvedReplacements.forEach(replacement => {
            resolvedTemplate = resolvedTemplate.replace(replacement.old, replacement.new);
        });

        return resolvedTemplate;
    }

    protected async evalSingleArgument (argument: string, entityID: string, entityRecord: any, ContextUser: UserInfo): Promise<string> {
        const funcMatch = argument.match(/(\w+)\(([^)]*)\)/);
        if (funcMatch) {
            const [, funcName, paramsString] = funcMatch;
            const params = paramsString.split(',').map(param => {
                param = param.trim();
                //if the string is wrapped in single or double quotes, remove them
                if (param.startsWith('"') && param.endsWith('"')) {
                    return param.slice(1, -1);
                } else if (param.startsWith("'") && param.endsWith("'")) {
                    return param.slice(1, -1);
                } else {
                    return param; 
                }
            });

            
            // Check if the method exists on this instance
            if (typeof this[funcName] === 'function') {
                // Call the instance method dynamically using its name and spread the params
                return this[funcName](entityID, entityRecord, ContextUser, ...params);
            } else {
                throw new Error(`Function ${funcName} is not defined.`);
            }
        } else {
            // not a function match, attempt to return the value from the entity record
            return entityRecord[argument] !== undefined ? entityRecord[argument] : "";
        }
    };
}

/**
 * This is the first-level sub-class of EntityDocumentTemplateParserBase. This class is used to parse a string template with variables and functions. 
 * If you wish to override functionality you can subclass it and then use the @RegisterClass decorator to register the sub-class of EntityDocumentTemplateParser with a priority of 1 or above to 
 * then be used instead of the default implementation.
 */
@RegisterClass(EntityDocumentTemplateParser)
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

        const entityInfo = md.Entities.find(e => e.ID === entityID);    
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
                            return parser.Parse("", re.RelatedEntityID, data, ContextUser);
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