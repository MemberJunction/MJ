/**
 * @fileoverview **Channel scoping** — which realtime channels a session gets.
 *
 * A channel row's activation used to mean "every session in the database". That is the wrong unit:
 * a lead-capture agent wants an identity form and nothing else, a research agent wants a browser,
 * and an Open App that ships a channel must not have it appear in every other app's sessions. This
 * module is the single, pure place where that decision is made, so the browser runtime and the
 * server make the *same* decision from the same inputs.
 *
 * ## The layers
 *
 * ```
 * code default  →  agent (type < co-agent < target < override)  →  app  →  host
 * ```
 *
 * 1. **Code default.** The channel's own descriptor says whether it is `'all-sessions'` or
 *    `'opt-in'` ({@link RealtimeChannelAvailability}). Every channel that predates the contract is
 *    `'all-sessions'`, so existing behavior is preserved exactly.
 * 2. **Agent** and 3. **App.** The `channels` section of the realtime configuration cascade
 *    ({@link RealtimeChannelsConfig}); the app's `Application.AgentSettings.Realtime.Channels` is the
 *    cascade's app layer, so both arrive here already folded together by
 *    {@link AccumulateRealtimeChannelsConfig}.
 * 4. **Host.** The page or app embedding the runtime may declare channels it *brings* — including
 *    channels with no registry row at all, which is the only way a connect-only (anonymous embed)
 *    session gets channels.
 *
 * ## Two things the layering is NOT
 *
 * - **A host cannot override policy.** A host *adds* channels; it cannot lift an agent or app
 *   `exclude`, and its `Config` is only a default that agent/app config overrides. The page that
 *   embeds a widget is not a trusted policy author — an agent's author decided what that agent may
 *   do, and a `<script>` tag must not be able to undo it.
 * - **Nothing overrides the kill switch.** A registry row with `IsActive = false` excludes the
 *   channel from every session, even one a host declared or an agent explicitly included.
 *
 * Pure and deterministic: no I/O, no metadata, no framework. Registry state is *injected* by the
 * caller (the server reads it from its engine; the browser from its provider) so this module stays
 * client-safe.
 *
 * @module @memberjunction/ai-core-plus
 */

import type { JSONObject, RealtimeToolDefinition } from '@memberjunction/ai';
import { IsPlainObject } from '@memberjunction/global';
import { ReadConfiguredMaxExposure, ResolvePolicyExposure, type RealtimeExposureLimit } from './realtime-channel-exposure';
import type {
    RealtimeChannelAvailability,
    RealtimeChannelDisplayPolicy,
    RealtimeChannelExposure,
} from './realtime-channel-descriptor';

/** The valid {@link RealtimeChannelDisplayPolicy} values, for runtime guards. */
export const REALTIME_CHANNEL_DISPLAY_POLICIES: readonly RealtimeChannelDisplayPolicy[] = ['open-on-start', 'on-demand', 'headless'];

/** The valid {@link RealtimeChannelAvailability} values, for runtime guards. */
export const REALTIME_CHANNEL_AVAILABILITIES: readonly RealtimeChannelAvailability[] = ['all-sessions', 'opt-in'];

/** The valid {@link RealtimeChannelExposure} values, for runtime guards. */
export const REALTIME_CHANNEL_EXPOSURES: readonly RealtimeChannelExposure[] = ['none', 'state', 'pixels'];

/** Type guard for {@link RealtimeChannelDisplayPolicy}. */
export function IsRealtimeChannelDisplayPolicy(value: unknown): value is RealtimeChannelDisplayPolicy {
    return typeof value === 'string' && (REALTIME_CHANNEL_DISPLAY_POLICIES as readonly string[]).includes(value);
}

/** Type guard for {@link RealtimeChannelAvailability}. */
export function IsRealtimeChannelAvailability(value: unknown): value is RealtimeChannelAvailability {
    return typeof value === 'string' && (REALTIME_CHANNEL_AVAILABILITIES as readonly string[]).includes(value);
}

/** Type guard for {@link RealtimeChannelExposure}. */
export function IsRealtimeChannelExposure(value: unknown): value is RealtimeChannelExposure {
    return typeof value === 'string' && (REALTIME_CHANNEL_EXPOSURES as readonly string[]).includes(value);
}

/**
 * The `channels` section of the realtime configuration cascade (`RealtimeConfigSection.channels`),
 * and — after the app layer is mapped across — the shape every layer is normalized to.
 *
 * Keys mirror the persisted cascade JSON (`realtime.channels.include`, …).
 */
export interface RealtimeChannelsConfig {
    /** Channel keys to turn ON. The only way to get an `'opt-in'` channel; a no-op for `'all-sessions'` ones. */
    include?: string[]; // case-violation-ok-legacy-back-compat: mirrors the persisted realtime cascade JSON key
    /** Channel keys to turn OFF. A hard veto: a host cannot lift it. */
    exclude?: string[]; // case-violation-ok-legacy-back-compat: mirrors the persisted realtime cascade JSON key
    /** Per-channel opaque configuration, delivered to the channel at session start. */
    config?: Record<string, JSONObject>; // case-violation-ok-legacy-back-compat: mirrors the persisted realtime cascade JSON key
    /** Per-channel display override. */
    displayPolicy?: Record<string, RealtimeChannelDisplayPolicy>; // case-violation-ok-legacy-back-compat: mirrors the persisted realtime cascade JSON key
    /**
     * Exposure levels that need a zero-data-retention model. When the session model's configuration
     * does not declare `Privacy.ZeroDataRetention: true`, exposure is lowered to below the lowest level
     * listed (see `ResolveChannelExposure`). Applies to every channel in the session. Accumulates as a
     * UNION across layers: a stricter layer's requirement is never loosened by another.
     */
    requireZeroDataRetentionFor?: RealtimeZeroDataRetentionLevel[]; // case-violation-ok-legacy-back-compat: mirrors the persisted realtime cascade JSON key
}

/** An exposure level a ZDR requirement can name (`'none'` exposes nothing, so it can never need one). */
export type RealtimeZeroDataRetentionLevel = 'state' | 'pixels';

/** Reads a `requireZeroDataRetentionFor` list: valid levels only, de-duplicated, in a stable order. */
function readZeroDataRetentionLevels(raw: unknown): RealtimeZeroDataRetentionLevel[] {
    if (!Array.isArray(raw)) {
        return [];
    }
    const levels = new Set<RealtimeZeroDataRetentionLevel>();
    for (const item of raw) {
        if (item === 'state' || item === 'pixels') {
            levels.add(item);
        }
    }
    return (['state', 'pixels'] as const).filter((level) => levels.has(level));
}

/** Normalizes a channel key for comparison: trimmed and lower-cased (channel keys are case-insensitive). */
export function NormalizeChannelKey(key: string): string {
    return key.trim().toLowerCase();
}

/** Reads a non-empty, trimmed string list, de-duplicated case-insensitively (first spelling kept). */
function readKeyList(raw: unknown): string[] {
    if (!Array.isArray(raw)) {
        return [];
    }
    const seen = new Set<string>();
    const keys: string[] = [];
    for (const item of raw) {
        if (typeof item !== 'string') {
            continue;
        }
        const trimmed = item.trim();
        const id = NormalizeChannelKey(trimmed);
        if (id.length > 0 && !seen.has(id)) {
            seen.add(id);
            keys.push(trimmed);
        }
    }
    return keys;
}

/**
 * Tolerantly normalizes one layer's raw `channels` section. Wrong-typed members are dropped, never
 * thrown on (the same contract as every other cascade input).
 *
 * @param raw The raw `channels` value of a configuration layer.
 * @returns The normalized section, or `undefined` when the layer contributes nothing.
 */
export function NormalizeRealtimeChannelsConfig(raw: unknown): RealtimeChannelsConfig | undefined {
    if (!IsPlainObject(raw)) {
        return undefined;
    }
    const result: RealtimeChannelsConfig = {};
    const include = readKeyList(raw['include']);
    if (include.length > 0) {
        result.include = include;
    }
    const exclude = readKeyList(raw['exclude']);
    if (exclude.length > 0) {
        result.exclude = exclude;
    }
    const config = readConfigMap(raw['config']);
    if (config) {
        result.config = config;
    }
    const displayPolicy = readDisplayPolicyMap(raw['displayPolicy']);
    if (displayPolicy) {
        result.displayPolicy = displayPolicy;
    }
    const zeroDataRetention = readZeroDataRetentionLevels(raw['requireZeroDataRetentionFor']);
    if (zeroDataRetention.length > 0) {
        result.requireZeroDataRetentionFor = zeroDataRetention;
    }
    return Object.keys(result).length > 0 ? result : undefined;
}

/** Reads the per-channel config map, keeping only plain-object values. */
function readConfigMap(raw: unknown): Record<string, JSONObject> | undefined {
    if (!IsPlainObject(raw)) {
        return undefined;
    }
    const map: Record<string, JSONObject> = {};
    for (const [key, value] of Object.entries(raw)) {
        if (key.trim().length > 0 && IsPlainObject(value)) {
            map[key.trim()] = value as JSONObject;
        }
    }
    return Object.keys(map).length > 0 ? map : undefined;
}

/** Reads the per-channel display-policy map, keeping only valid policies. */
function readDisplayPolicyMap(raw: unknown): Record<string, RealtimeChannelDisplayPolicy> | undefined {
    if (!IsPlainObject(raw)) {
        return undefined;
    }
    const map: Record<string, RealtimeChannelDisplayPolicy> = {};
    for (const [key, value] of Object.entries(raw)) {
        if (key.trim().length > 0 && IsRealtimeChannelDisplayPolicy(value)) {
            map[key.trim()] = value;
        }
    }
    return Object.keys(map).length > 0 ? map : undefined;
}

/** Recursively merges plain objects (later wins); arrays and scalars replace. Returns a fresh graph. */
function mergeJsonObjects(base: JSONObject, overlay: JSONObject): JSONObject {
    const merged: JSONObject = { ...base };
    for (const [key, incoming] of Object.entries(overlay)) {
        const existing = merged[key];
        merged[key] =
            IsPlainObject(existing) && IsPlainObject(incoming)
                ? mergeJsonObjects(existing as JSONObject, incoming as JSONObject)
                : incoming;
    }
    return merged;
}

/**
 * Folds the `channels` sections of the cascade's layers (lowest precedence first) into one
 * normalized {@link RealtimeChannelsConfig}.
 *
 * This is **per-channel, not per-key**: each layer's `include` / `exclude` are decisions about
 * *individual channels*, so the most specific layer to mention a channel wins — and within one layer
 * `exclude` beats `include`. A plain deep merge would be wrong here, because it replaces arrays
 * wholesale: an app layer's `exclude: ['Media']` would silently erase the agent layer's
 * `exclude: ['RemoteBrowser']`. (Allowed-agent accumulation exists for the same reason.)
 *
 * `config` and `displayPolicy` merge per channel key, later layers winning. `requireZeroDataRetentionFor`
 * is a union (a requirement is only ever added to).
 *
 * @param layers Raw `channels` sections, lowest precedence first. Absent/invalid ones are skipped.
 * @returns The folded config, or `undefined` when no layer contributed anything.
 */
export function AccumulateRealtimeChannelsConfig(layers: ReadonlyArray<unknown>): RealtimeChannelsConfig | undefined {
    const decisions = new Map<string, { Key: string; On: boolean }>();
    const config = new Map<string, { Key: string; Value: JSONObject }>();
    const displayPolicy = new Map<string, { Key: string; Value: RealtimeChannelDisplayPolicy }>();
    const zeroDataRetention = new Set<RealtimeZeroDataRetentionLevel>();

    for (const layer of layers) {
        const normalized = NormalizeRealtimeChannelsConfig(layer);
        if (!normalized) {
            continue;
        }
        for (const key of normalized.include ?? []) {
            decisions.set(NormalizeChannelKey(key), { Key: key, On: true });
        }
        for (const key of normalized.exclude ?? []) {
            decisions.set(NormalizeChannelKey(key), { Key: key, On: false });
        }
        for (const [key, value] of Object.entries(normalized.config ?? {})) {
            const id = NormalizeChannelKey(key);
            const prior = config.get(id);
            config.set(id, { Key: key, Value: prior ? mergeJsonObjects(prior.Value, value) : value });
        }
        for (const [key, value] of Object.entries(normalized.displayPolicy ?? {})) {
            displayPolicy.set(NormalizeChannelKey(key), { Key: key, Value: value });
        }
        for (const level of normalized.requireZeroDataRetentionFor ?? []) {
            zeroDataRetention.add(level);
        }
    }

    const result: RealtimeChannelsConfig = {};
    const include = [...decisions.values()].filter((d) => d.On).map((d) => d.Key);
    const exclude = [...decisions.values()].filter((d) => !d.On).map((d) => d.Key);
    if (include.length > 0) {
        result.include = include;
    }
    if (exclude.length > 0) {
        result.exclude = exclude;
    }
    if (config.size > 0) {
        result.config = Object.fromEntries([...config.values()].map((c) => [c.Key, c.Value]));
    }
    if (displayPolicy.size > 0) {
        result.displayPolicy = Object.fromEntries([...displayPolicy.values()].map((d) => [d.Key, d.Value]));
    }
    const requiredLevels = readZeroDataRetentionLevels([...zeroDataRetention]);
    if (requiredLevels.length > 0) {
        result.requireZeroDataRetentionFor = requiredLevels;
    }
    return Object.keys(result).length > 0 ? result : undefined;
}

/**
 * Whether a channel's registry row exists and is active — injected by the caller, because only the
 * caller can read the registry (`MJ: AI Agent Channels`).
 *
 * - `'active'` — a row exists and `IsActive`.
 * - `'inactive'` — a row exists and `IsActive = false`: the master kill switch.
 * - `'none'` — no row. Fine for a host-declared channel; for anything else the channel is unknown.
 */
export type RealtimeChannelRegistryState = 'active' | 'inactive' | 'none';

/** One channel the session could have, with everything the scope decision needs. */
export interface RealtimeChannelScopeCandidate {
    /** The channel's key (its descriptor `Key`, i.e. its `ChannelName`). */
    Key: string;
    /** The channel's code default (`GetDescriptor().DefaultAvailability`). */
    DefaultAvailability: RealtimeChannelAvailability;
    /** The channel's code-default display (`GetDescriptor().DisplayPolicy`). */
    DisplayPolicy: RealtimeChannelDisplayPolicy;
    /** The ceiling the channel can reach (`GetDescriptor().MaxExposure`). */
    MaxExposure: RealtimeChannelExposure;
    /** Registry state, resolved by the caller. */
    Registry: RealtimeChannelRegistryState;
    /** The host declared this channel (it may have no registry row). */
    HostDeclared?: boolean;
    /** Config the host supplied for it — a default that agent/app config overrides. */
    HostConfig?: JSONObject;
    /** Display the host asked for — a default that agent/app config overrides. */
    HostDisplayPolicy?: RealtimeChannelDisplayPolicy;
}

/** Why a channel is in the session. */
export type RealtimeChannelScopeSource = 'default' | 'config' | 'host';

/** One channel that IS in the session, with its resolved behavior. */
export interface ResolvedRealtimeChannel {
    /** The channel key. */
    Key: string;
    /** Resolved display: config override, else the host's, else the channel's code default. */
    DisplayPolicy: RealtimeChannelDisplayPolicy;
    /** The ceiling the channel can reach (scoping never raises it). */
    MaxExposure: RealtimeChannelExposure;
    /**
     * The exposure the SERVER allows: the ceiling lowered by the agent's per-channel `maxExposure` and by
     * any zero-data-retention requirement the session model does not meet. The browser takes its own
     * minimum of this and the user's choice and can never raise it. Absent on a policy from a server
     * that predates exposure policy, which readers treat as {@link MaxExposure}.
     */
    Exposure?: RealtimeChannelExposure;
    /** Why {@link Exposure} is below {@link MaxExposure}, each limit with a reason the agent can be told. Absent when nothing lowered it. */
    ExposureLimits?: RealtimeExposureLimit[];
    /** What put the channel in the session. */
    Source: RealtimeChannelScopeSource;
    /** Resolved per-channel config: the host's defaults beneath agent/app config. Absent when there is none. */
    Config?: JSONObject;
}

/** Why a channel is NOT in the session. */
export type RealtimeChannelExclusionReason =
    /** Its registry row has `IsActive = false` — the master kill switch. */
    | 'inactive-registry-row'
    /** An agent/app layer excluded it. */
    | 'excluded-by-config'
    /** It is `'opt-in'` and nobody asked for it. */
    | 'opt-in-not-included'
    /** It has no registry row and no host declared it. */
    | 'unknown-channel';

/** One channel that is NOT in the session, and why. */
export interface RealtimeChannelScopeExclusion {
    /** The channel key. */
    Key: string;
    /** Why it was left out. */
    Reason: RealtimeChannelExclusionReason;
}

/** The outcome of {@link ResolveRealtimeChannelScope}. */
export interface RealtimeChannelScopeResult {
    /** The channels in the session, in candidate order. */
    Channels: ResolvedRealtimeChannel[];
    /** The channels left out, with reasons (for logs and diagnostics). */
    Excluded: RealtimeChannelScopeExclusion[];
}

/** Input to {@link ResolveRealtimeChannelScope}. */
export interface RealtimeChannelScopeInput {
    /** Every channel the session could have. Duplicate keys: the first wins. */
    Candidates: ReadonlyArray<RealtimeChannelScopeCandidate>;
    /** The folded agent + app configuration (see {@link AccumulateRealtimeChannelsConfig}). */
    Config?: RealtimeChannelsConfig | null;
    /**
     * Whether the session model's configuration declares `Privacy.ZeroDataRetention: true`. Only the
     * server knows the model's catalog row, so a local (no-server) scope leaves this unset, which also
     * means no agent requirement applies there (the agent's configuration is the server's too).
     */
    ModelHasZeroDataRetention?: boolean;
}

/** Looks up a case-insensitive key in a keyed record, returning the first match. */
function lookupByKey<T>(record: Record<string, T> | undefined, key: string): T | undefined {
    if (!record) {
        return undefined;
    }
    const id = NormalizeChannelKey(key);
    for (const [candidateKey, value] of Object.entries(record)) {
        if (NormalizeChannelKey(candidateKey) === id) {
            return value;
        }
    }
    return undefined;
}

/** Whether a key list contains `key`, case-insensitively. */
function listHasKey(list: ReadonlyArray<string> | undefined, key: string): boolean {
    const id = NormalizeChannelKey(key);
    return (list ?? []).some((k) => NormalizeChannelKey(k) === id);
}

/** Decides whether one candidate is in the session; returns its exclusion reason, or its `Source`. */
function decideCandidate(
    candidate: RealtimeChannelScopeCandidate,
    config: RealtimeChannelsConfig,
): { Source: RealtimeChannelScopeSource } | { Reason: RealtimeChannelExclusionReason } {
    if (candidate.Registry === 'inactive') {
        return { Reason: 'inactive-registry-row' };
    }
    if (candidate.Registry === 'none' && !candidate.HostDeclared) {
        return { Reason: 'unknown-channel' };
    }
    if (listHasKey(config.exclude, candidate.Key)) {
        return { Reason: 'excluded-by-config' };
    }
    if (candidate.HostDeclared) {
        return { Source: 'host' };
    }
    if (listHasKey(config.include, candidate.Key)) {
        return { Source: 'config' };
    }
    if (candidate.DefaultAvailability === 'all-sessions') {
        return { Source: 'default' };
    }
    return { Reason: 'opt-in-not-included' };
}

/** Resolves a channel's per-channel config: host defaults beneath agent/app config. */
function resolveChannelConfig(candidate: RealtimeChannelScopeCandidate, config: RealtimeChannelsConfig): JSONObject | undefined {
    const layered = lookupByKey(config.config, candidate.Key);
    if (candidate.HostConfig && layered) {
        return mergeJsonObjects(candidate.HostConfig, layered);
    }
    return layered ?? candidate.HostConfig;
}

/** Resolves a channel's server-decided exposure and records it, with the limits that bind it, on the resolved channel. */
function applyExposurePolicy(resolved: ResolvedRealtimeChannel, config: RealtimeChannelsConfig, modelHasZeroDataRetention: boolean): void {
    const policy = ResolvePolicyExposure({
        Ceiling: resolved.MaxExposure,
        ConfiguredMax: ReadConfiguredMaxExposure(resolved.Config),
        RequireZeroDataRetentionFor: config.requireZeroDataRetentionFor,
        ModelHasZeroDataRetention: modelHasZeroDataRetention,
    });
    resolved.Exposure = policy.Exposure;
    if (policy.Limits.length > 0) {
        resolved.ExposureLimits = policy.Limits;
    }
}

/**
 * Decides which candidate channels are in a session. Pure; see the module documentation for the
 * layering rules (and the two things the layering deliberately is not).
 *
 * @param input The candidates (with injected registry state) and the folded agent/app config.
 * @returns The channels in the session (in candidate order) and the ones left out, with reasons.
 */
export function ResolveRealtimeChannelScope(input: RealtimeChannelScopeInput): RealtimeChannelScopeResult {
    const config = input.Config ?? {};
    const result: RealtimeChannelScopeResult = { Channels: [], Excluded: [] };
    const seen = new Set<string>();
    for (const candidate of input.Candidates) {
        const id = NormalizeChannelKey(candidate.Key);
        if (id.length === 0 || seen.has(id)) {
            continue;
        }
        seen.add(id);
        const decision = decideCandidate(candidate, config);
        if ('Reason' in decision) {
            result.Excluded.push({ Key: candidate.Key, Reason: decision.Reason });
            continue;
        }
        const resolved: ResolvedRealtimeChannel = {
            Key: candidate.Key,
            DisplayPolicy: lookupByKey(config.displayPolicy, candidate.Key) ?? candidate.HostDisplayPolicy ?? candidate.DisplayPolicy,
            MaxExposure: candidate.MaxExposure,
            Source: decision.Source,
        };
        const channelConfig = resolveChannelConfig(candidate, config);
        if (channelConfig) {
            resolved.Config = channelConfig;
        }
        applyExposurePolicy(resolved, config, input.ModelHasZeroDataRetention === true);
        result.Channels.push(resolved);
    }
    return result;
}

/**
 * Whether a channel's native tools are declared to the provider at session mint.
 *
 * Typed native tools beat a proxy call when they are known up front, so every channel that is
 * mounted with the session (`'open-on-start'` and `'headless'`) declares them; an `'on-demand'`
 * channel is reached through the `ContextTool` proxy once opened. One definition, used by both the
 * server (which filters the declaration) and the browser (which does the same when no server policy
 * arrives).
 */
export function DeclaresNativeTools(displayPolicy: RealtimeChannelDisplayPolicy): boolean {
    return displayPolicy !== 'on-demand';
}

/**
 * The tools to declare natively at mint: the tools of every in-session channel whose display policy
 * declares native tools. Order follows the channel order, then each channel's own tool order.
 *
 * @param channels The resolved in-session channels.
 * @param toolsByChannelKey Each candidate channel's tools, keyed by channel key (case-insensitive).
 */
export function SelectNativeChannelTools(
    channels: ReadonlyArray<ResolvedRealtimeChannel>,
    toolsByChannelKey: ReadonlyMap<string, ReadonlyArray<RealtimeToolDefinition>>,
): RealtimeToolDefinition[] {
    const lookup = new Map<string, ReadonlyArray<RealtimeToolDefinition>>();
    for (const [key, tools] of toolsByChannelKey) {
        lookup.set(NormalizeChannelKey(key), tools);
    }
    const selected: RealtimeToolDefinition[] = [];
    for (const channel of channels) {
        if (DeclaresNativeTools(channel.DisplayPolicy)) {
            selected.push(...(lookup.get(NormalizeChannelKey(channel.Key)) ?? []));
        }
    }
    return selected;
}
