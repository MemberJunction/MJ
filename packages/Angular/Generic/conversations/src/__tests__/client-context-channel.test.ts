/**
 * @fileoverview Unit tests for the headless {@link ClientContextChannel} — its single stable
 * `ContextTool` proxy (parse + dispatch + tolerant errors) and its app-context streaming (perception
 * notes). Plain-class tests: construct, Initialize with a mock RealtimeChannelContext, exercise.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { BehaviorSubject, Subject } from 'rxjs';
import {
  RealtimeConversationMemory,
  RenderRealtimeMemorySeed,
  type RealtimeContextNoteOptions,
} from '@memberjunction/ai';
import type { AppContextSnapshot } from '@memberjunction/ai-core-plus';
import {
  APP_CONTEXT_MEMORY_STATE_KEY,
  CLIENT_CONTEXT_COALESCE_MS,
  ClientContextChannel,
  CONTEXT_TOOL_NAME,
} from '../lib/components/realtime/channels/client-context-channel';
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

  it('reports a tool whose handler returned Success: false as a failure, with its message', async () => {
    const failed = { Success: false, ErrorMessage: 'The open dashboard changed.' };
    const exec = vi.fn(async () => ({ Success: false, ErrorMessage: failed.ErrorMessage, Result: failed }));
    const ch = new ClientContextChannel();
    ch.Initialize(makeContext({ ExecuteClientTool: exec }));
    const out = await ch.ApplyAgentTool('ContextTool', JSON.stringify({ action: 'AddPanel', params: { dashboardId: 'd-2' } }));
    expect(JSON.parse(out)).toEqual({ success: false, output: 'The open dashboard changed.' });
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
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('streams a context note after the coalescing window when the app-context snapshot changes', () => {
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

    expect(sendNote).not.toHaveBeenCalled();
    vi.advanceTimersByTime(CLIENT_CONTEXT_COALESCE_MS);

    expect(sendNote).toHaveBeenCalledTimes(1);
    expect(sendNote.mock.calls[0][0]).toContain('[app-context]');
    expect(sendNote.mock.calls[0][0]).toContain('Knowledge Hub');
    expect(sendNote.mock.calls[0][1]).toEqual({ StateKey: APP_CONTEXT_MEMORY_STATE_KEY });
  });

  it('captures synchronous BehaviorSubject initial value as baseline without emitting a duplicate t=0 wire note, then diffs intra-app tab bursts into 1 compact delta + full MemoryText', () => {
    const initialSnapshot: AppContextSnapshot = {
      App: { Name: 'AI Analytics', Description: 'AI observability suite' },
      ActiveNavItem: { Name: 'Overview', Description: 'Executive summary' },
      OtherNavItems: [
        { Name: 'Prompt Runs', Description: 'Prompt execution telemetry' },
        { Name: 'Agent Runs', Description: 'Agent execution telemetry' },
        { Name: 'Vendor Costs', Description: 'Spend breakdown' },
      ],
      NavigableApps: [
        { Name: 'CRM', Description: 'Accounts and contacts' },
        { Name: 'Data Explorer', Description: 'Entity browser' },
      ],
      User: { Name: 'Soham', Roles: ['Admin'] },
      View: { VisibleEntities: ['MJ: AI Prompt Runs'], FreeText: 'KPI cards loaded' },
      Capabilities: {
        Tools: [{ Name: 'FilterDateRange', Description: 'Filter by date', Category: 'view', InputSchema: {} }],
        Agents: [{ AgentID: 'agent-sage', Name: 'Sage', Description: 'Primary assistant' }],
      },
    };
    const appContext$ = new BehaviorSubject<AppContextSnapshot | null>(initialSnapshot);
    const sendNote = vi.fn();
    const ch = new ClientContextChannel();
    ch.Initialize(makeContext({ AppContext$: appContext$, SendContextNote: sendNote }));

    // Initial synchronous emission at t=0 is NOT duplicated onto the wire (already in SystemPrompt at mint).
    vi.advanceTimersByTime(1000);
    expect(sendNote).not.toHaveBeenCalled();

    // Simulate Explorer's rapid multi-update navigation burst when clicking "Prompt Runs" tab:
    // 1) Nav switch clears View + Tools
    appContext$.next({
      ...initialSnapshot,
      ActiveNavItem: { Name: 'Prompt Runs', Description: 'Prompt execution telemetry' },
      OtherNavItems: [
        { Name: 'Overview', Description: 'Executive summary' },
        { Name: 'Agent Runs', Description: 'Agent execution telemetry' },
        { Name: 'Vendor Costs', Description: 'Spend breakdown' },
      ],
      View: undefined,
      Capabilities: { Tools: [], Agents: initialSnapshot.Capabilities!.Agents },
    });
    // 2) Dashboard mounts and pushes AdditionalContext 40ms later
    vi.advanceTimersByTime(40);
    appContext$.next({
      ...initialSnapshot,
      ActiveNavItem: { Name: 'Prompt Runs', Description: 'Prompt execution telemetry' },
      OtherNavItems: [
        { Name: 'Overview', Description: 'Executive summary' },
        { Name: 'Agent Runs', Description: 'Agent execution telemetry' },
        { Name: 'Vendor Costs', Description: 'Spend breakdown' },
      ],
      View: { VisibleEntities: ['MJ: AI Prompt Runs'], FreeText: 'Prompt Runs table' },
      AdditionalContext: { TotalRuns: 1280, ErrorRate: '0.4%' },
      Capabilities: { Tools: [], Agents: initialSnapshot.Capabilities!.Agents },
    });
    // 3) Dashboard registers surface client tools 30ms later (same unchanged tool or new tool)
    vi.advanceTimersByTime(30);
    appContext$.next({
      ...initialSnapshot,
      ActiveNavItem: { Name: 'Prompt Runs', Description: 'Prompt execution telemetry' },
      OtherNavItems: [
        { Name: 'Overview', Description: 'Executive summary' },
        { Name: 'Agent Runs', Description: 'Agent execution telemetry' },
        { Name: 'Vendor Costs', Description: 'Spend breakdown' },
      ],
      View: { VisibleEntities: ['MJ: AI Prompt Runs'], FreeText: 'Prompt Runs table' },
      AdditionalContext: { TotalRuns: 1280, ErrorRate: '0.4%' },
      Capabilities: initialSnapshot.Capabilities,
    });

    expect(sendNote).not.toHaveBeenCalled();
    vi.advanceTimersByTime(CLIENT_CONTEXT_COALESCE_MS);

    // Entire 3-step burst collapsed into ONE wire note!
    expect(sendNote).toHaveBeenCalledTimes(1);
    const [wireNote, options] = sendNote.mock.calls[0] as [string, { StateKey?: string; MemoryText?: string }];

    // Wire note is a compact delta: contains new section + view + screen details, and OMITS unchanged OtherNavItems/NavigableApps/Capabilities!
    expect(wireNote).toContain('Prompt Runs');
    expect(wireNote).toContain('1280');
    expect(wireNote).not.toContain('sections in this app');
    expect(wireNote).not.toContain('apps you can open');
    expect(wireNote).not.toContain('FilterDateRange');

    // MemoryText holds the FULL self-contained snapshot under StateKey 'app-context' so reconnect memory replaces prior screen state cleanly!
    expect(options.StateKey).toBe(APP_CONTEXT_MEMORY_STATE_KEY);
    expect(options.MemoryText).toBeDefined();
    expect(options.MemoryText).toContain('sections in this app');
    expect(options.MemoryText).toContain('apps you can open');
    expect(options.MemoryText).toContain('FilterDateRange');
    expect(wireNote.length).toBeLessThan((options.MemoryText ?? '').length);
  });

  it('emits nothing when a rapid burst nets out to zero change against baseline', () => {
    const base: AppContextSnapshot = {
      App: { Name: 'CRM', Description: '' },
      ActiveNavItem: { Name: 'Accounts' },
      OtherNavItems: [{ Name: 'Contacts' }],
      User: { Name: 'Amith', Roles: [] },
    };
    const appContext$ = new BehaviorSubject<AppContextSnapshot | null>(base);
    const sendNote = vi.fn();
    const ch = new ClientContextChannel();
    ch.Initialize(makeContext({ AppContext$: appContext$, SendContextNote: sendNote }));

    appContext$.next({ ...base, ActiveNavItem: { Name: 'Contacts' }, OtherNavItems: [{ Name: 'Accounts' }] });
    appContext$.next(base);
    vi.advanceTimersByTime(CLIENT_CONTEXT_COALESCE_MS);

    expect(sendNote).not.toHaveBeenCalled();
  });

  it('does not stream when no AppContext$ is supplied (custom hosts)', () => {
    const sendNote = vi.fn();
    const ch = new ClientContextChannel();
    ch.Initialize(makeContext({ AppContext$: undefined, SendContextNote: sendNote }));
    vi.advanceTimersByTime(CLIENT_CONTEXT_COALESCE_MS);
    expect(sendNote).not.toHaveBeenCalled();
  });

  it('cancels pending coalesced notes and stops streaming after Dispose', () => {
    const appContext$ = new Subject<AppContextSnapshot | null>();
    const sendNote = vi.fn();
    const ch = new ClientContextChannel();
    ch.Initialize(makeContext({ AppContext$: appContext$, SendContextNote: sendNote }));
    appContext$.next({
      App: { Name: 'PendingApp', Description: '' }, ActiveNavItem: { Name: 'Tab1' }, OtherNavItems: [], User: { Name: '', Roles: [] },
    });
    ch.Dispose();
    vi.advanceTimersByTime(CLIENT_CONTEXT_COALESCE_MS * 2);
    appContext$.next({
      App: { Name: 'X', Description: '' }, ActiveNavItem: { Name: 'Y' }, OtherNavItems: [], User: { Name: '', Roles: [] },
    });
    vi.advanceTimersByTime(CLIENT_CONTEXT_COALESCE_MS * 2);
    expect(sendNote).not.toHaveBeenCalled();
  });

  it('preserves early spoken turns in RealtimeConversationMemory across 30 ~2,000-char Explorer screen navigations', () => {
    const memory = new RealtimeConversationMemory({ MaxSeedChars: 24_000 });
    memory.Record({ Kind: 'user', Text: "Remember I'm working on AIDP." });
    memory.Record({ Kind: 'assistant', Text: "Got it — I'll remember you're working on AIDP." });

    const makeHeavySnapshot = (screenIdx: number): AppContextSnapshot => ({
      App: { Name: 'MemberJunction Explorer', Description: 'Enterprise AI workspace and data operations portal' },
      ActiveNavItem: { Name: `Screen ${screenIdx}`, Description: `Detailed operational dashboard #${screenIdx}` },
      OtherNavItems: Array.from({ length: 10 }, (_, i) => ({
        Name: `Section ${i + 1}`,
        Description: 'Analytics, entity records, telemetry metrics, and workflow management view',
      })),
      NavigableApps: Array.from({ length: 6 }, (_, i) => ({
        Name: `Workspace App ${i + 1}`,
        Description: 'Cross-functional business application with agent capabilities and dashboards',
      })),
      User: { Name: 'Soham', Roles: ['Developer', 'Admin'] },
      View: {
        VisibleEntities: [`Entity_${screenIdx}`],
        FreeText: `Inspecting record batch #${screenIdx} with ${'detailed metric summary '.repeat(25)}`,
      },
      Capabilities: {
        Tools: Array.from({ length: 5 }, (_, i) => ({
          Name: `SurfaceTool_${i + 1}`,
          Description: 'Executes a rich interactive filter or drilldown action on the active surface',
          Category: 'view',
          InputSchema: {},
        })),
        Agents: [{ AgentID: 'agent-sage', Name: 'Sage', Description: 'Ambient co-agent and workspace orchestrator' }],
      },
    });

    const appContext$ = new BehaviorSubject<AppContextSnapshot | null>(makeHeavySnapshot(0));
    const ch = new ClientContextChannel();
    ch.Initialize(
      makeContext({
        AppContext$: appContext$,
        SendContextNote: (text: string, options?: RealtimeContextNoteOptions) => {
          memory.Record({ Kind: 'note', Text: text, ...options });
        },
      }),
    );

    for (let i = 1; i <= 30; i++) {
      appContext$.next(makeHeavySnapshot(i));
      vi.advanceTimersByTime(CLIENT_CONTEXT_COALESCE_MS);
    }

    expect(memory.StateEntryCount).toBe(1);
    expect(memory.DroppedEntryCount).toBe(0);
    expect(memory.EntryCount).toBe(2);

    const rendered = RenderRealtimeMemorySeed(memory.Seed())
      .map((turn) => `${turn.Role}: ${turn.Texts.join('\n')}`)
      .join('\n');
    expect(rendered).toContain("Remember I'm working on AIDP.");
    expect(rendered).toContain("Got it — I'll remember you're working on AIDP.");
    expect(rendered).toContain('Screen 30');
    expect(rendered).toContain('Entity_30');
    expect(rendered).not.toContain('Entity_1\n');
    expect(rendered).not.toContain('Entity_15');

    ch.Dispose();
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
