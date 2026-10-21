/**
 * The BROWSER EDGE of the tab-close signal — deliberately thin (same rule as `widget-auth.browser.ts`): the
 * real keepalive `fetch` and the real `GraphQLDataProvider` config. Every decision lives in the covered
 * {@link WidgetPageClose}.
 */
import { GraphQLDataProvider } from '@memberjunction/graphql-dataprovider';
import { WidgetPageClose } from './widget-page-close';

/** The same mutation the runtime sends on an explicit end — over a raw fetch, because a normal GraphQL call is cancelled at teardown. */
const CLOSE_MUTATION = `
mutation CloseAgentSession($agentSessionId: String!) {
  CloseAgentSession(agentSessionId: $agentSessionId)
}`;

/** Reads the live provider's endpoint and bearer token; null until the widget has authenticated. */
function liveConfig(): { url: string; token: string } | null {
  try {
    const config = GraphQLDataProvider.Instance?.ConfigData;
    const url = config?.URL ?? '';
    const token = config?.Token ?? '';
    return url.length > 0 && token.length > 0 ? { url, token } : null;
  } catch {
    // Nothing has configured the provider yet — that IS the answer, not an error.
    return null;
  }
}

/** Fire-and-forget by design: at pagehide there is nobody left to show a failure to. */
function keepaliveSend(url: string, token: string, agentSessionId: string): void {
  void fetch(url, {
    method: 'POST',
    keepalive: true,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ query: CLOSE_MUTATION, variables: { agentSessionId } })
  }).catch(() => {
    // Swallowing is the documented contract: the page is being torn down, there is no console left to reach,
    // and the server's idle sweep is the designed backstop for a lost close.
  });
}

/** Builds the production tab-close handler for a browser embed. */
export function CreateBrowserPageClose(): WidgetPageClose {
  return new WidgetPageClose({ config: liveConfig, send: keepaliveSend });
}
