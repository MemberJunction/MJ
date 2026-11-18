import { IMetadataProvider, Metadata, RunView, UserInfo } from '@memberjunction/core';
import { MJQueryEntity } from '@memberjunction/core-entities';
import { EscapeSQLString } from '@memberjunction/global';
import type { ApplyResult, ListRefreshMode } from '@memberjunction/lists-base';

import { ListOperations } from './ListOperations';
import { UserListQueries } from './UserListQueries';

/** Most records a list that can't refresh is filled with (the entity grid's "add all to list" cap). */
export const MAX_STATIC_LIST_RECORDS = 100_000;

/**
 * SQL a caller wrote, already checked by the host and ready to run as the caller. The host decides
 * what "checked" means (an action applies the ad-hoc SQL authorizer and the agent's data policy; a
 * resolver applies the same authorizer) and where it runs (the read-only login).
 */
export interface CheckedCallerSQL {
  /** The SQL as it will run and as it will be saved. */
  readonly SQL: string;
  Run(maxRows: number): Promise<{ Success: boolean; Results: Record<string, unknown>[]; ErrorMessage?: string }>;
  /** True when the caller may not see this column, so it can't be the record key. */
  IsColumnHidden?(column: string): boolean;
}

/** How the new list is named, filed and refreshed. */
export interface ListFromQueryRequest {
  ListName: string;
  Description?: string;
  CategoryID?: string;
  /** For a saved query only: values for its parameters. */
  Parameters?: Record<string, unknown>;
  /** Required with SQL; for a saved query, worked out from its fields when left out. */
  EntityName?: string;
  KeyField?: string;
  RefreshMode: ListRefreshMode;
  AutoRefresh: boolean;
}

/** Why no list was made. `QUERY_FAILED` carries the database's message for the host to classify. */
export type ListFromQueryRefusalCode =
  | 'MISSING_PARAMETER'
  | 'INVALID_PARAMETER'
  | 'QUERY_NOT_FOUND'
  | 'AMBIGUOUS_QUERY'
  | 'PERMISSION_DENIED'
  | 'QUERY_FAILED'
  | 'TOO_MANY_RECORDS';

export type ListFromQueryOutcome =
  | {
      Kind: 'Created';
      /** The list operation's result: `CreatedListId`, counts, and a `PARTIAL_SUCCESS` when some records failed. */
      Result: ApplyResult;
      SourceQueryID: string | null;
      SourceQueryName: string | null;
      /** True when the SQL was saved by this call, as a Pending query in the user's User Lists. */
      SavedNewQuery: boolean;
      /** Why the list won't refresh, when it won't: the SQL could not be saved as a query. */
      StaticReason: string | null;
    }
  | { Kind: 'Refused'; Code: ListFromQueryRefusalCode; Message: string };

/**
 * Makes a list from a query, linked to it so it keeps itself current. Shared by the Create List From
 * Query action and the Save as list button's mutation, so both behave the same.
 *
 * - From a saved query: the list is linked to it (`ListOperations.MaterializeFromQuery`).
 * - From caller SQL: the SQL is run once to find the key column, saved as a Pending query in the
 *   user's User Lists (`UserListQueries`), and the list is linked to that query. When the user can't
 *   save queries, the list is made from the SQL's results without a source, and says why.
 */
export class ListFromQuery {
  constructor(
    private readonly contextUser: UserInfo,
    private readonly provider?: IMetadataProvider,
  ) {}

  /** A list linked to the saved query named by ID, or by name when exactly one query has it. */
  public async FromSavedQueryAsync(query: { ID?: string; Name?: string }, request: ListFromQueryRequest): Promise<ListFromQueryOutcome> {
    const found = await this.findQueryAsync(query);
    if ('Kind' in found) return found;
    const result = await this.ops().MaterializeFromQuery(found.ID, {
      ListName: request.ListName,
      Description: request.Description,
      CategoryId: request.CategoryID,
      Parameters: request.Parameters,
      EntityName: request.EntityName,
      KeyField: request.KeyField,
      RefreshMode: request.RefreshMode,
      AutoRefresh: request.AutoRefresh,
    });
    return { Kind: 'Created', Result: result, SourceQueryID: found.ID, SourceQueryName: found.Name, SavedNewQuery: false, StaticReason: null };
  }

  /** A list linked to the caller's SQL, saved as a Pending query; or, when it can't be saved, a list that won't refresh. */
  public async FromSQLAsync(sql: CheckedCallerSQL, request: ListFromQueryRequest): Promise<ListFromQueryOutcome> {
    if (request.Parameters) return refused('INVALID_PARAMETER', "Parameters apply to a saved query, not to SQL.");
    if (!request.EntityName) return refused('MISSING_PARAMETER', 'An entity is required with SQL: the entity whose records the SQL returns.');
    const entity = this.metadata().EntityByName(request.EntityName);
    if (!entity) return refused('INVALID_PARAMETER', `Entity '${request.EntityName}' not found.`);
    if (entity.PrimaryKeys.length !== 1) {
      return refused('INVALID_PARAMETER', `${entity.Name} has a composite key; a list made from a query needs an entity with a single-column key.`);
    }
    const pkName = entity.FirstPrimaryKey.Name; // first-pk-ok: single-column key, checked above
    const key = await this.findKeyColumnAsync(sql, request.KeyField ?? pkName, entity.Name);
    if (typeof key !== 'string') return key;

    const queries = new UserListQueries(this.contextUser, this.provider);
    const saved = await queries.SaveAsync({
      Name: request.ListName,
      SQL: sql.SQL,
      Description: `Saved so the list "${request.ListName}" can refresh from it.`,
    });
    if ('Reason' in saved) return this.staticListAsync(sql, request, entity.Name, key, saved.Reason);

    const result = await this.materializeOrDiscardAsync(queries, saved.QueryID, {
      ListName: request.ListName,
      Description: request.Description,
      CategoryId: request.CategoryID,
      EntityName: entity.Name,
      KeyField: key,
      RefreshMode: request.RefreshMode,
      AutoRefresh: request.AutoRefresh,
    });
    return { Kind: 'Created', Result: result, SourceQueryID: saved.QueryID, SourceQueryName: saved.QueryName, SavedNewQuery: true, StaticReason: null };
  }

  /**
   * Makes the list from the query just saved for it. When no list comes of it (the run threw, or
   * the list wasn't created), the query is deleted, so a retry doesn't leave "Name (2)" beside an
   * orphan in the user's User Lists.
   */
  private async materializeOrDiscardAsync(
    queries: UserListQueries,
    queryID: string,
    opts: Parameters<ListOperations['MaterializeFromQuery']>[1],
  ): Promise<ApplyResult> {
    let result: ApplyResult;
    try {
      result = await this.ops().MaterializeFromQuery(queryID, opts);
    } catch (e) {
      await queries.DeleteAsync(queryID);
      throw e;
    }
    if (!result.CreatedListId) await queries.DeleteAsync(queryID);
    return result;
  }

  /**
   * Runs the SQL for one row to check it works and to find the key column, matched case-insensitively.
   * With no rows to look at, the name asked for is assumed.
   */
  private async findKeyColumnAsync(sql: CheckedCallerSQL, wanted: string, entityName: string): Promise<string | ListFromQueryOutcome> {
    const probe = await sql.Run(1);
    if (!probe.Success) return refused('QUERY_FAILED', probe.ErrorMessage ?? 'The SQL failed.');
    const columns = probe.Results.length > 0 ? Object.keys(probe.Results[0]) : [];
    const column = columns.length > 0 ? columns.find((c) => c.toLowerCase() === wanted.toLowerCase()) : wanted;
    if (!column) {
      return refused('INVALID_PARAMETER', `The SQL returns no column named '${wanted}'. Name the column holding the ${entityName} key.`);
    }
    if (sql.IsColumnHidden?.(column)) {
      return refused('PERMISSION_DENIED', `Your data policy hides the column '${column}', so it can't be used as the record key.`);
    }
    return column;
  }

  /** The list made from the SQL's results when the SQL couldn't be saved as a query: it won't refresh. */
  private async staticListAsync(
    sql: CheckedCallerSQL,
    request: ListFromQueryRequest,
    entityName: string,
    keyField: string,
    reason: string,
  ): Promise<ListFromQueryOutcome> {
    const rows = await sql.Run(MAX_STATIC_LIST_RECORDS + 1);
    if (!rows.Success) return refused('QUERY_FAILED', rows.ErrorMessage ?? 'The SQL failed.');
    if (rows.Results.length > MAX_STATIC_LIST_RECORDS) {
      return refused('TOO_MANY_RECORDS', `The SQL returned more than ${MAX_STATIC_LIST_RECORDS} rows, and it could not be saved as a query (${reason}). Narrow it.`);
    }
    const ids = rows.Results
      .map((row) => row[keyField])
      .filter((v) => v !== null && v !== undefined && v !== '')
      .map(String);
    const result = await this.ops().CreateListFromRecords(entityName, ids, {
      ListName: request.ListName,
      Description: request.Description,
      CategoryId: request.CategoryID,
    });
    return { Kind: 'Created', Result: result, SourceQueryID: null, SourceQueryName: null, SavedNewQuery: false, StaticReason: reason };
  }

  private async findQueryAsync(query: { ID?: string; Name?: string }): Promise<Pick<MJQueryEntity, 'ID' | 'Name'> | ListFromQueryOutcome> {
    if (!query.ID && !query.Name) return refused('MISSING_PARAMETER', 'A query ID or name is required.');
    const filter = query.ID ? `ID='${EscapeSQLString(query.ID)}'` : `Name='${EscapeSQLString(query.Name!)}'`;
    const result = await this.runView().RunView<Pick<MJQueryEntity, 'ID' | 'Name'>>(
      { EntityName: 'MJ: Queries', ExtraFilter: filter, Fields: ['ID', 'Name'], ResultType: 'simple' },
      this.contextUser,
    );
    if (!result.Success) return refused('QUERY_NOT_FOUND', `Could not look up the query: ${result.ErrorMessage}`);
    if (result.Results.length === 1) return result.Results[0];
    const which = query.ID ? `ID '${query.ID}'` : `name '${query.Name}'`;
    return result.Results.length === 0
      ? refused('QUERY_NOT_FOUND', `No query with ${which} was found.`)
      : refused('AMBIGUOUS_QUERY', `${result.Results.length} queries are named '${query.Name}'. Use the query's ID instead.`);
  }

  private ops(): ListOperations {
    return new ListOperations(this.contextUser, this.provider);
  }

  private metadata(): Metadata {
    return (this.provider as unknown as Metadata | undefined) ?? new Metadata();
  }

  private runView(): RunView {
    return this.provider ? RunView.FromMetadataProvider(this.provider) : new RunView();
  }
}

function refused(code: ListFromQueryRefusalCode, message: string): ListFromQueryOutcome {
  return { Kind: 'Refused', Code: code, Message: message };
}
