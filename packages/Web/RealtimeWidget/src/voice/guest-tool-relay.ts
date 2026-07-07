/**
 * @fileoverview Live relay for NON-channel (server-executed) realtime tool calls — chiefly
 * `invoke-target-agent`. When the widget's voice session has interactive channels enabled, the
 * controller intercepts every tool call; channel-prefixed calls run locally, and everything else is
 * relayed here to MJAPI's `ExecuteRealtimeSessionTool` (the same mutation Explorer's realtime overlay
 * uses) and the result fed back to the model. Reuses the configured guest GraphQLDataProvider; no new
 * endpoint. Live-only — exercised under a running MJAPI, not in unit tests.
 *
 * @module @memberjunction/realtime-widget
 */

import { GraphQLDataProvider } from '@memberjunction/graphql-dataprovider';
import type { RelayToolFn } from './realtime-voice-controller.js';

const EXECUTE_TOOL_MUTATION = `
mutation WidgetRelayRealtimeTool($agentSessionId: String!, $callId: String!, $toolName: String!, $argsJson: String!) {
  ExecuteRealtimeSessionTool(agentSessionId: $agentSessionId, callId: $callId, toolName: $toolName, argsJson: $argsJson)
}`;

/** Builds the relay fn the voice controller calls for non-channel tools (returns the tool result JSON). */
export function createGuestToolRelay(): RelayToolFn {
    return async (agentSessionId: string, callId: string, toolName: string, argsJson: string): Promise<string> => {
        const data = (await GraphQLDataProvider.Instance.ExecuteGQL(EXECUTE_TOOL_MUTATION, {
            agentSessionId,
            callId,
            toolName,
            argsJson,
        })) as { ExecuteRealtimeSessionTool: string };
        return data.ExecuteRealtimeSessionTool ?? '{}';
    };
}
