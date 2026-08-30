/**
 * Deep-link parameter resolution for the chat resource wrapper.
 *
 * Kept in its own module (no Angular decorators) so the rule can be unit-tested directly.
 */

/**
 * Resolve a deep-link parameter, letting the LIVE URL outrank restored tab configuration.
 *
 * On a cold load — a deep link opened in a fresh browser tab, which is every click of a
 * Slack/Teams "open conversation in MJ Explorer" link — the workspace tab is restored carrying
 * the queryParams of the PREVIOUS visit, and nothing reconciles them against the URL actually
 * being opened: the shell's URL-is-source-of-truth sync runs on router navigation events, not at
 * boot. The deep link therefore opened whatever was last viewed, which reads as a broken link.
 *
 * Ordinary in-app navigation is unaffected: when the URL carries no such parameter, the saved
 * configuration is used exactly as before.
 *
 * @param name         parameter to read (e.g. `conversationId`)
 * @param search       `window.location.search` at the time of the call
 * @param savedParams  queryParams restored with the workspace tab
 * @param configValue  value from the tab configuration itself
 */
export function resolveDeepLinkParam(
  name: string,
  search: string,
  savedParams: Record<string, string> | undefined,
  configValue: string | undefined
): string | undefined {
  const fromUrl = new URLSearchParams(search ?? '').get(name);
  return fromUrl || savedParams?.[name] || configValue || undefined;
}
