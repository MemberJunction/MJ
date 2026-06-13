/**
 * @fileoverview The **Remote Browser** server-side channel — a SERVER-ONLY interactive channel (no
 * Angular client surface) that gives a realtime voice co-agent a live web browser.
 *
 * It contributes a browser-driving tool vocabulary the agent invokes server-side (`browser_OpenUrl`,
 * `browser_Click`, `browser_Type`, `browser_Key`, `browser_Scroll`, `browser_Back`, `browser_Forward`,
 * `browser_Wait`, `browser_Screenshot`, `browser_GetPageText`) and feeds back the perception that makes
 * web automation possible: the **current URL** after each navigation/action. Every tool maps to a
 * strongly-typed {@link RemoteBrowserAction} executed against the live {@link IRemoteBrowserSession} the
 * {@link RemoteBrowserEngine} opened. When the backend's resolved control strategy is `NativeAI`, a
 * high-level intent tool (`browser_DoTask`) is contributed instead/additionally and routes to the
 * backend's own AI-control harness via {@link IRemoteBrowserSession.InvokeNativeAIControl}.
 *
 * The channel has **no platform code**: it drives an INJECTED {@link IRemoteBrowserSession} (the bridge
 * driver / engine owns the CDP machinery). This is the §4d "Remote Browser channel" pattern realized as
 * an MJ channel — dynamic tool vocabulary + perception, routed through the same channel plane as the
 * MJ-native whiteboard, with NO client component (a bot has no browser of its own).
 *
 * @module @memberjunction/remote-browser-server
 * @author MemberJunction.com
 */

import {
    BaseRealtimeChannelServer,
    JSONObject,
    RealtimeToolDefinition,
    ServerChannelToolResult,
} from '@memberjunction/ai';
import { RegisterClass } from '@memberjunction/global';
import { LogError } from '@memberjunction/core';
import {
    IRemoteBrowserProviderFeatures,
    IRemoteBrowserSession,
    RemoteBrowserAction,
    RemoteBrowserActionResult,
    RemoteBrowserControlStrategy,
    resolveControlStrategy,
} from '@memberjunction/remote-browser-base';

/** The channel name — matches the (seedable) `MJ: AI Agent Channels` row's `Name`. */
export const REMOTE_BROWSER_CHANNEL_NAME = 'Remote Browser';

/**
 * The shared name prefix of every Remote Browser tool. The host routes any tool call beginning with
 * this prefix back to this channel's {@link RemoteBrowserChannel.ExecuteServerTool}.
 */
export const REMOTE_BROWSER_TOOL_PREFIX = 'browser_';

// ──────────────────────────────────────────────────────────────────────────────────────────────────
// Strongly-typed parsed tool-argument shapes — one per tool, no `any`.
// ──────────────────────────────────────────────────────────────────────────────────────────────────

/** Parsed args for `browser_OpenUrl`. */
interface OpenUrlArgs {
    url?: string;
}

/** Parsed args for `browser_Click`. */
interface ClickArgs {
    selector?: string;
    x?: number;
    y?: number;
}

/** Parsed args for `browser_Type`. */
interface TypeArgs {
    text?: string;
    selector?: string;
}

/** Parsed args for `browser_Key`. */
interface KeyArgs {
    key?: string;
}

/** Parsed args for `browser_Scroll`. */
interface ScrollArgs {
    deltaX?: number;
    deltaY?: number;
    selector?: string;
}

/** Parsed args for `browser_Wait`. */
interface WaitArgs {
    ms?: number;
    selector?: string;
}

/** Parsed args for the native-AI `browser_DoTask` intent tool. */
interface DoTaskArgs {
    intent?: string;
}

/**
 * Dependencies injected into a {@link RemoteBrowserChannel} — the live session the channel drives and
 * the backend's capability flags (which decide the control strategy + screenshot availability).
 * Injected (rather than resolved) so the channel is fully unit-testable with a fake session.
 */
export interface RemoteBrowserChannelDeps {
    /** The live remote-browser session the channel's tools execute against. */
    Session: IRemoteBrowserSession;

    /** The backend's capability flags — drives control-strategy resolution + screenshot gating. */
    Features: IRemoteBrowserProviderFeatures;

    /**
     * Optional caller preference for the control strategy. `'ComputerUse'` pins MJ's own tool-driven
     * loop and suppresses native delegation even when the backend supports it. When omitted the
     * strategy is resolved from {@link Features} via `resolveControlStrategy`.
     */
    PreferredStrategy?: RemoteBrowserControlStrategy;
}

/**
 * Server-only Remote Browser channel — gives a realtime co-agent a browser. ONE instance per session.
 *
 * Like Meeting Controls (and unlike the registry-resolved whiteboard), this channel needs a per-session
 * {@link IRemoteBrowserSession} from the engine, so it is constructed directly with
 * {@link RemoteBrowserChannelDeps} and handed to the host's per-session plugin set. It has **no client
 * surface** — {@link GetServerToolDefinitions} / {@link ExecuteServerTool} are the entire interface and
 * {@link GetSurfaceComponent} returns `null` (a server-only console channel).
 *
 * Registered under {@link REMOTE_BROWSER_CHANNEL_NAME} so a seeded registry row can resolve a default
 * (session-less) instance for discovery; a real session always injects the engine's live session.
 */
@RegisterClass(BaseRealtimeChannelServer, 'RemoteBrowserChannelServer')
export class RemoteBrowserChannel extends BaseRealtimeChannelServer {
    /** The live remote-browser session, or `null` for a registry-resolved discovery instance. */
    private readonly session: IRemoteBrowserSession | null;

    /** The backend's capability flags (empty for a discovery instance). */
    private readonly features: IRemoteBrowserProviderFeatures;

    /** The resolved control strategy for this session (`ComputerUse` / `NativeAI`). */
    private readonly strategy: RemoteBrowserControlStrategy;

    /**
     * @param deps Optional per-session dependencies. Omitted only for a registry-resolved discovery
     *   instance (the host's ClassFactory path) — such an instance contributes its tool vocabulary but
     *   cannot drive a browser (every tool returns a structured "no live session" failure).
     */
    constructor(deps?: RemoteBrowserChannelDeps) {
        super();
        this.session = deps?.Session ?? null;
        this.features = deps?.Features ?? {};
        this.strategy = resolveControlStrategy(this.features, deps?.PreferredStrategy);
    }

    /** @inheritdoc */
    public get ChannelName(): string {
        return REMOTE_BROWSER_CHANNEL_NAME;
    }

    /** @inheritdoc */
    public override get ToolNamePrefix(): string {
        return REMOTE_BROWSER_TOOL_PREFIX;
    }

    /** The resolved control strategy for this session — exposed for the host + tests. */
    public get Strategy(): RemoteBrowserControlStrategy {
        return this.strategy;
    }

    /**
     * A server-only channel contributes no Angular client surface — the agent drives the browser through
     * tools, and the live view (when shown) is the engine's screencast track, not a channel component.
     *
     * @returns `null` (no client component), mirroring the server-only Meeting Controls precedent.
     */
    public GetSurfaceComponent(): string | null {
        return null;
    }

    // ── Dynamic tool vocabulary ─────────────────────────────────────────────────────

    /**
     * The browser-driving tool vocabulary. When the resolved {@link Strategy} is `NativeAI`, the
     * high-level `browser_DoTask` intent tool is contributed (delegating heavy autonomous automation to
     * the backend's own AI-control harness). The granular `ComputerUse` tools (`OpenUrl`/`Click`/…) are
     * always contributed so the co-agent retains fine-grained control regardless of strategy — the
     * runtime-computed addition of `DoTask` is the §4d-i "pluggable strategy" point.
     *
     * @returns The contributed server-executed tool definitions.
     */
    public override GetServerToolDefinitions(): RealtimeToolDefinition[] {
        const tools: RealtimeToolDefinition[] = [
            this.tool('OpenUrl', 'Navigate the browser to an absolute URL.', this.openUrlSchema()),
            this.tool('Click', 'Click an element by CSS selector, or by viewport x/y coordinates.', this.clickSchema()),
            this.tool('Type', 'Type text, optionally focusing a CSS selector first.', this.typeSchema()),
            this.tool('Key', 'Press a key or key-combination (e.g. "Enter", "Control+A").', this.keySchema()),
            this.tool('Scroll', 'Scroll by deltaX/deltaY pixels, or scroll a CSS selector into view.', this.scrollSchema()),
            this.tool('Back', 'Navigate back in browser history.', this.emptySchema()),
            this.tool('Forward', 'Navigate forward in browser history.', this.emptySchema()),
            this.tool('Wait', 'Wait for a fixed number of milliseconds, or until a CSS selector appears.', this.waitSchema()),
            this.tool('Screenshot', 'Capture a screenshot of the current viewport (returns base64).', this.emptySchema()),
            this.tool('GetPageText', 'Return the current page URL and a short note describing the page.', this.emptySchema()),
        ];
        if (this.strategy === 'NativeAI') {
            tools.push(
                this.tool(
                    'DoTask',
                    "Delegate a high-level natural-language task to the browser's native AI-control harness " +
                        "(e.g. 'log in with the test account and download the latest invoice').",
                    this.doTaskSchema(),
                ),
            );
        }
        return tools;
    }

    /**
     * Executes one browser tool and returns the result (the model narrates it). Dispatch is by the bare
     * tool name (after {@link REMOTE_BROWSER_TOOL_PREFIX}). Never throws — a missing live session, bad
     * args, or an unknown tool resolve to a structured failure result.
     *
     * @param toolName The full tool name (prefixed).
     * @param argsJson The raw arguments JSON.
     * @returns The execution result.
     */
    public override async ExecuteServerTool(toolName: string, argsJson: string): Promise<ServerChannelToolResult> {
        if (!this.session) {
            return { Success: false, Output: 'No live remote-browser session is bound to this channel.' };
        }
        const bare = toolName.startsWith(REMOTE_BROWSER_TOOL_PREFIX)
            ? toolName.slice(REMOTE_BROWSER_TOOL_PREFIX.length)
            : toolName;
        try {
            return await this.dispatch(bare, argsJson);
        } catch (err) {
            return { Success: false, Output: `Browser tool '${toolName}' failed: ${this.errText(err)}` };
        }
    }

    /**
     * Routes a bare tool name to its handler. A standalone method (rather than an inline switch in
     * {@link ExecuteServerTool}) so the try/catch wrapper stays thin and dispatch stays testable.
     *
     * @param bare The tool name with the prefix stripped.
     * @param argsJson The raw arguments JSON.
     * @returns The execution result.
     */
    private async dispatch(bare: string, argsJson: string): Promise<ServerChannelToolResult> {
        switch (bare) {
            case 'OpenUrl':
                return this.execOpenUrl(argsJson);
            case 'Click':
                return this.execClick(argsJson);
            case 'Type':
                return this.execType(argsJson);
            case 'Key':
                return this.execKey(argsJson);
            case 'Scroll':
                return this.execScroll(argsJson);
            case 'Back':
                return this.execAction({ Kind: 'back' });
            case 'Forward':
                return this.execAction({ Kind: 'forward' });
            case 'Wait':
                return this.execWait(argsJson);
            case 'Screenshot':
                return this.execScreenshot();
            case 'GetPageText':
                return this.execGetPageText();
            case 'DoTask':
                return this.execDoTask(argsJson);
            default:
                return { Success: false, Output: `Unknown Remote Browser tool '${bare}'.` };
        }
    }

    // ── Tool implementations ────────────────────────────────────────────────────────

    /** `OpenUrl(url)` — navigate the browser. */
    private async execOpenUrl(argsJson: string): Promise<ServerChannelToolResult> {
        const url = this.safeParse<OpenUrlArgs>(argsJson).url;
        if (typeof url !== 'string' || url.trim().length === 0) {
            return { Success: false, Output: "OpenUrl requires a non-empty 'url'." };
        }
        return this.execAction({ Kind: 'navigate', Url: url });
    }

    /** `Click(selector?, x?, y?)` — click by selector or coordinates. */
    private async execClick(argsJson: string): Promise<ServerChannelToolResult> {
        const args = this.safeParse<ClickArgs>(argsJson);
        if (!args.selector && (typeof args.x !== 'number' || typeof args.y !== 'number')) {
            return { Success: false, Output: "Click requires either a 'selector' or both 'x' and 'y'." };
        }
        return this.execAction({ Kind: 'click', Selector: args.selector, X: args.x, Y: args.y });
    }

    /** `Type(text, selector?)` — type text, optionally into a selector. */
    private async execType(argsJson: string): Promise<ServerChannelToolResult> {
        const args = this.safeParse<TypeArgs>(argsJson);
        if (typeof args.text !== 'string') {
            return { Success: false, Output: "Type requires a 'text' string." };
        }
        return this.execAction({ Kind: 'type', Text: args.text, Selector: args.selector });
    }

    /** `Key(key)` — press a key/combination. */
    private async execKey(argsJson: string): Promise<ServerChannelToolResult> {
        const key = this.safeParse<KeyArgs>(argsJson).key;
        if (typeof key !== 'string' || key.trim().length === 0) {
            return { Success: false, Output: "Key requires a non-empty 'key'." };
        }
        return this.execAction({ Kind: 'key', Key: key });
    }

    /** `Scroll(deltaX?, deltaY?, selector?)` — scroll by delta or into view. */
    private async execScroll(argsJson: string): Promise<ServerChannelToolResult> {
        const args = this.safeParse<ScrollArgs>(argsJson);
        if (!args.selector && typeof args.deltaX !== 'number' && typeof args.deltaY !== 'number') {
            return { Success: false, Output: "Scroll requires a 'selector' or at least one of 'deltaX'/'deltaY'." };
        }
        return this.execAction({ Kind: 'scroll', DeltaX: args.deltaX, DeltaY: args.deltaY, Selector: args.selector });
    }

    /** `Wait(ms?, selector?)` — wait a fixed time or for a selector. */
    private async execWait(argsJson: string): Promise<ServerChannelToolResult> {
        const args = this.safeParse<WaitArgs>(argsJson);
        if (typeof args.ms !== 'number' && !args.selector) {
            return { Success: false, Output: "Wait requires a numeric 'ms' or a 'selector'." };
        }
        return this.execAction({ Kind: 'wait', Ms: args.ms, Selector: args.selector });
    }

    /** `Screenshot()` — capture the current viewport as base64. */
    private async execScreenshot(): Promise<ServerChannelToolResult> {
        const session = this.session;
        if (!session) {
            return { Success: false, Output: 'No live remote-browser session.' };
        }
        const base64 = await session.CaptureScreenshot();
        this.emitPerception('screenshot captured');
        return {
            Success: true,
            Output: JSON.stringify({ CurrentUrl: session.GetCurrentUrl(), ScreenshotBase64: base64 }),
        };
    }

    /** `GetPageText()` — perception read-back of the current URL (page-changed note). */
    private execGetPageText(): ServerChannelToolResult {
        const session = this.session;
        if (!session) {
            return { Success: false, Output: 'No live remote-browser session.' };
        }
        const currentUrl = session.GetCurrentUrl();
        return { Success: true, Output: JSON.stringify({ CurrentUrl: currentUrl }) };
    }

    /** `DoTask(intent)` — native-AI delegation (only contributed when strategy is `NativeAI`). */
    private async execDoTask(argsJson: string): Promise<ServerChannelToolResult> {
        if (this.strategy !== 'NativeAI') {
            return { Success: false, Output: 'Native AI control is not enabled for this browser session.' };
        }
        const session = this.session;
        if (!session) {
            return { Success: false, Output: 'No live remote-browser session.' };
        }
        const intent = this.safeParse<DoTaskArgs>(argsJson).intent;
        if (typeof intent !== 'string' || intent.trim().length === 0) {
            return { Success: false, Output: "DoTask requires a non-empty 'intent'." };
        }
        const result = await session.InvokeNativeAIControl(intent);
        return this.toToolResult(result, `Completed task: ${intent}`);
    }

    /**
     * Executes a {@link RemoteBrowserAction} against the live session, feeds the resulting URL back as
     * perception, and maps the {@link RemoteBrowserActionResult} into the channel tool result shape.
     *
     * @param action The action to perform.
     * @returns The execution result.
     */
    private async execAction(action: RemoteBrowserAction): Promise<ServerChannelToolResult> {
        const session = this.session;
        if (!session) {
            return { Success: false, Output: 'No live remote-browser session.' };
        }
        const result = await session.ExecuteAction(action);
        if (result.CurrentUrl) {
            this.emitPerception(`page is ${result.CurrentUrl}`);
        }
        return this.toToolResult(result, `${action.Kind} ok`);
    }

    // ── Perception ──────────────────────────────────────────────────────────────────

    /**
     * Feeds a browser-state note (the current URL / a page-changed note) to the model as a background
     * context note — the channel-plane perception mechanism the bridge channel uses. No-op when the
     * host context supplies no perception sink (provider can't inject mid-session, or no live session).
     *
     * @param note A short note describing the current browser state (logging + perception).
     */
    private emitPerception(note: string): void {
        const sink = this.Context?.SendContextNote;
        if (!sink) {
            return;
        }
        try {
            sink.call(this.Context, `[remote-browser] ${note}`);
        } catch (err) {
            LogError(`[RemoteBrowserChannel] perception emit failed: ${this.errText(err)}`);
        }
    }

    // ── Helpers ─────────────────────────────────────────────────────────────────────

    /**
     * Maps a {@link RemoteBrowserActionResult} into a {@link ServerChannelToolResult}, preferring the
     * driver's `Detail`, then the resulting URL, then a default success note.
     *
     * @param result The action result from the session.
     * @param successNote The default note when the result carries no detail/URL.
     * @returns The channel tool result.
     */
    private toToolResult(result: RemoteBrowserActionResult, successNote: string): ServerChannelToolResult {
        if (!result.Success) {
            return { Success: false, Output: result.Detail ?? 'The browser action failed.' };
        }
        const output = result.Detail ?? (result.CurrentUrl ? `Now at ${result.CurrentUrl}.` : successNote);
        return { Success: true, Output: output };
    }

    /** Builds one tool definition with the prefixed name. */
    private tool(bareName: string, description: string, parametersSchema: JSONObject): RealtimeToolDefinition {
        return { Name: `${REMOTE_BROWSER_TOOL_PREFIX}${bareName}`, Description: description, ParametersSchema: parametersSchema };
    }

    /** JSON schema for `OpenUrl`. */
    private openUrlSchema(): JSONObject {
        return {
            type: 'object',
            properties: { url: { type: 'string', description: 'The absolute URL to navigate to.' } },
            required: ['url'],
        };
    }

    /** JSON schema for `Click`. */
    private clickSchema(): JSONObject {
        return {
            type: 'object',
            properties: {
                selector: { type: 'string', description: 'CSS selector of the element to click.' },
                x: { type: 'number', description: 'Viewport X coordinate (used when no selector).' },
                y: { type: 'number', description: 'Viewport Y coordinate (used when no selector).' },
            },
        };
    }

    /** JSON schema for `Type`. */
    private typeSchema(): JSONObject {
        return {
            type: 'object',
            properties: {
                text: { type: 'string', description: 'The text to type.' },
                selector: { type: 'string', description: 'Optional CSS selector to focus before typing.' },
            },
            required: ['text'],
        };
    }

    /** JSON schema for `Key`. */
    private keySchema(): JSONObject {
        return {
            type: 'object',
            properties: { key: { type: 'string', description: 'The key or combination to press, in Playwright/CDP syntax.' } },
            required: ['key'],
        };
    }

    /** JSON schema for `Scroll`. */
    private scrollSchema(): JSONObject {
        return {
            type: 'object',
            properties: {
                deltaX: { type: 'number', description: 'Horizontal scroll distance in pixels (positive = right).' },
                deltaY: { type: 'number', description: 'Vertical scroll distance in pixels (positive = down).' },
                selector: { type: 'string', description: 'Optional CSS selector to scroll into view instead of applying deltas.' },
            },
        };
    }

    /** JSON schema for `Wait`. */
    private waitSchema(): JSONObject {
        return {
            type: 'object',
            properties: {
                ms: { type: 'number', description: 'Fixed wait in milliseconds.' },
                selector: { type: 'string', description: 'Optional CSS selector to wait for instead of a fixed duration.' },
            },
        };
    }

    /** JSON schema for the native-AI `DoTask` tool. */
    private doTaskSchema(): JSONObject {
        return {
            type: 'object',
            properties: { intent: { type: 'string', description: 'The natural-language task to delegate to the native AI harness.' } },
            required: ['intent'],
        };
    }

    /** JSON schema for a parameterless tool (`Back` / `Forward` / `Screenshot` / `GetPageText`). */
    private emptySchema(): JSONObject {
        return { type: 'object', properties: {} };
    }

    /** Parses JSON into `T`, returning an empty object on any error (channels never throw on bad args). */
    private safeParse<T>(json: string): T {
        try {
            const parsed: unknown = JSON.parse(json);
            return parsed && typeof parsed === 'object' ? (parsed as T) : ({} as T);
        } catch {
            return {} as T;
        }
    }

    /** Renders an unknown error into a string message. */
    private errText(err: unknown): string {
        return err instanceof Error ? err.message : String(err);
    }
}

/**
 * Tree-shaking prevention for {@link RemoteBrowserChannel}'s `@RegisterClass` registration. Call from a
 * static code path so the registration is never eliminated by the bundler — mirroring every other
 * `Load…()` in the realtime stack.
 */
export function LoadRemoteBrowserChannel(): void {
    // no-op — the import + call create a static reference bundlers cannot eliminate
}
