/**
 * Network policy for the test page.
 *
 * The component under test is generated code, and it runs with real data reached through the
 * harness's exposed functions (`__mjRunView`, `__mjRunQuery`, ...). Those functions are Playwright
 * bindings, not HTTP, so the page itself only needs the network to load the runtime and the
 * registered component libraries from their CDNs. Requests to any other origin are blocked, so a
 * component cannot send the rows it was given to an outside host, nor reach hosts on the network
 * the harness runs in.
 *
 * Two layers enforce it. Request routing sees the page's HTTP requests and WebSockets, and records
 * what it blocks for the page that made it. Some traffic never reaches routing: Speculation Rules
 * prefetches, and WebRTC's connections to STUN and TURN servers. So every context the harness
 * creates also sends its traffic through an allowlisting proxy (`AllowlistProxy`), and a browser
 * the harness launches gets flags ({@link BROWSER_LAUNCH_ARGS}) that send WebRTC's TCP through that
 * proxy and turn off its UDP. WebRTC is also removed from every frame
 * ({@link DISABLE_WEBRTC_SCRIPT}), but only as a first line: a script can be raced.
 *
 * What is not covered: a browser the harness attaches to keeps its own launch flags, so WebRTC
 * over UDP is not stopped there; a reused external context gets neither the proxy nor the
 * context-wide route; an allowed origin is allowed as a whole; a redirect from an allowed origin
 * is not re-checked by routing (the proxy does check it). This is a first layer, not a sandbox.
 */

/**
 * Chromium flags for a browser the harness launches with the filter on.
 * - WebRTC may use only the proxy: its TCP goes through the proxy, which refuses hosts the
 *   allowlist does not allow, and its UDP, which no HTTP proxy can carry, is turned off.
 * - DNS prefetching is off: a lookup of `<data>.attacker.example` carries data on its own.
 */
export const BROWSER_LAUNCH_ARGS: readonly string[] = [
  '--force-webrtc-ip-handling-policy=disable_non_proxied_udp',
  '--webrtc-ip-handling-policy=disable_non_proxied_udp',
  '--dns-prefetch-disable',
];

/**
 * Init script for every filtered context (or page, in a reused context), run in each frame.
 * Components have no use for WebRTC, so its constructors are removed. This is a first line only:
 * Chrome can hand a sandboxed iframe a fresh `RTCPeerConnection` before the script runs, which
 * is why the proxy and {@link BROWSER_LAUNCH_ARGS} back it at the network level.
 */
export const DISABLE_WEBRTC_SCRIPT = `for (const name of ['RTCPeerConnection', 'webkitRTCPeerConnection', 'RTCDataChannel', 'RTCIceCandidate', 'RTCSessionDescription', 'RTCRtpSender', 'RTCRtpReceiver', 'RTCRtpTransceiver']) {
  try { delete globalThis[name]; } catch { /* not configurable in this browser: leave it */ }
}`;

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
 * One allowlist entry. A URL allows exactly its origin: that scheme, host and port. A bare host
 * name allows that host on any http(s) port, and `host:port` allows that port only.
 */
interface AllowEntry {
  scheme: string | null;
  host: string;
  port: string | null;
}

/** The port a parsed http(s) URL connects to, filling in the scheme's default. */
function effectivePort(url: URL): string {
  return url.port || (url.protocol === 'http:' ? '80' : '443');
}

/** The entry `value` names, or null when it names no host. */
function parseEntry(value: string): AllowEntry | null {
  const trimmed = value.trim();
  if (trimmed.includes('://')) {
    try {
      const url = new URL(trimmed);
      if ((url.protocol !== 'http:' && url.protocol !== 'https:') || !url.hostname) {
        return null;
      }
      return { scheme: url.protocol, host: url.hostname.toLowerCase(), port: effectivePort(url) };
    } catch {
      return null;
    }
  }
  try {
    const url = new URL(`https://${trimmed}`);
    return url.hostname ? { scheme: null, host: url.hostname.toLowerCase(), port: url.port || null } : null;
  } catch {
    return null;
  }
}

function entryKey(entry: AllowEntry): string {
  return `${entry.scheme ?? '*:'}//${entry.host}:${entry.port ?? '*'}`;
}

/**
 * The origins and hosts the allowlist is given. One instance is shared by all pages of a
 * {@link BrowserManager}; each page may also get its own, for a URL a caller navigates it to.
 */
export class NetworkAllowlist {
  private readonly entries = new Map<string, AllowEntry>();

  constructor(hostsOrUrls: readonly string[] = []) {
    this.AllowUrls(hostsOrUrls);
  }

  /**
   * Allow each value. A URL ('https://cdn.example.com/lib.js') allows its origin only; a bare
   * host name ('cdn.example.com') allows that host on any port, and 'host:port' that port only.
   */
  AllowUrls(hostsOrUrls: readonly string[]): void {
    for (const value of hostsOrUrls) {
      const entry = parseEntry(value);
      if (entry) {
        this.entries.set(entryKey(entry), entry);
      }
    }
  }

  /** The allowed entries, sorted, for logging: `scheme://host:port`, with `*` for any. */
  get AllowedEntries(): string[] {
    return [...this.entries.keys()].sort();
  }

  /** True when the page may make a request to `url`. */
  IsAllowed(url: string): boolean {
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      return false;
    }
    if (LOCAL_SCHEMES.has(parsed.protocol)) {
      return true;
    }
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return false;
    }
    const host = parsed.hostname.toLowerCase();
    const port = effectivePort(parsed);
    for (const entry of this.entries.values()) {
      if (entry.host === host && (entry.port === null || entry.port === port)
        && (entry.scheme === null || entry.scheme === parsed.protocol)) {
        return true;
      }
    }
    return false;
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
