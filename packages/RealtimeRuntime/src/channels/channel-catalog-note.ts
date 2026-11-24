/**
 * @fileoverview The **channel catalog note** — how the agent learns which channels exist in its
 * session and how to use them, from the channels' own descriptors.
 *
 * Before descriptors, an agent knew about a channel only through prose baked into a server prompt;
 * a new channel needed a prompt change. Now the runtime renders every channel's descriptor into ONE
 * context note sent when the session goes live: what each channel is (its instructions), whether it
 * is open or must be opened first, the things it holds, and — for channels reached through the
 * `ContextTool` proxy — the verbs it accepts and the inputs it opens with.
 *
 * Channels the agent already operates through native tools described by their own tool
 * declarations (a v1 channel mounted with the session) are left out: their tools self-describe, and
 * restating them would only add tokens. The note is bounded (long instructions and verb lists are
 * clipped) because it rides the model's context for the whole call.
 *
 * @module @memberjunction/realtime-runtime
 */

import {
    DescribeExposureLimit,
    WithheldVerbs,
    REALTIME_CHANNEL_LEGACY_CONTRACT_VERSION,
    type RealtimeChannelDescriptor,
    type RealtimeChannelExposure,
    type RealtimeChannelVerb,
} from '@memberjunction/ai-core-plus';
import { CHANNEL_OPEN_ACTION } from './channel-action-dispatcher';
import { FormatParameterList } from './channel-schema-format';

/** One channel to describe. */
export interface ChannelCatalogEntry {
    /** The channel's descriptor. */
    Descriptor: RealtimeChannelDescriptor;
    /** Whether the channel is mounted now (`false` for an advertised, unopened `on-demand` channel). */
    IsOpen: boolean;
    /** Whether the channel's tools were declared natively at mint (so they already describe themselves). */
    HasNativeTools: boolean;
    /**
     * Set when exposure policy (the agent's configuration, a zero-data-retention requirement, or the
     * user's choice) holds what the model may perceive of this channel below what it could. The note
     * tells the agent what it receives and why, so it never assumes it can see what it cannot.
     */
    ExposureLimit?: {
        /** What the model actually receives. */
        Effective: RealtimeChannelExposure;
        /** The most the channel could expose. */
        Ceiling: RealtimeChannelExposure;
        /** Why it is lower, as sentences. */
        Reasons: readonly string[];
    };
}

/** One channel omitted by the host for this device/viewport, with the reason to give the user if asked. */
export interface UnavailableChannelEntry {
    /** The channel's descriptor key (e.g. `"Whiteboard"`). */
    Key: string;
    /** Human-readable channel name (e.g. `"Live Whiteboard"`). */
    DisplayName: string;
    /** Why this channel is unavailable on the current device/viewport. */
    Reason: string;
}

/** Longest instruction text sent per channel. */
const MAX_INSTRUCTION_CHARS = 800;
/** Longest per-verb description sent. */
const MAX_VERB_DESCRIPTION_CHARS = 160;
/** Most verbs listed per channel. */
const MAX_VERBS_LISTED = 24;
/** Longest note total; further channels are dropped (with a marker) rather than letting it grow without bound. */
const MAX_NOTE_CHARS = 8000;

/** Clips text to `limit` characters with an ellipsis. */
function clip(text: string, limit: number): string {
    const trimmed = text.trim().replace(/\s+/g, ' ');
    return trimmed.length > limit ? `${trimmed.slice(0, limit - 1)}…` : trimmed;
}

/**
 * Whether a channel needs a catalog entry. Authored descriptors do; legacy ones only when their tools
 * do not already describe them. A channel that is open and has nothing to act on or look at (no verbs,
 * no nouns — the headless client-context proxy itself) has nothing to say.
 */
function needsEntry(entry: ChannelCatalogEntry): boolean {
    const { Descriptor: d } = entry;
    if (entry.IsOpen && d.Verbs.length === 0 && d.Nouns.length === 0) {
        return false;
    }
    const legacy = d.Version === REALTIME_CHANNEL_LEGACY_CONTRACT_VERSION;
    return !(legacy && entry.IsOpen && entry.HasNativeTools);
}

/** Renders one verb: `name(params) — description`, flagging the ones only the user may do. */
function renderVerb(verb: RealtimeChannelVerb): string {
    const user = verb.InvokableBy === 'user' ? ' [user only]' : '';
    return `${verb.Name}(${FormatParameterList(verb.ParametersSchema)})${user} — ${clip(verb.Description, MAX_VERB_DESCRIPTION_CHARS)}`;
}

/** Renders one channel's entry as indented lines. */
function renderEntry(entry: ChannelCatalogEntry): string[] {
    const { Descriptor: d } = entry;
    const status = entry.IsOpen ? 'open' : 'available — open it first';
    const lines = [`- ${d.DisplayName} (channel "${d.Key}", ${status}): ${clip(d.Instructions, MAX_INSTRUCTION_CHARS)}`];
    if (d.Nouns.length > 0) {
        lines.push(`    holds: ${d.Nouns.map((n) => `${n.Name} — ${clip(n.Description, MAX_VERB_DESCRIPTION_CHARS)}`).join('; ')}`);
    }
    if (!entry.IsOpen && d.Inputs) {
        lines.push(`    open with: ${FormatParameterList(d.Inputs) || '(no inputs)'}`);
    }
    // Native-tool channels' verbs are already tools; list verbs only where the proxy is the way in.
    if (!entry.HasNativeTools && d.Verbs.length > 0) {
        const verbs = d.Verbs.slice(0, MAX_VERBS_LISTED).map(renderVerb);
        lines.push(`    actions: ${verbs.join('; ')}${d.Verbs.length > MAX_VERBS_LISTED ? `; …and ${d.Verbs.length - MAX_VERBS_LISTED} more` : ''}`);
    }
    return lines;
}

/**
 * Renders the catalog note for a session's channels.
 *
 * @param entries The session's channels (open and advertised).
 * @param unavailable Channels omitted by the host on this device/viewport, with reasons to share if asked.
 * @returns The note text, or `null` when no channel needs describing (so a legacy-only session sends nothing new).
 */
export function BuildChannelCatalogNote(
    entries: ReadonlyArray<ChannelCatalogEntry>,
    unavailable: ReadonlyArray<UnavailableChannelEntry> = [],
): string | null {
    const described = entries.filter(needsEntry);
    const limits = renderVisibilityLimits(entries);
    const unavailableLines = renderUnavailableChannels(unavailable);
    if (described.length === 0) {
        const tail = [...limits, ...unavailableLines];
        return tail.length > 0 ? tail.join('\n') : null;
    }
    const header = [
        '[channels] Interactive channels in this session.',
        `Address one with ContextTool: action = the action name, target = { "channel": "<channel>" }, params = that action's parameters.`,
        `A channel marked "available" must be opened first: action "${CHANNEL_OPEN_ACTION}", target = { "channel": "<channel>" }, params = its open inputs.`,
    ];
    const lines = [...header];
    let omitted = 0;
    for (const entry of described) {
        const rendered = renderEntry(entry);
        if (lines.join('\n').length + rendered.join('\n').length > MAX_NOTE_CHARS) {
            omitted++;
            continue;
        }
        lines.push(...rendered);
    }
    if (omitted > 0) {
        lines.push(`(${omitted} more channel(s) omitted for length.)`);
    }
    lines.push(...limits, ...unavailableLines);
    return lines.join('\n');
}

/** The "unavailable in this view" section: why host-filtered channels are omitted so the agent explains honestly without over-promising agent-scoped opt-in channels. */
function renderUnavailableChannels(unavailable: ReadonlyArray<UnavailableChannelEntry>): string[] {
    if (unavailable.length === 0) {
        return [];
    }
    const lines = unavailable.map((u) => `- ${u.DisplayName} (channel "${u.Key}"): ${u.Reason}`);
    return [
        '[channels] Unavailable in this view (filtered out before per-agent policy: do not try to open or call these, and do not promise an opt-in channel is enabled for you on wider screens unless your instructions say you have it; if the user asks for one, share the reason below instead of claiming a permissions error):',
        ...lines,
    ];
}

/** The "visibility limits" section: what the agent perceives of each channel whose exposure is held down, and why. */
function renderVisibilityLimits(entries: ReadonlyArray<ChannelCatalogEntry>): string[] {
    const lines: string[] = [];
    for (const entry of entries) {
        const limit = entry.ExposureLimit;
        const sentence = limit ? DescribeExposureLimit(limit.Effective, limit.Ceiling, limit.Reasons) : null;
        if (limit && sentence) {
            lines.push(`- ${entry.Descriptor.DisplayName} (channel "${entry.Descriptor.Key}"): ${sentence}`);
            const withheld = WithheldVerbs(entry.Descriptor.Verbs, limit.Effective).map((v) => v.Name);
            if (withheld.length > 0) {
                lines.push(`    unavailable right now, because their results would show you what you may not perceive: ${withheld.join(', ')}`);
            }
        }
    }
    return lines.length > 0 ? ['[channels] Visibility limits — what you perceive of these channels without asking:', ...lines] : [];
}
