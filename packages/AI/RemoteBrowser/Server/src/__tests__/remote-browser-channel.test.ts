import { describe, it, expect, beforeEach } from 'vitest';
import type { RealtimeChannelServerContext } from '@memberjunction/ai';
import {
    IRemoteBrowserProviderFeatures,
    IRemoteBrowserSession,
    RemoteBrowserAction,
    RemoteBrowserActionResult,
    RemoteBrowserHumanInput,
    RemoteBrowserScreencastFrame,
} from '@memberjunction/remote-browser-base';
import {
    RemoteBrowserChannel,
    RemoteBrowserChannelDeps,
    REMOTE_BROWSER_CHANNEL_NAME,
    REMOTE_BROWSER_TOOL_PREFIX,
} from '../remote-browser-channel';

// ──────────────────────────────────────────────────────────────────────────────
// Fake session capturing actions / native intents.
// ──────────────────────────────────────────────────────────────────────────────

class FakeSession implements IRemoteBrowserSession {
    public Actions: RemoteBrowserAction[] = [];
    public NativeIntents: string[] = [];
    public FailNext = false;
    private url = 'https://start.example';

    public GetCdpEndpoint(): string {
        return 'ws://fake';
    }
    public async Navigate(url: string): Promise<RemoteBrowserActionResult> {
        return this.ExecuteAction({ Kind: 'navigate', Url: url });
    }
    public async ExecuteAction(action: RemoteBrowserAction): Promise<RemoteBrowserActionResult> {
        this.Actions.push(action);
        if (this.FailNext) {
            this.FailNext = false;
            return { Success: false, Detail: 'navigation blocked' };
        }
        if (action.Kind === 'navigate') {
            this.url = action.Url;
        }
        return { Success: true, CurrentUrl: this.url };
    }
    public async CaptureScreenshot(): Promise<string> {
        return 'IMG64';
    }
    public GetCurrentUrl(): string {
        return this.url;
    }
    public async Close(): Promise<void> {}
    public async GetLiveViewUrl(): Promise<string> {
        return 'https://fake/live';
    }
    public async StartScreencast(_onFrame: (frame: RemoteBrowserScreencastFrame) => void): Promise<void> {}
    public async StopScreencast(): Promise<void> {}
    public RouteHumanInput(_input: RemoteBrowserHumanInput): void {}
    public async InvokeNativeAIControl(intent: string): Promise<RemoteBrowserActionResult> {
        this.NativeIntents.push(intent);
        return { Success: true, CurrentUrl: this.url, Detail: `did: ${intent}` };
    }
}

function makeChannel(
    features: IRemoteBrowserProviderFeatures = {},
    extra: Partial<RemoteBrowserChannelDeps> = {},
): { channel: RemoteBrowserChannel; session: FakeSession; notes: string[] } {
    const session = new FakeSession();
    const notes: string[] = [];
    const channel = new RemoteBrowserChannel({ Session: session, Features: features, ...extra });
    const ctx: RealtimeChannelServerContext = {
        AgentSessionID: 's1',
        AgentID: 'a1',
        UserID: 'u1',
        ConversationID: null,
        SendContextNote: (text: string) => notes.push(text),
    };
    channel.Initialize(ctx);
    return { channel, session, notes };
}

function name(bare: string): string {
    return `${REMOTE_BROWSER_TOOL_PREFIX}${bare}`;
}

beforeEach(() => {
    // no shared state
});

// ──────────────────────────────────────────────────────────────────────────────
// Channel identity + tool definitions.
// ──────────────────────────────────────────────────────────────────────────────

describe('RemoteBrowserChannel — identity + tool definitions', () => {
    it('exposes the channel name, prefix, and no client surface', () => {
        const { channel } = makeChannel();
        expect(channel.ChannelName).toBe(REMOTE_BROWSER_CHANNEL_NAME);
        expect(channel.ToolNamePrefix).toBe(REMOTE_BROWSER_TOOL_PREFIX);
        expect(channel.GetSurfaceComponent()).toBeNull();
    });

    it('contributes the granular ComputerUse tools and prefixes every name', () => {
        const { channel } = makeChannel();
        const names = channel.GetServerToolDefinitions().map((t) => t.Name);
        expect(names).toEqual(
            [
                'OpenUrl',
                'Click',
                'Type',
                'Key',
                'Scroll',
                'Back',
                'Forward',
                'Wait',
                'Screenshot',
                'GetPageText',
            ].map(name),
        );
        expect(names.every((n) => n.startsWith(REMOTE_BROWSER_TOOL_PREFIX))).toBe(true);
    });

    it('does NOT contribute DoTask under the default ComputerUse strategy', () => {
        const { channel } = makeChannel({ RawCdpControl: true });
        expect(channel.Strategy).toBe('ComputerUse');
        expect(channel.GetServerToolDefinitions().map((t) => t.Name)).not.toContain(name('DoTask'));
    });

    it('contributes DoTask when the backend enables the NativeAI strategy', () => {
        const { channel } = makeChannel({ NativeAIControl: true });
        expect(channel.Strategy).toBe('NativeAI');
        expect(channel.GetServerToolDefinitions().map((t) => t.Name)).toContain(name('DoTask'));
    });

    it('an explicit ComputerUse preference suppresses native delegation even when supported', () => {
        const { channel } = makeChannel({ NativeAIControl: true }, { PreferredStrategy: 'ComputerUse' });
        expect(channel.Strategy).toBe('ComputerUse');
        expect(channel.GetServerToolDefinitions().map((t) => t.Name)).not.toContain(name('DoTask'));
    });
});

// ──────────────────────────────────────────────────────────────────────────────
// ExecuteServerTool — mapping each tool → action.
// ──────────────────────────────────────────────────────────────────────────────

describe('RemoteBrowserChannel — tool execution maps to actions', () => {
    it('OpenUrl maps to a navigate action and feeds perception', async () => {
        const { channel, session, notes } = makeChannel();
        const res = await channel.ExecuteServerTool(name('OpenUrl'), JSON.stringify({ url: 'https://x.test' }));
        expect(res.Success).toBe(true);
        expect(session.Actions[0]).toEqual({ Kind: 'navigate', Url: 'https://x.test' });
        expect(notes.some((n) => n.includes('https://x.test'))).toBe(true);
    });

    it('Click by selector maps to a click action', async () => {
        const { channel, session } = makeChannel();
        await channel.ExecuteServerTool(name('Click'), JSON.stringify({ selector: '#go' }));
        expect(session.Actions[0]).toEqual({ Kind: 'click', Selector: '#go', X: undefined, Y: undefined });
    });

    it('Click by coordinates maps to a click action', async () => {
        const { channel, session } = makeChannel();
        await channel.ExecuteServerTool(name('Click'), JSON.stringify({ x: 12, y: 34 }));
        expect(session.Actions[0]).toEqual({ Kind: 'click', Selector: undefined, X: 12, Y: 34 });
    });

    it('Type maps to a type action', async () => {
        const { channel, session } = makeChannel();
        await channel.ExecuteServerTool(name('Type'), JSON.stringify({ text: 'hi', selector: '#q' }));
        expect(session.Actions[0]).toEqual({ Kind: 'type', Text: 'hi', Selector: '#q' });
    });

    it('Key maps to a key action', async () => {
        const { channel, session } = makeChannel();
        await channel.ExecuteServerTool(name('Key'), JSON.stringify({ key: 'Enter' }));
        expect(session.Actions[0]).toEqual({ Kind: 'key', Key: 'Enter' });
    });

    it('Scroll maps to a scroll action', async () => {
        const { channel, session } = makeChannel();
        await channel.ExecuteServerTool(name('Scroll'), JSON.stringify({ deltaY: 100 }));
        expect(session.Actions[0]).toEqual({ Kind: 'scroll', DeltaX: undefined, DeltaY: 100, Selector: undefined });
    });

    it('Back / Forward map to history actions', async () => {
        const { channel, session } = makeChannel();
        await channel.ExecuteServerTool(name('Back'), '{}');
        await channel.ExecuteServerTool(name('Forward'), '{}');
        expect(session.Actions).toEqual([{ Kind: 'back' }, { Kind: 'forward' }]);
    });

    it('Wait maps to a wait action', async () => {
        const { channel, session } = makeChannel();
        await channel.ExecuteServerTool(name('Wait'), JSON.stringify({ ms: 500 }));
        expect(session.Actions[0]).toEqual({ Kind: 'wait', Ms: 500, Selector: undefined });
    });

    it('Screenshot returns the base64 + current URL without executing an action', async () => {
        const { channel, session } = makeChannel();
        const res = await channel.ExecuteServerTool(name('Screenshot'), '{}');
        expect(res.Success).toBe(true);
        expect(session.Actions).toHaveLength(0);
        const payload = JSON.parse(res.Output) as { ScreenshotBase64: string; CurrentUrl: string };
        expect(payload.ScreenshotBase64).toBe('IMG64');
        expect(payload.CurrentUrl).toBe('https://start.example');
    });

    it('GetPageText returns the current URL', async () => {
        const { channel } = makeChannel();
        await channel.ExecuteServerTool(name('OpenUrl'), JSON.stringify({ url: 'https://now.test' }));
        const res = await channel.ExecuteServerTool(name('GetPageText'), '{}');
        const payload = JSON.parse(res.Output) as { CurrentUrl: string };
        expect(payload.CurrentUrl).toBe('https://now.test');
    });
});

// ──────────────────────────────────────────────────────────────────────────────
// Argument validation + failure handling (never throws).
// ──────────────────────────────────────────────────────────────────────────────

describe('RemoteBrowserChannel — argument validation', () => {
    it('OpenUrl without a url fails cleanly', async () => {
        const { channel, session } = makeChannel();
        const res = await channel.ExecuteServerTool(name('OpenUrl'), '{}');
        expect(res.Success).toBe(false);
        expect(session.Actions).toHaveLength(0);
    });

    it('Click without selector or coordinates fails cleanly', async () => {
        const { channel } = makeChannel();
        const res = await channel.ExecuteServerTool(name('Click'), '{}');
        expect(res.Success).toBe(false);
    });

    it('Type without text fails cleanly', async () => {
        const { channel } = makeChannel();
        expect((await channel.ExecuteServerTool(name('Type'), '{}')).Success).toBe(false);
    });

    it('Scroll with neither delta nor selector fails cleanly', async () => {
        const { channel } = makeChannel();
        expect((await channel.ExecuteServerTool(name('Scroll'), '{}')).Success).toBe(false);
    });

    it('Wait with no ms or selector fails cleanly', async () => {
        const { channel } = makeChannel();
        expect((await channel.ExecuteServerTool(name('Wait'), '{}')).Success).toBe(false);
    });

    it('malformed JSON is tolerated (treated as empty args)', async () => {
        const { channel } = makeChannel();
        const res = await channel.ExecuteServerTool(name('OpenUrl'), 'not json {');
        expect(res.Success).toBe(false); // empty args → missing url, but no throw
    });

    it('an unknown tool returns a structured failure', async () => {
        const { channel } = makeChannel();
        const res = await channel.ExecuteServerTool(name('Frobnicate'), '{}');
        expect(res.Success).toBe(false);
        expect(res.Output).toContain('Unknown');
    });

    it('a failing action surfaces the driver Detail', async () => {
        const { channel, session } = makeChannel();
        session.FailNext = true;
        const res = await channel.ExecuteServerTool(name('OpenUrl'), JSON.stringify({ url: 'https://blocked.test' }));
        expect(res.Success).toBe(false);
        expect(res.Output).toBe('navigation blocked');
    });

    it('a session-less discovery instance fails every tool but still lists definitions', async () => {
        const channel = new RemoteBrowserChannel(); // discovery instance (no deps)
        expect(channel.GetServerToolDefinitions().length).toBeGreaterThan(0);
        const res = await channel.ExecuteServerTool(name('OpenUrl'), JSON.stringify({ url: 'https://x.test' }));
        expect(res.Success).toBe(false);
        expect(res.Output).toContain('No live remote-browser session');
    });
});

// ──────────────────────────────────────────────────────────────────────────────
// Native-AI routing.
// ──────────────────────────────────────────────────────────────────────────────

describe('RemoteBrowserChannel — native-AI routing', () => {
    it('DoTask routes the intent to InvokeNativeAIControl when NativeAI is enabled', async () => {
        const { channel, session } = makeChannel({ NativeAIControl: true });
        const res = await channel.ExecuteServerTool(name('DoTask'), JSON.stringify({ intent: 'log in' }));
        expect(res.Success).toBe(true);
        expect(session.NativeIntents).toEqual(['log in']);
        expect(session.Actions).toHaveLength(0); // not a granular action
    });

    it('DoTask without an intent fails cleanly', async () => {
        const { channel } = makeChannel({ NativeAIControl: true });
        expect((await channel.ExecuteServerTool(name('DoTask'), '{}')).Success).toBe(false);
    });

    it('DoTask is rejected when the strategy is ComputerUse', async () => {
        const { channel, session } = makeChannel({ RawCdpControl: true });
        const res = await channel.ExecuteServerTool(name('DoTask'), JSON.stringify({ intent: 'log in' }));
        expect(res.Success).toBe(false);
        expect(session.NativeIntents).toHaveLength(0);
    });
});
