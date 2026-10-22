import { createHash } from 'node:crypto';
import { CompositeKey, IMetadataProvider, Metadata, UserInfo } from '@memberjunction/core';
import { UUIDsEqual, UserScopedCacheKey } from '@memberjunction/global';
import { TemplateEngineServer } from '@memberjunction/templates';

/**
 * Abstract base class for entity document template parsing.
 * Use EntityDocumentTemplateParser or a subclass thereof.
 */
export abstract class EntityDocumentTemplateParserBase {
  public static ClearCache(): void {
    EntityDocumentTemplateParserBase.__cache = {};
  }

  /**
   * Builds the key a resolved placeholder is cached under. Placeholders such as `Relationship()` load
   * rows under the caller's permissions, so the key includes the user. It also includes a hash of the
   * record values the placeholder was resolved from: a caller that strips restricted fields from a
   * record must not be served a value resolved earlier from the full record, and a record whose values
   * changed must not be served the old value. Returns null when there is no user ID, in which case the
   * placeholder is resolved without caching.
   *
   * @param RecordValuesHash a hash of the record values, from {@link HashRecordValues}
   */
  public static CreateCacheKey(
    EntityID: string,
    EntityRecordPrimaryKey: string,
    Content: string,
    UserID: string | null | undefined,
    RecordValuesHash: string = ''
  ): string | null {
    return UserScopedCacheKey(UserID, `${EntityID}___${EntityRecordPrimaryKey}___${RecordValuesHash}___${Content}`);
  }

  /**
   * A hash of a record's values (nested objects such as `__Parent` included), independent of key order,
   * so two records with the same values hash alike however they were built.
   */
  public static HashRecordValues(EntityRecord: Record<string, unknown>): string {
    return createHash('sha256').update(stableSerialize(EntityRecord, new WeakSet<object>())).digest('hex');
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
    if (Template.includes('{{') || Template.includes('{%')) {
      await TemplateEngineServer.Instance.Config(false, ContextUser);
      const renderResult = await TemplateEngineServer.Instance.RenderTemplateSimple(Template, EntityRecord, { ContextUser });
      if (renderResult.Success && renderResult.Output) {
        processedTemplate = renderResult.Output;
      }
    }

    const compositeKey = new CompositeKey();
    compositeKey.LoadFromEntityInfoAndRecord(entityInfo, EntityRecord);

    const recordHash = EntityDocumentTemplateParserBase.HashRecordValues(EntityRecord);
    const regex = /\$\{([^{}]+)\}/g;
    const matches = processedTemplate.matchAll(regex);

    // Pass 2: Replace ${} placeholders (variables, dotted paths like __Parent.Field, and function calls)
    const replacements = Array.from(matches).map(async (match) => {
      const content = match[1]; // The captured group from regex
      const cacheKey = EntityDocumentTemplateParserBase.CreateCacheKey(EntityID, compositeKey.ToString(), content, ContextUser.ID, recordHash);
      if (cacheKey === null) {
        return { old: match[0], new: await this.evalSingleArgument(content, EntityID, EntityRecord, ContextUser) };
      }

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
    const funcMatch = argument.match(/^\s*(\w+)\(([^)]*)\)\s*$/);
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

/**
 * Serializes a value with object keys sorted, for {@link EntityDocumentTemplateParserBase.HashRecordValues}.
 * A value already being serialized higher up (a cycle) is written as a marker instead of recursing.
 */
function stableSerialize(value: unknown, seen: WeakSet<object>): string {
  if (value === null || typeof value !== 'object') {
    return typeof value === 'undefined' ? 'u' : `${typeof value}:${String(value)}`;
  }
  if (value instanceof Date) {
    return `date:${Number.isNaN(value.getTime()) ? 'invalid' : value.toISOString()}`;
  }
  if (seen.has(value)) {
    return 'cycle';
  }
  seen.add(value);
  const body = Array.isArray(value)
    ? `[${value.map((item) => stableSerialize(item, seen)).join(',')}]`
    : `{${Object.keys(value)
        .sort()
        .map((key) => `${JSON.stringify(key)}=${stableSerialize((value as Record<string, unknown>)[key], seen)}`)
        .join(',')}}`;
  seen.delete(value);
  return body;
}
