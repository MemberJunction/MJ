import {
  EntityInfo,
  IMetadataProvider,
  IRunQueryProvider,
  Metadata,
  RunQuery,
  RunView,
  UserInfo,
} from '@memberjunction/core';
import {
  ComputeQueryFingerprintAsync,
  ComputeUserViewFingerprintAsync,
  MJListEntity,
  MJQueryEntity,
  MJUserViewEntityExtended,
  QueryDefinitionRows,
} from '@memberjunction/core-entities';
import { EscapeSQLString } from '@memberjunction/global';
import type { ListSourceChange, ResolvedRecordSet } from '@memberjunction/lists-base';

/**
 * What a list's source is right now: which query or view, and the fingerprint of its current
 * definition. A refresh compares `Fingerprint` with `List.SourceFingerprint`.
 */
export interface ListSourceDefinition {
  Kind: ListSourceChange['SourceKind'];
  ID: string;
  Name: string;
  /** When the source record was last saved. */
  UpdatedAt: Date | null;
  Fingerprint: string;
}

function isRunQueryProvider(provider: IMetadataProvider | undefined): provider is IMetadataProvider & IRunQueryProvider {
  return !!provider && 'RunQuery' in provider && typeof provider.RunQuery === 'function';
}

/**
 * Reads a list's source query or view: the fingerprint of its current definition, and for a
 * query, the records it returns. Runs as the user the list operation acts for.
 *
 * The fingerprint is computed here from the definition as stored, not read from the source's
 * `DefinitionFingerprint` column. That column is stamped when the query or view is saved, so an
 * edit made only to a query's dialect or parameter rows would leave it behind. Computing it live
 * catches that edit too.
 */
export class ListRefreshSource {
  constructor(
    private readonly contextUser: UserInfo,
    private readonly md: Metadata,
    private readonly rv: RunView,
    private readonly provider: IMetadataProvider | undefined,
  ) {}

  /** The list's source and its current fingerprint, or `null` when the list has no source. */
  public async CurrentDefinitionAsync(list: MJListEntity): Promise<ListSourceDefinition | null> {
    if (list.SourceQueryID) return this.queryDefinitionAsync(list.SourceQueryID);
    if (list.SourceViewID) return this.viewDefinitionAsync(list.SourceViewID);
    return null;
  }

  /**
   * Runs the list's source query with its stored parameter values and returns the records it names,
   * in `MJ: List Details.RecordID` form. The key column must hold the list entity's primary key, so
   * a query source needs an entity with a single-column key.
   */
  public async ResolveQueryRecordsAsync(list: MJListEntity, entityInfo: EntityInfo): Promise<ResolvedRecordSet> {
    const keyField = list.SourceQueryKeyField?.trim();
    if (!list.SourceQueryID || !keyField) {
      throw new Error(`List '${list.ID}' has a source query but no SourceQueryKeyField naming its key column.`);
    }
    if (entityInfo.PrimaryKeys.length !== 1) {
      throw new Error(`List '${list.ID}' is on ${entityInfo.Name}, which has a composite key. A query source needs a single-column key.`);
    }
    const result = await this.runQuery().RunQuery(
      { QueryID: list.SourceQueryID, Parameters: this.parseParameters(list) },
      this.contextUser,
    );
    if (!result.Success) {
      throw new Error(`Source query for list '${list.ID}' failed: ${result.ErrorMessage}`);
    }
    return { EntityName: entityInfo.Name, RecordIds: this.keyValues(result.Results, keyField) };
  }

  private async queryDefinitionAsync(queryID: string): Promise<ListSourceDefinition> {
    const query = await this.md.GetEntityObject<MJQueryEntity>('MJ: Queries', this.contextUser);
    if (!(await query.Load(queryID))) {
      throw new Error(`Source query '${queryID}' not found.`);
    }
    const fingerprint = await ComputeQueryFingerprintAsync(query, await this.loadQueryDefinitionRowsAsync(queryID));
    return { Kind: 'query', ID: query.ID, Name: query.Name, UpdatedAt: query.__mj_UpdatedAt ?? null, Fingerprint: fingerprint };
  }

  private async viewDefinitionAsync(viewID: string): Promise<ListSourceDefinition> {
    const view = await this.md.GetEntityObject<MJUserViewEntityExtended>('MJ: User Views', this.contextUser);
    if (!(await view.Load(viewID))) {
      throw new Error(`Source view '${viewID}' not found.`);
    }
    const fingerprint = await ComputeUserViewFingerprintAsync(view);
    return { Kind: 'view', ID: view.ID, Name: view.Name, UpdatedAt: view.__mj_UpdatedAt ?? null, Fingerprint: fingerprint };
  }

  /** The query's dialect and parameter rows as stored, bypassing every cache. */
  private async loadQueryDefinitionRowsAsync(queryID: string): Promise<QueryDefinitionRows> {
    const filter = `QueryID='${EscapeSQLString(queryID)}'`;
    const [sqls, parameters] = await this.rv.RunViews<QueryDefinitionRows['SQLs'][number] & QueryDefinitionRows['Parameters'][number]>([
      { EntityName: 'MJ: Query SQLs', ExtraFilter: filter, Fields: ['SQLDialectID', 'SQL'], ResultType: 'simple', BypassCache: true },
      { EntityName: 'MJ: Query Parameters', ExtraFilter: filter, Fields: ['Name', 'Type', 'IsRequired', 'ValidationFilters', 'IsServerSet'], ResultType: 'simple', BypassCache: true },
    ], this.contextUser);
    if (!sqls?.Success || !parameters?.Success) {
      throw new Error(`Could not read the definition of source query '${queryID}': ${sqls?.ErrorMessage || parameters?.ErrorMessage}`);
    }
    return { SQLs: sqls.Results, Parameters: parameters.Results };
  }

  private parseParameters(list: MJListEntity): Record<string, unknown> | undefined {
    const raw = list.SourceQueryParameters?.trim();
    if (!raw) return undefined;
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error(`List '${list.ID}' has SourceQueryParameters that are not a JSON object.`);
    }
    return parsed as Record<string, unknown>;
  }

  /** The distinct, non-empty values of the key column, as strings. */
  private keyValues(rows: Record<string, unknown>[], keyField: string): string[] {
    const ids = new Set<string>();
    for (const row of rows) {
      const value = row[keyField];
      if (value === null || value === undefined || value === '') continue;
      ids.add(String(value));
    }
    if (rows.length > 0 && ids.size === 0 && !(keyField in rows[0])) {
      throw new Error(`The source query returned no column named '${keyField}'.`);
    }
    return [...ids];
  }

  private runQuery(): RunQuery {
    return new RunQuery(isRunQueryProvider(this.provider) ? this.provider : null);
  }
}
