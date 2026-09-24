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
  type EntitySearchResult,
  type IMetadataProvider,
  type SearchEntityParams,
} from '@memberjunction/core';
import {
  FKLookupStrategy,
  type FKLookupContext,
  type FKLookupGroup,
  type FKLookupRow,
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
 * The stock lookup: browse by name for the empty query; for a typed one, an escaped `LIKE` on the
 * column the user is searching, prefix matches first. The field's `RelatedEntityFilter` and the
 * `[FKExtraFilter]` input apply to both, in SQL. `{ SearchMode: 'hybrid' }` in `[FKLookupOptions]`
 * ranks through the platform search API instead and hydrates the winners in search order.
 *
 * Subclass it rather than {@link FKLookupStrategy} when an app wants MJ's querying but its own
 * grouping or decoration — `fieldsFor` and `baseFilter` are the hooks for that.
 */
export class DefaultFKLookupStrategy extends FKLookupStrategy {
  /**
   * `SearchEntity` takes no filter, so the metadata filter can only be applied when hydrating the
   * IDs it returned. Over-fetch so a filter that removes most of the matches still leaves a usable
   * list; when it removes all of them the LIKE path, which filters in SQL, answers instead.
   */
  private static readonly SEARCH_OVERFETCH = 4;
  private static readonly SEARCH_MIN_TOPK = 25;

  public async Lookup(context: FKLookupContext): Promise<FKLookupGroup[]> {
    const rows = !context.Query.trim()
      ? await this.browse(context)
      : this.shouldSearch(context)
        ? await this.search(context)
        : await this.likeSearch(context);
    return [{ Key: 'results', Label: null, Rows: rows }];
  }

  /** The filter the browse and search paths apply, so a recent pick outside it stops being offered. */
  public override RecentFilter(context: FKLookupContext): string {
    return this.baseFilter(context);
  }

  /**
   * The search API ranks across every searchable field of the related entity, so it answers only
   * when the field opted into hybrid ranking AND the user is searching the name field — a column
   * chosen on the scope pill needs a LIKE on that column. A field metadata marks as `Dropdown` is a
   * small reference table the user is meant to read, and a composite key's search result is a
   * compact key segment rather than a SQL literal to hydrate with an IN list; both take the LIKE path.
   */
  protected shouldSearch(context: FKLookupContext): boolean {
    return (
      context.Options['SearchMode'] === 'hybrid' &&
      context.SearchField === context.NameField &&
      context.FieldInfo.RelatedEntityDisplayType !== 'Dropdown' &&
      context.RelatedEntity.PrimaryKeys.length === 1
    );
  }

  /** The metadata + caller filters, AND-ed. Subclasses widen this. */
  protected baseFilter(context: FKLookupContext): string {
    const fromInput = typeof context.Options['ExtraFilter'] === 'string' ? context.Options['ExtraFilter'] : '';
    return CombineFilters(context.FieldInfo.RelatedEntityFilter, fromInput);
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
   * Rank through the platform search API, then hydrate the winners in search order so the
   * dropdown has display columns. Falls back to a LIKE when search returns nothing — a server
   * with no search index — or when the filter removes every hit it did return.
   */
  protected async search(context: FKLookupContext): Promise<FKLookupRow[]> {
    const ids = await this.searchIds(context);
    if (ids.length === 0) {
      return this.likeSearch(context);
    }
    const rows = await this.hydrate(context, ids);
    if (rows.length === 0) {
      return this.likeSearch(context);
    }
    return this.orderByIds(rows, ids, context.PkField).slice(0, context.MaxRows);
  }

  private async searchIds(context: FKLookupContext): Promise<string[]> {
    const source = asSearchSource(context.Provider);
    if (!source) return [];
    const topK = Math.max(
      context.MaxRows * DefaultFKLookupStrategy.SEARCH_OVERFETCH,
      DefaultFKLookupStrategy.SEARCH_MIN_TOPK
    );
    try {
      const results: EntitySearchResult[] = await source.SearchEntity({
        entityName: context.RelatedEntity.Name,
        searchText: context.Query.trim(),
        options: { mode: 'hybrid', topK },
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

  /** Re-impose the search API's ranking, which the hydrating view does not preserve. */
  private orderByIds(rows: FKLookupRow[], ids: string[], pkField: string): FKLookupRow[] {
    const rank = new Map(ids.map((id, i) => [id.trim().toLowerCase(), i]));
    const rankOf = (row: FKLookupRow): number =>
      rank.get(String(row.Values[pkField] ?? '').trim().toLowerCase()) ?? ids.length;
    return [...rows].sort((a, b) => rankOf(a) - rankOf(b));
  }

  /** `LIKE` on the column the user is searching, escaped, honouring that field's own predicate. */
  private async likeSearch(context: FKLookupContext): Promise<FKLookupRow[]> {
    const searchField = context.SearchField || context.NameField;
    const field = context.RelatedEntity.Fields.find(f => f.Name === searchField);
    const pattern = buildLikePattern(
      field?.UserSearchPredicateAPI ?? null,
      EscapeSqlLikeValue(context.Query.trim())
    );
    const result = await RunView.FromMetadataProvider(context.Provider).RunView<Record<string, unknown>>({
      EntityName: context.RelatedEntity.Name,
      ExtraFilter: CombineFilters(`[${searchField}] LIKE ${pattern}`, this.baseFilter(context)),
      OrderBy: `[${searchField}]`,
      MaxRows: context.MaxRows,
      ResultType: 'simple',
      Fields: this.fieldsFor(context),
    });
    if (!result.Success) return [];
    return RankByPrefix(result.Results.map(Values => ({ Values })), context.Query, searchField);
  }
}
