// The whiteboard channel imports its Angular surface component (partial-compiled Angular
// libs require the JIT compiler in this node test environment), so load the compiler FIRST.
import '@angular/compiler';
import { describe, it, expect, beforeEach } from 'vitest';
import type { Type } from '@angular/core';
import { RealtimeToolDefinition } from '@memberjunction/ai';
import { BaseRealtimeChannelClient, RealtimeChannelContext } from '../lib/components/realtime/channels/base-realtime-channel-client';
import { RealtimeWhiteboardChannel } from '../lib/components/realtime/whiteboard/whiteboard-channel';
import { WhiteboardStickyItem, WhiteboardTextItem } from '../lib/components/realtime/whiteboard/whiteboard-state';

/**
 * The RestoreState hook — base-class default (channels keep no state → false) and the
 * whiteboard implementation: a prior session's saved board round-trips into THIS session's
 * engine in place; malformed/incompatible payloads return false, never throw, and leave
 * the board fresh.
 */

/** Stand-in surface for the stateless test channel. */
class NullSurface {}

/** Minimal concrete channel that exercises the BASE-CLASS defaults only. */
class StatelessChannel extends BaseRealtimeChannelClient<NullSurface> {
  public get ChannelName(): string { return 'Stateless'; }
  public get ToolNamePrefix(): string { return 'Stateless_'; }
  public get TabTitle(): string { return 'Stateless'; }
  public get TabIcon(): string { return 'fa-solid fa-cube'; }
  public GetToolDefinitions(): RealtimeToolDefinition[] { return []; }
  public ApplyAgentTool(): string { return '{}'; }
  public GetSurfaceComponent(): Type<NullSurface> { return NullSurface; }
  public BindSurface(): void { /* no surface */ }
}

interface CtxLog {
  Saves: string[];
}

function makeContext(log: CtxLog): RealtimeChannelContext {
  return {
    AgentName: 'Sage',
    SendContextNote: () => undefined,
    RequestSave: (stateJson: string) => log.Saves.push(stateJson),
    SetFocusMode: () => undefined,
    SaveAsArtifact: async () => null
  };
}

describe('BaseRealtimeChannelClient.RestoreState — default', () => {
  it('returns false (a stateless channel ignores any saved payload)', () => {
    const channel = new StatelessChannel();
    channel.Initialize(makeContext({ Saves: [] }));
    expect(channel.RestoreState('{"anything": true}')).toBe(false);
  });
});

describe('RealtimeWhiteboardChannel.RestoreState', () => {
  let channel: RealtimeWhiteboardChannel;
  let log: CtxLog;

  beforeEach(() => {
    channel = new RealtimeWhiteboardChannel();
    log = { Saves: [] };
    channel.Initialize(makeContext(log));
  });

  /** A prior session's saved board: styled sticky + text + a shape, via a throwaway channel. */
  function priorSessionState(): string {
    const prior = new RealtimeWhiteboardChannel();
    prior.Initialize(makeContext({ Saves: [] }));
    prior.State.AddItem({
      Kind: 'sticky', X: 40, Y: 60, Text: 'carried over', FontSize: 24, FontFamily: 'serif', FontWeight: 700
    }, 'user');
    prior.State.AddItem({ Kind: 'text', X: 200, Y: 80, Text: 'styled label', FontSize: 18, Color: '#0ea5e9' }, 'agent');
    prior.State.AddItem({ Kind: 'shape', Shape: 'diamond', X: 300, Y: 200, W: 120, H: 80, Label: 'Decision' }, 'agent');
    const json = prior.SerializeState();
    expect(json).toBeTruthy();
    return json as string;
  }

  it('restores a valid prior-session board IN PLACE — items (and style fields) round-trip', () => {
    const saved = priorSessionState();
    const engineBefore = channel.State;

    expect(channel.RestoreState(saved)).toBe(true);

    expect(channel.State).toBe(engineBefore); // same engine instance — subscriptions intact
    expect(channel.State.ElementCount).toBe(3);
    expect(channel.State.CountByAuthor('user')).toBe(1);
    expect(channel.State.CountByAuthor('agent')).toBe(2);

    const sticky = channel.State.Items.find((i) => i.Kind === 'sticky') as WhiteboardStickyItem;
    expect(sticky.Text).toBe('carried over');
    expect(sticky.FontSize).toBe(24);
    expect(sticky.FontFamily).toBe('serif');
    expect(sticky.FontWeight).toBe(700);

    const text = channel.State.Items.find((i) => i.Kind === 'text') as WhiteboardTextItem;
    expect(text.Color).toBe('#0ea5e9');

    // the restored board re-serializes to the same items (the restore's own 'replace'
    // change bumps the engine seq, so compare the items payload, not the raw string)
    const reserialized = JSON.parse(channel.SerializeState() as string) as { items: unknown[] };
    expect(reserialized.items).toEqual((JSON.parse(saved) as { items: unknown[] }).items);
  });

  it('keeps the save pipeline live after restore (mutations still persist)', () => {
    channel.RestoreState(priorSessionState());
    const savesBefore = log.Saves.length;
    channel.ApplyAgentTool('Whiteboard_AddNote', JSON.stringify({ text: 'post-restore' }));
    expect(log.Saves.length).toBeGreaterThan(savesBefore);
    expect(channel.State.ElementCount).toBe(4);
  });

  it('returns false on garbage JSON and leaves the board fresh (never throws)', () => {
    expect(channel.RestoreState('not json at all {{{')).toBe(false);
    expect(channel.State.ElementCount).toBe(0);
  });

  it('returns false on well-formed but incompatible payloads, preserving current state', () => {
    channel.State.AddItem({ Kind: 'text', X: 0, Y: 0, Text: 'pre-existing' }, 'user');

    expect(channel.RestoreState('{"items": 42}')).toBe(false);
    expect(channel.RestoreState('null')).toBe(false);
    expect(channel.RestoreState('"just a string"')).toBe(false);
    expect(channel.RestoreState('[]')).toBe(false);

    expect(channel.State.ElementCount).toBe(1); // untouched
    const text = channel.State.Items[0] as WhiteboardTextItem;
    expect(text.Text).toBe('pre-existing');
  });
});
