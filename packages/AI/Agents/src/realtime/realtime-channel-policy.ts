/**
 * @fileoverview The **server half of channel scoping** for client-direct realtime sessions — pure
 * functions, no I/O, so the whole decision is unit-testable and the transport layer
 * (`RealtimeClientSessionResolver`) stays a thin shell.
 *
 * In the client-direct topology the browser holds the channel plugins and the server holds the
 * configuration cascade and the registry. At mint the browser reports its **candidates**
 * ({@link RealtimeChannelCandidate} — facts about code it owns); this module decides, from the
 * server's own state, which of them are **in the session**, and what the model is told natively:
 *
 * 1. **Registry state is the server's, never the client's.** A candidate is matched to its
 *    `MJ: AI Agent Channels` row by name; `IsActive = false` is the master kill switch.
 * 2. **Scoping** is `ResolveRealtimeChannelScope` (`@memberjunction/ai-core-plus`) — the SAME pure
 *    function the browser runs locally when no server policy comes back — fed the cascade's folded
 *    `channels` section (agent layers + the app's `AgentSettings.Realtime.Channels`).
 * 3. **Exposure** (how much of each channel the model may perceive: nothing, state, or pixels) is the
 *    channel's ceiling lowered by the agent's per-channel `maxExposure` and by the agent's
 *    `requireZeroDataRetentionFor` when the session model does not declare zero data retention. It is
 *    decided HERE, on the server, and rides in the policy; the browser can only lower it further with
 *    the user's own choice.
 * 4. **Native tools** are re-derived from the decision: the tools the client declared are narrowed to
 *    those of in-scope channels that declare natively, and the in-scope channels' tools are added by
 *    name even if the client did not list them (an `'opt-in'` channel the agent included). Tools
 *    that do not belong to any candidate (the host's own) pass through untouched.
 *
 * Nothing here grants capability: candidate tools are CLIENT-EXECUTED declarations of the same kind
 * `clientToolsJson` has always carried, and they are subject to the same shape validation and caps.
 *
 * @module @memberjunction/ai-agents
 */

import type { RealtimeToolDefinition } from '@memberjunction/ai';
import {
    NormalizeChannelKey,
    ResolveRealtimeChannelScope,
    SelectNativeChannelTools,
    type RealtimeChannelCandidate,
    type RealtimeChannelRegistryState,
    type RealtimeChannelsConfig,
    type RealtimeSessionClientPolicy,
    type RealtimeSessionClientTools,
} from '@memberjunction/ai-core-plus';

/** The slice of an `MJ: AI Agent Channels` row the scope decision needs. */
export interface RealtimeChannelRegistryRow {
    /** The channel's registry name — matched to a candidate's key, case-insensitively. */
    Name: string;
    /** `false` is the master kill switch. */
    IsActive: boolean;
}

/** Input to {@link BuildSessionChannelPolicy}. */
export interface SessionChannelPolicyInput {
    /** The channels the browser reported (already validated and capped). */
    Candidates: ReadonlyArray<RealtimeChannelCandidate>;
    /** The cascade's folded `channels` section — agent layers plus the app layer. */
    ChannelsConfig?: RealtimeChannelsConfig | null;
    /** The registry, as the server reads it. */
    Registry: ReadonlyArray<RealtimeChannelRegistryRow>;
    /** The client tools as the browser declared them at mint, if any. */
    ClientTools?: ReadonlyArray<RealtimeToolDefinition> | null;
    /** The app/static client-tool tiers to hand back to the browser, when resolved. */
    ClientToolTiers?: RealtimeSessionClientTools;
    /**
     * Whether the session model's configuration declares `Privacy.ZeroDataRetention: true`. Feeds the
     * agent's `requireZeroDataRetentionFor` exposure downgrade; leave unset (treated as `false`) when
     * the model could not be resolved, so the downgrade fails closed.
     */
    ModelHasZeroDataRetention?: boolean;
}

/** The outcome of {@link BuildSessionChannelPolicy}. */
export interface SessionChannelPolicyOutcome {
    /** The policy to return to the browser at mint. */
    Policy: RealtimeSessionClientPolicy;
    /** The native tools to declare to the model: the client's, narrowed and completed per the scope. `undefined` when there are none. */
    ClientTools: RealtimeToolDefinition[] | undefined;
}

/** The registry state a candidate resolves to, from the server's own registry. */
export function ResolveCandidateRegistryState(
    candidateKey: string,
    registry: ReadonlyArray<RealtimeChannelRegistryRow>,
): RealtimeChannelRegistryState {
    const id = NormalizeChannelKey(candidateKey);
    const row = registry.find((r) => NormalizeChannelKey(r.Name ?? '') === id);
    if (!row) {
        return 'none';
    }
    return row.IsActive ? 'active' : 'inactive';
}

/**
 * Decides which candidate channels are in the session and which native tools the model gets.
 *
 * @param input The candidates, the cascade's channel config, the registry, and the client's declared tools.
 */
export function BuildSessionChannelPolicy(input: SessionChannelPolicyInput): SessionChannelPolicyOutcome {
    const scope = ResolveRealtimeChannelScope({
        Candidates: input.Candidates.map((candidate) => ({
            ...candidate,
            Registry: ResolveCandidateRegistryState(candidate.Key, input.Registry),
        })),
        Config: input.ChannelsConfig ?? null,
        ModelHasZeroDataRetention: input.ModelHasZeroDataRetention === true,
    });
    const toolsByKey = new Map(input.Candidates.map((c) => [c.Key, c.Tools] as const));
    const inScopeNative = SelectNativeChannelTools(scope.Channels, toolsByKey);
    const clientTools = reconcileClientTools(input.ClientTools ?? [], input.Candidates, inScopeNative);

    const policy: RealtimeSessionClientPolicy = {
        Version: 1,
        Channels: scope.Channels,
        ExcludedChannels: scope.Excluded,
    };
    if (input.ClientToolTiers && (input.ClientToolTiers.App?.length || input.ClientToolTiers.Static?.length)) {
        policy.ClientTools = input.ClientToolTiers;
    }
    return { Policy: policy, ClientTools: clientTools.length > 0 ? clientTools : undefined };
}

/**
 * Narrows the client's declared tools to the scope's decision: a tool that belongs to a candidate
 * survives only if its channel's native tools were selected; a tool no candidate owns passes through;
 * and selected channel tools the client did not declare are appended (by name — never duplicated).
 */
function reconcileClientTools(
    declared: ReadonlyArray<RealtimeToolDefinition>,
    candidates: ReadonlyArray<RealtimeChannelCandidate>,
    inScopeNative: ReadonlyArray<RealtimeToolDefinition>,
): RealtimeToolDefinition[] {
    const candidateOwned = new Set(candidates.flatMap((c) => c.Tools.map((t) => t.Name)));
    const selected = new Set(inScopeNative.map((t) => t.Name));
    const kept = declared.filter((tool) => !candidateOwned.has(tool.Name) || selected.has(tool.Name));
    const present = new Set(kept.map((t) => t.Name));
    return [...kept, ...inScopeNative.filter((tool) => !present.has(tool.Name))];
}

/**
 * The channel keys a policy puts in the session — what the server persists on the session so a later
 * server-side call can check it names a channel that is actually in scope.
 */
export function InSessionChannelKeys(policy: RealtimeSessionClientPolicy): string[] {
    return policy.Channels.map((c) => c.Key);
}

/** The keys of the channels a policy excluded — what the server prunes its own channel plugins by. */
export function ExcludedChannelKeys(policy: RealtimeSessionClientPolicy): string[] {
    return (policy.ExcludedChannels ?? []).map((e) => e.Key);
}
