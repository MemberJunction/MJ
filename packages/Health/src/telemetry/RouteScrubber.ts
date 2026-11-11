/** Result of scrubbing a raw client-side route via {@link RouteScrubber.Scrub}. */
export interface ScrubbedRouteResult {
  /** The matched route's static template, safe to share (no record IDs or search text). */
  RouteTemplate: string;
  /** The scrubbed path: record IDs replaced with `_id_`, search terms replaced with `[REDACTED]`. */
  ScrubbedPath: string;
  ResourceType?: string;
  EntityName?: string;
  ApplicationName?: string;
}

interface KnownRoute {
  pattern: RegExp;
  template: string;
  scrubbed: (match: RegExpMatchArray) => string;
}

/**
 * Sanitizes MJ Explorer navigation paths before they reach any telemetry processing. MJ URLs
 * routinely contain database record IDs and raw search terms (e.g.
 * `resource/record/:entityName/:recordId`, `resource/search/:searchInput`) — `RouteScrubber`
 * tokenizes record IDs to `_id_` (never hashed — a hash is still a stable correlate) and fully
 * redacts search terms, so neither can leave the deployment boundary through a route-change event.
 *
 * **Fails closed**: a path that matches none of {@link KNOWN_ROUTES} resolves to
 * `RouteTemplate: 'unknown'` / `ScrubbedPath: '/unknown'` rather than passing the raw path through
 * — an unrecognized route is exactly the case most likely to carry something unanticipated.
 */
export class RouteScrubber {
  private static readonly KNOWN_ROUTES: readonly KnownRoute[] = [
    {
      pattern: /^app\/([^/]+)\/record\/([^/]+)\/([^/]+)/,
      template: 'app/:appName/record/:entityName/:recordId',
      scrubbed: (m) => `app/${m[1]}/record/${m[2]}/_id_`,
    },
    {
      pattern: /^resource\/record\/([^/]+)\/([^/]+)/,
      template: 'resource/record/:entityName/:recordId',
      scrubbed: (m) => `resource/record/${m[1]}/_id_`,
    },
    {
      pattern: /^resource\/search\/(.+)/,
      template: 'resource/search/:searchInput',
      scrubbed: () => 'resource/search/[REDACTED]',
    },
    {
      pattern: /^resource\/view\/([^/]+)/,
      template: 'resource/view/:viewId',
      scrubbed: () => 'resource/view/_id_',
    },
    {
      pattern: /^resource\/dashboard\/([^/]+)/,
      template: 'resource/dashboard/:dashboardId',
      scrubbed: () => 'resource/dashboard/_id_',
    },
  ];

  /**
   * Scrubs `rawUrl`, stripping its query string entirely (all query parameters — no allowlist;
   * `RouteScrubber` itself cannot enumerate "non-PII system flags", so stripping everything is the
   * fail-closed posture) and matching the remaining path against {@link KNOWN_ROUTES}.
   */
  public static Scrub(rawUrl: string): ScrubbedRouteResult {
    const cleanUrl = rawUrl.split('?')[0].replace(/^\//, '');

    for (const route of this.KNOWN_ROUTES) {
      const match = cleanUrl.match(route.pattern);
      if (match) {
        return {
          RouteTemplate: route.template,
          ScrubbedPath: '/' + route.scrubbed(match),
          ...this.describeMatch(route.template, match),
        };
      }
    }

    // Fail closed on unrecognized routes.
    return { RouteTemplate: 'unknown', ScrubbedPath: '/unknown' };
  }

  /** Derives the optional descriptive fields from a successful match, without echoing raw values. */
  private static describeMatch(template: string, match: RegExpMatchArray): Pick<ScrubbedRouteResult, 'ResourceType' | 'EntityName' | 'ApplicationName'> {
    if (template.startsWith('app/:appName/record/')) {
      return { ResourceType: 'record', ApplicationName: match[1], EntityName: match[2] };
    }
    if (template.startsWith('resource/record/')) {
      return { ResourceType: 'record', EntityName: match[1] };
    }
    if (template.startsWith('resource/search/')) {
      return { ResourceType: 'search' };
    }
    if (template.startsWith('resource/view/')) {
      return { ResourceType: 'view' };
    }
    if (template.startsWith('resource/dashboard/')) {
      return { ResourceType: 'dashboard' };
    }
    return {};
  }
}
