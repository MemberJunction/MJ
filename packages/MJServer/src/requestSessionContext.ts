import { AsyncLocalStorage } from 'node:async_hooks';
import type { BaseEntity } from '@memberjunction/core';
import { GetGlobalObjectStore } from '@memberjunction/global';

const REQUEST_SESSION_ALS_KEY = '___MJ_SERVER_REQUEST_SESSION_ALS___';
const PROVIDER_ORIGIN_SESSION_MAP_KEY = '___MJ_SERVER_PROVIDER_ORIGIN_SESSION_MAP___';

function getRequestSessionAsyncLocalStorage(): AsyncLocalStorage<string | null> {
  const store = GetGlobalObjectStore();
  let als = store?.[REQUEST_SESSION_ALS_KEY] as AsyncLocalStorage<string | null> | undefined;
  if (!als) {
    als = new AsyncLocalStorage<string | null>();
    if (store) {
      store[REQUEST_SESSION_ALS_KEY] = als;
    }
  }
  return als;
}

function getProviderOriginSessionMap(): WeakMap<object, string> {
  const store = GetGlobalObjectStore();
  let map = store?.[PROVIDER_ORIGIN_SESSION_MAP_KEY] as WeakMap<object, string> | undefined;
  if (!map) {
    map = new WeakMap<object, string>();
    if (store) {
      store[PROVIDER_ORIGIN_SESSION_MAP_KEY] = map;
    }
  }
  return map;
}

/**
 * Runs `fn` with `sessionId` bound in Node.js `AsyncLocalStorage` so downstream
 * `BaseEntity` save/delete invalidation events know which browser session originated the write.
 */
export function RunWithRequestSessionId<T>(sessionId: string | null | undefined, fn: () => T): T {
  const normalized = typeof sessionId === 'string' && sessionId.trim().length > 0 ? sessionId.trim() : null;
  return getRequestSessionAsyncLocalStorage().run(normalized, fn);
}

/**
 * Returns the active HTTP/GraphQL request's `x-session-id` when executing inside {@link RunWithRequestSessionId},
 * or `null` for server-internal background work (timers, agents, startup).
 */
export function GetCurrentRequestSessionId(): string | null {
  return getRequestSessionAsyncLocalStorage().getStore() ?? null;
}

/**
 * Associates a per-request `DatabaseProviderBase` instance with the originating client's `sessionId`.
 */
export function StampProviderOriginSessionId(provider: object | null | undefined, sessionId: string | null | undefined): void {
  if (!provider || typeof sessionId !== 'string' || sessionId.trim().length === 0) {
    return;
  }
  getProviderOriginSessionMap().set(provider, sessionId.trim());
}

/**
 * Resolves the originating browser `sessionId` for a `BaseEntity` save/delete event:
 * 1. Checks the per-request provider stamp on `baseEntity.ProviderToUse` (survives event-bus/timer boundaries).
 * 2. Falls back to `AsyncLocalStorage` (`GetCurrentRequestSessionId()`).
 * 3. Returns `null` for genuine server-initiated writes so all browsers receive them.
 */
export function ResolveOriginSessionId(baseEntity?: BaseEntity | null): string | null {
  const provider = baseEntity?.ProviderToUse;
  if (provider && typeof provider === 'object') {
    const stamped = getProviderOriginSessionMap().get(provider);
    if (stamped) {
      return stamped;
    }
  }
  return GetCurrentRequestSessionId();
}
