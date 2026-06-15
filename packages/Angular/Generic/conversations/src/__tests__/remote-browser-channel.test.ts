// The Remote Browser channel imports its standalone Angular surface component (partial-compiled
// Angular libs require the JIT compiler in this node test environment), so load the compiler FIRST.
import '@angular/compiler';
import { describe, it, expect, beforeEach } from 'vitest';
import { EventEmitter } from '@angular/core';
import { JSONValue } from '@memberjunction/ai';
import { MJGlobal } from '@memberjunction/global';
import { BaseRealtimeChannelClient, RealtimeChannelContext } from '../lib/components/realtime/channels/base-realtime-channel-client';
import {
  LoadRealtimeRemoteBrowserChannel, RemoteBrowserChannel
} from '../lib/components/realtime/remote-browser/remote-browser-channel';
import {
  MapToViewportCoords, RemoteBrowserHumanInputEvent, RemoteBrowserSurfaceComponent
} from '../lib/components/realtime/remote-browser/remote-browser-surface.component';
import {
  MapToolToAction, REMOTE_BROWSER_TOOL_DEFINITIONS, REMOTE_BROWSER_TOOL_NAMES,
  REMOTE_BROWSER_TOOL_PREFIX, RemoteBrowserToolArgError
} from '../lib/components/realtime/remote-browser/remote-browser-tools';

LoadRealtimeRemoteBrowserChannel();

/** One recorded GraphQL call the fake context received. */
interface ServerCall {
  Query: string;
  Variables: Record<string, JSONValue>;
}

interface CtxLog {
  Notes: string[];
  Calls: ServerCall[];
}

/**
 * Builds a fake channel context that records `SendContextNote` notes and `ExecuteServerAction`
 * calls, and replies with a fixed server response. `sessionId` defaults to a live id so tools
 * can run; pass `null` to exercise the no-session path.
 */
function makeContext(
  log: CtxLog,
  response: Record<string, JSONValue> | null,
  sessionId: string | null = 'session-1'
): RealtimeChannelContext {
  return {
    AgentName: 'Sage',
    SendContextNote: (text: string) => log.Notes.push(text),
    RequestSave: () => undefined,
    SetFocusMode: () => undefined,
    SaveAsArtifact: async () => null,
    AgentSessionID: sessionId,
    ExecuteServerAction: async <T>(query: string, variables: Record<string, JSONValue>): Promise<T | null> => {
      log.Calls.push({ Query: query, Variables: variables });
      return response as T | null;
    }
  };
}

/** Parses a channel tool-result JSON string into a typed shape. */
function parseResult(json: string): { success: boolean; currentUrl?: string; detail?: string; error?: string } {
  return JSON.parse(json) as { success: boolean; currentUrl?: string; detail?: string; error?: string };
}

describe('Remote Browser — MapToolToAction (tool → server action)', () => {
  it('maps browser_OpenUrl to a navigate action carrying the url', () => {
    expect(MapToolToAction(REMOTE_BROWSER_TOOL_NAMES.OpenUrl, { url: 'https://example.com' }))
      .toEqual({ Kind: 'navigate', Url: 'https://example.com' });
  });

  it('throws a model-readable error when browser_OpenUrl is missing its url', () => {
    expect(() => MapToolToAction(REMOTE_BROWSER_TOOL_NAMES.OpenUrl, {})).toThrow(RemoteBrowserToolArgError);
  });

  it('maps browser_Click by selector', () => {
    expect(MapToolToAction(REMOTE_BROWSER_TOOL_NAMES.Click, { selector: '#go' }))
      .toEqual({ Kind: 'click', Selector: '#go', X: undefined, Y: undefined });
  });

  it('maps browser_Click by x/y coordinates', () => {
    expect(MapToolToAction(REMOTE_BROWSER_TOOL_NAMES.Click, { x: 12, y: 34 }))
      .toEqual({ Kind: 'click', Selector: undefined, X: 12, Y: 34 });
  });

  it('throws when browser_Click has neither a selector nor both coordinates', () => {
    expect(() => MapToolToAction(REMOTE_BROWSER_TOOL_NAMES.Click, { x: 12 })).toThrow(RemoteBrowserToolArgError);
    expect(() => MapToolToAction(REMOTE_BROWSER_TOOL_NAMES.Click, {})).toThrow(RemoteBrowserToolArgError);
  });

  it('maps browser_Type with optional selector, and allows empty text', () => {
    expect(MapToolToAction(REMOTE_BROWSER_TOOL_NAMES.Type, { text: 'hello', selector: '#q' }))
      .toEqual({ Kind: 'type', Text: 'hello', Selector: '#q' });
    // empty string is a VALID value to type (clears / types nothing) — only a non-string is rejected
    expect(MapToolToAction(REMOTE_BROWSER_TOOL_NAMES.Type, { text: '' }))
      .toEqual({ Kind: 'type', Text: '', Selector: undefined });
  });

  it('throws when browser_Type is missing text entirely', () => {
    expect(() => MapToolToAction(REMOTE_BROWSER_TOOL_NAMES.Type, {})).toThrow(RemoteBrowserToolArgError);
  });

  it('maps browser_Key, requiring a key', () => {
    expect(MapToolToAction(REMOTE_BROWSER_TOOL_NAMES.Key, { key: 'Enter' })).toEqual({ Kind: 'key', Key: 'Enter' });
    expect(() => MapToolToAction(REMOTE_BROWSER_TOOL_NAMES.Key, {})).toThrow(RemoteBrowserToolArgError);
  });

  it('maps browser_Scroll with optional deltas + selector', () => {
    expect(MapToolToAction(REMOTE_BROWSER_TOOL_NAMES.Scroll, { deltaY: 200 }))
      .toEqual({ Kind: 'scroll', DeltaX: undefined, DeltaY: 200, Selector: undefined });
    expect(MapToolToAction(REMOTE_BROWSER_TOOL_NAMES.Scroll, {}))
      .toEqual({ Kind: 'scroll', DeltaX: undefined, DeltaY: undefined, Selector: undefined });
  });

  it('maps the argument-less navigation + read tools', () => {
    expect(MapToolToAction(REMOTE_BROWSER_TOOL_NAMES.Back, {})).toEqual({ Kind: 'back' });
    expect(MapToolToAction(REMOTE_BROWSER_TOOL_NAMES.Forward, {})).toEqual({ Kind: 'forward' });
    expect(MapToolToAction(REMOTE_BROWSER_TOOL_NAMES.GetPageText, {})).toEqual({ Kind: 'getPageText' });
  });

  it('maps browser_Wait with optional ms + selector', () => {
    expect(MapToolToAction(REMOTE_BROWSER_TOOL_NAMES.Wait, { ms: 500 }))
      .toEqual({ Kind: 'wait', Ms: 500, Selector: undefined });
  });

  it('throws on an unknown tool name', () => {
    expect(() => MapToolToAction('browser_Teleport', {})).toThrow(RemoteBrowserToolArgError);
  });
});

describe('RemoteBrowserChannel — plugin contract + ApplyAgentTool round-trip', () => {
  let channel: RemoteBrowserChannel;
  let log: CtxLog;

  beforeEach(() => {
    channel = new RemoteBrowserChannel();
    log = { Notes: [], Calls: [] };
  });

  it('is resolvable from the ClassFactory by its registry ClientPluginClass key', () => {
    const registration = MJGlobal.Instance.ClassFactory.GetRegistration(BaseRealtimeChannelClient, 'RealtimeRemoteBrowserChannel');
    expect(registration).toBeTruthy();
    const instance = MJGlobal.Instance.ClassFactory.CreateInstance<BaseRealtimeChannelClient>(
      BaseRealtimeChannelClient, 'RealtimeRemoteBrowserChannel'
    );
    expect(instance).toBeInstanceOf(RemoteBrowserChannel);
  });

  it('contributes the channel contract: name, prefix, tab chrome, tool set, surface', () => {
    expect(channel.ChannelName).toBe('Remote Browser');
    expect(channel.ToolNamePrefix).toBe(REMOTE_BROWSER_TOOL_PREFIX);
    expect(channel.TabTitle).toBe('Browser');
    expect(channel.TabIcon).toBe('fa-solid fa-globe');
    expect(channel.GetToolDefinitions()).toBe(REMOTE_BROWSER_TOOL_DEFINITIONS);
    expect(channel.GetSurfaceComponent()).toBe(RemoteBrowserSurfaceComponent);
  });

  it('supplies first-run onboarding details (heading, description, tips, icon)', () => {
    const details = channel.GetOnboardingDetails();
    expect(details).not.toBeNull();
    expect(details?.Heading).toBe('Remote Browser');
    expect(details?.IconClass).toBe('fa-solid fa-globe');
    expect(details?.Description?.length).toBeGreaterThan(0);
    expect((details?.Tips?.length ?? 0)).toBeGreaterThan(0);
  });

  it('drives the ExecuteRemoteBrowserAction mutation with flat variables and reports success', async () => {
    channel.Initialize(makeContext(log, { ExecuteRemoteBrowserAction: { Success: true, CurrentUrl: 'https://example.com', Detail: null } }));

    const resultJson = await channel.ApplyAgentTool('browser_OpenUrl', JSON.stringify({ url: 'https://example.com' }));
    const result = parseResult(resultJson);

    expect(result.success).toBe(true);
    expect(result.currentUrl).toBe('https://example.com');
    expect(log.Calls).toHaveLength(1);
    expect(log.Calls[0].Query).toContain('ExecuteRemoteBrowserAction');
    expect(log.Calls[0].Variables).toMatchObject({
      agentSessionID: 'session-1', kind: 'navigate', url: 'https://example.com',
      selector: null, x: null, y: null, text: null, key: null, deltaX: null, deltaY: null, ms: null
    });
    // PERCEPTION: the agent is told where the page went (no spoken reply requested).
    expect(log.Notes).toEqual(['[browser] current page: https://example.com']);
  });

  it('returns the server Detail for read tools and does NOT push a context note without a URL', async () => {
    channel.Initialize(makeContext(log, { ExecuteRemoteBrowserAction: { Success: true, CurrentUrl: null, Detail: 'Page text here' } }));

    const result = parseResult(await channel.ApplyAgentTool('browser_GetPageText', '{}'));
    expect(result.success).toBe(true);
    expect(result.detail).toBe('Page text here');
    expect(log.Notes).toEqual([]);
  });

  it('maps a server failure to a failed result with the server Detail (never throws)', async () => {
    channel.Initialize(makeContext(log, { ExecuteRemoteBrowserAction: { Success: false, CurrentUrl: null, Detail: 'Selector not found' } }));

    const result = parseResult(await channel.ApplyAgentTool('browser_Click', JSON.stringify({ selector: '#missing' })));
    expect(result.success).toBe(false);
    expect(result.error).toBe('Selector not found');
  });

  it('returns a failed result (no server call) when arguments are invalid', async () => {
    channel.Initialize(makeContext(log, { ExecuteRemoteBrowserAction: { Success: true, CurrentUrl: null, Detail: null } }));

    const result = parseResult(await channel.ApplyAgentTool('browser_OpenUrl', '{}'));
    expect(result.success).toBe(false);
    expect(result.error).toContain('url');
    expect(log.Calls).toHaveLength(0); // bad args never reach the server
  });

  it('returns a failed result when no live session is available', async () => {
    channel.Initialize(makeContext(log, null, null));

    const result = parseResult(await channel.ApplyAgentTool('browser_Back', '{}'));
    expect(result.success).toBe(false);
    expect(result.error).toContain('No live browser session');
    expect(log.Calls).toHaveLength(0);
  });

  it('maps a null server response to a failed result (best-effort transport)', async () => {
    channel.Initialize(makeContext(log, null));

    const result = parseResult(await channel.ApplyAgentTool('browser_Back', '{}'));
    expect(result.success).toBe(false);
    expect(result.error).toContain('no response from the server');
  });

  it('tolerates malformed args JSON for an argument-less tool (parses to {})', async () => {
    channel.Initialize(makeContext(log, { ExecuteRemoteBrowserAction: { Success: true, CurrentUrl: 'https://x', Detail: null } }));

    const result = parseResult(await channel.ApplyAgentTool('browser_Forward', 'not json'));
    expect(result.success).toBe(true);
    expect(log.Calls[0].Variables.kind).toBe('forward');
  });
});

describe('RemoteBrowserChannel — visual interpreter (browser_DescribePage / browser_LocateElement)', () => {
  let channel: RemoteBrowserChannel;
  let log: CtxLog;

  beforeEach(() => {
    channel = new RemoteBrowserChannel();
    log = { Notes: [], Calls: [] };
  });

  it('routes browser_DescribePage to the InterpretRemoteBrowserPage mutation and returns the description', async () => {
    channel.Initialize(makeContext(log, {
      InterpretRemoteBrowserPage: { Description: 'A login page with email and password fields.', Elements: [], Detail: null }
    }));

    const resultJson = await channel.ApplyAgentTool('browser_DescribePage', '{}');
    const result = JSON.parse(resultJson) as { description: string };

    expect(log.Calls).toHaveLength(1);
    expect(log.Calls[0].Query).toContain('InterpretRemoteBrowserPage');
    // DescribePage carries no target query.
    expect(log.Calls[0].Variables).toMatchObject({ agentSessionID: 'session-1', query: null });
    expect(result.description).toBe('A login page with email and password fields.');
  });

  it('routes browser_LocateElement to the interpret mutation with the query and returns found + centroid', async () => {
    channel.Initialize(makeContext(log, {
      InterpretRemoteBrowserPage: {
        Description: 'A login page.',
        Elements: [{ Label: 'Sign In button', X: 320, Y: 480, Confidence: 0.9 }],
        Detail: null
      }
    }));

    const resultJson = await channel.ApplyAgentTool('browser_LocateElement', JSON.stringify({ description: 'the blue Sign In button' }));
    const result = JSON.parse(resultJson) as {
      found: boolean;
      element: { label: string; x: number; y: number } | null;
      all: Array<{ Label: string; X: number; Y: number; Confidence: number }>;
    };

    expect(log.Calls).toHaveLength(1);
    expect(log.Calls[0].Query).toContain('InterpretRemoteBrowserPage');
    expect(log.Calls[0].Variables).toMatchObject({ agentSessionID: 'session-1', query: 'the blue Sign In button' });
    expect(result.found).toBe(true);
    expect(result.element).toEqual({ label: 'Sign In button', x: 320, y: 480 });
    expect(result.all).toHaveLength(1);
  });

  it('reports found:false with a null element when no element is localized', async () => {
    channel.Initialize(makeContext(log, {
      InterpretRemoteBrowserPage: { Description: 'A login page.', Elements: [], Detail: null }
    }));

    const resultJson = await channel.ApplyAgentTool('browser_LocateElement', JSON.stringify({ description: 'the logout link' }));
    const result = JSON.parse(resultJson) as { found: boolean; element: unknown | null };
    expect(result.found).toBe(false);
    expect(result.element).toBeNull();
  });

  it('rejects browser_LocateElement without a description (no server call)', async () => {
    channel.Initialize(makeContext(log, { InterpretRemoteBrowserPage: { Description: null, Elements: [], Detail: null } }));

    const result = parseResult(await channel.ApplyAgentTool('browser_LocateElement', '{}'));
    expect(result.success).toBe(false);
    expect(result.error).toContain('description');
    expect(log.Calls).toHaveLength(0);
  });

  it('keeps the null-session guard for the interpreter tools (no server call)', async () => {
    channel.Initialize(makeContext(log, null, null));

    const result = parseResult(await channel.ApplyAgentTool('browser_DescribePage', '{}'));
    expect(result.success).toBe(false);
    expect(result.error).toContain('No live browser session');
    expect(log.Calls).toHaveLength(0);
  });
});

describe('RemoteBrowserChannel — live screencast (pushed frames)', () => {
  let channel: RemoteBrowserChannel;
  let log: CtxLog;

  beforeEach(() => {
    channel = new RemoteBrowserChannel();
    log = { Notes: [], Calls: [] };
  });

  /** Minimal surface double recording the frames it was asked to render + its Streaming flag. */
  function makeSurface(): RemoteBrowserSurfaceComponent & { RenderedFrames: string[] } {
    const surface = {
      Streaming: false,
      Interactive: false,
      HumanInput: new EventEmitter<RemoteBrowserHumanInputEvent>(),
      RenderedFrames: [] as string[],
      RenderFrame(dataBase64: string) {
        this.RenderedFrames.push(dataBase64);
      }
    };
    return surface as unknown as RemoteBrowserSurfaceComponent & { RenderedFrames: string[] };
  }

  /** Flushes microtasks so BindSurface's fire-and-forget startScreencast resolves. */
  function flush(): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, 0));
  }

  it('starts the screencast and flips the surface to Streaming when the backend supports it', async () => {
    channel.Initialize(makeContext(log, { StartRemoteBrowserScreencast: { Streaming: true } }));
    const surface = makeSurface();

    channel.BindSurface(surface);
    await flush();

    // The start mutation ran with the session id…
    const startCall = log.Calls.find(c => c.Query.includes('StartRemoteBrowserScreencast'));
    expect(startCall).toBeTruthy();
    expect(startCall?.Variables).toMatchObject({ agentSessionID: 'session-1' });
    // …and the surface was switched to canvas mode.
    expect(surface.Streaming).toBe(true);
  });

  it('forwards pushed frames to the surface canvas once streaming', async () => {
    channel.Initialize(makeContext(log, { StartRemoteBrowserScreencast: { Streaming: true } }));
    const surface = makeSurface();
    channel.BindSurface(surface);
    await flush();

    channel.OnScreencastFrame('AAAA');
    channel.OnScreencastFrame('BBBB');

    expect(surface.RenderedFrames).toEqual(['AAAA', 'BBBB']);
  });

  it('does NOT flip Streaming or forward frames when the backend lacks ScreenStreaming', async () => {
    channel.Initialize(makeContext(log, { StartRemoteBrowserScreencast: { Streaming: false } }));
    const surface = makeSurface();
    channel.BindSurface(surface);
    await flush();

    expect(surface.Streaming).toBe(false);
    channel.OnScreencastFrame('AAAA');
    expect(surface.RenderedFrames).toEqual([]); // ignored — channel is not streaming
  });

  it('stops the screencast on UnbindSurface when it had started', async () => {
    channel.Initialize(makeContext(log, { StartRemoteBrowserScreencast: { Streaming: true } }));
    const surface = makeSurface();
    channel.BindSurface(surface);
    await flush();

    channel.UnbindSurface();
    await flush();

    const stopCall = log.Calls.find(c => c.Query.includes('StopRemoteBrowserScreencast'));
    expect(stopCall).toBeTruthy();
    expect(stopCall?.Variables).toMatchObject({ agentSessionID: 'session-1' });
    // After unbind, late frames are ignored (not streaming, no surface).
    channel.OnScreencastFrame('CCCC');
    expect(surface.RenderedFrames).toEqual([]);
  });
});

describe('RemoteBrowserChannel — human takeover (relay surface input to the server)', () => {
  let channel: RemoteBrowserChannel;
  let log: CtxLog;

  beforeEach(() => {
    channel = new RemoteBrowserChannel();
    log = { Notes: [], Calls: [] };
  });

  /** Minimal surface double exposing the takeover wiring: Interactive flag + HumanInput emitter. */
  function makeSurface(): RemoteBrowserSurfaceComponent & { HumanInput: EventEmitter<RemoteBrowserHumanInputEvent> } {
    const surface = {
      Streaming: false,
      Interactive: false,
      HumanInput: new EventEmitter<RemoteBrowserHumanInputEvent>(),
      RenderFrame() { /* unused here */ }
    };
    return surface as unknown as RemoteBrowserSurfaceComponent & { HumanInput: EventEmitter<RemoteBrowserHumanInputEvent> };
  }

  it('enables takeover by default on bind (Interactive = true)', () => {
    channel.Initialize(makeContext(log, { StartRemoteBrowserScreencast: { Streaming: true } }));
    const surface = makeSurface();

    channel.BindSurface(surface);

    expect(surface.Interactive).toBe(true);
  });

  it('forwards a pointer-click HumanInput to the relay mutation with viewport coords + button', () => {
    channel.Initialize(makeContext(log, { RelayRemoteBrowserHumanInput: true }));
    const surface = makeSurface();
    channel.BindSurface(surface);

    surface.HumanInput.emit({ kind: 'pointer-click', x: 320, y: 480, button: 'left' });

    const relayCall = log.Calls.find(c => c.Query.includes('RelayRemoteBrowserHumanInput'));
    expect(relayCall).toBeTruthy();
    expect(relayCall?.Variables).toMatchObject({
      agentSessionID: 'session-1', kind: 'pointer-click', x: 320, y: 480, button: 'left', key: null
    });
  });

  it('forwards a key HumanInput with the key string (null pointer coords)', () => {
    channel.Initialize(makeContext(log, { RelayRemoteBrowserHumanInput: true }));
    const surface = makeSurface();
    channel.BindSurface(surface);

    surface.HumanInput.emit({ kind: 'key', key: 'Enter' });

    const relayCall = log.Calls.find(c => c.Query.includes('RelayRemoteBrowserHumanInput'));
    expect(relayCall?.Variables).toMatchObject({
      agentSessionID: 'session-1', kind: 'key', x: null, y: null, button: null, key: 'Enter'
    });
  });

  it('stops forwarding after UnbindSurface (subscription torn down)', () => {
    channel.Initialize(makeContext(log, { RelayRemoteBrowserHumanInput: true }));
    const surface = makeSurface();
    channel.BindSurface(surface);
    channel.UnbindSurface();

    surface.HumanInput.emit({ kind: 'pointer-move', x: 1, y: 2 });

    expect(log.Calls.find(c => c.Query.includes('RelayRemoteBrowserHumanInput'))).toBeUndefined();
  });
});

describe('MapToViewportCoords (display → viewport coordinate mapping)', () => {
  it('maps a click on a scaled-up canvas back to viewport pixels', () => {
    // Canvas internal resolution 1280x720, displayed at 640x360 (2x downscale) at offset (100, 50).
    // A click at display (420, 230) → local (320, 180) → viewport (640, 360).
    const rect = { left: 100, top: 50, width: 640, height: 360 };
    expect(MapToViewportCoords(420, 230, rect, 1280, 720)).toEqual({ x: 640, y: 360 });
  });

  it('maps 1:1 when the display size equals the internal resolution', () => {
    const rect = { left: 0, top: 0, width: 800, height: 600 };
    expect(MapToViewportCoords(120, 90, rect, 800, 600)).toEqual({ x: 120, y: 90 });
  });

  it('rounds to integer viewport coordinates', () => {
    const rect = { left: 0, top: 0, width: 300, height: 300 };
    // 101/300 * 1000 = 336.67 → 337 ; 100/300 * 1000 = 333.33 → 333
    expect(MapToViewportCoords(101, 100, rect, 1000, 1000)).toEqual({ x: 337, y: 333 });
  });

  it('returns null on a zero-size rect (divide-by-zero guard)', () => {
    expect(MapToViewportCoords(10, 10, { left: 0, top: 0, width: 0, height: 0 }, 1280, 720)).toBeNull();
  });

  it('returns null on an un-sized canvas', () => {
    expect(MapToViewportCoords(10, 10, { left: 0, top: 0, width: 640, height: 360 }, 0, 0)).toBeNull();
  });
});
