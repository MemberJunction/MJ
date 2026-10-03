/**
 * @fileoverview **Legacy descriptor synthesis** — how a channel written against the original (v1)
 * members gets a v2 descriptor without being edited.
 *
 * Back-compat is absolute: a plugin that implements only `GetToolDefinitions()`, `ApplyAgentTool()`
 * and tab chrome keeps working unchanged, and — because the runtime reads descriptors, never the
 * v1 members, when it scopes channels and advertises them — it must be *describable*. Synthesis
 * derives a descriptor from what the plugin already declares:
 *
 * - **verbs** from its tool definitions (the tool name minus the shared prefix; the full tool name
 *   is kept as `NativeToolName`, so the proxy and the native path reach the same executor);
 * - **instructions** from the registry row's `Description` when the runtime has one, else the
 *   channel's first-run intro, else a plain statement of the tool prefix;
 * - **availability / display / exposure** from conservative defaults that preserve today's
 *   behavior: `'all-sessions'` (every pre-existing channel was), `'open-on-start'` when it has a
 *   surface and `'headless'` when it does not, and `'pixels'` only when it sources video.
 *
 * The result is stamped with {@link REALTIME_CHANNEL_LEGACY_CONTRACT_VERSION} so a synthesized
 * descriptor is always distinguishable from an authored one.
 *
 * @module @memberjunction/realtime-runtime
 */

import type { RealtimeToolDefinition } from '@memberjunction/ai';
import {
    REALTIME_CHANNEL_LEGACY_CONTRACT_VERSION,
    type RealtimeChannelDescriptor,
    type RealtimeChannelInvoker,
    type RealtimeChannelVerb,
} from '@memberjunction/ai-core-plus';
import type { BaseRealtimeChannelClient } from './base-realtime-channel-client';

/**
 * The verb name for a native tool: the tool name with the channel's shared prefix removed
 * (`'Whiteboard_AddNote'` → `'AddNote'`). A tool that does not carry the prefix — or that *is* the
 * prefix, like `ContextTool` — keeps its full name.
 */
export function VerbNameForTool(toolName: string, toolNamePrefix: string): string {
    return toolNamePrefix.length > 0 && toolName.length > toolNamePrefix.length && toolName.startsWith(toolNamePrefix)
        ? toolName.slice(toolNamePrefix.length)
        : toolName;
}

/**
 * Builds the verb list for a channel whose actions are its native tools. Both the synthesizer and
 * the reference channels' explicit descriptors use it, so a subclass that adds a tool (an app
 * extending a MJ channel) gets a verb for it automatically instead of a descriptor that lies.
 *
 * @param tools The channel's current tool declarations (`GetToolDefinitions()`).
 * @param toolNamePrefix The channel's shared tool-name prefix.
 * @param invokableBy Who may invoke these verbs (default `'agent'` — native tools are agent tools).
 * @param returnsChannelData Native tool name to the exposure its RESULT requires, for the tools whose result carries what
 *   the channel holds (see `RealtimeChannelVerb.ReturnsChannelData`); tools not listed only act.
 */
export function BuildToolBackedVerbs(
    tools: ReadonlyArray<RealtimeToolDefinition>,
    toolNamePrefix: string,
    invokableBy: RealtimeChannelInvoker = 'agent',
    returnsChannelData: Readonly<Record<string, 'state' | 'pixels'>> = {},
): RealtimeChannelVerb[] {
    return tools.map((tool) => ({
        Name: VerbNameForTool(tool.Name, toolNamePrefix),
        Description: tool.Description,
        ParametersSchema: tool.ParametersSchema,
        InvokableBy: invokableBy,
        NativeToolName: tool.Name,
        ...(returnsChannelData[tool.Name] ? { ReturnsChannelData: returnsChannelData[tool.Name] } : {}),
    }));
}

/** Extra context the runtime can supply that the channel instance cannot know. */
export interface DescriptorSynthesisContext {
    /** The registry row's `Description`, when the channel was resolved from a row. */
    RegistryDescription?: string | null;
}

/**
 * Synthesizes a v2 descriptor for a channel that implements only the v1 members.
 *
 * @param channel The channel (need not be initialized).
 * @param context Optional runtime-supplied context (the registry row's description).
 */
export function SynthesizeChannelDescriptor(
    channel: BaseRealtimeChannelClient,
    context: DescriptorSynthesisContext = {},
): RealtimeChannelDescriptor {
    const sourcesVideo = channel.GetSourcedTracks().some((t) => t.Modality === 'video' && t.Direction === 'inbound');
    return {
        Key: channel.ChannelName,
        Version: REALTIME_CHANNEL_LEGACY_CONTRACT_VERSION,
        DisplayName: channel.TabTitle,
        Instructions: legacyInstructions(channel, context),
        Nouns: [],
        Verbs: BuildToolBackedVerbs(channel.GetToolDefinitions(), channel.ToolNamePrefix),
        DisplayPolicy: channel.HasSurface() ? 'open-on-start' : 'headless',
        DefaultAvailability: 'all-sessions',
        MaxExposure: sourcesVideo ? 'pixels' : 'state',
    };
}

/** The best available natural-language account of a legacy channel. */
function legacyInstructions(channel: BaseRealtimeChannelClient, context: DescriptorSynthesisContext): string {
    const fromRegistry = context.RegistryDescription?.trim();
    if (fromRegistry) {
        return fromRegistry;
    }
    const fromIntro = channel.GetOnboardingDetails()?.Description?.trim();
    if (fromIntro) {
        return fromIntro;
    }
    const prefix = channel.ToolNamePrefix;
    return prefix.length > 0
        ? `The ${channel.TabTitle} channel. Use its tools (names beginning "${prefix}") to act on it.`
        : `The ${channel.TabTitle} channel.`;
}
