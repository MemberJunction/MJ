import { MJAIBridgeProviderEntity } from '@memberjunction/core-entities';

/**
 * The canonical platform a meeting/call join URL belongs to. This is the *platform identity* a join
 * URL resolves to — distinct from (but used to find) an {@link MJAIBridgeProviderEntity} row. Kept as
 * a union type (repo convention — union over enum) so it exports cleanly and a new platform is a
 * one-line addition.
 */
export type JoinUrlPlatform =
    | 'Zoom'
    | 'Microsoft Teams'
    | 'Google Meet'
    | 'Cisco Webex'
    | 'Slack'
    | 'Discord'
    | 'RingCentral'
    | 'GoTo Meeting'
    | 'BlueJeans';

/**
 * One host-pattern → platform rule. A join URL matches the rule when its lowercased hostname *ends
 * with* {@link HostSuffix} (a true domain-suffix test, so `us02web.zoom.us` matches `zoom.us` but a
 * deceptive `zoom.us.evil.com` does NOT — see {@link hostnameEndsWith}).
 */
interface JoinUrlRule {
    /** The registrable host suffix that identifies the platform (e.g. `'zoom.us'`). */
    readonly HostSuffix: string;
    /** The platform a URL on this host belongs to. */
    readonly Platform: JoinUrlPlatform;
}

/**
 * The host-suffix → platform rule table. Ordered most-specific-first is unnecessary because matching
 * is by full domain-suffix (no rule is a suffix of another here), but new rules should still prefer
 * the most specific registrable host. Covers the meeting platforms in the bridge build set
 * (`/plans/realtime/realtime-bridges-architecture.md` §8) plus the two EOL platforms for completeness.
 */
const JOIN_URL_RULES: ReadonlyArray<JoinUrlRule> = [
    { HostSuffix: 'zoom.us', Platform: 'Zoom' },
    { HostSuffix: 'zoomgov.com', Platform: 'Zoom' },
    { HostSuffix: 'teams.microsoft.com', Platform: 'Microsoft Teams' },
    { HostSuffix: 'teams.live.com', Platform: 'Microsoft Teams' },
    { HostSuffix: 'meet.google.com', Platform: 'Google Meet' },
    { HostSuffix: 'webex.com', Platform: 'Cisco Webex' },
    { HostSuffix: 'slack.com', Platform: 'Slack' },
    { HostSuffix: 'discord.com', Platform: 'Discord' },
    { HostSuffix: 'discord.gg', Platform: 'Discord' },
    { HostSuffix: 'ringcentral.com', Platform: 'RingCentral' },
    { HostSuffix: 'rcv.io', Platform: 'RingCentral' },
    { HostSuffix: 'goto.com', Platform: 'GoTo Meeting' },
    { HostSuffix: 'gotomeeting.com', Platform: 'GoTo Meeting' },
    { HostSuffix: 'bluejeans.com', Platform: 'BlueJeans' },
];

/**
 * Classifies a meeting/call join URL into its {@link JoinUrlPlatform} by hostname — a **pure**,
 * dependency-free function. Returns `null` for an empty/malformed URL or an unrecognised host.
 *
 * The match is a strict domain-suffix test on the parsed hostname, never a naive substring scan, so
 * a hostile URL that merely *contains* a known token in its path or as a deceptive prefix
 * (`https://evil.com/zoom.us/j/123`, `https://zoom.us.attacker.com/...`) does **not** match the
 * legitimate platform.
 *
 * @param url The raw join URL (e.g. `'https://us02web.zoom.us/j/8675309?pwd=abc'`).
 * @returns The platform the URL belongs to, or `null` when none matches.
 */
export function ClassifyJoinUrl(url: string): JoinUrlPlatform | null {
    const hostname = parseHostname(url);
    if (!hostname) {
        return null;
    }
    for (const rule of JOIN_URL_RULES) {
        if (hostnameEndsWith(hostname, rule.HostSuffix)) {
            return rule.Platform;
        }
    }
    return null;
}

/**
 * Resolves a meeting/call join URL to the matching **active** {@link MJAIBridgeProviderEntity} from a
 * candidate set (typically `AIBridgeEngine.Providers`) — a **pure** function over its inputs. First
 * classifies the URL via {@link ClassifyJoinUrl}, then finds the active provider whose `Name` matches
 * the platform (case-insensitive, trim-tolerant).
 *
 * Returns `null` when the URL is unrecognised, OR when no active provider for that platform is
 * registered (the platform is known but not configured in this tenant — the watcher then skips the
 * invite rather than guessing a transport).
 *
 * @param url The raw join URL from a calendar invite.
 * @param providers The candidate providers to resolve against (e.g. the engine's cached registry).
 * @returns The matching active provider, or `null`.
 */
export function ResolveProviderFromJoinUrl(
    url: string,
    providers: ReadonlyArray<MJAIBridgeProviderEntity>,
): MJAIBridgeProviderEntity | null {
    const platform = ClassifyJoinUrl(url);
    if (!platform) {
        return null;
    }
    const target = platform.toLowerCase();
    const match = providers.find(
        p => p.Status === 'Active' && (p.Name ?? '').trim().toLowerCase() === target,
    );
    return match ?? null;
}

/**
 * Parses the lowercased hostname from a URL. Tolerant of a missing scheme (prepends `https://` so a
 * bare `zoom.us/j/123` still parses) and returns `null` for anything unparseable.
 *
 * @param url The raw URL.
 * @returns The lowercased hostname, or `null`.
 */
function parseHostname(url: string): string | null {
    const trimmed = (url ?? '').trim();
    if (trimmed.length === 0) {
        return null;
    }
    const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
    try {
        return new URL(withScheme).hostname.toLowerCase();
    } catch {
        return null;
    }
}

/**
 * True domain-suffix test: `hostname` equals `suffix` or ends with `'.' + suffix`. This is what makes
 * `us02web.zoom.us` match `zoom.us` while `zoom.us.attacker.com` does NOT (its suffix is
 * `attacker.com`, not `zoom.us`).
 *
 * @param hostname The already-lowercased hostname to test.
 * @param suffix The already-lowercased registrable host suffix.
 * @returns `true` when `hostname` is on (or under) `suffix`.
 */
function hostnameEndsWith(hostname: string, suffix: string): boolean {
    return hostname === suffix || hostname.endsWith(`.${suffix}`);
}
