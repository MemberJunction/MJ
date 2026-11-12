/**
 * The link a conversation export writes for each artifact.
 *
 * Kept in its own module (no Angular decorators) so the rule can be unit-tested directly.
 */
import type { ExportArtifactLinkTarget } from '@memberjunction/ng-conversations';

/**
 * Build a deep link that opens an exported artifact in the chat resource: the current page's
 * address with only `conversationId`, `artifactId` and `versionNumber` as its query, the
 * parameters the chat resource reads on load (see `ResolveDeepLinkParam`). The path is kept
 * as-is, so the link respects app-scoped routes and any base path. Returns null when the
 * current address is not http(s).
 *
 * @param currentHref `window.location.href` at export time
 */
export function BuildExportArtifactLink(currentHref: string, target: ExportArtifactLinkTarget): string | null {
  let url: URL;
  try {
    url = new URL(currentHref);
  } catch {
    return null;
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return null;
  }
  url.search = '';
  url.hash = '';
  url.searchParams.set('conversationId', target.ConversationID);
  url.searchParams.set('artifactId', target.ArtifactID);
  url.searchParams.set('versionNumber', String(target.VersionNumber));
  return url.toString();
}
