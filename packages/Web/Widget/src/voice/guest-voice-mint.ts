/**
 * @fileoverview The production voice-mint function: calls the `StartRealtimeClientSession`
 * GraphQL mutation (via the already-configured guest GraphQLDataProvider) for the widget's
 * PINNED agent and maps the result to the `ClientRealtimeSessionConfig` the realtime client
 * applies verbatim — exactly mirroring Explorer's `buildClientConfig`. Reuses the shipped
 * mint resolver; no new server endpoint.
 *
 * NOTE: live-only (needs the guest GraphQL provider configured by RuntimeWidgetTransport +
 * a running MJAPI). Unit tests use MockVoiceController, so this is type-checked but not
 * exercised offline.
 *
 * @module @memberjunction/web-widget
 */

import { GraphQLDataProvider } from '@memberjunction/graphql-dataprovider';
import type { ClientRealtimeSessionConfig } from '@memberjunction/ai';
import type { WidgetSession } from '../types.js';
import type { VoiceMintFn, VoiceMintResult } from './realtime-voice-controller.js';

/** The subset of StartRealtimeClientSessionResult the widget needs. */
interface StartRealtimeSessionGQLResult {
    StartRealtimeClientSession: {
        Provider: string;
        Model: string;
        EphemeralToken: string;
        ExpiresAt: string;
        SessionConfigJson: string;
    };
}

const START_REALTIME_MUTATION = `
mutation StartWidgetVoiceSession($targetAgentId: String) {
  StartRealtimeClientSession(targetAgentId: $targetAgentId) {
    Provider
    Model
    EphemeralToken
    ExpiresAt
    SessionConfigJson
  }
}`;

/** Builds a VoiceMintFn that mints a realtime session for the widget's pinned agent. */
export function createGuestVoiceMint(session: WidgetSession): VoiceMintFn {
    return async (): Promise<VoiceMintResult> => {
        const data = (await GraphQLDataProvider.Instance.ExecuteGQL(START_REALTIME_MUTATION, {
            targetAgentId: session.pinnedAgentId,
        })) as StartRealtimeSessionGQLResult;
        const r = data.StartRealtimeClientSession;
        const sessionConfig: ClientRealtimeSessionConfig = {
            Provider: r.Provider,
            Model: r.Model,
            EphemeralToken: r.EphemeralToken,
            ExpiresAt: r.ExpiresAt,
            SessionConfig: parseSessionConfig(r.SessionConfigJson),
        };
        return { provider: r.Provider, sessionConfig };
    };
}

/** Parses the server-built session config; an empty object on failure (client applies nothing). */
function parseSessionConfig(json: string | null): ClientRealtimeSessionConfig['SessionConfig'] {
    if (!json) {
        return {};
    }
    try {
        return JSON.parse(json) as ClientRealtimeSessionConfig['SessionConfig'];
    } catch {
        return {};
    }
}
