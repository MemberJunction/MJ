// The whiteboard channel imports its Angular surface component (partial-compiled Angular
// libs require the JIT compiler in this node test environment), so load the compiler FIRST.
import '@angular/compiler';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { EventEmitter } from '@angular/core';
import type { JSONObject } from '@memberjunction/ai';
import { RealtimeChannelContext } from '@memberjunction/realtime-runtime';
import {
  RealtimeWhiteboardChannel, WHITEBOARD_ACTIONS_NOTE_THROTTLE_MS, WHITEBOARD_WIDGET_STATE_SAVE_THROTTLE_MS,
  WhiteboardChannelWidgetCommand
} from '../lib/components/realtime/whiteboard/whiteboard-channel';
import {
  IsWhiteboardWidgetToolName, RealtimeWhiteboardHostComponent, WHITEBOARD_TOOL_NAMES, WHITEBOARD_WIDGET_TOOL_NAMES, WhiteboardAuthor,
  WhiteboardToolResult, WhiteboardWidgetAccess, WhiteboardWidgetActionsChangedEventArgs,
  WhiteboardWidgetInteractionEvent, WhiteboardWidgetSubmitEvent
} from '@memberjunction/ng-whiteboard';

/**
 * D8 — the channel side of widget interaction: declared tools by `MaxWidgetAccess`, per-call
 * access + veto hooks, the async widget path (no confirmation frame), `ReturnsChannelData`,
 * author-aware notes, the session access note, actions perception, and widget-state
 * save/restore. The surface is a STRUCTURAL fake (the real host needs an injection context).
 */

/** Structural stand-in for the bound board host, including the widget APIs. */
class FakeWidgetHost {
  public State: unknown = null;
  public AgentName = '';
  public FocusMode = false;
  public AgentWidgetAccess: WhiteboardWidgetAccess = 'full';
  public SceneDelta = new EventEmitter<string>();
  public AgentUndo = new EventEmitter<void>();
  public FocusModeChange = new EventEmitter<boolean>();
  public SaveToArtifactsRequested = new EventEmitter<void>();
  public WidgetSubmitted = new EventEmitter<WhiteboardWidgetSubmitEvent>();
  public WidgetInteraction = new EventEmitter<WhiteboardWidgetInteractionEvent>();
  public WidgetActionsChanged = new EventEmitter<WhiteboardWidgetActionsChangedEventArgs>();
  public AsyncCalls: Array<{ ToolName: string; ArgsJson: string; Access: WhiteboardWidgetAccess }> = [];
  public SyncCalls: string[] = [];
  public AsyncResult: Promise<string> | null = null;

  public ApplyAgentTool(toolName: string): string {
    this.SyncCalls.push(toolName);
    return JSON.stringify({ success: true });
  }

  public ApplyAgentToolAsync(toolName: string, argsJson: string): Promise<string> {
    this.AsyncCalls.push({ ToolName: toolName, ArgsJson: argsJson, Access: this.AgentWidgetAccess });
    return this.AsyncResult ?? Promise.resolve(JSON.stringify({ success: true, itemId: 'html-1', outline: 'button "Go" [b1]' }));
  }

  public ToggleFocus(): void { /* unused */ }
  public SetOnStage(): void { /* unused */ }
}

function asHost(fake: FakeWidgetHost): RealtimeWhiteboardHostComponent {
  return fake as unknown as RealtimeWhiteboardHostComponent;
}

interface CtxLog {
  Notes: string[];
  Spoken: string[];
  Saves: string[];
}

function makeContext(log: CtxLog, channelConfig?: JSONObject): RealtimeChannelContext {
  return {
    AgentName: 'Sage',
    Provider: null,
    SendContextNote: (text: string) => log.Notes.push(text),
    RequestSpokenResponse: (instructions: string) => log.Spoken.push(instructions),
    RequestSave: (stateJson: string) => log.Saves.push(stateJson),
    SetFocusMode: () => undefined,
    SaveAsArtifact: async () => null,
    AgentSessionID: null,
    ExecuteServerAction: async () => null,
    ...(channelConfig ? { ChannelConfig: channelConfig } : {})
  };
}

/** Test subclass: counts confirmation frames and exposes the policy hooks. */
class ProbeChannel extends RealtimeWhiteboardChannel {
  public Confirms = 0;
  public Max: WhiteboardWidgetAccess = 'full';
  public Override: WhiteboardWidgetAccess | null = null;
  public Veto: string | null = null;
  public Commands: WhiteboardChannelWidgetCommand[] = [];

  protected override get MaxWidgetAccess(): WhiteboardWidgetAccess {
    return this.Max;
  }
  protected override ResolveWidgetAccess(): WhiteboardWidgetAccess {
    return this.Override ?? super.ResolveWidgetAccess();
  }
  protected override OnBeforeWidgetCommand(command: WhiteboardChannelWidgetCommand): string | null {
    this.Commands.push(command);
    return this.Veto;
  }
  protected override ConfirmVisualChange(): Promise<void> {
    this.Confirms++;
    return Promise.resolve();
  }
}

function parse(json: string): WhiteboardToolResult {
  return JSON.parse(json) as WhiteboardToolResult;
}

async function apply(channel: RealtimeWhiteboardChannel, toolName: string, args: JSONObject): Promise<WhiteboardToolResult> {
  return parse(await channel.ApplyAgentTool(toolName, JSON.stringify(args)));
}

describe('RealtimeWhiteboardChannel — widget tools', () => {
  let channel: ProbeChannel;
  let log: CtxLog;
  let host: FakeWidgetHost;

  function start(config?: JSONObject): void {
    channel.Initialize(makeContext(log, config));
    channel.BindSurface(asHost(host));
  }

  beforeEach(() => {
    channel = new ProbeChannel();
    log = { Notes: [], Spoken: [], Saves: [] };
    host = new FakeWidgetHost();
  });

  afterEach(() => {
    channel.Dispose();
    vi.useRealTimers();
  });

  describe('declared tools (MaxWidgetAccess, read before Initialize)', () => {
    function declared(max: WhiteboardWidgetAccess): string[] {
      const c = new ProbeChannel();
      c.Max = max;
      return c.GetToolDefinitions().map(t => t.Name).filter(n => (WHITEBOARD_WIDGET_TOOL_NAMES as readonly string[]).includes(n));
    }

    it('declares all three widget tools at full access', () => {
      expect(declared('full')).toEqual([...WHITEBOARD_WIDGET_TOOL_NAMES]);
    });

    it('declares only Inspect when inspect-only, none when off, and keeps every board tool', () => {
      expect(declared('inspect-only')).toEqual([WHITEBOARD_TOOL_NAMES.InspectWidget]);
      expect(declared('off')).toEqual([]);
      const c = new ProbeChannel();
      c.Max = 'off';
      expect(c.GetToolDefinitions().map(t => t.Name)).toContain(WHITEBOARD_TOOL_NAMES.AddHtml);
    });
  });

  it('the descriptor marks every widget verb ReturnsChannelData "state" and no board verb', () => {
    const verbs = channel.GetDescriptor().Verbs;
    for (const name of WHITEBOARD_WIDGET_TOOL_NAMES) {
      expect(verbs.find(v => v.NativeToolName === name)?.ReturnsChannelData).toBe('state');
    }
    expect(verbs.find(v => v.NativeToolName === WHITEBOARD_TOOL_NAMES.AddNote)?.ReturnsChannelData).toBeUndefined();
  });

  it('runs a widget tool through the host asynchronously, with NO confirmation frame', async () => {
    start();
    const pending = channel.ApplyAgentTool(WHITEBOARD_TOOL_NAMES.InspectWidget, JSON.stringify({ itemId: 'html-1' }));
    expect(pending).toBeInstanceOf(Promise);
    const result = parse(await pending);
    expect(result.success).toBe(true);
    expect(result.outline).toContain('[b1]');
    expect(host.AsyncCalls).toEqual([{ ToolName: WHITEBOARD_TOOL_NAMES.InspectWidget, ArgsJson: '{"itemId":"html-1"}', Access: 'full' }]);
    expect(host.SyncCalls).toEqual([]);
    expect(channel.Confirms).toBe(0);
  });

  it('board tools still confirm visually and stay synchronous', () => {
    start();
    const result = channel.ApplyAgentTool(WHITEBOARD_TOOL_NAMES.AddNote, JSON.stringify({ text: 'x' }));
    expect(typeof result).toBe('string');
    expect(channel.Confirms).toBe(1);
  });

  it('a subclass that post-processes board results and routes widget tools to super keeps working', async () => {
    /** The documented override pattern: widget tools straight to super, board tools narrowed to string. */
    class TaggingChannel extends ProbeChannel {
      public override ApplyAgentTool(toolName: string, argsJson: string): string | Promise<string> {
        if (IsWhiteboardWidgetToolName(toolName)) {
          return super.ApplyAgentTool(toolName, argsJson);
        }
        const result = super.ApplyAgentTool(toolName, argsJson);
        if (typeof result !== 'string') {
          throw new Error('board tools must answer synchronously');
        }
        return JSON.stringify({ ...parse(result), tagged: true });
      }
    }
    const tagging = new TaggingChannel();
    tagging.Initialize(makeContext(log));
    tagging.BindSurface(asHost(host));
    const board = tagging.ApplyAgentTool(WHITEBOARD_TOOL_NAMES.AddNote, JSON.stringify({ text: 'x' }));
    expect(typeof board).toBe('string');
    expect(JSON.parse(board as string)).toMatchObject({ success: true, tagged: true });
    const widget = tagging.ApplyAgentTool(WHITEBOARD_TOOL_NAMES.InspectWidget, JSON.stringify({ itemId: 'html-1' }));
    expect(widget).toBeInstanceOf(Promise);
    expect(parse(await widget)).toMatchObject({ success: true, itemId: 'html-1' });
    // Unbound: the board tool still answers synchronously from the pure engine.
    tagging.UnbindSurface();
    expect(typeof tagging.ApplyAgentTool(WHITEBOARD_TOOL_NAMES.AddNote, JSON.stringify({ text: 'y' }))).toBe('string');
    tagging.Dispose();
  });

  it('returns surface_unavailable when no board is bound', async () => {
    channel.Initialize(makeContext(log));
    const result = await apply(channel, WHITEBOARD_TOOL_NAMES.InspectWidget, { itemId: 'html-1' });
    expect(result.success).toBe(false);
    expect(result.errorCode).toBe('surface_unavailable');
    expect(result.error).toContain('ask the user to open');
  });

  it('turns a rejected host promise into a failure result', async () => {
    start();
    host.AsyncResult = Promise.reject(new Error('boom'));
    const result = await apply(channel, WHITEBOARD_TOOL_NAMES.CallWidget, { itemId: 'html-1', action: 'next' });
    expect(result.success).toBe(false);
    expect(result.error).toContain('boom');
  });

  describe('access policy', () => {
    it('config widgetAccess "inspect-only" refuses operate/call with access_denied and a reason, allows inspect', async () => {
      start({ widgetAccess: 'inspect-only' });
      expect(host.AgentWidgetAccess).toBe('inspect-only');
      const denied = await apply(channel, WHITEBOARD_TOOL_NAMES.OperateWidget, { itemId: 'html-1', steps: [] });
      expect(denied.errorCode).toBe('access_denied');
      expect(denied.error).toContain('inspect-only');
      expect((await apply(channel, WHITEBOARD_TOOL_NAMES.InspectWidget, { itemId: 'html-1' })).success).toBe(true);
      expect(host.AsyncCalls.map(c => c.ToolName)).toEqual([WHITEBOARD_TOOL_NAMES.InspectWidget]);
    });

    it('config cannot raise access above MaxWidgetAccess', async () => {
      channel.Max = 'inspect-only';
      start({ widgetAccess: 'full' });
      expect((await apply(channel, WHITEBOARD_TOOL_NAMES.CallWidget, { itemId: 'html-1', action: 'a' })).errorCode).toBe('access_denied');
    });

    it('ResolveWidgetAccess is evaluated per call and passed to the host', async () => {
      start();
      channel.Override = 'off';
      const denied = await apply(channel, WHITEBOARD_TOOL_NAMES.InspectWidget, { itemId: 'html-1' });
      expect(denied.errorCode).toBe('access_denied');
      expect(denied.error).toContain('turned off');
      channel.Override = 'inspect-only';
      await apply(channel, WHITEBOARD_TOOL_NAMES.InspectWidget, { itemId: 'html-1' });
      expect(host.AsyncCalls[0].Access).toBe('inspect-only');
    });

    it('OnBeforeWidgetCommand vetoes one command with its reason (vetoed) and sees the parsed command', async () => {
      start();
      channel.Veto = 'This exercise is scored; let the learner answer.';
      const vetoed = await apply(channel, WHITEBOARD_TOOL_NAMES.OperateWidget, { itemId: 'html-3', steps: [] });
      expect(vetoed.errorCode).toBe('vetoed');
      expect(vetoed.error).toBe('This exercise is scored; let the learner answer.');
      expect(host.AsyncCalls).toEqual([]);
      expect(channel.Commands[0]).toMatchObject({ ToolName: WHITEBOARD_TOOL_NAMES.OperateWidget, ItemID: 'html-3', Access: 'full' });
    });

    it('warns once per invalid config member and falls back to the default', () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
      start({ widgetAccess: 'sometimes' });
      expect(warn).toHaveBeenCalledWith(expect.stringContaining('"widgetAccess"'));
      expect(host.AgentWidgetAccess).toBe('full');
      warn.mockRestore();
    });
  });

  describe('session note', () => {
    it('names the unavailable widget tools when access is below full', () => {
      start({ widgetAccess: 'inspect-only' });
      channel.OnSessionStarted();
      const note = log.Notes.find(n => n.includes('unavailable'));
      expect(note).toContain(WHITEBOARD_TOOL_NAMES.OperateWidget);
      expect(note).toContain(WHITEBOARD_TOOL_NAMES.CallWidget);
      const unavailableList = (note ?? '').split(' are unavailable')[0];
      expect(unavailableList).not.toContain(WHITEBOARD_TOOL_NAMES.InspectWidget);
    });

    it('sends nothing at full access', () => {
      start();
      channel.OnSessionStarted();
      expect(log.Notes.filter(n => n.includes('unavailable'))).toEqual([]);
    });
  });

  describe('notes by author', () => {
    function submit(author?: WhiteboardAuthor): WhiteboardWidgetSubmitEvent & { Author?: WhiteboardAuthor } {
      return { ItemID: 'html-1', Title: 'Quiz', DataJson: '{"q":1}', ...(author ? { Author: author } : {}) };
    }
    function interaction(author?: WhiteboardAuthor): WhiteboardWidgetInteractionEvent & { Author?: WhiteboardAuthor } {
      return { ItemID: 'html-1', Title: 'Quiz', Summary: 'clicked "Go"', ...(author ? { Author: author } : {}) };
    }

    it('an agent-authored submit sends no note and no spoken request', () => {
      start();
      host.WidgetSubmitted.emit(submit('agent'));
      expect(log.Notes).toEqual([]);
      expect(log.Spoken).toEqual([]);
    });

    it('a user (or unattributed) submit is unchanged: note + spoken request', () => {
      start();
      host.WidgetSubmitted.emit(submit('user'));
      host.WidgetSubmitted.emit(submit());
      expect(log.Notes.filter(n => n.includes('submitted input'))).toHaveLength(2);
      expect(log.Spoken).toHaveLength(2);
    });

    it('agent-authored interactions send no ambient note; user ones do', () => {
      start();
      host.WidgetInteraction.emit(interaction('agent'));
      expect(log.Notes).toEqual([]);
      host.WidgetInteraction.emit(interaction());
      expect(log.Notes.filter(n => n.includes('ambient activity'))).toHaveLength(1);
    });
  });

  describe('actions perception', () => {
    const actions = (names: string[]): WhiteboardWidgetActionsChangedEventArgs =>
      new WhiteboardWidgetActionsChangedEventArgs('html-2', 'Planet quiz', names.map(n => ({ Name: n })));

    it('sends a throttled "offers actions" note (latest wins)', () => {
      vi.useFakeTimers();
      start();
      host.WidgetActionsChanged.emit(actions(['next']));
      host.WidgetActionsChanged.emit(actions(['next', 'reset']));
      expect(log.Notes).toEqual(['[whiteboard] widget "Planet quiz" (html-2) offers actions: next']);
      vi.advanceTimersByTime(WHITEBOARD_ACTIONS_NOTE_THROTTLE_MS);
      expect(log.Notes[1]).toBe('[whiteboard] widget "Planet quiz" (html-2) offers actions: next, reset');
    });

    it('sends one note per distinct list: repeats (remount, hello, inspect pin) stay quiet', () => {
      vi.useFakeTimers();
      start();
      const offers = () => log.Notes.filter(n => n.includes('offers actions'));
      host.WidgetActionsChanged.emit(actions(['next']));
      vi.advanceTimersByTime(WHITEBOARD_ACTIONS_NOTE_THROTTLE_MS);
      host.WidgetActionsChanged.emit(actions(['next'])); // same list again, outside the window
      vi.advanceTimersByTime(WHITEBOARD_ACTIONS_NOTE_THROTTLE_MS);
      host.WidgetActionsChanged.emit(actions(['next'])); // …and again
      vi.advanceTimersByTime(WHITEBOARD_ACTIONS_NOTE_THROTTLE_MS);
      expect(offers()).toHaveLength(1);
      host.WidgetActionsChanged.emit(actions(['next', 'reset'])); // changed list → a new note
      expect(offers()).toHaveLength(2);
      expect(offers()[1]).toContain('next, reset');
      vi.advanceTimersByTime(WHITEBOARD_ACTIONS_NOTE_THROTTLE_MS);
      host.WidgetActionsChanged.emit(new WhiteboardWidgetActionsChangedEventArgs('html-2', 'Planet quiz',
        [{ Name: 'next', Description: 'Next question' }, { Name: 'reset' }])); // description change counts
      expect(offers()).toHaveLength(3);
    });

    it('a trailing note that equals the last one sent is dropped', () => {
      vi.useFakeTimers();
      start();
      host.WidgetActionsChanged.emit(actions(['next']));
      host.WidgetActionsChanged.emit(actions(['next', 'reset']));
      host.WidgetActionsChanged.emit(actions(['next'])); // latest wins — and it is what was already sent
      vi.advanceTimersByTime(WHITEBOARD_ACTIONS_NOTE_THROTTLE_MS);
      expect(log.Notes.filter(n => n.includes('offers actions'))).toHaveLength(1);
    });

    it('stays silent below "state" exposure, when calls are not allowed, or with no actions', () => {
      start({ widgetAccess: 'inspect-only' });
      host.WidgetActionsChanged.emit(actions(['next']));
      channel.Dispose();

      channel = new ProbeChannel();
      log.Notes = [];
      start();
      host.WidgetActionsChanged.emit(actions([]));
      channel.ApplyExposure({ Policy: 'none' });
      log.Notes = [];
      host.WidgetActionsChanged.emit(new WhiteboardWidgetActionsChangedEventArgs('html-9', '', [{ Name: 'go' }]));
      expect(log.Notes.filter(n => n.includes('offers actions'))).toEqual([]);
    });
  });
});

describe('RealtimeWhiteboardChannel — widget state save / restore', () => {
  let channel: RealtimeWhiteboardChannel;
  let log: CtxLog;

  function addWidget(): string {
    const item = channel.State.AddItem({ Kind: 'html', X: 0, Y: 0, W: 200, H: 100, Html: '<p>q</p>', Title: 'Q' }, 'agent');
    if (!item) {
      throw new Error('add vetoed');
    }
    return item.ID;
  }

  function lastSave(): JSONObject {
    return JSON.parse(log.Saves[log.Saves.length - 1]) as JSONObject;
  }

  beforeEach(() => {
    vi.useFakeTimers();
    channel = new RealtimeWhiteboardChannel();
    log = { Notes: [], Spoken: [], Saves: [] };
  });

  afterEach(() => {
    channel.Dispose();
    vi.useRealTimers();
  });

  it('saves widget states as a sibling key of the board JSON, and keeps them out of SerializeState', () => {
    channel.Initialize(makeContext(log));
    const id = addWidget();
    log.Saves = [];
    channel.State.SetWidgetState(id, '{"q":1}');
    expect(log.Saves).toHaveLength(1);
    const saved = lastSave();
    expect(saved['widgetStates']).toEqual({ [id]: '{"q":1}' });
    expect(saved['pages']).toBeDefined();
    expect(channel.SerializeState()).not.toContain('widgetStates');
    expect(channel.State.ToJSON()).not.toContain('widgetStates');
  });

  it('board-change saves carry the widget states too', () => {
    channel.Initialize(makeContext(log));
    const id = addWidget();
    channel.State.SetWidgetState(id, '"s"');
    channel.State.AddItem({ Kind: 'sticky', X: 0, Y: 0, Text: 'n' }, 'user');
    expect(lastSave()['widgetStates']).toEqual({ [id]: '"s"' });
  });

  it('throttles widget-state save requests to one per window (leading + trailing, latest state)', () => {
    channel.Initialize(makeContext(log));
    const id = addWidget();
    log.Saves = [];
    channel.State.SetWidgetState(id, '1');
    channel.State.SetWidgetState(id, '2');
    channel.State.SetWidgetState(id, '3');
    expect(log.Saves).toHaveLength(1);
    vi.advanceTimersByTime(WHITEBOARD_WIDGET_STATE_SAVE_THROTTLE_MS - 1);
    expect(log.Saves).toHaveLength(1);
    vi.advanceTimersByTime(1);
    expect(log.Saves).toHaveLength(2);
    expect(lastSave()['widgetStates']).toEqual({ [id]: '3' });
  });

  it('persistWidgetState false: no widget-state saves, no sibling key, nothing restored', () => {
    channel.Initialize(makeContext(log, { persistWidgetState: false }));
    const id = addWidget();
    log.Saves = [];
    channel.State.SetWidgetState(id, '"x"');
    expect(log.Saves).toEqual([]);
    channel.State.AddItem({ Kind: 'sticky', X: 0, Y: 0, Text: 'n' }, 'user');
    expect(lastSave()['widgetStates']).toBeUndefined();

    const payload = JSON.stringify({ ...JSON.parse(channel.State.ToJSON()), widgetStates: { [id]: '"saved"' } });
    expect(channel.RestoreState(payload)).toBe(true);
    expect(channel.State.GetWidgetState(id)).toBeNull();
  });

  it('restores widget states from the sibling key after the board', () => {
    channel.Initialize(makeContext(log));
    const source = new RealtimeWhiteboardChannel();
    const item = source.State.AddItem({ Kind: 'html', X: 0, Y: 0, W: 10, H: 10, Html: '<p/>' }, 'agent');
    const payload = JSON.stringify({ ...JSON.parse(source.State.ToJSON()), widgetStates: { [item?.ID ?? '']: '{"q":2}', bad: 7 } });
    expect(channel.RestoreState(payload)).toBe(true);
    expect(channel.State.ElementCount).toBe(1);
    expect(channel.State.GetWidgetState(item?.ID ?? '')).toBe('{"q":2}');
    expect(channel.State.GetWidgetState('bad')).toBeNull();
  });

  it('restores a legacy payload (no widgetStates key) and clears any in-memory states', () => {
    channel.Initialize(makeContext(log));
    const id = addWidget();
    channel.State.SetWidgetState(id, '"stale"');
    const legacy = channel.State.ToJSON();
    const before = log.Saves.length;
    expect(channel.RestoreState(legacy)).toBe(true);
    expect(channel.State.GetWidgetState(id)).toBeNull();
    // Review NB3 + Q2: the restore requests exactly ONE save, and it never carries the stale
    // in-memory widget state (the board and its widget states are saved together).
    const restoreSaves = log.Saves.slice(before);
    expect(restoreSaves).toHaveLength(1);
    expect(JSON.parse(restoreSaves[0])['widgetStates']).toBeUndefined();
    const failedBefore = log.Saves.length;
    expect(channel.RestoreState('{not json')).toBe(false);
    expect(log.Saves.length).toBe(failedBefore); // a failed restore requests nothing
  });

  it('a restore over in-memory widget states saves the RESTORED states, never the stale ones (review Q2)', () => {
    channel.Initialize(makeContext(log));
    const id = addWidget();
    channel.State.SetWidgetState(id, '"stale"');
    const payload = JSON.stringify({ ...JSON.parse(channel.State.ToJSON()), widgetStates: { [id]: '"restored"' } });
    const before = log.Saves.length;
    expect(channel.RestoreState(payload)).toBe(true);
    const restoreSaves = log.Saves.slice(before).map((p) => JSON.parse(p)['widgetStates']);
    expect(restoreSaves).toEqual([{ [id]: '"restored"' }]);
  });

  it('flushes a pending trailing widget-state save on Dispose', () => {
    channel.Initialize(makeContext(log));
    const id = addWidget();
    channel.State.SetWidgetState(id, '1');
    channel.State.SetWidgetState(id, '2');
    const before = log.Saves.length;
    channel.Dispose();
    expect(log.Saves.length).toBe(before + 1);
    expect(lastSave()['widgetStates']).toEqual({ [id]: '2' });
  });
});
