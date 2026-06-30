/**
 * @fileoverview Resolves + coordinates the interactive channels a widget voice session may attach.
 *
 * Built from the minted session's `enabledChannels` (which mirrors the widget instance's
 * `EnabledChannels`), it resolves each named channel to a framework-free {@link BaseWidgetChannel}
 * via `MJGlobal.ClassFactory` — exactly how the voice controller resolves the realtime driver — and
 * then: aggregates their client-tool definitions (declared to the model at mint), routes the model's
 * channel-prefixed tool calls to the owning channel (the rest are relayed to the server by the
 * controller), and binds each channel's surface into the widget's demonstration slot on first use.
 *
 * An empty `enabledChannels` (the default for every widget) yields an inert host: no tools, no surface,
 * no behavior change — so channels are strictly opt-in per widget instance.
 *
 * @module @memberjunction/web-widget
 */

import { MJGlobal } from '@memberjunction/global';
import { BaseWidgetChannel, type WidgetChannelContext, type WidgetChannelToolDefinition } from './base-widget-channel.js';

/** Result of routing a tool call through the host. */
export interface ChannelToolRouteResult {
    /** Whether a channel owned (and applied) the tool. When false, the caller relays it to the server. */
    handled: boolean;
    /** The channel's result JSON (present when `handled`). */
    resultJson?: string;
    /** The channel that handled it (present when `handled`) — lets the controller reveal its surface. */
    channel?: BaseWidgetChannel;
}

/** Coordinates the set of interactive channels enabled for a voice session. */
export class WidgetChannelHost {
    private readonly channels: BaseWidgetChannel[] = [];
    private boundChannels = new Set<string>();

    /**
     * @param enabledChannels Channel names the widget instance allows (from the minted session).
     * @param context The perception seam channels use to feed the model (channel → agent notes).
     */
    constructor(enabledChannels: readonly string[], private readonly context: WidgetChannelContext) {
        for (const name of enabledChannels) {
            const channel = this.resolveChannel(name);
            if (channel) {
                channel.Initialize(context);
                this.channels.push(channel);
            }
        }
    }

    /** True when at least one enabled channel resolved (so the controller declares tools + shows the surface). */
    public get HasChannels(): boolean {
        return this.channels.length > 0;
    }

    /** The resolved channels (read-only) — used to build/reveal their surfaces. */
    public get Channels(): readonly BaseWidgetChannel[] {
        return this.channels;
    }

    /** Every enabled channel's client-tool definitions, flattened — declared to the model at session mint. */
    public GetToolDefinitions(): WidgetChannelToolDefinition[] {
        return this.channels.flatMap((c) => c.GetToolDefinitions());
    }

    /**
     * The channel that owns a tool name (matched by prefix), or `undefined` when none does (the caller
     * then relays the tool to the server). Pure lookup — does NOT apply the tool, so the caller can bind
     * the channel's surface before applying.
     */
    public FindChannel(toolName: string): BaseWidgetChannel | undefined {
        return this.channels.find((c) => toolName.startsWith(c.ToolNamePrefix));
    }

    /**
     * Routes a model tool call to the owning channel and APPLIES it. Returns `{ handled: false }` when
     * no channel owns it. Convenience for callers that have already bound surfaces (and for tests).
     */
    public RouteTool(toolName: string, argsJson: string): ChannelToolRouteResult {
        const channel = this.FindChannel(toolName);
        if (!channel) {
            return { handled: false };
        }
        return { handled: true, resultJson: channel.ApplyAgentTool(toolName, argsJson), channel };
    }

    /**
     * Binds a channel's surface into a host element, once. The caller supplies a factory that creates/
     * returns the host element for a given channel name (the widget's demonstration slot). Idempotent.
     */
    public BindSurface(channel: BaseWidgetChannel, host: HTMLElement): void {
        if (this.boundChannels.has(channel.ChannelName)) {
            return;
        }
        channel.BindSurface(host);
        this.boundChannels.add(channel.ChannelName);
    }

    /** Disposes every channel (clears surfaces + perception subscriptions). */
    public Dispose(): void {
        for (const channel of this.channels) {
            channel.Dispose();
        }
        this.channels.length = 0;
        this.boundChannels.clear();
    }

    /**
     * Resolves one channel name to an instance via ClassFactory; returns null (logged) when no channel
     * is registered for the key. The explicit `GetRegistration` check is REQUIRED: ClassFactory falls
     * back to the highest-priority registration for the base class when a key is unknown, so without it
     * an unrecognized channel name would silently resolve to some other channel.
     */
    private resolveChannel(name: string): BaseWidgetChannel | null {
        const key = name?.trim();
        if (!key) {
            return null;
        }
        const registration = MJGlobal.Instance.ClassFactory.GetRegistration(BaseWidgetChannel, key);
        if (!registration) {
            console.warn(`[mj-widget] No interactive channel registered for '${key}' — skipping.`);
            return null;
        }
        const channel = MJGlobal.Instance.ClassFactory.CreateInstance<BaseWidgetChannel>(BaseWidgetChannel, key);
        // Defense-in-depth: ensure the resolved channel actually claims this name (not a fallback).
        if (!channel || channel.ChannelName !== key) {
            console.warn(`[mj-widget] Interactive channel '${key}' did not resolve cleanly — skipping.`);
            return null;
        }
        return channel;
    }
}
