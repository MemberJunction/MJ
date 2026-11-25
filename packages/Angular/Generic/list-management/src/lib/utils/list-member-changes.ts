import type { IMetadataProvider } from '@memberjunction/core';
import { GraphQLDataProvider, GraphQLListsClient } from '@memberjunction/graphql-dataprovider';
import type { ApplyResult } from '@memberjunction/lists-base';

/** Builds a lists client for the provider. Throws when the provider does not use GraphQL. */
export function CreateListsClient(provider: IMetadataProvider): GraphQLListsClient {
  if (!(provider instanceof GraphQLDataProvider)) {
    throw new Error('List membership changes need a GraphQL data provider.');
  }
  return new GraphQLListsClient(provider);
}

/** Runs a server list change and turns a thrown error into a failed result. */
export async function RunListChange(call: () => Promise<ApplyResult>): Promise<ApplyResult> {
  try {
    return await call();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { Success: false, ResultCode: 'UNEXPECTED_ERROR', Message: message };
  }
}

/**
 * Adds the results of each view to the list, one server call per view, and returns the summed
 * counts. The result is a partial success when some views or records failed after others were added.
 */
export async function AddViewResultsToList(client: GraphQLListsClient, viewIds: readonly string[], listId: string): Promise<ApplyResult> {
  const total: ApplyResult = { Success: true, ResultCode: 'SUCCESS', Message: '', Counts: { Added: 0, Removed: 0, Failed: 0 }, Errors: [] };
  for (const viewId of viewIds) {
    mergeViewResult(total, await RunListChange(() => client.AddViewResultsToList(viewId, listId)));
  }
  return total;
}

function mergeViewResult(total: ApplyResult, result: ApplyResult): void {
  total.Counts!.Added += result.Counts?.Added ?? 0;
  total.Counts!.Failed += result.Counts?.Failed ?? 0;
  total.Errors!.push(...(result.Errors ?? []));
  if (result.Success) return;
  const anyAdded = total.Counts!.Added > 0;
  total.Success = false;
  total.ResultCode = anyAdded || result.ResultCode === 'PARTIAL_SUCCESS' ? 'PARTIAL_SUCCESS' : result.ResultCode;
  total.Message = result.Message;
  if (!result.Counts) total.Errors!.push(result.Message);
}

/** True when the server changed at least part of the list (full or partial success). */
export function ListChangeApplied(result: ApplyResult): boolean {
  return result.Success || result.ResultCode === 'PARTIAL_SUCCESS';
}

function plural(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? '' : 's'}`;
}

/**
 * Text for a list change that did not fully succeed. A partial success names how many records
 * failed; any other failure shows the server message.
 */
export function ListChangeFailureMessage(result: ApplyResult, fallback: string): string {
  if (result.ResultCode === 'PARTIAL_SUCCESS') {
    const failed = result.Counts?.Failed ?? 0;
    if (failed === 0) return result.Message || fallback;
    const firstError = result.Errors?.[0] ? `: ${result.Errors[0]}` : '';
    return `${plural(failed, 'record')} failed${firstError}`;
  }
  return result.Message || fallback;
}

/** "N record(s)" text for notifications. */
export function RecordCountText(count: number): string {
  return plural(count, 'record');
}
