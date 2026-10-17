import { IMetadataProvider, LogError } from '@memberjunction/core';
import { GraphQLDataProvider } from '@memberjunction/graphql-dataprovider';

/** Shape of the `CreateMediaAccessToken` server mutation result (one file). */
export interface CreateMediaAccessTokenResult {
  Success: boolean;
  Token?: string | null;
  Url?: string | null;
  ExpiresAt?: string | null;
  MimeType?: string | null;
  /**
   * Optional precomputed waveform peaks (normalized `0..1`, one per bar) read from a `peaks.json`
   * sidecar beside the file. When present, the player renders the real waveform instantly with NO
   * client-side fetch/decode of the audio. Absent → the player falls back to client-side extraction.
   */
  Peaks?: number[] | null;
  ErrorMessage?: string | null;
}

/**
 * The exact GraphQL mutation this wrapper consumes. Mints a short-lived signed token (after a
 * server-side per-user permission check) and returns the authenticated `/media/<fileId>?token=`
 * streaming URL — which `<audio>`/`<video>` stream natively with HTTP Range (seek-before-download).
 */
export const CREATE_MEDIA_ACCESS_TOKEN_MUTATION = `mutation CreateMediaAccessToken($fileId: String!) {
  CreateMediaAccessToken(fileId: $fileId) {
    Success
    Url
    ExpiresAt
    MimeType
    Peaks
    ErrorMessage
  }
}`;

/** Mints an authenticated streaming-URL token for one file id via the active provider. */
export async function MintMediaAccessUrl(
  provider: IMetadataProvider,
  fileId: string,
): Promise<CreateMediaAccessTokenResult | null> {
  try {
    const gqlProvider = provider as unknown as GraphQLDataProvider;
    const data = await gqlProvider.ExecuteGQL(CREATE_MEDIA_ACCESS_TOKEN_MUTATION, { fileId });
    const payload = data?.CreateMediaAccessToken as CreateMediaAccessTokenResult | undefined;
    return payload ?? null;
  } catch (err) {
    LogError(`CreateMediaAccessToken failed for file '${fileId}': ${err instanceof Error ? err.message : String(err)}`);
    return { Success: false, ErrorMessage: 'Unable to load this recording.' };
  }
}
