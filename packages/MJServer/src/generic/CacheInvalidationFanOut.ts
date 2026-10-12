/**
 * @fileoverview Cross-process delivery of CACHE_INVALIDATION events (MJ #5510, part B).
 *
 * Every BaseEntity save/delete in an MJAPI process is published on that process's local
 * CACHE_INVALIDATION topic, so only browsers whose WebSocket is attached to that process hear about
 * it. That breaks the moment background work (agents, scheduled jobs) runs in a separate worker
 * process — the isolation that keeps a stall in that work from hanging every interactive session.
 * The worker has no browser sockets, so its saves would reach no one.
 *
 * This module is the pure half — the outbound hook and the inbound parser. `sharedCache.ts` wires
 * them to Redis, exactly as it does for push-status updates. Kept free of MJServer imports, like
 * `CacheInvalidationResolver`, so it never drags config validation into a test's import chain.
 *
 * @module MJServer/generic/CacheInvalidationFanOut
 */

import type { CacheInvalidationPayload } from './CacheInvalidationResolver.js';

let publishHook: ((payload: CacheInvalidationPayload) => void) | undefined;

/** Install (or clear, with `undefined`) the outbound hook. Called by `WireCacheInvalidationFanOut`. */
export function SetCacheInvalidationPublishHook(hook: ((payload: CacheInvalidationPayload) => void) | undefined): void {
  publishHook = hook;
}

/**
 * Forward a locally-originated event to other processes. Call it only for events that originated
 * here — an event received from the bus is republished onto the local topic directly and must not
 * come back through this function, or it would loop.
 *
 * Never throws: the bus is an addition to local delivery, and a save must not fail because Redis did.
 */
export function ReplicateCacheInvalidation(payload: CacheInvalidationPayload): void {
  if (!publishHook) {
    return;
  }
  try {
    publishHook(payload);
  } catch {
    // Local delivery already happened; a peer that misses this event re-reads on its next query.
  }
}

/**
 * Parse an event received from another process. Returns `null` for anything that must not be
 * republished: malformed JSON, a field of the wrong type, no entity name (the subscription filter
 * could not permission-check it), no source, or this process's own event echoed back.
 */
export function ParseReplicatedCacheInvalidation(raw: string, localServerId: string): CacheInvalidationPayload | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof parsed !== 'object' || parsed === null) {
    return null;
  }
  const fields = parsed as Record<string, unknown>;
  const { entityName, primaryKeyValues, action, sourceServerId, timestamp, originSessionId, recordData } = fields;

  if (typeof entityName !== 'string' || !entityName || typeof action !== 'string') {
    return null;
  }
  if (typeof sourceServerId !== 'string' || !sourceServerId || sourceServerId === localServerId) {
    return null;
  }
  if (!isOptionalString(primaryKeyValues) || !isOptionalString(originSessionId) || !isOptionalString(recordData)) {
    return null;
  }
  const session = originSessionId ?? undefined;
  const record = recordData ?? undefined;
  const when = typeof timestamp === 'string' || typeof timestamp === 'number' ? new Date(timestamp) : new Date();

  return {
    entityName,
    primaryKeyValues: primaryKeyValues ?? null,
    action,
    sourceServerId,
    timestamp: Number.isNaN(when.getTime()) ? new Date() : when,
    ...(session !== undefined ? { originSessionId: session } : {}),
    ...(record !== undefined ? { recordData: record } : {}),
  };
}

function isOptionalString(value: unknown): value is string | null | undefined {
  return value === undefined || value === null || typeof value === 'string';
}
