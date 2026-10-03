/**
 * @fileoverview The **session-scoping helpers** of the realtime runtime — turning the channel plugins
 * a session *could* have into the channels it *does* have.
 *
 * The decision itself (`ResolveRealtimeChannelScope`) is pure and lives in `@memberjunction/ai-core-plus`
 * so the server and the browser make it identically. What lives here is the browser-side plumbing around it:
 *
 * - {@link PreparedChannel} — a plugin that has been *resolved* (from the registry or declared by the
 *   host) but not yet *initialized*. Preparing is side-effect free, which is what lets the runtime
 *   report candidates to the server at mint without having started anything the server may then veto.
 * - {@link BuildChannelCandidate} / {@link ResolveLocalChannelScope} — the facts the browser reports,
 *   and the scope it resolves on its own when no server policy comes back (a legacy server, or a host
 *   that mints through its own proxy).
 * - {@link ReconcileChannelsWithPolicy} — maps a resolved policy back onto the prepared plugins.
 * - {@link MergeToolMetadata} — layers a host's registered tool handlers over the manifest the host
 *   streamed, so "available tools" messages can describe them.
 *
 * Framework-free and DOM-free: importable in plain Node tests.
 *
 * @module @memberjunction/realtime-runtime
 */

import type { JSONObject, RealtimeToolDefinition } from '@memberjunction/ai';
import {
    NormalizeChannelKey,
    ResolveRealtimeChannelScope,
    type ClientToolMetadata,
    type RealtimeChannelCandidate,
    type RealtimeChannelDescriptor,
    type RealtimeChannelDisplayPolicy,
    type RealtimeChannelRegistryState,
    type RealtimeChannelScopeResult,
    type ResolvedRealtimeChannel,
} from '@memberjunction/ai-core-plus';
import type { BaseRealtimeChannelClient } from '../channels/base-realtime-channel-client';

/**
 * A channel the HOST brings to a session — the way a page or app adds a channel that has no
 * `MJ: AI Agent Channels` row, which is the ONLY way a connect-only (anonymous embed) session
 * gets channels, because that kind of session has no entity metadata to read the registry from.
 *
 * Supply either {@link ClientPluginClass} (a ClassFactory key, exactly like a registry row's
 * `ClientPluginClass`) or {@link Create} (a factory — for a channel the host constructs itself, e.g.
 * with injected collaborators). If both are given, {@link Create} wins.
 *
 * A host *adds* channels and supplies *defaults*; it cannot lift an agent or app `exclude`, and its
 * `Config` / `DisplayPolicy` are overridden by the agent/app layers. An inactive registry row for the
 * same channel still switches it off.
 */
export interface RealtimeHostChannelDeclaration {
    /** ClassFactory key of the channel plugin (`@RegisterClass(BaseRealtimeChannelClient, '<key>')`). */
    ClientPluginClass?: string;
    /** Factory that builds the plugin; use when the host constructs it with its own collaborators. */
    Create?: () => BaseRealtimeChannelClient;
    /** Default per-channel configuration; agent/app `channels.config` overrides it. */
    Config?: JSONObject;
    /** Default display for this host; agent/app `channels.displayPolicy` overrides it. */
    DisplayPolicy?: RealtimeChannelDisplayPolicy;
}

/**
 * Per-start options of {@link RealtimeSessionRuntime.StartRealtimeSession} that are not part of the
 * mint contract. Every field is optional; omit the whole object for the behavior hosts always had.
 */
export interface RealtimeSessionStartOptions {
    /** Channels the host brings to this session (see {@link RealtimeHostChannelDeclaration}). */
    HostChannels?: RealtimeHostChannelDeclaration[];
}

/** A resolved-but-not-yet-initialized channel plugin, with what the scope decision needs to know about it. */
export interface PreparedChannel {
    /** The plugin instance (constructed, NOT initialized). */
    Plugin: BaseRealtimeChannelClient;
    /** Its key (the plugin's `ChannelName`). */
    Key: string;
    /** Registry state: `'active'`, `'inactive'` (the kill switch), or `'none'` (host-declared only). */
    Registry: RealtimeChannelRegistryState;
    /** The host declaration that brought it, when one did. */
    HostDeclaration?: RealtimeHostChannelDeclaration;
}

/** Looks a prepared channel up by key, case-insensitively. */
export function FindPreparedChannel(prepared: ReadonlyArray<PreparedChannel>, key: string): PreparedChannel | undefined {
    const id = NormalizeChannelKey(key);
    return prepared.find((p) => NormalizeChannelKey(p.Key) === id);
}

/**
 * The facts the browser reports about one channel at mint (also the input to the local scope
 * decision). Reads the plugin's descriptor and tools; never initializes it.
 *
 * @param prepared The prepared channel.
 * @param descriptor The plugin's descriptor (passed in so callers read it once).
 */
export function BuildChannelCandidate(prepared: PreparedChannel, descriptor: RealtimeChannelDescriptor): RealtimeChannelCandidate & { Registry: RealtimeChannelRegistryState } {
    const candidate: RealtimeChannelCandidate & { Registry: RealtimeChannelRegistryState } = {
        Key: prepared.Key,
        DefaultAvailability: descriptor.DefaultAvailability,
        DisplayPolicy: descriptor.DisplayPolicy,
        MaxExposure: descriptor.MaxExposure,
        ToolNamePrefix: prepared.Plugin.ToolNamePrefix,
        Tools: prepared.Plugin.GetToolDefinitions(),
        Registry: prepared.Registry,
    };
    const declaration = prepared.HostDeclaration;
    if (declaration) {
        candidate.HostDeclared = true;
        if (declaration.Config) {
            candidate.HostConfig = declaration.Config;
        }
        if (declaration.DisplayPolicy) {
            candidate.HostDisplayPolicy = declaration.DisplayPolicy;
        }
    }
    return candidate;
}

/**
 * Resolves the scope from code defaults and host declarations alone — what the browser decides when
 * no server policy arrives. Identical to the server's decision in the absence of an agent/app layer.
 *
 * @param candidates The reported candidates (with registry state).
 */
export function ResolveLocalChannelScope(
    candidates: ReadonlyArray<RealtimeChannelCandidate & { Registry: RealtimeChannelRegistryState }>,
): RealtimeChannelScopeResult {
    return ResolveRealtimeChannelScope({ Candidates: candidates.map((c) => ({ ...c })) });
}

/** The tools of each candidate, keyed by channel key — the input `SelectNativeChannelTools` wants. */
export function ToolsByChannelKey(
    candidates: ReadonlyArray<RealtimeChannelCandidate>,
): Map<string, ReadonlyArray<RealtimeToolDefinition>> {
    return new Map(candidates.map((c) => [c.Key, c.Tools]));
}

/** A policy channel paired with the prepared plugin it names. */
export interface ReconciledChannel {
    /** The prepared plugin. */
    Prepared: PreparedChannel;
    /** What the policy resolved for it. */
    Resolved: ResolvedRealtimeChannel;
}

/** The outcome of {@link ReconcileChannelsWithPolicy}. */
export interface ChannelReconciliation {
    /** Channels the policy puts in the session, in policy order. */
    InSession: ReconciledChannel[];
    /** Prepared plugins the policy left out — never initialized; the runtime just drops them. */
    Dropped: PreparedChannel[];
    /** Policy channels the browser has no plugin for (a stale or foreign policy); logged by the caller. */
    Unknown: string[];
}

/**
 * Maps a resolved policy back onto the prepared plugins. A policy can only select among plugins the
 * browser actually has — it can never conjure one — so a key with no plugin is reported, not honored.
 *
 * @param prepared Every prepared plugin.
 * @param channels The policy's in-session channels.
 */
export function ReconcileChannelsWithPolicy(
    prepared: ReadonlyArray<PreparedChannel>,
    channels: ReadonlyArray<ResolvedRealtimeChannel>,
): ChannelReconciliation {
    const inSession: ReconciledChannel[] = [];
    const unknown: string[] = [];
    const used = new Set<PreparedChannel>();
    for (const resolved of channels) {
        const match = FindPreparedChannel(prepared, resolved.Key);
        if (match && !used.has(match)) {
            used.add(match);
            inSession.push({ Prepared: match, Resolved: resolved });
        } else if (!match) {
            unknown.push(resolved.Key);
        }
    }
    return { InSession: inSession, Dropped: prepared.filter((p) => !used.has(p)), Unknown: unknown };
}

/**
 * Overlays the metadata of tools a host registered handlers for onto the manifest it streamed, by
 * name (case-insensitive). A registered tool's own description/schema wins when it supplied one; a
 * bare `{ Name, Handler }` registration (what most hosts do) inherits the manifest's description and
 * schema instead of showing up with none.
 *
 * @param registered The registry's tools as metadata.
 * @param manifest The tools the host's app-context snapshot advertises (may be empty).
 */
export function MergeToolMetadata(
    registered: ReadonlyArray<ClientToolMetadata>,
    manifest: ReadonlyArray<ClientToolMetadata>,
): ClientToolMetadata[] {
    const fromManifest = new Map(manifest.map((t) => [t.Name.trim().toLowerCase(), t]));
    return registered.map((tool) => {
        const advertised = fromManifest.get(tool.Name.trim().toLowerCase());
        if (!advertised) {
            return tool;
        }
        return {
            ...advertised,
            ...tool,
            Description: tool.Description || advertised.Description,
            InputSchema: Object.keys(tool.InputSchema ?? {}).length > 0 ? tool.InputSchema : advertised.InputSchema,
        };
    });
}
