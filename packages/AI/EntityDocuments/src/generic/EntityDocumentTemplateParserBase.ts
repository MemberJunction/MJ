import { CompositeKey, IMetadataProvider, Metadata, UserInfo } from '@memberjunction/core';
import { UUIDsEqual } from '@memberjunction/global';
import { TemplateEngineServer } from '@memberjunction/templates';

/**
 * Abstract base class for entity document template parsing.
 * Use EntityDocumentTemplateParser or a subclass thereof.
 */
export abstract class EntityDocumentTemplateParserBase {
  public static ClearCache(): void {
    EntityDocumentTemplateParserBase.__cache = {};
  }

  public static CreateCacheKey(EntityID: string, EntityRecordPrimaryKey: string, Content: string): string {
    return `${EntityID}___${EntityRecordPrimaryKey}___${Content}`;
  }

  protected static __cache: Record<string, string> = {};
  protected static get _cache(): Record<string, string> {
    return EntityDocumentTemplateParserBase.__cache;
  }

  /** Optional provider override; falls back to Metadata.Provider when not set. */
  protected _provider?: IMetadataProvider;

  /** Allows setting or reading an explicit provider override for testing or isolated execution */
  public get ProviderOverride(): IMetadataProvider | undefined {
    return this._provider;
  }
  public set ProviderOverride(value: IMetadataProvider | undefined) {
    this._provider = value;
  }

  /** Returns the active provider — explicit override if set, otherwise the global default. */
  protected get ProviderToUse(): IMetadataProvider {
    return this._provider ?? Metadata.Provider;
  }

  /**
   * Parses an entity document template and replaces values within ${} placeholders with actual values from the entity record.
   * If template uses Nunjucks {{ }} syntax, it is pre-rendered with the MJ TemplateEngine first.
   *
   * @param Template - the document template to parse
   * @param EntityID - the ID of the entity
   * @param EntityRecord - the values for the entity record (may contain __Parent context)
   * @param ContextUser - the current user
   * @returns the evaluated value of the template incorporating fields, nested contexts, and function call(s)
   */
  public async Parse(
    Template: string,
    EntityID: string,
    EntityRecord: Record<string, unknown>,
    ContextUser: UserInfo
  ): Promise<string> {
    if (!ContextUser) {
      throw new Error('ContextUser is required to parse the template');
    }

    const md = this.ProviderToUse;
    const entityInfo = md.Entities.find((e) => UUIDsEqual(e.ID, EntityID));
    if (!entityInfo) {
      throw new Error(`Entity with ID ${EntityID} not found.`);
    }

    // Pass 1: If template uses Nunjucks {{ }} syntax, pre-render with the MJ TemplateEngine first.
    // This handles conditionals ({% if __Parent %}), filters, and expressions.
    let processedTemplate = Template;
    if (/\{\{.*\}\}/.test(Template) || /\{%.*%\}/.test(Template)) {
      await TemplateEngineServer.Instance.Config(false, ContextUser);
      const renderResult = await TemplateEngineServer.Instance.RenderTemplateSimple(Template, EntityRecord);
      if (renderResult.Success && renderResult.Output) {
        processedTemplate = renderResult.Output;
      }
    }

    const compositeKey = new CompositeKey();
    compositeKey.LoadFromEntityInfoAndRecord(entityInfo, EntityRecord);

    const regex = /\$\{([^{}]+)\}/g;
    const matches = processedTemplate.matchAll(regex);

    // Pass 2: Replace ${} placeholders (variables, dotted paths like __Parent.Field, and function calls)
    const replacements = Array.from(matches).map(async (match) => {
      const content = match[1]; // The captured group from regex
      const cacheKey = EntityDocumentTemplateParserBase.CreateCacheKey(EntityID, compositeKey.ToString(), content);

      if (!EntityDocumentTemplateParserBase._cache[cacheKey]) {
        EntityDocumentTemplateParserBase._cache[cacheKey] = await this.evalSingleArgument(
          content,
          EntityID,
          EntityRecord,
          ContextUser
        );
      }

      return {
        old: match[0],
        new: EntityDocumentTemplateParserBase._cache[cacheKey],
      };
    });

    const resolvedReplacements = await Promise.all(replacements);

    let resolvedTemplate = processedTemplate;
    resolvedReplacements.forEach((replacement) => {
      // Function replacement: the resolved value is field data, so $&/$`/$$ in it must be text rather than splice directives (#3171).
      resolvedTemplate = resolvedTemplate.replace(replacement.old, () => replacement.new);
    });

    return resolvedTemplate;
  }

  /**
   * Evaluates a single placeholder argument: either a function call like Relationship(...) or a field/path reference like Name or __Parent.Title.
   */
  protected async evalSingleArgument(
    argument: string,
    entityID: string,
    entityRecord: Record<string, unknown>,
    ContextUser: UserInfo
  ): Promise<string> {
    const funcMatch = argument.match(/(\w+)\(([^)]*)\)/);
    if (funcMatch) {
      const [, funcName, paramsString] = funcMatch;
      const params = paramsString.split(',').map((param) => {
        param = param.trim();
        if ((param.startsWith('"') && param.endsWith('"')) || (param.startsWith("'") && param.endsWith("'"))) {
          return param.slice(1, -1);
        }
        return param;
      });

      const method = (this as Record<string, unknown>)[funcName];
      if (typeof method === 'function') {
        const result = await (method as (...args: unknown[]) => Promise<string> | string).apply(this, [
          entityID,
          entityRecord,
          ContextUser,
          ...params,
        ]);
        return result ?? '';
      } else {
        throw new Error(`Function ${funcName} is not defined.`);
      }
    } else {
      // Field or property path resolution (supports dotted paths e.g. __Parent.Field, __Parent.__Parent.Field)
      if (argument.includes('.')) {
        let current: unknown = entityRecord;
        const parts = argument.split('.');
        for (const part of parts) {
          if (current !== null && typeof current === 'object' && part in (current as Record<string, unknown>)) {
            current = (current as Record<string, unknown>)[part];
          } else {
            current = undefined;
            break;
          }
        }
        return current !== undefined && current !== null ? String(current) : '';
      }

      const val = entityRecord[argument];
      return val !== undefined && val !== null ? String(val) : '';
    }
  }
}
