import { Metadata } from "@memberjunction/core";
import { MJGlobal, RegisterClass } from "@memberjunction/global";

/**
 * This is an abstract base class, use the EntityDocumentTemplateParser class or a sub-class thereof.
 */
export abstract class EntityDocumentTemplateParserBase {
    /** Convenience method to get an instance of the class and uses the ClassFactory so we can create sub-classes if they are registered with higher priorities than the base class */
    public static CreateInstance(): EntityDocumentTemplateParserBase {
        return MJGlobal.Instance.ClassFactory.CreateInstance<EntityDocumentTemplateParserBase>(EntityDocumentTemplateParserBase);
    }


    public static ClearCache() {
        EntityDocumentTemplateParserBase.__cache = {};
    }
    public static CreateCacheKey(EntityID: number, EntityRecordPrimaryKey: string, Content: string): string {
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
     * @returns the evaluated value of the template incorporating fields and function call(s), if any.
     */
    public async Parse(Template: string, EntityID: number, EntityRecord: any): Promise<string> {
        const md = new Metadata();
        const entityInfo = md.Entities.find(e => e.ID === EntityID);
        if (!entityInfo) 
            throw new Error(`Entity with ID ${EntityID} not found.`);
        const entityRecordPrimaryKey = entityInfo.PrimaryKeys.map(pk => pk.Name + '|' + EntityRecord[pk.Name]).join('||'); // TODO TO-DO TO DO ----- @Jonathan - replace this with CompositeKey.stringify after you have that done

        const regex = /\$\{([^{}]+)\}/g;
        const matches = Template.matchAll(regex);
        
        // Convert matches to an array to handle them asynchronously
        const replacements = Array.from(matches).map(async match => {
            const content = match[1]; // The captured group from regex
            const cacheKey = EntityDocumentTemplateParserBase.CreateCacheKey(EntityID, entityRecordPrimaryKey, content);
            
            // check the cache and if we don't have an entry in the cache, add it
            if (!EntityDocumentTemplateParserBase._cache[cacheKey]) {
                // Cache miss, evaluate and store the result
                EntityDocumentTemplateParserBase._cache[cacheKey] = await this.evalSingleArgument(content, EntityID, EntityRecord);
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

    protected async evalSingleArgument (argument: string, entityID: number, entityRecord: any): Promise<string> {
        const funcMatch = argument.match(/(\w+)\(([^)]*)\)/);
        if (funcMatch) {
            const [, funcName, paramsString] = funcMatch;
            const params = paramsString.split(',').map(param => param.trim());

            
            // Check if the method exists on this instance
            if (typeof this[funcName] === 'function') {
                // Call the instance method dynamically using its name and spread the params
                return this[funcName](entityID, entityRecord, ...params);
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
    /**
     * This function 
     * @param entityID 
     * @param entityRecord 
     * @param relationshipName 
     * @param maxRows 
     * @param templateName 
     * @returns 
     */
    protected async Relationship(entityID: number, entityRecord: any, relationshipName: string, maxRows: number, templateName: string) {
        // super inefficient handling to start, we'll optimize this later to call the related stuff in batch
        const md = new Metadata();

        const entityInfo = md.Entities.find(e => e.ID === entityID);    
        if (!entityInfo)
            throw new Error(`Entity with ID ${entityID} not found.`);

        const re = entityInfo.RelatedEntities.find(re => re.RelatedEntity === relationshipName);
        if (!re)
            throw new Error(`Relationship ${relationshipName} not found for entity ${entityInfo.Name}`);

        const obj = await md.GetEntityObject(entityInfo.Name);
        await obj.InnerLoad(entityInfo.PrimaryKeys.map(pk => {
            return {
                    FieldName: pk.Name, 
                    Value: entityRecord[pk.Name]
                }
        }));
        const reData = await obj.GetRelatedEntityDataExt(re, null, maxRows)

        if (reData && reData.Data) {
            // temp, just return the data in a simple JSON.stringify call
            // later, replace this by recursively calling for a parser to parse a doc template based on the provide doc tempalte name, if one provided
            return JSON.stringify({ Relationship: relationshipName, Data: reData.Data});
        }
        else {
            return "{ No Data for: " + relationshipName + " }"
        }
    }
}