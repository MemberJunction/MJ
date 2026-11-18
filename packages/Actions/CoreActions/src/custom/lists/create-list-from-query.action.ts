import { BaseAction } from '@memberjunction/actions';
import type { ActionResultSimple, RunActionParams } from '@memberjunction/actions-base';
import { LogError } from '@memberjunction/core';
import { RegisterClass } from '@memberjunction/global';
import { type CheckedCallerSQL, ListFromQuery, type ListFromQueryOutcome, type ListFromQueryRequest } from '@memberjunction/lists';

import { AgentDataPolicyGuard } from '../crud/agent-data-policy-guard';
import { AdhocQueryFailure, type AdhocSQLRun, CheckAdhocSQL } from '../data/adhoc-sql-gate';
import { AddOutputParam, GetBooleanParam, GetStringParam, MissingParam } from './_action-helpers';

const ACTION_NAME = 'Create List From Query';

/** The action's inputs, read and checked. */
interface CreateListInput extends ListFromQueryRequest {
  QueryID?: string;
  QueryName?: string;
  SQL?: string;
}

/**
 * Creates a list from a query, linked to that query so it keeps itself current.
 *
 * - Given a saved query (`QueryID` or `QueryName`), it runs it as the user and links the new list
 *   to it.
 * - Given SQL written in a conversation (`SQL`, with `EntityName`), it applies the same checks as
 *   Run Ad-hoc Query and runs the SQL as the user. Then it saves the SQL as a query, Pending
 *   approval, in the user's own "User Lists" query category, and links the list to that query.
 *   If the user can't save queries, it still creates the list from the SQL's results, without a
 *   source, and says why it won't refresh.
 *
 * `RefreshMode` (`Additive`, the default, or `Sync`) and `RefreshAutomatically` (default off) set
 * how the list refreshes. A linked list stops refreshing for review when its query is edited.
 * The work is done by `ListFromQuery` in `@memberjunction/lists`, which the Save as list button
 * shares.
 *
 * @example
 * ```typescript
 * await runAction({
 *   ActionName: 'Create List From Query',
 *   Params: [
 *     { Name: 'ListName', Value: 'Mid-career members, no ethics course' },
 *     { Name: 'SQL', Value: 'SELECT p.ID FROM dbo.vwPersons p WHERE ...' },
 *     { Name: 'EntityName', Value: 'Persons' },
 *     { Name: 'RefreshAutomatically', Value: true }
 *   ]
 * });
 * ```
 */
@RegisterClass(BaseAction, ACTION_NAME)
export class CreateListFromQueryAction extends BaseAction {
  protected async InternalRunAction(params: RunActionParams): Promise<ActionResultSimple> {
    try {
      const input = this.readInput(params);
      if ('Failure' in input) return input.Failure;
      return input.SQL ? await this.fromSQL(params, input, input.SQL) : await this.fromSavedQuery(params, input);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      LogError(`${ACTION_NAME}: ${message}`);
      return failure('UNEXPECTED_ERROR', `Failed to create the list: ${message}`);
    }
  }

  private async fromSavedQuery(params: RunActionParams, input: CreateListInput): Promise<ActionResultSimple> {
    const policy = await AgentDataPolicyGuard.EvaluateStoredQuery(params, input.QueryID, input.QueryID ? undefined : input.QueryName, stringValues(input.Parameters));
    if ('Blocked' in policy) return policy.Blocked;
    if (input.KeyField && keyFieldMasked(input.KeyField, policy.Allowed.DeniedFieldPatterns)) {
      return failure('PERMISSION_DENIED', `Your data policy hides the column '${input.KeyField}', so it can't be used as the record key.`);
    }
    const outcome = await new ListFromQuery(params.ContextUser, params.Provider).FromSavedQueryAsync({ ID: input.QueryID, Name: input.QueryName }, input);
    return this.report(params, outcome, 0);
  }

  private async fromSQL(params: RunActionParams, input: CreateListInput, rawSQL: string): Promise<ActionResultSimple> {
    const gate = await CheckAdhocSQL(params, ACTION_NAME, rawSQL);
    if ('Blocked' in gate) return gate.Blocked;
    const outcome = await new ListFromQuery(params.ContextUser, params.Provider).FromSQLAsync(checkedSQL(params, gate.Allowed), input);
    return this.report(params, outcome, gate.Allowed.TimeoutSeconds);
  }

  private report(params: RunActionParams, outcome: ListFromQueryOutcome, timeoutSeconds: number): ActionResultSimple {
    if (outcome.Kind === 'Refused') {
      return outcome.Code === 'QUERY_FAILED' ? AdhocQueryFailure(outcome.Message, timeoutSeconds) : failure(outcome.Code, outcome.Message);
    }
    const result = outcome.Result;
    AddOutputParam(params, 'ListID', result.CreatedListId);
    AddOutputParam(params, 'Added', result.Counts?.Added);
    AddOutputParam(params, 'Failed', result.Counts?.Failed);
    AddOutputParam(params, 'SourceQueryID', outcome.SourceQueryID);
    AddOutputParam(params, 'SourceQueryName', outcome.SourceQueryName);
    AddOutputParam(params, 'SourceQueryStatus', outcome.SavedNewQuery ? 'Pending' : null);
    AddOutputParam(params, 'Refreshes', !!result.CreatedListId && !outcome.StaticReason);
    return { Success: result.Success, ResultCode: result.ResultCode, Message: describe(outcome) };
  }

  private readInput(params: RunActionParams): CreateListInput | { Failure: ActionResultSimple } {
    const listName = GetStringParam(params, 'ListName')?.trim();
    if (!listName) return { Failure: MissingParam('ListName') };
    const queryID = GetStringParam(params, 'QueryID')?.trim() || undefined;
    const queryName = GetStringParam(params, 'QueryName')?.trim() || undefined;
    const sql = GetStringParam(params, 'SQL')?.trim() || undefined;
    if ([queryID ?? queryName, sql].filter(Boolean).length !== 1) {
      return { Failure: failure('MISSING_PARAMETER', "Pass exactly one of 'QueryID', 'QueryName' or 'SQL'.") };
    }
    const refreshMode = GetStringParam(params, 'RefreshMode')?.trim() || 'Additive';
    if (refreshMode !== 'Additive' && refreshMode !== 'Sync') {
      return { Failure: failure('INVALID_PARAMETER', `RefreshMode must be 'Additive' or 'Sync', got '${refreshMode}'.`) };
    }
    const parameters = readParameters(params);
    if (parameters === null) return { Failure: failure('INVALID_PARAMETER', "'Parameters' must be a JSON object.") };
    return {
      ListName: listName,
      Description: GetStringParam(params, 'Description')?.trim() || undefined,
      CategoryID: GetStringParam(params, 'CategoryID')?.trim() || undefined,
      QueryID: queryID,
      QueryName: queryName,
      SQL: sql,
      Parameters: parameters,
      EntityName: GetStringParam(params, 'EntityName')?.trim() || undefined,
      KeyField: GetStringParam(params, 'KeyField')?.trim() || undefined,
      RefreshMode: refreshMode,
      AutoRefresh: GetBooleanParam(params, 'RefreshAutomatically', false),
    };
  }
}

/** The checked SQL, run on the read-only login with the host's timeout, hiding what the agent's policy hides. */
function checkedSQL(params: RunActionParams, run: AdhocSQLRun): CheckedCallerSQL {
  return {
    SQL: run.SQL,
    Run: async (maxRows) => {
      const result = await run.Provider.RunQuery({ SQL: run.SQL, MaxRows: maxRows, TimeoutSeconds: run.TimeoutSeconds }, params.ContextUser);
      return { Success: result.Success, Results: (result.Results ?? []) as Record<string, unknown>[], ErrorMessage: result.ErrorMessage };
    },
    IsColumnHidden: (column) => keyFieldMasked(column, run.DeniedFieldPatterns),
  };
}

function describe(outcome: Extract<ListFromQueryOutcome, { Kind: 'Created' }>): string {
  const result = outcome.Result;
  if (!result.CreatedListId) return result.Message;
  if (outcome.StaticReason) return `${result.Message}. It won't refresh, because the SQL could not be saved as a query: ${outcome.StaticReason}`;
  const saved = outcome.SavedNewQuery
    ? ` The SQL was saved as the query "${outcome.SourceQueryName}" in your User Lists, Pending approval; editing it pauses refreshes until you approve the change.`
    : ` It refreshes from the query "${outcome.SourceQueryName}".`;
  return `${result.Message}.${saved}`;
}

function failure(resultCode: string, message: string): ActionResultSimple {
  return { Success: false, ResultCode: resultCode, Message: message };
}

/** `Parameters` as an object: undefined when absent, null when present but not a JSON object. */
function readParameters(params: RunActionParams): Record<string, unknown> | undefined | null {
  const param = params.Params.find((p) => p.Type === 'Input' && p.Name.toLowerCase() === 'parameters');
  const value: unknown = param?.Value;
  if (value === null || value === undefined || value === '') return undefined;
  let parsed: unknown = value;
  if (typeof value === 'string') {
    try {
      parsed = JSON.parse(value);
    } catch {
      return null;
    }
  }
  return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : null;
}

function stringValues(values: Record<string, unknown> | undefined): Record<string, string> | undefined {
  if (!values) return undefined;
  return Object.fromEntries(Object.entries(values).map(([k, v]) => [k, v == null ? '' : String(v)]));
}

/** True when the calling agent's data policy hides the column. */
function keyFieldMasked(keyField: string, deniedFieldPatterns: string[]): boolean {
  if (deniedFieldPatterns.length === 0) return false;
  const [masked] = AgentDataPolicyGuard.MaskRows([{ [keyField]: 1 }], deniedFieldPatterns);
  return !(keyField in masked);
}
