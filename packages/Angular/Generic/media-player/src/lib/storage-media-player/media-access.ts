import { IMetadataProvider, LogError } from '@memberjunction/core';
import {
  CreateMediaAccessTokenClientResult,
  GraphQLDataProvider,
  GraphQLFileStorageClient,
} from '@memberjunction/graphql-dataprovider';

/** Shape of the `CreateMediaAccessToken` server mutation result (one file). */
export type CreateMediaAccessTokenResult = CreateMediaAccessTokenClientResult;

/** Mints an authenticated streaming-URL token for one file id via `GraphQLFileStorageClient.CreateMediaAccessToken`. */
export function MintMediaAccessUrl(
  provider: IMetadataProvider,
  fileId: string,
): Promise<CreateMediaAccessTokenResult | null> {
  if (!fileId || fileId.trim().startsWith('inline:')) {
    return Promise.resolve(null);
  }
  try {
    const gqlProvider = provider as unknown as GraphQLDataProvider;
    const storageClient = new GraphQLFileStorageClient(gqlProvider);
    return storageClient.CreateMediaAccessToken(fileId);
  } catch (err) {
    LogError(`CreateMediaAccessToken failed for file '${fileId}': ${err instanceof Error ? err.message : String(err)}`);
    return Promise.resolve({ Success: false, ErrorMessage: 'Unable to load this recording.' });
  }
}

