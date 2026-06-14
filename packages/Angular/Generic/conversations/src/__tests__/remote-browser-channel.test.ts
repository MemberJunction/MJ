// The Remote Browser channel imports its standalone Angular surface component (partial-compiled
// Angular libs require the JIT compiler in this node test environment), so load the compiler FIRST.
import '@angular/compiler';
import { describe, it, expect, beforeEach } from 'vitest';
import { JSONValue } from '@memberjunction/ai';
import { MJGlobal } from '@memberjunction/global';
import { BaseRealtimeChannelClient, RealtimeChannelContext } from '../lib/components/realtime/channels/base-realtime-channel-client';
import {
  LoadRealtimeRemoteBrowserChannel, RemoteBrowserChannel
} from '../lib/components/realtime/remote-browser/remote-browser-channel';
import { RemoteBrowserSurfaceComponent } from '../lib/components/realtime/remote-browser/remote-browser-surface.component';
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
  it('maps browser_OpenUrl to an openUrl action carrying the url', () => {
    expect(MapToolToAction(REMOTE_BROWSER_TOOL_NAMES.OpenUrl, { url: 'https://example.com' }))
      .toEqual({ Kind: 'openUrl', Url: 'https://example.com' });
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
      agentSessionID: 'session-1', kind: 'openUrl', url: 'https://example.com',
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
