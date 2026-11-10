/**
 * @fileoverview Closes the server's agent session from `pagehide`, when the page is going away for good.
 *
 * The End path closes the session with an ordinary GraphQL `CloseAgentSession`, but the browser cancels
 * ordinary requests on unload, so a closed tab left the session `Active` until the server's idle janitor
 * swept it (15 minutes by default). This sends the same mutation as a `keepalive` fetch, which the browser
 * completes after the page is gone and which, unlike `sendBeacon`, carries the auth headers.
 *
 * @module @memberjunction/realtime-runtime
 */
import type { IMetadataProvider } from '@memberjunction/core';
import { ProviderRequestAuthFor, type ProviderRequestAuth } from './provider-request-auth';
import type { ClientCloseReason } from './RealtimeSessionRuntime';

/** Sends a session close that survives page unload. */
export interface ISessionCloseBeacon {
  /**
   * Dispatches the close synchronously (the page may be gone right after) and returns without waiting.
   * The returned promise settles with whether the server acknowledged it, when the page lives to see it;
   * it never rejects (failures are logged with the session id).
   */
  SendClose(agentSessionId: string, closeReason: ClientCloseReason): Promise<boolean>;
}

const CLOSE_MUTATION = `mutation CloseAgentSession($agentSessionId: String!, $closeReason: String) {
  CloseAgentSession(agentSessionId: $agentSessionId, closeReason: $closeReason)
}`;

interface CloseMutationResponse {
  data?: { CloseAgentSession?: boolean } | null;
  errors?: Array<{ message?: string }>;
}

/** {@link ISessionCloseBeacon} over a `keepalive` POST to the provider's GraphQL endpoint. */
export class FetchSessionCloseBeacon implements ISessionCloseBeacon {
  /** @param fetchImpl defaults to `globalThis.fetch`, resolved at call time so tests can stub it. */
  constructor(private readonly auth: ProviderRequestAuth, private readonly fetchImpl?: typeof fetch) {}

  public async SendClose(agentSessionId: string, closeReason: ClientCloseReason): Promise<boolean> {
    const context = `session ${agentSessionId} (closeReason ${closeReason})`;
    const doFetch = this.fetchImpl ?? globalThis.fetch;
    try {
      // The request is dispatched by this call, before the first await: the page may unload right after.
      const response = await doFetch(this.auth.GraphQLURL, {
        method: 'POST',
        keepalive: true,
        headers: { 'Content-Type': 'application/json', ...this.auth.Headers() },
        body: JSON.stringify({ query: CLOSE_MUTATION, variables: { agentSessionId, closeReason } }),
      });
      if (!response.ok) {
        console.warn(`[RealtimeSession] Page-close CloseAgentSession for ${context} rejected with status ${response.status}; the server janitor closes the session.`);
        return false;
      }
      const result = (await response.json()) as CloseMutationResponse;
      if (result.errors?.length) {
        console.warn(`[RealtimeSession] Page-close CloseAgentSession for ${context} failed: ${result.errors.map((e) => e.message ?? '').join('; ')}`);
        return false;
      }
      return result.data?.CloseAgentSession === true;
    } catch (error) {
      console.warn(`[RealtimeSession] Page-close CloseAgentSession for ${context} could not be sent; the server janitor closes the session.`, error);
      return false;
    }
  }
}

/** The default beacon for a provider; null when the provider has no GraphQL URL (see {@link ProviderRequestAuthFor}). */
export function CreateSessionCloseBeaconForProvider(provider: IMetadataProvider | null | undefined): ISessionCloseBeacon | null {
  const auth = ProviderRequestAuthFor(provider);
  return auth ? new FetchSessionCloseBeacon(auth) : null;
}
