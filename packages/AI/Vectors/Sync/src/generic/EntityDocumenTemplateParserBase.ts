import { CompositeKey, Metadata, UserInfo } from '@memberjunction/core';
import { UUIDsEqual } from '@memberjunction/global';

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
    if (!ContextUser) {
      throw new Error('ContextUser is required to parse the template');
    }

    const md = new Metadata();
    const entityInfo = md.Entities.find((e) => UUIDsEqual(e.ID, EntityID));
    if (!entityInfo) {
      throw new Error(`Entity with ID ${EntityID} not found.`);
    }

    let compositeKey: CompositeKey = new CompositeKey();
    compositeKey.LoadFromEntityInfoAndRecord(entityInfo, EntityRecord);

    const regex = /\$\{([^{}]+)\}/g;
    const matches = Template.matchAll(regex);

    // Convert matches to an array to handle them asynchronously
    const replacements = Array.from(matches).map(async (match) => {
      const content = match[1]; // The captured group from regex
      const cacheKey = EntityDocumentTemplateParserBase.CreateCacheKey(EntityID, compositeKey.ToString(), content);

      // check the cache and if we don't have an entry in the cache, add it
      if (!EntityDocumentTemplateParserBase._cache[cacheKey]) {
        // Cache miss, evaluate and store the result
        EntityDocumentTemplateParserBase._cache[cacheKey] = await this.evalSingleArgument(content, EntityID, EntityRecord, ContextUser);
      }

      return {
        old: match[0], // The entire placeholder including ${}
        new: EntityDocumentTemplateParserBase._cache[cacheKey], // The replacement value
      };
    });

    // Resolve all promises
    const resolvedReplacements = await Promise.all(replacements);

    // Replace each placeholder in the template with its resolved value
    let resolvedTemplate = Template;
    resolvedReplacements.forEach((replacement) => {
      resolvedTemplate = resolvedTemplate.replace(replacement.old, replacement.new);
    });

    return resolvedTemplate;
  }

  protected async evalSingleArgument(argument: string, entityID: string, entityRecord: any, ContextUser: UserInfo): Promise<string> {
    const funcMatch = argument.match(/(\w+)\(([^)]*)\)/);
    if (funcMatch) {
      const [, funcName, paramsString] = funcMatch;
      const params = paramsString.split(',').map((param) => {
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
      return entityRecord[argument] !== undefined ? entityRecord[argument] : '';
    }
  }
}
