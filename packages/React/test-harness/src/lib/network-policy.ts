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
 * Request routing sees HTTP requests and WebSockets only. WebRTC bypasses it, so every filtered
 * page has the WebRTC constructors removed ({@link DISABLE_WEBRTC_SCRIPT}). DNS prefetching bypasses
 * it too, so a browser the harness launches has it turned off ({@link BROWSER_LAUNCH_ARGS}); a
 * browser the harness attaches to keeps whatever flags it was started with. An allowed CDN origin is
 * allowed as a whole, and a redirect from it is not re-checked: this is a first layer, not a
 * sandbox.
 */

/**
 * Chromium flags for a browser the harness launches with the filter on. A DNS prefetch of
 * `<data>.attacker.example` carries data in the lookup itself, and never passes through routing.
 */
export const BROWSER_LAUNCH_ARGS: readonly string[] = ['--dns-prefetch-disable'];

/**
 * Init script for every filtered page, run in each of its frames. WebRTC's ICE traffic goes to any
 * STUN or TURN server the page names, over UDP or TCP, without passing through request routing,
 * and no Chromium flag stops TURN over TCP. Components have no use for WebRTC, so it is removed.
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
