/**
 * @fileoverview Unit tests for the headless {@link ClientContextChannel} — its single stable
 * `ContextTool` proxy (parse + dispatch + tolerant errors) and its app-context streaming (perception
 * notes). Plain-class tests: construct, Initialize with a mock RealtimeChannelContext, exercise.
 */
import { describe, it, expect, vi } from 'vitest';
import { Subject } from 'rxjs';
import type { AppContextSnapshot } from '@memberjunction/ai-core-plus';
import { ClientContextChannel, CONTEXT_TOOL_NAME } from '../lib/components/realtime/channels/client-context-channel';
import type { RealtimeChannelContext } from '@memberjunction/realtime-runtime';

function makeContext(over: Partial<RealtimeChannelContext> = {}): RealtimeChannelContext {
  return {
    AgentName: 'Sage',
    Provider: null,
    SendContextNote: vi.fn(),
    RequestSave: vi.fn(),
    SetFocusMode: vi.fn(),
    SaveAsArtifact: vi.fn(async () => null),
    AgentSessionID: 'sess-1',
    ExecuteServerAction: vi.fn(async () => null),
    ...over,
  } as RealtimeChannelContext;
}

describe('ClientContextChannel — contract', () => {
  it('reports the headless channel identity + single stable tool', () => {
    const ch = new ClientContextChannel();
    expect(ch.ChannelName).toBe('ClientContextChannel');
    expect(ch.ToolNamePrefix).toBe(CONTEXT_TOOL_NAME);
    const tools = ch.GetToolDefinitions();
    expect(tools).toHaveLength(1);
    expect(tools[0].Name).toBe('ContextTool');
  });
});

describe('ClientContextChannel — ContextTool dispatch', () => {
  it('routes {action, params} to the host client-tool executor and returns its result', async () => {
    const exec = vi.fn(async () => ({ Success: true, Result: 'navigated' }));
    const ch = new ClientContextChannel();
    ch.Initialize(makeContext({ ExecuteClientTool: exec }));

    const out = await ch.ApplyAgentTool('ContextTool', JSON.stringify({ action: 'NavigateToRecord', params: { id: '7' } }));
    expect(exec).toHaveBeenCalledWith('NavigateToRecord', { id: '7' });
    expect(JSON.parse(out)).toEqual({ success: true, output: 'navigated' });
  });

  it('serializes a host failure as a structured (non-throwing) result', async () => {
    const exec = vi.fn(async () => ({ Success: false, ErrorMessage: 'no such tool' }));
    const ch = new ClientContextChannel();
    ch.Initialize(makeContext({ ExecuteClientTool: exec }));
    const out = await ch.ApplyAgentTool('ContextTool', JSON.stringify({ action: 'Bogus' }));
    expect(JSON.parse(out)).toEqual({ success: false, output: 'no such tool' });
  });

  it('rejects a call with no action', async () => {
    const ch = new ClientContextChannel();
    ch.Initialize(makeContext({ ExecuteClientTool: vi.fn() }));
    const out = await ch.ApplyAgentTool('ContextTool', JSON.stringify({ params: {} }));
    expect(JSON.parse(out).success).toBe(false);
  });

  it('handles malformed JSON args gracefully', async () => {
    const ch = new ClientContextChannel();
    ch.Initialize(makeContext({ ExecuteClientTool: vi.fn() }));
    const out = await ch.ApplyAgentTool('ContextTool', 'not json');
    expect(JSON.parse(out).success).toBe(false);
  });

  it('reports no surface when the host has no client-tool executor', async () => {
    const ch = new ClientContextChannel();
    ch.Initialize(makeContext({ ExecuteClientTool: undefined }));
    const out = await ch.ApplyAgentTool('ContextTool', JSON.stringify({ action: 'X' }));
    expect(JSON.parse(out).success).toBe(false);
  });
});

describe('ClientContextChannel — context streaming', () => {
  it('streams a context note when the app-context snapshot changes', () => {
    const appContext$ = new Subject<AppContextSnapshot | null>();
    const sendNote = vi.fn();
    const ch = new ClientContextChannel();
    ch.Initialize(makeContext({ AppContext$: appContext$, SendContextNote: sendNote }));

    appContext$.next({
      App: { Name: 'Knowledge Hub', Description: '' },
      ActiveNavItem: { Name: 'Analytics' },
      OtherNavItems: [],
      User: { Name: 'Amith', Roles: [] },
      View: { FreeText: 'on the cluster chart' },
    });

    expect(sendNote).toHaveBeenCalledTimes(1);
    expect(sendNote.mock.calls[0][0]).toContain('[app-context]');
    expect(sendNote.mock.calls[0][0]).toContain('Knowledge Hub');
  });

  it('does not stream when no AppContext$ is supplied (custom hosts)', () => {
    const sendNote = vi.fn();
    const ch = new ClientContextChannel();
    ch.Initialize(makeContext({ AppContext$: undefined, SendContextNote: sendNote }));
    expect(sendNote).not.toHaveBeenCalled();
  });

  it('stops streaming after Dispose', () => {
    const appContext$ = new Subject<AppContextSnapshot | null>();
    const sendNote = vi.fn();
    const ch = new ClientContextChannel();
    ch.Initialize(makeContext({ AppContext$: appContext$, SendContextNote: sendNote }));
    ch.Dispose();
    appContext$.next({
      App: { Name: 'X', Description: '' }, ActiveNavItem: { Name: 'Y' }, OtherNavItems: [], User: { Name: '', Roles: [] },
    });
    expect(sendNote).not.toHaveBeenCalled();
  });
});

describe('ClientContextChannel — channel-addressed ContextTool calls (target)', () => {
  it('declares `target` on the proxy tool schema, with `channel` required inside it', () => {
    const schema = new ClientContextChannel().GetToolDefinitions()[0].ParametersSchema as {
      properties: { target: { required: string[]; properties: Record<string, unknown> } };
      required: string[];
    };
    expect(schema.required).toEqual(['action']); // target stays optional: app actions are unchanged
    expect(schema.properties.target.required).toEqual(['channel']);
    expect(Object.keys(schema.properties.target.properties)).toEqual(['channel', 'instance']);
  });

  it('hands a targeted call to the runtime dispatcher, NOT to the app client-tool executor', async () => {
    const dispatch = vi.fn(async () => ({ Success: true as const, Result: { opened: true } }));
    const exec = vi.fn();
    const ch = new ClientContextChannel();
    ch.Initialize(makeContext({ ExecuteClientTool: exec, DispatchContextAction: dispatch }));

    const out = await ch.ApplyAgentTool('ContextTool', JSON.stringify({ action: 'open', params: { title: 'x' }, target: { channel: ' Form ', instance: '2' } }));

    expect(dispatch).toHaveBeenCalledWith({ Target: { Channel: 'Form', Instance: '2' }, Action: 'open', Params: { title: 'x' } });
    expect(exec).not.toHaveBeenCalled();
    expect(JSON.parse(out)).toEqual({ success: true, output: { opened: true } });
  });

  it('omits the instance when none was given', async () => {
    const dispatch = vi.fn(async () => ({ Success: true as const }));
    const ch = new ClientContextChannel();
    ch.Initialize(makeContext({ DispatchContextAction: dispatch }));
    await ch.ApplyAgentTool('ContextTool', JSON.stringify({ action: 'SetField', target: { channel: 'Form' } }));
    expect(dispatch).toHaveBeenCalledWith({ Target: { Channel: 'Form', Instance: undefined }, Action: 'SetField', Params: {} });
  });

  it('returns a refusal as a structured, model-recoverable error with what would have been valid', async () => {
    const dispatch = vi.fn(async () => ({
      Success: false as const,
      ErrorCode: 'invalid_params' as const,
      ErrorMessage: 'The parameters for SetField are invalid. Expected SetField(name:string). Fix them and call it again.',
      Details: ['$.name: expected type string, got integer'],
      Available: ['SetField'],
    }));
    const ch = new ClientContextChannel();
    ch.Initialize(makeContext({ DispatchContextAction: dispatch }));
    const out = JSON.parse(await ch.ApplyAgentTool('ContextTool', JSON.stringify({ action: 'SetField', params: { name: 5 }, target: { channel: 'Form' } })));
    expect(out).toEqual({
      success: false,
      output: 'The parameters for SetField are invalid. Expected SetField(name:string). Fix them and call it again.',
      errorCode: 'invalid_params',
      details: ['$.name: expected type string, got integer'],
      available: ['SetField'],
    });
  });

  it('says channel actions are unavailable when the host has no dispatcher, instead of running an app tool by accident', async () => {
    const exec = vi.fn();
    const ch = new ClientContextChannel();
    ch.Initialize(makeContext({ ExecuteClientTool: exec }));
    const out = JSON.parse(await ch.ApplyAgentTool('ContextTool', JSON.stringify({ action: 'SetField', target: { channel: 'Form' } })));
    expect(out.success).toBe(false);
    expect(out.output).toContain('not available');
    expect(exec).not.toHaveBeenCalled();
  });

  it('treats a target with no usable channel as no target (an app action)', async () => {
    const exec = vi.fn(async () => ({ Success: true, Result: 'ok' }));
    const ch = new ClientContextChannel();
    ch.Initialize(makeContext({ ExecuteClientTool: exec }));
    for (const target of [{}, { channel: '   ' }, 'Form', null, ['Form']]) {
      await ch.ApplyAgentTool('ContextTool', JSON.stringify({ action: 'Go', target }));
    }
    expect(exec).toHaveBeenCalledTimes(5);
  });

  it('describes itself as a headless door with no verbs, so it is never addressed as a channel', () => {
    const d = new ClientContextChannel().GetDescriptor();
    expect(d).toMatchObject({ Key: 'ClientContextChannel', Version: '2.0.0', DisplayPolicy: 'headless', DefaultAvailability: 'all-sessions' });
    expect(d.Verbs).toEqual([]);
    expect(d.Nouns).toEqual([]);
  });
});
