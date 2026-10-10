/**
 * @fileoverview The production voice-mint function: calls the `StartRealtimeClientSession`
 * GraphQL mutation (via the already-configured guest GraphQLDataProvider) for the widget's
 * PINNED agent and maps the result to the `ClientRealtimeSessionConfig` the realtime client
 * applies verbatim — exactly mirroring Explorer's `buildClientConfig`, a relay session's
 * `Transport` and `RelayUrl` included. Reuses the shipped mint resolver; no new server endpoint.
 * The widget shows no agent video, so it tells the mint (`showsAgentVideo: false`) and the server
 * asks the model for no avatar.
 *
 * NOTE: a live mint needs the guest GraphQL provider configured by RuntimeWidgetTransport and a
 * running MJAPI; the unit tests drive it through a stand-in provider.
 *
 * @module @memberjunction/realtime-widget
 */

import { GraphQLDataProvider } from '@memberjunction/graphql-dataprovider';
import { ParseRealtimeClientTransport, type ClientRealtimeSessionConfig } from '@memberjunction/ai';
import type { WidgetSession } from '../types.js';
import type { VoiceMintFn, VoiceMintResult } from './realtime-voice-controller.js';
import type { WidgetChannelToolDefinition } from './channels/base-widget-channel.js';

/** The subset of StartRealtimeClientSessionResult the widget needs. */
interface StartRealtimeSessionGQLResult {
    StartRealtimeClientSession: {
        AgentSessionId: string;
        Provider: string;
        Model: string;
        EphemeralToken: string;
        ExpiresAt: string;
        SessionConfigJson: string;
        /** How the browser reaches the provider; absent from a server that predates it, null on a direct session. */
        Transport?: string | null;
        /** A relay session's relay URL. It carries the relay's ticket, so it is never logged. */
        RelayUrl?: string | null;
    };
}

/** The mint's variables. */
type StartRealtimeSessionVariables = Record<string, string | boolean | undefined>;

/** The fields every server returns. */
const MINT_FIELDS: readonly string[] = ['AgentSessionId', 'Provider', 'Model', 'EphemeralToken', 'ExpiresAt', 'SessionConfigJson'];

/** A relay session's transport and URL. A server that predates them rejects the mint at validation. */
const TRANSPORT_FIELDS: readonly string[] = ['Transport', 'RelayUrl'];

/**
 * What the mint asks for beyond what every server takes. A server that predates one rejects the mint at validation; the
 * mint then goes without that one alone, and keeps doing so.
 */
interface WidgetMintExtensions {
    /** A relay session's transport and URL: the `Transport` and `RelayUrl` fields. */
    Transport: boolean;
    /** The widget shows no agent video: the `showsAgentVideo: false` argument, so the server asks for no avatar. */
    NoAgentVideo: boolean;
}

/** What the widget says, once per mint function, when the server rejects an extension. */
const UNSUPPORTED_WARNINGS: Readonly<Record<keyof WidgetMintExtensions, string>> = {
    Transport: '[RealtimeWidget] The server does not report the session transport — minting without it; every session connects directly.',
    NoAgentVideo:
        "[RealtimeWidget] The server does not take showsAgentVideo — minting without it; it may ask for an avatar the widget can't show (the call stays audio only).",
};

/** The mint mutation, with the extensions asked for. */
function startRealtimeMutation(asked: WidgetMintExtensions): string {
    const fields = asked.Transport ? [...MINT_FIELDS, ...TRANSPORT_FIELDS] : MINT_FIELDS;
    const variable = asked.NoAgentVideo ? ', $showsAgentVideo: Boolean' : '';
    const argument = asked.NoAgentVideo ? ', showsAgentVideo: $showsAgentVideo' : '';
    return `
mutation StartWidgetVoiceSession($targetAgentId: String, $clientToolsJson: String${variable}) {
  StartRealtimeClientSession(targetAgentId: $targetAgentId, clientToolsJson: $clientToolsJson${argument}) {
    ${fields.join('\n    ')}
  }
}`;
}

/**
 * The extension a mint failure rejects, when it is a server that predates one rejecting it at validation
 * (`Unknown argument "showsAgentVideo"…`, `Cannot query field "Transport"…`); `null` for any other failure. The quoted
 * field name, not the bare word: "Transport" alone could be any transport error.
 */
function rejectedExtension(error: unknown, asked: WidgetMintExtensions): keyof WidgetMintExtensions | null {
    const message = error instanceof Error ? error.message : String(error);
    if (asked.NoAgentVideo && message.includes('showsAgentVideo')) {
        return 'NoAgentVideo';
    }
    if (asked.Transport && (message.includes('field "Transport"') || message.includes('RelayUrl'))) {
        return 'Transport';
    }
    return null;
}

/**
 * Builds a VoiceMintFn that mints a realtime session for the widget's pinned agent. The controller
 * passes the enabled channels' client-tool definitions, which are declared to the model at session
 * start (so it can call e.g. `Whiteboard_*`); `RealtimeToolDefinition` is structurally identical to
 * {@link WidgetChannelToolDefinition} (Name / Description / ParametersSchema), so they serialize as-is.
 *
 * It asks for the session's transport and relay URL too, and says the widget shows no agent video
 * (`showsAgentVideo: false`). A server that predates one of them rejects the mint at validation; the
 * function then mints without that one alone, and keeps doing so.
 */
export function CreateGuestVoiceMint(session: WidgetSession): VoiceMintFn {
    const serverLacks = new Set<keyof WidgetMintExtensions>();
    const mint = async (variables: StartRealtimeSessionVariables): Promise<StartRealtimeSessionGQLResult> => {
        let asked: WidgetMintExtensions = { Transport: !serverLacks.has('Transport'), NoAgentVideo: !serverLacks.has('NoAgentVideo') };
        for (;;) {
            try {
                const sent = asked.NoAgentVideo ? { ...variables, showsAgentVideo: false } : variables;
                return (await GraphQLDataProvider.Instance.ExecuteGQL(startRealtimeMutation(asked), sent)) as StartRealtimeSessionGQLResult;
            } catch (error) {
                const rejected = rejectedExtension(error, asked);
                if (!rejected) {
                    throw error;
                }
                serverLacks.add(rejected);
                console.warn(UNSUPPORTED_WARNINGS[rejected]);
                asked = { ...asked, [rejected]: false };
            }
        }
    };
    return async (clientTools: WidgetChannelToolDefinition[]): Promise<VoiceMintResult> => {
        const data = await mint({
            targetAgentId: session.pinnedAgentId,
            clientToolsJson: clientTools.length > 0 ? JSON.stringify(clientTools) : undefined,
        });
        const r = data.StartRealtimeClientSession;
        return { provider: r.Provider, sessionConfig: toClientConfig(r), agentSessionId: r.AgentSessionId };
    };
}

/** @deprecated Use {@link CreateGuestVoiceMint}. */
export function createGuestVoiceMint(session: WidgetSession): VoiceMintFn {
  return CreateGuestVoiceMint(session);
}

/** The minted session as the realtime client connects with it; a relay session's transport and URL go as minted. */
function toClientConfig(r: StartRealtimeSessionGQLResult['StartRealtimeClientSession']): ClientRealtimeSessionConfig {
    const transport = ParseRealtimeClientTransport(r.Transport);
    return {
        Provider: r.Provider,
        Model: r.Model,
        EphemeralToken: r.EphemeralToken,
        ExpiresAt: r.ExpiresAt,
        ...(transport ? { Transport: transport } : {}),
        ...(r.RelayUrl ? { RelayUrl: r.RelayUrl } : {}),
        SessionConfig: parseSessionConfig(r.SessionConfigJson),
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
