/**
 * @fileoverview Maps a discovery corpus request to the decision's state, the way production builds
 * it, so the eval asks exactly what Sage's discovery asks.
 *
 * Production (`BaseAgent`) reads the run's opening request with `OpeningRequestText`: the text of
 * the last user message when the run starts, trimmed and capped. A corpus request is that one user
 * message, so its state is `OpeningRequestText` over a conversation holding only it.
 *
 * @module @memberjunction/testing-engine
 */

import { OpeningRequestText } from '@memberjunction/ai-agents';

/**
 * The state production's decision discovery sends for a request: `OpeningRequestText` of a
 * conversation whose only message is the request, from the user. Empty when the request is blank.
 *
 * @param request The request, as the user typed it.
 */
export function DiscoveryDecisionState(request: string): string {
    return OpeningRequestText([{ role: 'user', content: request }]);
}
