/**
 * Network policy for the test page.
 *
 * The component under test is generated code, and it runs with real data reached through the
 * harness's exposed functions (`__mjRunView`, `__mjRunQuery`, ...). Those functions are Playwright
 * bindings, not HTTP, so the page itself only needs the network to load the runtime and the
 * registered component libraries from their CDNs. Everything else is blocked, so a component cannot
 * send the rows it was given, or anything else, to an outside host, nor reach hosts on the
 * network the harness runs in.
 */

/** Schemes that never leave the browser and are always allowed. */
const LOCAL_SCHEMES = new Set(['about:', 'data:', 'blob:']);

/**
 * `'allowlist'` (default): only local schemes and allowed hosts are reachable.
 * `'unrestricted'`: no filtering. For local debugging only; never for generated code.
 */
export type NetworkAccessMode = 'allowlist' | 'unrestricted';

/** The host a URL names, lowercase, or null when the URL does not parse or has no host. */
export function HostOfUrl(url: string): string | null {
  try {
    const host = new URL(url).hostname.toLowerCase();
    return host.length > 0 ? host : null;
  } catch {
    return null;
  }
}

/**
 * The hosts the allowlist is given, plus every request it refused. One instance is shared by all
 * pages of a {@link BrowserManager}; each page also records its own refusals for its result.
 */
export class NetworkAllowlist {
  private readonly hosts = new Set<string>();

  constructor(hostsOrUrls: readonly string[] = []) {
    this.AllowUrls(hostsOrUrls);
  }

  /** Allow the host of each URL. A bare host name ('cdn.example.com') is accepted as well. */
  AllowUrls(hostsOrUrls: readonly string[]): void {
    for (const value of hostsOrUrls) {
      const host = HostOfUrl(value) ?? HostOfUrl(`https://${value.trim()}`);
      if (host) {
        this.hosts.add(host);
      }
    }
  }

  /** The allowed hosts, sorted, for logging. */
  get AllowedHosts(): string[] {
    return [...this.hosts].sort();
  }

  /** True when the page may make a request to `url`. */
  IsAllowed(url: string): boolean {
    const scheme = schemeOfUrl(url);
    if (scheme && LOCAL_SCHEMES.has(scheme)) {
      return true;
    }
    if (scheme !== 'http:' && scheme !== 'https:') {
      return false;
    }
    const host = HostOfUrl(url);
    return host !== null && this.hosts.has(host);
  }
}

function schemeOfUrl(url: string): string | null {
  try {
    return new URL(url).protocol;
  } catch {
    return null;
  }
}

/**
 * The URL as it is recorded in a blocked-request report: origin and path only. The query string and
 * fragment are dropped, because they are where an exfiltration attempt would carry the data.
 */
export function RedactUrl(url: string): string {
  try {
    const parsed = new URL(url);
    return parsed.origin === 'null' ? parsed.protocol : `${parsed.origin}${parsed.pathname}`;
  } catch {
    return '(unparseable URL)';
  }
}
