// The whiteboard channel imports its Angular surface component (partial-compiled Angular
// libs require the JIT compiler in this node test environment), so load the compiler FIRST.
import '@angular/compiler';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { EventEmitter } from '@angular/core';
import { MJGlobal } from '@memberjunction/global';
import { BaseRealtimeChannelClient, RealtimeChannelContext } from '../lib/components/realtime/channels/base-realtime-channel-client';
import {
  RealtimeWhiteboardChannel, WHITEBOARD_INTERACTION_NOTE_THROTTLE_MS
} from '../lib/components/realtime/whiteboard/whiteboard-channel';
import {
  RealtimeWhiteboardHostComponent, WHITEBOARD_TOOL_DEFINITIONS, WHITEBOARD_TOOL_PREFIX,
  WhiteboardToolResult, WhiteboardWidgetInteractionEvent, WhiteboardWidgetSubmitEvent
} from '@memberjunction/ng-whiteboard';

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
  public SaveToArtifactsRequested = new EventEmitter<void>();
  public WidgetSubmitted = new EventEmitter<WhiteboardWidgetSubmitEvent>();
  public WidgetInteraction = new EventEmitter<WhiteboardWidgetInteractionEvent>();
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
  Spoken: string[];
  Saves: string[];
  Focus: boolean[];
}

function makeContext(log: CtxLog): RealtimeChannelContext {
  return {
    AgentName: 'Sage',
    SendContextNote: (text: string) => log.Notes.push(text),
    RequestSpokenResponse: (instructions: string) => log.Spoken.push(instructions),
    RequestSave: (stateJson: string) => log.Saves.push(stateJson),
    SetFocusMode: (on: boolean) => log.Focus.push(on),
    SaveAsArtifact: async () => null
  };
}

describe('RealtimeWhiteboardChannel — plugin contract', () => {
  let channel: RealtimeWhiteboardChannel;
  let log: CtxLog;

  beforeEach(() => {
    channel = new RealtimeWhiteboardChannel();
    log = { Notes: [], Spoken: [], Saves: [], Focus: [] };
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
    const resultJson = channel.ApplyAgentTool('Whiteboard_AddNote', JSON.stringify({ text: 'hello' }));
    const result = JSON.parse(resultJson) as WhiteboardToolResult;

    expect(result.success).toBe(true);
    expect(channel.State.ElementCount).toBe(1);
    expect(channel.State.CountByAuthor('agent')).toBe(1);
  });

  it('every board mutation requests a state-of-record save (user edits AND agent tools)', () => {
    channel.ApplyAgentTool('Whiteboard_AddNote', JSON.stringify({ text: 'note' }));
    expect(log.Saves.length).toBeGreaterThan(0);
    const lastSave = JSON.parse(log.Saves[log.Saves.length - 1]) as { Items?: unknown[] };
    expect(JSON.stringify(lastSave)).toBe(channel.SerializeState());
  });

  it('BindSurface wires inputs + outputs; tools then route through the host (UI garnish path)', () => {
    const fake = new FakeWhiteboardHost();
    channel.BindSurface(asHost(fake));

    expect(fake.State).toBe(channel.State);
    expect(fake.AgentName).toBe('Sage');

    const resultJson = channel.ApplyAgentTool('Whiteboard_AddNote', JSON.stringify({ text: 'via host' }));
    expect(fake.AppliedTools).toEqual([{ ToolName: 'Whiteboard_AddNote', ArgsJson: JSON.stringify({ text: 'via host' }) }]);
    expect((JSON.parse(resultJson) as WhiteboardToolResult).itemId).toBe('host-item');

    fake.SceneDelta.emit('{"added":[1]}');
    fake.AgentUndo.emit();
    fake.FocusModeChange.emit(true);
    // scene deltas carry the perception ETIQUETTE inline (don't comment on minor edits)
    expect(log.Notes).toHaveLength(2);
    expect(log.Notes[0]).toContain('[whiteboard] board update');
    expect(log.Notes[0]).toContain('do NOT comment on minor edits');
    expect(log.Notes[0]).toContain('{"added":[1]}');
    expect(log.Notes[1]).toBe('[whiteboard] user undid your last change');
    expect(log.Focus).toEqual([true]);
  });

  it('routes widget MJWhiteboard.submit input to the agent as a [whiteboard] context note', () => {
    const fake = new FakeWhiteboardHost();
    channel.BindSurface(asHost(fake));

    fake.WidgetSubmitted.emit({ ItemID: 'html-2', Title: 'Quick quiz', DataJson: '{"answer":"Mercury"}' });
    expect(log.Notes).toHaveLength(1);
    expect(log.Notes[0]).toBe('[whiteboard] the user submitted input in widget "Quick quiz": {"answer":"Mercury"}');
    // …and the model is asked to REACT audibly (SendContextNote alone is silent by contract)
    expect(log.Spoken).toHaveLength(1);
    expect(log.Spoken[0]).toContain('Quick quiz');
    expect(log.Spoken[0]).toContain('{"answer":"Mercury"}');
    expect(log.Spoken[0]).toContain('React to it now');

    // untitled widgets fall back to the item ID
    fake.WidgetSubmitted.emit({ ItemID: 'html-3', Title: '', DataJson: '{"ok":true}' });
    expect(log.Notes[1]).toBe('[whiteboard] the user submitted input in widget "html-3": {"ok":true}');

    // released with the surface, like the other output subscriptions
    channel.UnbindSurface();
    fake.WidgetSubmitted.emit({ ItemID: 'html-2', Title: 'Quick quiz', DataJson: '{"stale":true}' });
    expect(log.Notes).toHaveLength(2);
  });

  describe('ambient widget-interaction notes — per-widget throttle (latest wins)', () => {
    function interaction(itemId: string, summary: string, title = 'Vibe picker'): WhiteboardWidgetInteractionEvent {
      return { ItemID: itemId, Title: title, Summary: summary };
    }

    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('first activity in a widget sends a note IMMEDIATELY with the ambient framing', () => {
      const fake = new FakeWhiteboardHost();
      channel.BindSurface(asHost(fake));

      fake.WidgetInteraction.emit(interaction('html-2', 'clicked "Playful pink"; changed "vibe" to "pink"'));
      expect(log.Notes).toHaveLength(1);
      expect(log.Notes[0]).toBe(
        '[whiteboard] ambient activity in widget "Vibe picker" ' +
        '(background — do NOT respond unless it is significant or you are asked; ' +
        'explicit submissions arrive separately): clicked "Playful pink"; changed "vibe" to "pink"');
    });

    it('untitled widgets fall back to the item ID in the framing', () => {
      const fake = new FakeWhiteboardHost();
      channel.BindSurface(asHost(fake));

      fake.WidgetInteraction.emit(interaction('html-7', 'typing in "email"', ''));
      expect(log.Notes[0]).toContain('ambient activity in widget "html-7"');
    });

    it('within the window further activity coalesces — ONE trailing note, LATEST summary wins', () => {
      const fake = new FakeWhiteboardHost();
      channel.BindSurface(asHost(fake));

      fake.WidgetInteraction.emit(interaction('html-2', 'first'));
      fake.WidgetInteraction.emit(interaction('html-2', 'second'));
      fake.WidgetInteraction.emit(interaction('html-2', 'third'));
      expect(log.Notes).toHaveLength(1); // only the immediate first note so far

      vi.advanceTimersByTime(WHITEBOARD_INTERACTION_NOTE_THROTTLE_MS);
      expect(log.Notes).toHaveLength(2);
      expect(log.Notes[1]).toContain(': third'); // latest summary won
      expect(log.Notes.some((n) => n.includes(': second'))).toBe(false);
    });

    it('the trailing send opens a NEW window — chatty widgets stay at ≤1 note per window', () => {
      const fake = new FakeWhiteboardHost();
      channel.BindSurface(asHost(fake));

      fake.WidgetInteraction.emit(interaction('html-2', 'a'));      // sent immediately
      fake.WidgetInteraction.emit(interaction('html-2', 'b'));      // deferred
      vi.advanceTimersByTime(WHITEBOARD_INTERACTION_NOTE_THROTTLE_MS); // 'b' sent
      fake.WidgetInteraction.emit(interaction('html-2', 'c'));      // inside b's window → deferred
      expect(log.Notes).toHaveLength(2);
      vi.advanceTimersByTime(WHITEBOARD_INTERACTION_NOTE_THROTTLE_MS);
      expect(log.Notes).toHaveLength(3);
      expect(log.Notes[2]).toContain(': c');
    });

    it('after a QUIET window expires, the next activity sends immediately again', () => {
      const fake = new FakeWhiteboardHost();
      channel.BindSurface(asHost(fake));

      fake.WidgetInteraction.emit(interaction('html-2', 'early'));
      vi.advanceTimersByTime(WHITEBOARD_INTERACTION_NOTE_THROTTLE_MS + 1);
      fake.WidgetInteraction.emit(interaction('html-2', 'late'));
      expect(log.Notes).toHaveLength(2);
      expect(log.Notes[1]).toContain(': late');
    });

    it('throttles PER WIDGET — concurrent widgets do not share a window', () => {
      const fake = new FakeWhiteboardHost();
      channel.BindSurface(asHost(fake));

      fake.WidgetInteraction.emit(interaction('html-2', 'in widget two'));
      fake.WidgetInteraction.emit(interaction('html-3', 'in widget three', 'Other'));
      expect(log.Notes).toHaveLength(2);
      expect(log.Notes[0]).toContain('"Vibe picker"');
      expect(log.Notes[1]).toContain('"Other"');
    });

    it('UnbindSurface cancels pending trailing notes (nothing stale reaches the agent)', () => {
      const fake = new FakeWhiteboardHost();
      channel.BindSurface(asHost(fake));

      fake.WidgetInteraction.emit(interaction('html-2', 'sent'));
      fake.WidgetInteraction.emit(interaction('html-2', 'pending'));
      channel.UnbindSurface();
      vi.advanceTimersByTime(WHITEBOARD_INTERACTION_NOTE_THROTTLE_MS * 2);
      expect(log.Notes).toHaveLength(1); // the pending trailing note was canceled

      // and the released surface's emitter no longer reaches the channel at all
      fake.WidgetInteraction.emit(interaction('html-2', 'stale'));
      expect(log.Notes).toHaveLength(1);
    });
  });

  it('UnbindSurface flips back to the engine fallback and stops listening to old outputs', () => {
    const fake = new FakeWhiteboardHost();
    channel.BindSurface(asHost(fake));
    channel.UnbindSurface();

    channel.ApplyAgentTool('Whiteboard_AddNote', JSON.stringify({ text: 'after unbind' }));
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

    channel.ApplyAgentTool('Whiteboard_AddText', JSON.stringify({ text: 'x' }));
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
    channel.ApplyAgentTool('Whiteboard_AddNote', JSON.stringify({ text: 'still works' }));
    expect(spy).not.toHaveBeenCalled();
  });
});
