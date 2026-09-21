/**
 * MJ's own rows for a foreign-key dropdown — the behaviour every field gets when no
 * {@link FKLookupStrategy} is registered for it.
 *
 * What this replaces: one `RunView` with `[<name>] LIKE '%<typed>%'`, no `OrderBy`, twenty rows.
 * On a large related entity that is twenty arbitrary records containing the letters typed, with
 * `%` and `_` acting as live wildcards.
 */

import {
  RunView,
  type EntityInfo,
  type EntitySearchResult,
  type IMetadataProvider,
  type SearchEntityParams,
} from '@memberjunction/core';
import {
  FKLookupStrategy,
  type FKLookupContext,
  type FKLookupGroup,
  type FKLookupRow,
  type FKLookupScope,
  type FKLookupScopeLabels,
} from './fk-lookup-strategy';
import { EscapeSqlLikeValue, QuoteSqlIdList, RankByPrefix } from './fk-search-utils';

/**
 * A provider that can rank records through the platform search API. `SearchEntity` lives on
 * `IRunViewProvider`, which every shipped provider implements alongside `IMetadataProvider` —
 * but the field only ever holds the metadata half, so narrow before using it.
 */
type SearchCapableProvider = IMetadataProvider & {
  SearchEntity(params: SearchEntityParams): Promise<EntitySearchResult[]>;
};

/** The provider as a search source, or null when this one cannot rank records. */
function asSearchSource(provider: IMetadataProvider): SearchCapableProvider | null {
  const candidate = provider as SearchCapableProvider;
  return typeof candidate.SearchEntity === 'function' ? candidate : null;
}

/** True when the related entity has a `Status` field whose value list includes Active. */
export function HasActiveStatus(entity: EntityInfo): boolean {
  const status = entity.Fields.find(f => f.Name.toLowerCase() === 'status');
  return !!status && status.EntityFieldValues.some(v => String(v.Value).toLowerCase() === 'active');
}

/**
 * `[Status] = 'Active'` in the primary scope of an entity that has an active status, so the
 * dropdown does not offer records nobody should be linking to any more. Empty otherwise.
 */
export function BuildStatusFilter(entity: EntityInfo, scope: FKLookupScope): string {
  return scope === 'primary' && HasActiveStatus(entity) ? `[Status] = 'Active'` : '';
}

/** AND-join the non-empty fragments, each parenthesized so precedence survives. */
export function CombineFilters(...parts: ReadonlyArray<string | null | undefined>): string {
  return parts
    .map(p => (p ?? '').trim())
    .filter(p => p.length > 0)
    .map(p => `(${p})`)
    .join(' AND ');
}

/** `LIKE` pattern for one field, honouring the field's own `UserSearchPredicateAPI`. */
function buildLikePattern(predicate: string | null, escaped: string): string {
  switch ((predicate ?? '').trim().toLowerCase()) {
    case 'beginswith':
      return `'${escaped}%'`;
    case 'endswith':
      return `'%${escaped}'`;
    case 'exact':
      return `'${escaped}'`;
    default:
      return `'%${escaped}%'`;
  }
}

/**
 * The stock lookup: browse by name for the empty query, `SearchEntity` for a typed one, with the
 * field's `RelatedEntityFilter`, the `[FKExtraFilter]` input and the active-status scope applied
 * to both.
 *
 * Subclass it rather than {@link FKLookupStrategy} when an app wants MJ's querying but its own
 * grouping or decoration — `fieldsFor` and `baseFilter` are the hooks for that.
 */
export class DefaultFKLookupStrategy extends FKLookupStrategy {
  /**
   * `SearchEntity` takes no filter, so the scope and metadata filters can only be applied when
   * hydrating the IDs it returned. Over-fetch so a filter that removes most of the matches still
   * leaves a usable list.
   */
  private static readonly SEARCH_OVERFETCH = 4;
  private static readonly SEARCH_MIN_TOPK = 25;

  public override ScopeLabels(context: FKLookupContext): FKLookupScopeLabels | null {
    return HasActiveStatus(context.RelatedEntity)
      ? { primary: 'Active only', all: 'Include inactive' }
      : null;
  }

  public async Lookup(context: FKLookupContext): Promise<FKLookupGroup[]> {
    const rows = this.shouldSearch(context) ? await this.search(context) : await this.browse(context);
    return [{ Key: 'results', Label: null, Rows: rows }];
  }

  /**
   * A typed query goes through search, except on a field metadata marks as `Dropdown` — a small
   * reference table the user is meant to read rather than search.
   */
  protected shouldSearch(context: FKLookupContext): boolean {
    if (!context.Query.trim()) return false;
    return context.FieldInfo.RelatedEntityDisplayType !== 'Dropdown';
  }

  /** The scope + metadata + caller filters, AND-ed. Subclasses widen this. */
  protected baseFilter(context: FKLookupContext): string {
    const fromInput = typeof context.Options['ExtraFilter'] === 'string' ? context.Options['ExtraFilter'] : '';
    return CombineFilters(
      context.FieldInfo.RelatedEntityFilter,
      fromInput,
      BuildStatusFilter(context.RelatedEntity, context.Scope)
    );
  }

  /** Fields to read per row. Subclasses widen this for a second line or chips. */
  protected fieldsFor(context: FKLookupContext): string[] {
    return context.Fields;
  }

  protected orderBy(context: FKLookupContext): string {
    const fromInput = typeof context.Options['OrderBy'] === 'string' ? context.Options['OrderBy'] : '';
    return fromInput || context.FieldInfo.RelatedEntityOrderBy || `[${context.NameField}]`;
  }

  /** The empty-query list: the first `MaxRows` rows in a deliberate order. */
  protected async browse(context: FKLookupContext): Promise<FKLookupRow[]> {
    const result = await RunView.FromMetadataProvider(context.Provider).RunView<Record<string, unknown>>({
      EntityName: context.RelatedEntity.Name,
      ExtraFilter: this.baseFilter(context),
      OrderBy: this.orderBy(context),
      MaxRows: context.MaxRows,
      ResultType: 'simple',
      Fields: this.fieldsFor(context),
    });
    return result.Success ? result.Results.map(Values => ({ Values })) : [];
  }

  /**
   * Rank through the platform search API, then hydrate the winners so the dropdown has display
   * columns. Falls back to a LIKE when search returns nothing, so the field still works on a
   * server with no search index.
   */
  protected async search(context: FKLookupContext): Promise<FKLookupRow[]> {
    if (context.RelatedEntity.PrimaryKeys.length !== 1) {
      // A composite key's search result is a compact key segment, not a SQL literal, so it
      // cannot be hydrated with an IN list. Those entities take the LIKE path.
      return this.likeSearch(context);
    }
    const ids = await this.searchIds(context);
    if (ids.length === 0) {
      return this.likeSearch(context);
    }
    const rows = await this.hydrate(context, ids);
    return RankByPrefix(rows, context.Query, context.NameField).slice(0, context.MaxRows);
  }

  private async searchIds(context: FKLookupContext): Promise<string[]> {
    const source = asSearchSource(context.Provider);
    if (!source) return [];
    const mode = context.Options['SearchMode'] === 'hybrid' ? 'hybrid' : 'lexical';
    const topK = Math.max(
      context.MaxRows * DefaultFKLookupStrategy.SEARCH_OVERFETCH,
      DefaultFKLookupStrategy.SEARCH_MIN_TOPK
    );
    try {
      const results: EntitySearchResult[] = await source.SearchEntity({
        entityName: context.RelatedEntity.Name,
        searchText: context.Query.trim(),
        options: { mode, topK },
      });
      return results.map(r => r.recordId);
    } catch {
      // A server without the search resolver, or an entity with no searchable fields. The LIKE
      // fallback covers both; a failed dropdown lookup is not worth surfacing to the user.
      return [];
    }
  }

  protected async hydrate(context: FKLookupContext, ids: string[]): Promise<FKLookupRow[]> {
    const result = await RunView.FromMetadataProvider(context.Provider).RunView<Record<string, unknown>>({
      EntityName: context.RelatedEntity.Name,
      ExtraFilter: CombineFilters(
        `[${context.PkField}] IN (${QuoteSqlIdList(ids)})`,
        this.baseFilter(context)
      ),
      ResultType: 'simple',
      Fields: this.fieldsFor(context),
    });
    return result.Success ? result.Results.map(Values => ({ Values })) : [];
  }

  /** Name-field `LIKE`, escaped, honouring the field's own search predicate. */
  private async likeSearch(context: FKLookupContext): Promise<FKLookupRow[]> {
    const nameField = context.RelatedEntity.Fields.find(f => f.Name === context.NameField);
    const pattern = buildLikePattern(
      nameField?.UserSearchPredicateAPI ?? null,
      EscapeSqlLikeValue(context.Query.trim())
    );
    const result = await RunView.FromMetadataProvider(context.Provider).RunView<Record<string, unknown>>({
      EntityName: context.RelatedEntity.Name,
      ExtraFilter: CombineFilters(`[${context.NameField}] LIKE ${pattern}`, this.baseFilter(context)),
      OrderBy: `[${context.NameField}]`,
      MaxRows: context.MaxRows,
      ResultType: 'simple',
      Fields: this.fieldsFor(context),
    });
    if (!result.Success) return [];
    return RankByPrefix(result.Results.map(Values => ({ Values })), context.Query, context.NameField);
  }
}
