// The whiteboard channel imports its Angular surface component (partial-compiled Angular
// libs require the JIT compiler in this node test environment), so load the compiler FIRST.
import '@angular/compiler';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { EventEmitter } from '@angular/core';
import { MJGlobal } from '@memberjunction/global';
import { BaseRealtimeChannelClient, RealtimeChannelContext } from '../lib/components/realtime/channels/base-realtime-channel-client';
import { RealtimeWhiteboardChannel } from '../lib/components/realtime/whiteboard/whiteboard-channel';
import { RealtimeWhiteboardHostComponent } from '../lib/components/realtime/whiteboard/whiteboard-host.component';
import { WHITEBOARD_TOOL_DEFINITIONS, WHITEBOARD_TOOL_PREFIX, WhiteboardToolResult } from '../lib/components/realtime/whiteboard/whiteboard-tools';

/**
 * The LIVE WHITEBOARD as a registry plugin — contract metadata, ClassFactory registration,
 * the no-surface ApplyAgentTool fallback (panel collapsed), surface binding/unbinding, the
 * save-on-mutation pipeline and Dispose. The "surface" here is a STRUCTURAL fake (the real
 * component needs an Angular injection context); the plugin only touches the members the
 * fake provides.
 */

/** Structural stand-in for the bound board host. */
class FakeWhiteboardHost {
  public State: unknown = null;
  public AgentName = '';
  public FocusMode = false;
  public SceneDelta = new EventEmitter<string>();
  public AgentUndo = new EventEmitter<void>();
  public FocusModeChange = new EventEmitter<boolean>();
  public AppliedTools: Array<{ ToolName: string; ArgsJson: string }> = [];

  public ApplyAgentTool(toolName: string, argsJson: string): string {
    this.AppliedTools.push({ ToolName: toolName, ArgsJson: argsJson });
    return JSON.stringify({ success: true, itemId: 'host-item', summary: 'host applied' });
  }

  public ToggleFocus(): void {
    this.FocusMode = !this.FocusMode;
    this.FocusModeChange.emit(this.FocusMode);
  }
}

function asHost(fake: FakeWhiteboardHost): RealtimeWhiteboardHostComponent {
  return fake as unknown as RealtimeWhiteboardHostComponent;
}

interface CtxLog {
  Notes: string[];
  Saves: string[];
  Focus: boolean[];
}

function makeContext(log: CtxLog): RealtimeChannelContext {
  return {
    AgentName: 'Sage',
    SendContextNote: (text: string) => log.Notes.push(text),
    RequestSave: (stateJson: string) => log.Saves.push(stateJson),
    SetFocusMode: (on: boolean) => log.Focus.push(on)
  };
}

describe('RealtimeWhiteboardChannel — plugin contract', () => {
  let channel: RealtimeWhiteboardChannel;
  let log: CtxLog;

  beforeEach(() => {
    channel = new RealtimeWhiteboardChannel();
    log = { Notes: [], Saves: [], Focus: [] };
    channel.Initialize(makeContext(log));
  });

  it('is resolvable from the ClassFactory by its registry ClientPluginClass key', () => {
    const registration = MJGlobal.Instance.ClassFactory.GetRegistration(BaseRealtimeChannelClient, 'RealtimeWhiteboardChannel');
    expect(registration).toBeTruthy();
    const instance = MJGlobal.Instance.ClassFactory.CreateInstance<BaseRealtimeChannelClient>(
      BaseRealtimeChannelClient, 'RealtimeWhiteboardChannel'
    );
    expect(instance).toBeInstanceOf(RealtimeWhiteboardChannel);
  });

  it('contributes the channel contract: name, prefix, tab chrome, tool set, surface', () => {
    expect(channel.ChannelName).toBe('Whiteboard');
    expect(channel.ToolNamePrefix).toBe(WHITEBOARD_TOOL_PREFIX);
    expect(channel.TabTitle).toBe('Whiteboard');
    expect(channel.TabIcon).toBe('fa-solid fa-chalkboard');
    expect(channel.GetToolDefinitions()).toBe(WHITEBOARD_TOOL_DEFINITIONS);
    expect(channel.GetSurfaceComponent()).toBe(RealtimeWhiteboardHostComponent);
  });

  it('ApplyAgentTool with NO surface bound falls back to the pure engine (collapsed panel)', () => {
    const resultJson = channel.ApplyAgentTool('Whiteboard.AddNote', JSON.stringify({ text: 'hello' }));
    const result = JSON.parse(resultJson) as WhiteboardToolResult;

    expect(result.success).toBe(true);
    expect(channel.State.ElementCount).toBe(1);
    expect(channel.State.CountByAuthor('agent')).toBe(1);
  });

  it('every board mutation requests a state-of-record save (user edits AND agent tools)', () => {
    channel.ApplyAgentTool('Whiteboard.AddNote', JSON.stringify({ text: 'note' }));
    expect(log.Saves.length).toBeGreaterThan(0);
    const lastSave = JSON.parse(log.Saves[log.Saves.length - 1]) as { Items?: unknown[] };
    expect(JSON.stringify(lastSave)).toBe(channel.SerializeState());
  });

  it('BindSurface wires inputs + outputs; tools then route through the host (UI garnish path)', () => {
    const fake = new FakeWhiteboardHost();
    channel.BindSurface(asHost(fake));

    expect(fake.State).toBe(channel.State);
    expect(fake.AgentName).toBe('Sage');

    const resultJson = channel.ApplyAgentTool('Whiteboard.AddNote', JSON.stringify({ text: 'via host' }));
    expect(fake.AppliedTools).toEqual([{ ToolName: 'Whiteboard.AddNote', ArgsJson: JSON.stringify({ text: 'via host' }) }]);
    expect((JSON.parse(resultJson) as WhiteboardToolResult).itemId).toBe('host-item');

    fake.SceneDelta.emit('{"added":[1]}');
    fake.AgentUndo.emit();
    fake.FocusModeChange.emit(true);
    expect(log.Notes).toEqual(['[whiteboard] {"added":[1]}', '[whiteboard] user undid your last change']);
    expect(log.Focus).toEqual([true]);
  });

  it('UnbindSurface flips back to the engine fallback and stops listening to old outputs', () => {
    const fake = new FakeWhiteboardHost();
    channel.BindSurface(asHost(fake));
    channel.UnbindSurface();

    channel.ApplyAgentTool('Whiteboard.AddNote', JSON.stringify({ text: 'after unbind' }));
    expect(fake.AppliedTools).toEqual([]); // host no longer consulted
    expect(channel.State.ElementCount).toBe(1); // engine applied it

    fake.SceneDelta.emit('{"stale":true}');
    expect(log.Notes).toEqual([]); // old subscription released
  });

  it('re-binding a NEW surface replaces the old one (pane recreated after collapse/expand)', () => {
    const first = new FakeWhiteboardHost();
    const second = new FakeWhiteboardHost();
    channel.BindSurface(asHost(first));
    channel.BindSurface(asHost(second));

    channel.ApplyAgentTool('Whiteboard.AddText', JSON.stringify({ text: 'x' }));
    expect(first.AppliedTools).toEqual([]);
    expect(second.AppliedTools).toHaveLength(1);

    first.SceneDelta.emit('{"old":true}');
    expect(log.Notes).toEqual([]); // first surface's outputs were unsubscribed
  });

  it('RequestFocusExit leaves focus THROUGH the bound host so its toggle stays in sync', () => {
    const fake = new FakeWhiteboardHost();
    channel.BindSurface(asHost(fake));
    fake.ToggleFocus(); // enter focus → SetFocusMode(true)
    expect(log.Focus).toEqual([true]);

    channel.RequestFocusExit();
    expect(fake.FocusMode).toBe(false);
    expect(log.Focus).toEqual([true, false]);

    channel.RequestFocusExit(); // not in focus → no double-toggle
    expect(log.Focus).toEqual([true, false]);
  });

  it('Dispose releases the surface, the state subscription and the context', () => {
    const fake = new FakeWhiteboardHost();
    channel.BindSurface(asHost(fake));
    channel.Dispose();

    // State mutations no longer request saves…
    const savesBefore = log.Saves.length;
    channel.State.AddItem({ Kind: 'text', X: 0, Y: 0, Text: 'post-dispose' }, 'user');
    expect(log.Saves.length).toBe(savesBefore);

    // …and tool calls fall back to the engine (no host).
    const spy = vi.spyOn(fake, 'ApplyAgentTool');
    channel.ApplyAgentTool('Whiteboard.AddNote', JSON.stringify({ text: 'still works' }));
    expect(spy).not.toHaveBeenCalled();
  });
});
