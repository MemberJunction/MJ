/**
 * @fileoverview Re-sends realtime-call recording shards left in the local store, and builds the
 * transport that sends them from a GraphQL provider's configuration. Shared by
 * {@link RealtimeSessionRuntime} (every page load and session start) and by a host's logout.
 *
 * @module @memberjunction/realtime-runtime
 */
import type { IMetadataProvider } from '@memberjunction/core';
import type { GraphQLDataProvider } from '@memberjunction/graphql-dataprovider';
import { CreateRecordingShardStore, type IRecordingShardStore } from './RecordingShardStore';
import { FetchRecordingTransport, RecordingBaseURLFromGraphQLURL, type IRecordingTransport, type RecordingUploadOutcome } from './RecordingTransport';

/** Most stored shards one drain pass re-uploads; the rest wait for the next pass or load. */
export const MAX_DRAINED_SHARDS_PER_LOAD = 50;

/** What one drain pass did. */
export interface RecordingShardDrainPass {
  /** Shards the pass listed (at most {@link MAX_DRAINED_SHARDS_PER_LOAD}). */
  Listed: number;
  /** Shards the server acknowledged; deleted from the store. */
  Delivered: number;
  /** Shards the server refused for good; deleted from the store. */
  Refused: number;
}

function describeFailure(failure: unknown): string {
  return failure instanceof Error ? failure.message : String(failure);
}

/**
 * The default recording transport for a provider: MJAPI's REST recording routes, derived from the
 * provider's GraphQL URL, with credentials read per request so a refreshed token is used. Null when
 * the provider has no URL (a test double, a provider that is not GraphQL, or one not configured yet).
 */
export function CreateRecordingTransportForProvider(provider: IMetadataProvider | null | undefined): IRecordingTransport | null {
  // Typed as GraphQL, but read defensively: a test double or a non-GraphQL provider has no ConfigData.
  const graphQL = provider as GraphQLDataProvider | null | undefined;
  const url = graphQL?.ConfigData?.URL;
  if (!graphQL || !url) {
    return null;
  }
  return new FetchRecordingTransport({
    BaseURL: RecordingBaseURLFromGraphQLURL(url),
    Headers: () => {
      const config = graphQL.ConfigData;
      const headers: Record<string, string> = {};
      if (config?.Token) headers.authorization = `Bearer ${config.Token}`;
      if (config?.MJAPIKey) headers['x-mj-api-key'] = config.MJAPIKey;
      if (config?.UserAPIKey) headers['x-api-key'] = config.UserAPIKey;
      return headers;
    },
  });
}

/**
 * One drain pass over `userID`'s stored shards, oldest first, each under its own session and index. A
 * shard the server acknowledges or refuses for good (see {@link RecordingUploadOutcome}) leaves the
 * store; one that may still succeed stays for the next pass or load. Never rejects for an upload or
 * delete failure (each is logged); a store whose listing throws rejects.
 */
export async function DrainStoredRecordingShardsOnce(
  store: IRecordingShardStore,
  transport: IRecordingTransport,
  userID: string | null,
): Promise<RecordingShardDrainPass> {
  const pending = await store.ListOldest(MAX_DRAINED_SHARDS_PER_LOAD, userID);
  let delivered = 0;
  let refused = 0;
  for (const shard of pending) {
    let outcome: RecordingUploadOutcome = 'Retry';
    try {
      outcome = await transport.UploadShard(shard.SessionID, shard);
    } catch (error) {
      console.warn(`[RealtimeSession] Re-uploading stored recording shard ${shard.SessionID}/${shard.Index} failed: ${describeFailure(error)}; it stays stored for the next load.`, error);
    }
    if (outcome === 'Acked') {
      await DeleteStoredRecordingShard(store, shard.SessionID, shard.Index);
      delivered++;
    } else if (outcome === 'Refused') {
      console.warn(`[RealtimeSession] The server refused stored recording shard ${shard.SessionID}/${shard.Index} for good; deleting it so it no longer holds back the shards behind it.`);
      await DeleteStoredRecordingShard(store, shard.SessionID, shard.Index);
      refused++;
    }
  }
  if (pending.length > 0) {
    console.log(`[RealtimeSession] Re-uploaded ${delivered}/${pending.length} stored recording shard(s); ${refused} refused and deleted.`);
  }
  return { Listed: pending.length, Delivered: delivered, Refused: refused };
}

/** Removes one shard from the store. Never rejects: a failed delete only costs a duplicate re-upload. */
export async function DeleteStoredRecordingShard(store: IRecordingShardStore, sessionId: string, index: number): Promise<void> {
  try {
    await store.Delete(sessionId, index);
  } catch (error) {
    // Harmless beyond a wasted re-upload on the next load: the server acks a duplicate.
    console.warn(`[RealtimeSession] Failed to delete recording shard ${sessionId}/${index} from the local store:`, error);
  }
}

/** Most drain passes a logout runs before it deletes what is left (each pass is itself bounded). */
const MAX_LOGOUT_DRAIN_PASSES = 3;

/** What {@link ReleaseUserRecordingShards} did. */
export interface RecordingShardRelease {
  /** Shards the server acknowledged before the user's store was cleared. */
  Delivered: number;
  /** True when the time limit ended the upload attempt (the shards were deleted anyway). */
  TimedOut: boolean;
}

/**
 * For logout: tries to deliver `userID`'s stored shards within `timeoutMs`, then deletes every shard
 * of that user that is still stored, so their call audio neither stays on a shared browser's disk nor
 * waits for a later login. Other users' shards are untouched. Never rejects and never takes longer
 * than `timeoutMs` plus the delete.
 */
export async function ReleaseUserRecordingShards(
  store: IRecordingShardStore,
  transport: IRecordingTransport | null,
  userID: string | null,
  timeoutMs: number,
): Promise<RecordingShardRelease> {
  let delivered = 0;
  let timedOut = false;
  if (transport) {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const deadline = new Promise<'timeout'>((resolve) => {
      timer = setTimeout(() => resolve('timeout'), timeoutMs);
    });
    const attempt = (async () => {
      for (let pass = 1; pass <= MAX_LOGOUT_DRAIN_PASSES; pass++) {
        const result = await DrainStoredRecordingShardsOnce(store, transport, userID);
        delivered += result.Delivered;
        // Another pass only reaches shards beyond this pass's page, and only when this one made room;
        // a shard that answered Retry is not retried within the logout.
        if (result.Listed < MAX_DRAINED_SHARDS_PER_LOAD || result.Delivered + result.Refused === 0) {
          return;
        }
      }
    })().catch((error: unknown) => {
      console.warn(`[RealtimeSession] Sending stored recording shards at logout failed for user ${userID ?? '(none)'}: ${describeFailure(error)}; deleting them.`, error);
    });
    try {
      timedOut = (await Promise.race([attempt, deadline])) === 'timeout';
    } finally {
      clearTimeout(timer);
    }
    if (timedOut) {
      console.warn(`[RealtimeSession] Sending stored recording shards at logout took over ${timeoutMs} ms for user ${userID ?? '(none)'}; deleting what is left.`);
    }
  }
  try {
    await store.DeleteForUser(userID);
  } catch (error) {
    console.warn(`[RealtimeSession] Failed to delete the stored recording shards of user ${userID ?? '(none)'} at logout:`, error);
  }
  return { Delivered: delivered, TimedOut: timedOut };
}

/** How long a logout waits for stored shards to upload before it deletes them. */
export const RECORDING_LOGOUT_SEND_TIMEOUT_MS = 3000;

/**
 * A host's logout step: {@link ReleaseUserRecordingShards} for the provider's signed-in user, with the
 * browser's IndexedDB store and the provider's recording transport. Call it while the provider is
 * still authenticated (before its token is dropped). Never rejects.
 */
export function ReleaseRecordingShardsAtLogout(
  provider: IMetadataProvider | null | undefined,
  timeoutMs: number = RECORDING_LOGOUT_SEND_TIMEOUT_MS,
): Promise<RecordingShardRelease> {
  return ReleaseUserRecordingShards(
    CreateRecordingShardStore(globalThis.indexedDB),
    CreateRecordingTransportForProvider(provider),
    provider?.CurrentUser?.ID ?? null,
    timeoutMs,
  );
}
