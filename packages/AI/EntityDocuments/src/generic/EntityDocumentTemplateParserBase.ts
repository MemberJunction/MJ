import { createHash } from 'node:crypto';
import { CompositeKey, IMetadataProvider, Metadata, UserInfo } from '@memberjunction/core';
import { UUIDsEqual, UserScopedCacheKey } from '@memberjunction/global';
import { TemplateEngineServer } from '@memberjunction/templates';

/**
 * Abstract base class for entity document template parsing.
 * Use EntityDocumentTemplateParser or a subclass thereof.
 */
export abstract class EntityDocumentTemplateParserBase {
  /**
   * The most resolved placeholders kept at once. Every record version adds entries (the key includes a
   * hash of the record values), so the least recently used entry is evicted once the cache is full.
   */
  public static readonly MaxCachedPlaceholders = 10_000;

  public static ClearCache(): void {
    EntityDocumentTemplateParserBase.__cache.clear();
  }

  /** The number of resolved placeholders currently cached. */
  public static get CachedPlaceholderCount(): number {
    return EntityDocumentTemplateParserBase.__cache.size;
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

  /** Resolved placeholders by cache key, in least-recently-used-first order. */
  protected static __cache: Map<string, string> = new Map<string, string>();

  /** Returns a cached placeholder value and marks it most recently used, or undefined on a miss. */
  protected static getCachedPlaceholder(cacheKey: string): string | undefined {
    const cache = EntityDocumentTemplateParserBase.__cache;
    const value = cache.get(cacheKey);
    if (value !== undefined) {
      cache.delete(cacheKey);
      cache.set(cacheKey, value);
    }
    return value;
  }

  /** Caches a placeholder value, evicting the least recently used entries beyond {@link MaxCachedPlaceholders}. */
  protected static setCachedPlaceholder(cacheKey: string, value: string): void {
    const cache = EntityDocumentTemplateParserBase.__cache;
    cache.delete(cacheKey);
    cache.set(cacheKey, value);
    while (cache.size > EntityDocumentTemplateParserBase.MaxCachedPlaceholders) {
      const oldest = cache.keys().next().value;
      if (oldest === undefined) {
        break;
      }
      cache.delete(oldest);
    }
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

      let resolved = EntityDocumentTemplateParserBase.getCachedPlaceholder(cacheKey);
      if (resolved === undefined) {
        resolved = await this.evalSingleArgument(content, EntityID, EntityRecord, ContextUser);
        EntityDocumentTemplateParserBase.setCachedPlaceholder(cacheKey, resolved);
      }

      return { old: match[0], new: resolved };
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
 * Strings are JSON-quoted, so no string value can spell out the separators of another record shape.
 * A value already being serialized higher up (a cycle) is written as a marker instead of recursing.
 */
function stableSerialize(value: unknown, seen: WeakSet<object>): string {
  if (typeof value === 'string') {
    return `string:${JSON.stringify(value)}`;
  }
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
