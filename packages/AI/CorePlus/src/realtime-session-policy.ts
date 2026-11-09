/**
 * @fileoverview The wire contracts of **session client policy negotiation** for client-direct
 * realtime sessions.
 *
 * In the client-direct topology the browser opens its own provider socket, but the *server* owns
 * the configuration cascade (agent, app) and the registry's kill switch. Channels, however, are
 * plugins the *browser* has — their code defaults, tools and display live in client code. The two
 * halves have to meet at session mint, in one round trip:
 *
 * ```
 * browser                                    server
 *   │  channel candidates (key, defaults,       │
 *   │  tools, host-declared?) ───────────────►  │  ResolveRealtimeChannelScope(cascade, registry)
 *   │                                           │  → declares only the in-scope native tools
 *   │  ◄─────────────── RealtimeSessionClientPolicy (resolved channels + client-tool tiers)
 *   ▼  activates exactly that set
 * ```
 *
 * - {@link RealtimeChannelCandidate} is what the browser *reports* (facts about code it owns).
 * - {@link RealtimeSessionClientPolicy} is what the server *decides* (and persists on the session,
 *   so later server-side relays can check a call targets a channel that is actually in the session).
 *
 * The server never trusts a candidate for anything that grants capability: registry state is read
 * from the registry, and a candidate's claims only decide which *client-executed* tools get declared.
 *
 * @module @memberjunction/ai-core-plus
 */

import type { JSONObject, RealtimeToolDefinition } from '@memberjunction/ai';
import { IsPlainObject } from '@memberjunction/global';
import type { ClientToolMetadata } from './agent-types';
import type { RealtimeExposureLimit } from './realtime-channel-exposure';
import type {
    RealtimeChannelAvailability,
    RealtimeChannelDisplayPolicy,
    RealtimeChannelExposure,
} from './realtime-channel-descriptor';
import {
    IsRealtimeChannelAvailability,
    IsRealtimeChannelDisplayPolicy,
    IsRealtimeChannelExposure,
    type RealtimeChannelScopeExclusion,
    type RealtimeChannelExclusionReason,
    type ResolvedRealtimeChannel,
} from './realtime-channel-scope';

/** Maximum length of a tool or channel name accepted over the wire. */
const MAX_NAME_CHARS = 128;

/** Shape check for one provider tool declaration: non-empty Name/Description, `ParametersSchema` a plain object. */
export function IsValidRealtimeToolDefinition(candidate: unknown): candidate is RealtimeToolDefinition {
    if (!IsPlainObject(candidate)) {
        return false;
    }
    const tool = candidate as Partial<RealtimeToolDefinition>;
    return (
        typeof tool.Name === 'string' && tool.Name.trim().length > 0 && tool.Name.length <= MAX_NAME_CHARS &&
        typeof tool.Description === 'string' && tool.Description.trim().length > 0 &&
        IsPlainObject(tool.ParametersSchema)
    );
}

/** One channel the browser reports it could mount in the session. */
export interface RealtimeChannelCandidate {
    /** The channel's key (its descriptor `Key`, i.e. `ChannelName`). */
    Key: string;
    /** The channel's code default. */
    DefaultAvailability: RealtimeChannelAvailability;
    /** The channel's code-default display. */
    DisplayPolicy: RealtimeChannelDisplayPolicy;
    /** The ceiling the channel can reach. */
    MaxExposure: RealtimeChannelExposure;
    /** The host declared this channel (it may have no registry row). */
    HostDeclared?: boolean;
    /** Config the host supplied — a default that agent/app config overrides. */
    HostConfig?: JSONObject;
    /** Display the host asked for — a default that agent/app config overrides. */
    HostDisplayPolicy?: RealtimeChannelDisplayPolicy;
    /** The native tool-name prefix the channel routes locally (may be empty for a channel with no native tools). */
    ToolNamePrefix: string;
    /** The channel's native tool declarations (declared at mint only when the channel is mounted with the session). */
    Tools: RealtimeToolDefinition[];
}

/** Caps applied when parsing candidates off the wire. A flood is a misbehaving caller, not a trim candidate. */
export interface RealtimeChannelCandidateLimits {
    /** Maximum candidates accepted. */
    MaxCandidates: number;
    /** Maximum tools accepted per candidate. */
    MaxToolsPerCandidate: number;
    /** Maximum serialized size (chars) accepted. */
    MaxJsonChars: number;
}

/** The default caps — sized for several rich channels plus headroom. */
export const DEFAULT_REALTIME_CHANNEL_CANDIDATE_LIMITS: RealtimeChannelCandidateLimits = {
    MaxCandidates: 32,
    MaxToolsPerCandidate: 64,
    MaxJsonChars: 256_000,
};

/** The result of {@link ParseRealtimeChannelCandidates}. */
export interface ParsedRealtimeChannelCandidates {
    /** The candidates that passed validation (de-duplicated by key, first wins). */
    Candidates: RealtimeChannelCandidate[];
    /** Why anything was dropped, for the caller to log. Empty when everything was accepted. */
    Rejected: string[];
}

/** Validates one raw candidate; returns it, or a rejection reason. */
function readCandidate(raw: unknown, limits: RealtimeChannelCandidateLimits): RealtimeChannelCandidate | string {
    if (!IsPlainObject(raw)) {
        return 'a candidate is not an object';
    }
    const key = raw['Key'];
    if (typeof key !== 'string' || key.trim().length === 0 || key.length > MAX_NAME_CHARS) {
        return 'a candidate has no valid Key';
    }
    const label = `candidate '${key}'`;
    if (!IsRealtimeChannelAvailability(raw['DefaultAvailability'])) {
        return `${label} has an invalid DefaultAvailability`;
    }
    if (!IsRealtimeChannelDisplayPolicy(raw['DisplayPolicy'])) {
        return `${label} has an invalid DisplayPolicy`;
    }
    if (!IsRealtimeChannelExposure(raw['MaxExposure'])) {
        return `${label} has an invalid MaxExposure`;
    }
    const tools = readCandidateTools(raw['Tools'], limits);
    if (typeof tools === 'string') {
        return `${label}: ${tools}`;
    }
    const candidate: RealtimeChannelCandidate = {
        Key: key.trim(),
        DefaultAvailability: raw['DefaultAvailability'],
        DisplayPolicy: raw['DisplayPolicy'],
        MaxExposure: raw['MaxExposure'],
        ToolNamePrefix: typeof raw['ToolNamePrefix'] === 'string' ? raw['ToolNamePrefix'] : '',
        Tools: tools,
    };
    if (raw['HostDeclared'] === true) {
        candidate.HostDeclared = true;
    }
    if (IsPlainObject(raw['HostConfig'])) {
        candidate.HostConfig = raw['HostConfig'] as JSONObject;
    }
    if (IsRealtimeChannelDisplayPolicy(raw['HostDisplayPolicy'])) {
        candidate.HostDisplayPolicy = raw['HostDisplayPolicy'];
    }
    return candidate;
}

/** Validates a candidate's tool list; returns the valid tools, or a rejection reason. */
function readCandidateTools(raw: unknown, limits: RealtimeChannelCandidateLimits): RealtimeToolDefinition[] | string {
    if (raw === undefined) {
        return [];
    }
    if (!Array.isArray(raw)) {
        return 'Tools is not an array';
    }
    if (raw.length > limits.MaxToolsPerCandidate) {
        return `${raw.length} tools exceeds the cap of ${limits.MaxToolsPerCandidate}`;
    }
    return raw.filter(IsValidRealtimeToolDefinition);
}

/**
 * Parses the channel candidates a browser sent at session mint. Tolerant and capped — it never
 * throws; anything wrong is dropped and reported in {@link ParsedRealtimeChannelCandidates.Rejected}.
 *
 * @param json The raw JSON array string, or `null`/`undefined` when the caller sent none.
 * @param limits Optional caps; defaults to {@link DEFAULT_REALTIME_CHANNEL_CANDIDATE_LIMITS}.
 */
export function ParseRealtimeChannelCandidates(
    json: string | null | undefined,
    limits: RealtimeChannelCandidateLimits = DEFAULT_REALTIME_CHANNEL_CANDIDATE_LIMITS,
): ParsedRealtimeChannelCandidates {
    const parsed: ParsedRealtimeChannelCandidates = { Candidates: [], Rejected: [] };
    if (typeof json !== 'string' || json.length === 0) {
        return parsed;
    }
    if (json.length > limits.MaxJsonChars) {
        parsed.Rejected.push(`channel candidates rejected: ${json.length} chars exceeds the cap of ${limits.MaxJsonChars}`);
        return parsed;
    }
    let raw: unknown;
    try {
        raw = JSON.parse(json);
    } catch {
        parsed.Rejected.push('channel candidates rejected: not valid JSON');
        return parsed;
    }
    if (!Array.isArray(raw)) {
        parsed.Rejected.push('channel candidates rejected: expected a JSON array');
        return parsed;
    }
    if (raw.length > limits.MaxCandidates) {
        parsed.Rejected.push(`channel candidates rejected: ${raw.length} candidates exceeds the cap of ${limits.MaxCandidates}`);
        return parsed;
    }
    const seen = new Set<string>();
    for (const item of raw) {
        const candidate = readCandidate(item, limits);
        if (typeof candidate === 'string') {
            parsed.Rejected.push(candidate);
        } else if (!seen.has(candidate.Key.toLowerCase())) {
            seen.add(candidate.Key.toLowerCase());
            parsed.Candidates.push(candidate);
        }
    }
    return parsed;
}

/** The client-tool tiers the server resolves for a session (metadata only — handlers live in the host). */
export interface RealtimeSessionClientTools {
    /** The app tier: `Application.AgentSettings.ClientTools`, resolved to metadata. */
    App?: ClientToolMetadata[];
    /** The static tier: the target agent's `MJ: AI Agent Client Tools` junction, resolved to metadata. */
    Static?: ClientToolMetadata[];
}

/**
 * What the server decided for a session: the resolved channel set and the client-tool tiers. Returned
 * to the browser in the mint result, and (the channel keys) persisted on the session.
 */
export interface RealtimeSessionClientPolicy {
    /** Policy contract version. */
    Version: 1;
    /** The channels in the session, with their resolved display/config. */
    Channels: ResolvedRealtimeChannel[];
    /** The channels left out, with reasons (diagnostics). */
    ExcludedChannels?: RealtimeChannelScopeExclusion[];
    /** The app and static client-tool tiers. */
    ClientTools?: RealtimeSessionClientTools;
}

const EXCLUSION_REASONS: readonly RealtimeChannelExclusionReason[] = [
    'inactive-registry-row',
    'excluded-by-config',
    'opt-in-not-included',
    'unknown-channel',
];

/** Reads one resolved channel off the wire; `null` when malformed. */
function readResolvedChannel(raw: unknown): ResolvedRealtimeChannel | null {
    if (!IsPlainObject(raw) || typeof raw['Key'] !== 'string' || raw['Key'].trim().length === 0) {
        return null;
    }
    if (!IsRealtimeChannelDisplayPolicy(raw['DisplayPolicy']) || !IsRealtimeChannelExposure(raw['MaxExposure'])) {
        return null;
    }
    const source = raw['Source'];
    const channel: ResolvedRealtimeChannel = {
        Key: raw['Key'].trim(),
        DisplayPolicy: raw['DisplayPolicy'],
        MaxExposure: raw['MaxExposure'],
        Source: source === 'config' || source === 'host' ? source : 'default',
    };
    if (IsPlainObject(raw['Config'])) {
        channel.Config = raw['Config'] as JSONObject;
    }
    if (IsRealtimeChannelExposure(raw['Exposure'])) {
        channel.Exposure = raw['Exposure'];
    }
    const limits = readExposureLimits(raw['ExposureLimits']);
    if (limits.length > 0) {
        channel.ExposureLimits = limits;
    }
    return channel;
}

/** Reads a channel's exposure limits off the wire, dropping malformed entries. */
function readExposureLimits(raw: unknown): RealtimeExposureLimit[] {
    if (!Array.isArray(raw)) {
        return [];
    }
    const limits: RealtimeExposureLimit[] = [];
    for (const item of raw) {
        if (!IsPlainObject(item) || !IsRealtimeChannelExposure(item['Level']) || typeof item['Reason'] !== 'string') {
            continue;
        }
        const source = item['Source'];
        if (source === 'agent' || source === 'zero-data-retention' || source === 'user') {
            limits.push({ Source: source, Level: item['Level'], Reason: item['Reason'] });
        }
    }
    return limits;
}

/** Reads a client-tool metadata list off the wire, dropping malformed entries. */
function readClientToolList(raw: unknown): ClientToolMetadata[] | undefined {
    if (!Array.isArray(raw)) {
        return undefined;
    }
    const tools = raw.filter(
        (t): t is ClientToolMetadata =>
            IsPlainObject(t) && typeof t['Name'] === 'string' && t['Name'].length > 0 && typeof t['Description'] === 'string',
    ).map((t) => ({ ...t, InputSchema: IsPlainObject(t.InputSchema) ? t.InputSchema : {} }));
    return tools;
}

/**
 * Tolerantly parses the policy JSON a server returned at mint. `null` — never a throw — for an
 * absent or unusable payload, which the caller treats as "no server policy" and falls back to
 * resolving the scope locally from code defaults and host declarations.
 *
 * @param json The raw JSON string, or `null`/`undefined`.
 */
export function ParseRealtimeSessionClientPolicy(json: string | null | undefined): RealtimeSessionClientPolicy | null {
    if (typeof json !== 'string' || json.trim().length === 0) {
        return null;
    }
    let raw: unknown;
    try {
        raw = JSON.parse(json);
    } catch {
        return null;
    }
    if (!IsPlainObject(raw) || raw['Version'] !== 1 || !Array.isArray(raw['Channels'])) {
        return null;
    }
    const policy: RealtimeSessionClientPolicy = {
        Version: 1,
        Channels: raw['Channels'].map(readResolvedChannel).filter((c): c is ResolvedRealtimeChannel => c !== null),
    };
    if (Array.isArray(raw['ExcludedChannels'])) {
        policy.ExcludedChannels = raw['ExcludedChannels'].filter(
            (e): e is RealtimeChannelScopeExclusion =>
                IsPlainObject(e) && typeof e['Key'] === 'string' && EXCLUSION_REASONS.includes(e['Reason'] as RealtimeChannelExclusionReason),
        );
    }
    if (IsPlainObject(raw['ClientTools'])) {
        const tools: RealtimeSessionClientTools = {};
        const app = readClientToolList(raw['ClientTools']['App']);
        const stat = readClientToolList(raw['ClientTools']['Static']);
        if (app) {
            tools.App = app;
        }
        if (stat) {
            tools.Static = stat;
        }
        policy.ClientTools = tools;
    }
    return policy;
}
