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
