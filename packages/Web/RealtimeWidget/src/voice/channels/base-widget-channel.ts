/**
 * @fileoverview Framework-free interactive-channel contract for the public web widget.
 *
 * MJ's realtime co-agent stack supports interactive CHANNELS — agent-driven surfaces (Whiteboard,
 * Remote Browser, Media) the model manipulates via client-executed tools while it talks. The shipped
 * channel clients live in `@memberjunction/ng-conversations` and render ANGULAR components, so they
 * can't mount inside this dependency-free, shadow-DOM widget. This module defines the equivalent
 * **framework-free** channel contract: a channel declares client tools, applies the model's tool calls
 * to a surface it renders into a plain `HTMLElement`, and feeds user activity back as perception notes.
 *
 * Channels are resolved at runtime via `MJGlobal.ClassFactory` keyed by channel name — exactly how the
 * voice controller resolves the realtime driver — so adding a channel is a `@RegisterClass` + a Load()
 * call, with no widget-core changes. Which channels a given widget may attach is gated by the widget
 * instance's `EnabledChannels`.
 *
 * @module @memberjunction/realtime-widget
 */

/** A client-executed tool a channel exposes to the realtime model (declared at session start). */
export interface WidgetChannelToolDefinition {
    /** Fully-qualified tool name, MUST start with the channel's {@link BaseWidgetChannel.ToolNamePrefix}. */
    Name: string;
    /** One-line description the model sees. */
    Description: string;
    /** JSON-Schema for the tool's arguments (provider-agnostic; drivers translate it). */
    ParametersSchema: Record<string, unknown>;
}

/** The seam back to the live voice session a channel uses to feed the model background context. */
export interface WidgetChannelContext {
    /**
     * Feed a background perception note into the live model (no spoken reply) — e.g. "the user drew a
     * box". Mirrors `BaseRealtimeClient.SendContextNote` so the agent perceives surface activity.
     */
    SendContextNote(text: string): void;
}

/**
 * Base class for a framework-free widget interactive channel. Concrete channels (e.g. the Whiteboard)
 * subclass this and register with `@RegisterClass(BaseWidgetChannel, '<ChannelName>')`. Resolved via
 * `MJGlobal.ClassFactory.CreateInstance(BaseWidgetChannel, channelName)`.
 */
export abstract class BaseWidgetChannel {
    protected context: WidgetChannelContext | null = null;

    /** Channel name (matches the `MJ: AI Agent Channels` row + the EnabledChannels entry), e.g. `'Whiteboard'`. */
    public abstract get ChannelName(): string;

    /** Prefix every one of this channel's tool names share, e.g. `'Whiteboard_'`. Used to route tool calls. */
    public abstract get ToolNamePrefix(): string;

    /** Human label for the surface's header in the widget. */
    public abstract get SurfaceTitle(): string;

    /** The client tools this channel contributes to the realtime session (declared at mint). */
    public abstract GetToolDefinitions(): WidgetChannelToolDefinition[];

    /**
     * Applies one model-issued tool call to the channel's surface and returns the result as a JSON
     * string (fed back to the model as the tool result). Must not throw — return an `{ "error": … }`
     * JSON payload on a bad call so the model can recover.
     */
    public abstract ApplyAgentTool(toolName: string, argsJson: string): string;

    /** Renders the channel's surface into the supplied host element (inside the widget's shadow DOM). */
    public abstract BindSurface(host: HTMLElement): void;

    /** Wires the perception seam. Called once before the first tool call. */
    public Initialize(context: WidgetChannelContext): void {
        this.context = context;
    }

    /** Tears down the surface + subscriptions. Default: clears the context. */
    public Dispose(): void {
        this.context = null;
    }
}
