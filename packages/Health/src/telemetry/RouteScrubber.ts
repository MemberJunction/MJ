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
   * Scrubs `rawUrl`, stripping both query string and fragment entirely (all query parameters and
   * fragments — no allowlist), safely decoding percent-encoding, preventing path traversal, and
   * matching the remaining clean path against {@link KNOWN_ROUTES}.
   */
  public static Scrub(rawUrl: string): ScrubbedRouteResult {
    if (typeof rawUrl !== 'string' || rawUrl.length === 0 || rawUrl.length > 4096) {
      return { RouteTemplate: 'unknown', ScrubbedPath: '/unknown' };
    }

    const qIdx = rawUrl.indexOf('?');
    const hIdx = rawUrl.indexOf('#');
    const cutIdx = qIdx === -1 ? hIdx : hIdx === -1 ? qIdx : Math.min(qIdx, hIdx);
    const withoutQueryOrFragment = cutIdx === -1 ? rawUrl : rawUrl.slice(0, cutIdx);

    let decoded: string;
    try {
      decoded = decodeURIComponent(withoutQueryOrFragment);
    } catch {
      return { RouteTemplate: 'unknown', ScrubbedPath: '/unknown' };
    }

    if (decoded.split('/').some((seg) => seg === '..')) {
      return { RouteTemplate: 'unknown', ScrubbedPath: '/unknown' };
    }

    let start = 0;
    while (start < decoded.length && decoded.charCodeAt(start) === 47) {
      start++;
    }
    let end = decoded.length;
    while (end > start && decoded.charCodeAt(end - 1) === 47) {
      end--;
    }
    const cleanUrl = decoded.slice(start, end);
    if (cleanUrl.length === 0) {
      return { RouteTemplate: 'unknown', ScrubbedPath: '/unknown' };
    }

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

/** Convenience wrapper for {@link RouteScrubber.Scrub}. */
export function ScrubMjRoute(rawUrlOrPath: string): ScrubbedRouteResult {
  return RouteScrubber.Scrub(rawUrlOrPath);
}
